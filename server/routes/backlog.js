const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { buildBacklog } = require("../services/backlog");
const { dateNY } = require("../services/nyTime");

//------------------------------------------------------
// Backlog & delivery risk (Director, Nov 10 2026). Any login
// views and edits notes with a typed name (like BOM requests);
// notes are kept per SO across every QuickBooks refresh until
// cleared. Every change is logged.
//------------------------------------------------------

const FIELDS = {
    recoveryDate: "recovery_date",
    materialClearDate: "material_clear_date",
    opsComment: "ops_comment",
    salesNote: "sales_note"
};

const DATE_FIELDS = ["recoveryDate", "materialClearDate"];
const MAX_TEXT = 1000;

function parseDate(v) {

    const s = String(v ?? "").trim();

    if (!s)
        return "";

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (!m) {

        const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

        if (us)
            m = [null, us[3].length === 2 ? `20${us[3]}` : us[3], us[1], us[2]];

    }

    if (!m)
        return null;

    const iso = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    const d = new Date(`${iso}T12:00:00Z`);

    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;

}

function backlogRoutes(qbBom, db) {

    const router = express.Router();

    const st = {
        notes: db.prepare("SELECT * FROM backlog_notes"),
        note: db.prepare("SELECT * FROM backlog_notes WHERE so = ?"),
        upsert: db.prepare(`INSERT INTO backlog_notes (so, recovery_date, material_clear_date, ops_comment, sales_note, updated_by, updated_at)
            VALUES (@so, @recovery_date, @material_clear_date, @ops_comment, @sales_note, @updated_by, @updated_at)
            ON CONFLICT(so) DO UPDATE SET recovery_date = @recovery_date, material_clear_date = @material_clear_date, ops_comment = @ops_comment,
            sales_note = @sales_note, updated_by = @updated_by, updated_at = @updated_at`),
        remove: db.prepare("DELETE FROM backlog_notes WHERE so = ?"),
        log: db.prepare("INSERT INTO backlog_note_log (so, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"),
        history: db.prepare("SELECT field, old_value, new_value, changed_by, changed_at FROM backlog_note_log WHERE so = ? ORDER BY id DESC LIMIT 200")
    };

    // Applies changes for one SO; returns { note } or { errors }.
    function saveNote(so, body, by) {

        const errors = [];
        const before = st.note.get(so) || { so, recovery_date: null, material_clear_date: null, ops_comment: null, sales_note: null };
        const after = { ...before };

        for (const [key, col] of Object.entries(FIELDS)) {

            if (!(key in body))
                continue;

            if (DATE_FIELDS.includes(key)) {

                const d = parseDate(body[key]);

                if (d === null)
                    errors.push(`${key}: use YYYY-MM-DD or M/D/YYYY`);
                else
                    after[col] = d || null;

            }

            else {

                const t = String(body[key] ?? "").trim();

                if (t.length > MAX_TEXT)
                    errors.push(`${key}: at most ${MAX_TEXT} characters`);
                else
                    after[col] = t || null;

            }

        }

        if (errors.length)
            return { errors };

        const now = Date.now();
        const changed = Object.values(FIELDS).filter(c => (before[c] ?? null) !== (after[c] ?? null));

        if (!changed.length)
            return { note: st.note.get(so) || null, changed: 0 };

        db.transaction(() => {

            for (const c of changed)
                st.log.run(so, c, before[c] ?? null, after[c] ?? null, by, now);

            if (Object.values(FIELDS).every(c => !after[c]))
                st.remove.run(so);
            else
                st.upsert.run({ ...after, so, updated_by: by, updated_at: now });

        })();

        return { note: st.note.get(so) || null, changed: changed.length };

    }

    const nameOf = v => String(v ?? "").trim().slice(0, 60);

    router.get("/backlog", authenticateToken, async (req, res) => {

        const inputs = await qbBom.backlogInputs({ force: req.query.refresh === "1" });
        const notes = new Map(st.notes.all().map(n => [n.so, n]));

        const result = buildBacklog({
            soLines: inputs.soLines,
            poLines: inputs.poLines,
            items: inputs.items,
            childrenOf: inputs.childrenOf,
            today: dateNY(Date.now()),
            notes,
            lineGroupOf: qbBom.lineGroupOf
        });

        res.json({ ...result, asOf: inputs.asOf, error: inputs.error, status: qbBom.status() });

    });

    router.put("/backlog/notes/:so", authenticateToken, (req, res) => {

        const by = nameOf(req.body?.by);

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        const r = saveNote(String(req.params.so), req.body || {}, by);

        if (r.errors)
            return res.status(400).json({ success: false, message: r.errors.join("; "), errors: r.errors });

        res.json({ success: true, note: r.note, changed: r.changed });

    });

    // Clear everything on one SO (logged).
    router.delete("/backlog/notes/:so", authenticateToken, (req, res) => {

        const by = nameOf(req.body?.by ?? req.query.by);

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        const r = saveNote(String(req.params.so), { recoveryDate: "", materialClearDate: "", opsComment: "", salesNote: "" }, by);

        res.json({ success: true, note: r.note, changed: r.changed });

    });

    router.get("/backlog/notes/:so/history", authenticateToken, (req, res) => {

        res.json({ success: true, so: req.params.so, history: st.history.all(String(req.params.so)) });

    });

    // One-time import (admin): paste "SO <tab> recovery date <tab> comment" rows,
    // e.g. from the Ship Report. Comments go to Ops comment; nothing is
    // overwritten with blank. All rows or none.
    router.post("/admin/backlog/notes/import", authenticateToken, requireAdmin, (req, res) => {

        const by = nameOf(req.body?.by);
        const text = String(req.body?.text || "");

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        const rows = text.split(/\r?\n/).map(l => l.split("\t")).filter(c => c.some(x => x.trim()));
        const errors = [];
        const parsed = [];

        rows.forEach((c, i) => {

            const so = String(c[0] || "").trim();

            if (!so || /^so/i.test(so) && i === 0)
                return;

            const d = parseDate(c[1]);

            if (d === null)
                errors.push(`Row ${i + 1} (${so}): bad date "${c[1]}"`);
            else
                parsed.push({ so, recoveryDate: d, opsComment: String(c.slice(2).join(" ") || "").trim() });

        });

        if (errors.length)
            return res.status(400).json({ success: false, message: `${errors.length} row(s) have a problem. Nothing was saved.`, errors });

        let saved = 0;

        db.transaction(() => {

            for (const p of parsed) {

                const body = {};

                if (p.recoveryDate) body.recoveryDate = p.recoveryDate;
                if (p.opsComment) body.opsComment = p.opsComment;

                if (Object.keys(body).length && saveNote(p.so, body, by).changed)
                    saved++;

            }

        })();

        res.json({ success: true, rows: parsed.length, saved });

    });

    return router;

}

module.exports = { backlogRoutes, parseDate };
