const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { buildBacklog } = require("../services/backlog");
const { dateNY } = require("../services/nyTime");
const { createShipReportSync, readSheet } = require("../services/shipReport");

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
    salesNote: "sales_note",
    lineOverride: "line_override"
};

// Lines an SO or an accessory prefix can be set to (Nov 12 2026).
const LINES = ["Team A", "Team B", "SpaceX", "Other"];

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

function backlogRoutes(qbBom, db, { fetchShipReport = readSheet } = {}) {

    const router = express.Router();

    const st = {
        notes: db.prepare("SELECT * FROM backlog_notes"),
        note: db.prepare("SELECT * FROM backlog_notes WHERE so = ?"),
        upsert: db.prepare(`INSERT INTO backlog_notes (so, recovery_date, material_clear_date, ops_comment, sales_note, line_override, updated_by, updated_at)
            VALUES (@so, @recovery_date, @material_clear_date, @ops_comment, @sales_note, @line_override, @updated_by, @updated_at)
            ON CONFLICT(so) DO UPDATE SET recovery_date = @recovery_date, material_clear_date = @material_clear_date, ops_comment = @ops_comment,
            sales_note = @sales_note, line_override = @line_override, updated_by = @updated_by, updated_at = @updated_at`),
        prefixes: db.prepare("SELECT prefix, line_group, updated_by, updated_at FROM line_prefix_key ORDER BY prefix"),
        clearPrefixes: db.prepare("DELETE FROM line_prefix_key"),
        addPrefix: db.prepare("INSERT INTO line_prefix_key (prefix, line_group, updated_by, updated_at) VALUES (?, ?, ?, ?)"),
        remove: db.prepare("DELETE FROM backlog_notes WHERE so = ?"),
        log: db.prepare("INSERT INTO backlog_note_log (so, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"),
        history: db.prepare("SELECT field, old_value, new_value, changed_by, changed_at FROM backlog_note_log WHERE so = ? ORDER BY id DESC LIMIT 200"),
        repChannels: db.prepare("SELECT rep, channel, updated_by, updated_at FROM rep_channels ORDER BY rep"),
        clearReps: db.prepare("DELETE FROM rep_channels"),
        addRep: db.prepare("INSERT OR REPLACE INTO rep_channels (rep, channel, updated_by, updated_at) VALUES (?, ?, ?, ?)")
    };

    // Applies changes for one SO; returns { note } or { errors }.
    function saveNote(so, body, by) {

        const errors = [];
        const before = st.note.get(so) || { so, recovery_date: null, material_clear_date: null, ops_comment: null, sales_note: null, line_override: null };
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

            else if (key === "lineOverride") {

                const v = String(body[key] ?? "").trim();

                if (v && !LINES.includes(v))
                    errors.push(`lineOverride: one of ${LINES.join(", ")} (blank = automatic)`);
                else
                    after[col] = v || null;

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

    // Fixture SKU / family first (qbBom); an accessory that matches no
    // family takes the longest matching prefix in the Line key.
    function lineGroupWithKey(prefixRows) {

        const rows = [...prefixRows].sort((a, b) => b.prefix.length - a.prefix.length);

        return item => {

            const g = qbBom.lineGroupOf(item);

            if (g && g !== "Other")
                return g;

            const up = String(item || "").toUpperCase();
            const hit = rows.find(r => up.startsWith(r.prefix.toUpperCase()));

            return hit ? hit.line_group : g;

        };

    }

    // Ship Report → notes (Nov 12 2026): see services/shipReport.js.
    const shipReport = createShipReportSync({ db, saveNote, fetchRows: fetchShipReport });

    router.shipReport = shipReport;
    router.saveNote = saveNote;

    router.get("/backlog", authenticateToken, async (req, res) => {

        const inputs = await qbBom.backlogInputs({ force: req.query.refresh === "1" });
        const notes = new Map(st.notes.all().map(n => [n.so, n]));
        const repRows = st.repChannels.all();
        const repChannels = new Map(repRows.map(r => [r.rep.trim().toUpperCase(), r.channel]));

        const result = buildBacklog({
            soLines: inputs.soLines,
            poLines: inputs.poLines,
            items: inputs.items,
            childrenOf: inputs.childrenOf,
            today: dateNY(Date.now()),
            notes,
            lineGroupOf: lineGroupWithKey(st.prefixes.all()),
            repChannels
        });

        const unmappedReps = [...new Set(result.sos.filter(s => s.channel === "Unassigned" && s.rep).map(s => s.rep))].sort();

        res.json({ ...result, shipReport: shipReport.status(), repKey: { count: repRows.length, updatedAt: Math.max(0, ...repRows.map(r => r.updated_at || 0)) || null, unmappedReps }, asOf: inputs.asOf, error: inputs.error, status: qbBom.status() });

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

    // One-time import (admin). Paste either three columns (SO <tab>
    // recovery date <tab> comment) or a whole sheet with a header row:
    // the SO, recovery date and comment / notes columns are found by
    // their headers (Nov 11 2026: a Ship Report paste ran past the body
    // limit). Only SOs open in QuickBooks are imported; blanks never
    // overwrite; a date that can't be read is skipped (comment kept)
    // and listed. Comments go to Ops comment.
    const openSos = db.prepare("SELECT DISTINCT so FROM qb_open_so_lines WHERE ordered > shipped");

    function importColumns(rows) {

        for (let i = 0; i < Math.min(rows.length, 15); i++) {

            const h = rows[i].map(c => c.trim().toUpperCase());
            const so = h.findIndex(c => /^(SO|S\.O\.|SALES ORDER|SO\s*(#|NO\.?|NUMBER))$/.test(c));

            if (so < 0)
                continue;

            return {
                headerAt: i,
                so,
                date: h.findIndex(c => /RECOVER/.test(c)),
                comments: h.map((c, j) => (/COMMENT|NOTE/.test(c) ? j : -1)).filter(j => j >= 0)
            };

        }

        return { headerAt: -1, so: 0, date: 1, comments: null };

    }

    router.post("/admin/backlog/notes/import", authenticateToken, requireAdmin, (req, res) => {

        const by = nameOf(req.body?.by);
        const text = String(req.body?.text || "");

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        const rows = text.split(/\r?\n/).map(l => l.split("\t"));
        const cols = importColumns(rows);
        const open = new Set(openSos.all().map(r => String(r.so)));
        const warnings = [];
        const parsed = [];
        let notOpen = 0;

        if (cols.headerAt >= 0 && cols.date < 0 && !cols.comments.length)
            return res.status(400).json({ success: false, message: "Found the SO column but no recovery date or comment / notes column. Nothing was saved." });

        rows.forEach((c, i) => {

            if (i <= cols.headerAt || !c.some(x => x.trim()))
                return;

            const so = String(c[cols.so] || "").trim().replace(/^SO\s*#?\s*/i, "");

            if (!so || (cols.headerAt < 0 && i === 0 && /^so/i.test(String(c[0]).trim())))
                return;

            const comment = (cols.comments ? cols.comments.map(j => c[j]) : c.slice(2)).map(x => String(x || "").trim()).filter(Boolean).join(" ");
            const rawDate = cols.date >= 0 ? c[cols.date] : "";
            let recoveryDate = parseDate(rawDate);

            if (!recoveryDate && !comment)
                return;

            if (!open.has(so)) {

                notOpen++;
                return;

            }

            if (recoveryDate === null) {

                warnings.push(`${so}: date "${String(rawDate).trim()}" not read (use M/D/YYYY); comment kept`);
                recoveryDate = "";

            }

            parsed.push({ so, recoveryDate, opsComment: comment });

        });

        let saved = 0;

        db.transaction(() => {

            for (const p of parsed) {

                const body = {};

                if (p.recoveryDate) body.recoveryDate = p.recoveryDate;
                if (p.opsComment) body.opsComment = p.opsComment.slice(0, MAX_TEXT);

                if (Object.keys(body).length && saveNote(p.so, body, by).changed)
                    saved++;

            }

        })();

        res.json({ success: true, rows: parsed.length, saved, notOpen, warnings, columns: cols.headerAt >= 0 ? "by header" : "SO / date / comment" });

    });

    // Rep → channel key (admin): paste the two columns of the
    // "Assigned Rep to Sales Channel" sheet (Rep, Channel); replaces the
    // whole key, all rows or none.
    router.get("/backlog/rep-channels", authenticateToken, (req, res) => {

        res.json({ success: true, reps: st.repChannels.all() });

    });

    router.put("/admin/backlog/rep-channels", authenticateToken, requireAdmin, (req, res) => {

        const by = nameOf(req.body?.by);
        const rows = String(req.body?.text || "").split(/\r?\n/).map(l => l.split("\t").map(c => c.trim())).filter(c => c.some(Boolean));
        const errors = [];
        const parsed = new Map();

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        rows.forEach((c, i) => {

            if (i === 0 && /^rep$/i.test(c[0]))
                return;

            const rep = (c[0] || "").toUpperCase();
            const channel = c[1] || "";

            if (!rep || !/^(car\s*wash|industrial)/i.test(channel))
                errors.push(`Row ${i + 1}: "${c.join(" | ")}" needs a rep and a channel starting with Car Wash or Industrial`);
            else if (parsed.has(rep))
                errors.push(`Row ${i + 1}: ${rep} is listed twice`);
            else
                parsed.set(rep, channel);

        });

        if (!parsed.size && !errors.length)
            errors.push("Nothing to save.");

        if (errors.length)
            return res.status(400).json({ success: false, message: `${errors.length} problem(s). Nothing was saved.`, errors });

        const now = Date.now();

        db.transaction(() => {

            st.clearReps.run();

            for (const [rep, channel] of parsed)
                st.addRep.run(rep, channel, by, now);

        })();

        res.json({ success: true, reps: parsed.size });

    });

    // Accessory line key (Nov 12 2026): GET for anyone, PUT (admin) pastes
    // "prefix <tab> line" rows and replaces the whole key, all or none.
    router.get("/backlog/line-key", authenticateToken, (req, res) => {

        res.json({ success: true, lines: LINES, prefixes: st.prefixes.all() });

    });

    router.put("/admin/backlog/line-key", authenticateToken, requireAdmin, (req, res) => {

        const by = nameOf(req.body?.by);
        const rows = String(req.body?.text || "").split(/\r?\n/).map(l => l.split(/\t|,/).map(c => c.trim())).filter(c => c.some(Boolean));
        const errors = [];
        const parsed = new Map();

        if (!by)
            return res.status(400).json({ success: false, message: "Your name is required." });

        rows.forEach((c, i) => {

            if (i === 0 && /^prefix$/i.test(c[0]))
                return;

            const prefix = (c[0] || "").toUpperCase();
            const line = LINES.find(l => l.toLowerCase() === String(c[1] || "").toLowerCase());

            if (!prefix || !line)
                errors.push(`Row ${i + 1}: "${c.join(" | ")}" needs a prefix and one of ${LINES.join(", ")}`);
            else if (parsed.has(prefix))
                errors.push(`Row ${i + 1}: ${prefix} is listed twice`);
            else
                parsed.set(prefix, line);

        });

        if (!parsed.size && !errors.length)
            errors.push("Nothing to save.");

        if (errors.length)
            return res.status(400).json({ success: false, message: `${errors.length} problem(s). Nothing was saved.`, errors });

        const now = Date.now();

        db.transaction(() => {

            st.clearPrefixes.run();

            for (const [prefix, line] of parsed)
                st.addPrefix.run(prefix, line, by, now);

        })();

        res.json({ success: true, prefixes: parsed.size });

    });

    router.post("/admin/backlog/ship-report/pull", authenticateToken, requireAdmin, async (req, res) => {

        const r = await shipReport.run("admin");

        res.status(r.ok ? 200 : r.skipped ? 409 : 502).json({ success: r.ok, ...r, status: shipReport.status() });

    });

    return router;

}

module.exports = { backlogRoutes, parseDate };
