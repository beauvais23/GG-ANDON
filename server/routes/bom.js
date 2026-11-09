const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { LINE_GROUPS } = require("../services/qbBom");
const { REASONS, ADDABLE, validateRequest, codeFor } = require("../services/bomRequest");
const { requestUrl, postBomToTelegram, updateBomInTelegram } = require("../services/telegramGroups");
const { postBomToSlack, updateBomInSlack } = require("../services/slack");
const { queueNotification } = require("../services/notificationQueue");
const { dateNY, startOfDayNY } = require("../services/nyTime");

//------------------------------------------------------
// BOM viewer + BOM change request routes (Nov 5-6 2026).
// QuickBooks is never written. Any login views and sends
// requests (requester = a typed name); admins refresh the item
// list. Kept out of index.js (already ~3,800 lines).
//------------------------------------------------------

function bomRoutes(qbBom, db) {

    const router = express.Router();

    const st = {
        maxSeq: db.prepare("SELECT MAX(seq) AS n FROM bom_requests WHERE year = ?"),
        insert: db.prepare(`INSERT INTO bom_requests (code, year, seq, sku, sku_description, line_group, reason, reference, note, requested_by, requested_at, snapshot, bom_as_of)
            VALUES (@code, @year, @seq, @sku, @skuDescription, @lineGroup, @reason, @reference, @note, @requestedBy, @requestedAt, @snapshot, @bomAsOf)`),
        insertLine: db.prepare("INSERT INTO bom_request_lines (request_id, action, line, component, description, old_qty, new_qty, uom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
        byCode: db.prepare("SELECT * FROM bom_requests WHERE code = ?"),
        lines: db.prepare("SELECT * FROM bom_request_lines WHERE request_id = ? ORDER BY id"),
        list: db.prepare("SELECT * FROM bom_requests WHERE requested_at >= ? AND requested_at < ? ORDER BY requested_at DESC LIMIT 1000"),
        close: db.prepare("UPDATE bom_requests SET status = ?, closed_by = ?, closed_at = ?, close_note = ? WHERE id = ? AND status = 'OPEN'"),
        searchItems: db.prepare(`SELECT full_name, type, description, uom, on_hand FROM qb_items
            WHERE active = 1 AND type IN (${ADDABLE.map(() => "?").join(", ")}) AND (full_name LIKE ? OR description LIKE ?)
            ORDER BY CASE WHEN full_name LIKE ? THEN 0 ELSE 1 END, full_name LIMIT 40`),
        item: db.prepare("SELECT * FROM qb_items WHERE full_name = ?"),
        openForSku: db.prepare(`SELECT r.code, r.reason, r.requested_by, r.requested_at, l.component, l.action FROM bom_requests r
            JOIN bom_request_lines l ON l.request_id = r.id WHERE r.sku = ? AND r.status = 'OPEN' ORDER BY r.requested_at`)
    };

    const withLines = r => ({ ...r, lines: st.lines.all(r.id), snapshot: undefined });

    // Slack #bom-changes + the BOM Telegram group, in the background,
    // in order per request; each channel runs on its own. Results are
    // saved on the request (shown on the requests page).
    function notify(req, label) {

        return queueNotification(`bom:${req.code}`, label, async () => {

            const lines = st.lines.all(req.id);
            const card = label === "bom-card";

            await Promise.all([
                Promise.resolve().then(() => card
                    ? postBomToSlack(req, lines, requestUrl(req.code))
                    : updateBomInSlack(req, lines, requestUrl(req.code)))
                    .catch(err => console.error(`✗ Slack ${req.code}:`, err.message)),
                Promise.resolve().then(() => card ? postBomToTelegram(req, lines) : updateBomInTelegram(req, lines))
                    .catch(err => console.error(`✗ Telegram ${req.code}:`, err.message))
            ]);

        });

    }

    router.get("/bom/assemblies", authenticateToken, (req, res) => {

        res.json({ lineGroups: LINE_GROUPS, assemblies: qbBom.assemblies(), status: qbBom.status() });

    });

    router.get("/bom/status", authenticateToken, (req, res) => {

        res.json(qbBom.status());

    });

    router.get("/bom/sku/:sku", authenticateToken, async (req, res) => {

        const sku = String(req.params.sku || "").slice(0, 100);

        try {

            res.json(await qbBom.getBom(sku));

        }

        catch (err) {

            res.status(err.status || 503).json({ success: false, message: err.message });

        }

    });

    // Parts that can be added to a BOM (active Inventory, Inventory
    // Assembly, Non-inventory), by item number or description.
    router.get("/bom/items", authenticateToken, (req, res) => {

        const q = String(req.query.q || "").trim().slice(0, 60);

        if (q.length < 2)
            return res.json({ items: [] });

        const like = q.replace(/[%_]/g, "");

        res.json({ items: st.searchItems.all(...ADDABLE, `${like}%`, `%${like}%`, `${like}%`) });

    });

    router.get("/bom/reasons", authenticateToken, (req, res) => res.json({ reasons: REASONS }));

    router.post("/bom/requests", authenticateToken, async (req, res) => {

        const sku = String(req.body?.sku || "").trim().slice(0, 100);
        let bom;

        try {

            bom = await qbBom.getBom(sku);

        }

        catch (err) {

            return res.status(err.status === 404 ? 400 : 503).json({ success: false, message: err.message, errors: [err.message] });

        }

        const levelOne = bom.rows.filter(r => r.level === 1);
        const { errors, request, lines } = validateRequest(req.body, { sku, levelOne, itemOf: name => st.item.get(name) || null });

        if (errors.length)
            return res.status(400).json({ success: false, message: errors[0], errors });

        // Duplicate guard (Nov 6 2026): a component already in an open
        // request for this config needs confirmDuplicate: true.
        const wanted = new Set(lines.map(l => l.component));
        const duplicates = st.openForSku.all(sku).filter(d => wanted.has(d.component));

        if (duplicates.length && req.body?.confirmDuplicate !== true) {

            const codes = [...new Set(duplicates.map(d => d.code))].join(", ");

            return res.status(409).json({ success: false, message: `Already in open request ${codes}: ${[...new Set(duplicates.map(d => d.component))].join(", ")}.`, duplicates });

        }

        const now = Date.now();
        const year = Number(dateNY(now).slice(0, 4));

        const saved = db.transaction(() => {

            const seq = (st.maxSeq.get(year).n || 0) + 1;
            const code = codeFor(year, seq);

            const id = st.insert.run({
                code, year, seq, sku,
                skuDescription: bom.description || null,
                lineGroup: bom.lineGroup,
                ...request,
                requestedAt: now,
                snapshot: JSON.stringify(levelOne.map(r => ({ line: r.line, component: r.component, description: r.description, qty: r.qty, uom: r.uom }))),
                bomAsOf: bom.asOf
            }).lastInsertRowid;

            for (const l of lines)
                st.insertLine.run(id, l.action, l.line, l.component, l.description, l.oldQty, l.newQty, l.uom);

            return st.byCode.get(code);

        })();

        const out = withLines(saved);

        notify(saved, "bom-card");

        res.status(201).json({ success: true, request: out, bomStale: bom.stale, bomError: bom.error });

    });

    router.get("/bom/requests", authenticateToken, (req, res) => {

        const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
        const from = okDate(req.query.from) ? startOfDayNY(Date.parse(`${req.query.from}T12:00:00Z`)) : 0;
        const to = okDate(req.query.to) ? startOfDayNY(Date.parse(`${req.query.to}T12:00:00Z`) + 86400000) : 8.64e15;
        const status = ["OPEN", "DONE", "CANCELLED"].includes(req.query.status) ? req.query.status : null;
        const sku = req.query.sku ? String(req.query.sku).slice(0, 100) : null;

        const rows = st.list.all(from, to).filter(r => (!status || r.status === status) && (!sku || r.sku === sku));

        res.json({ requests: rows.map(withLines), reasons: REASONS });

    });

    router.get("/bom/requests/:code", authenticateToken, (req, res) => {

        const r = st.byCode.get(String(req.params.code));

        if (!r)
            return res.status(404).json({ success: false, message: "No such request." });

        res.json({ request: { ...withLines(r), snapshot: JSON.parse(r.snapshot || "[]") } });

    });

    // Done = the QuickBooks edit is made; Cancel = not needed / sent
    // by mistake (reason required). Only an open request closes.
    for (const [path, status] of [["done", "DONE"], ["cancel", "CANCELLED"]]) {

        router.post(`/bom/requests/:code/${path}`, authenticateToken, (req, res) => {

            const by = String(req.body?.by || "").trim().slice(0, 60);
            const note = String(req.body?.note || "").trim().slice(0, 500) || null;

            if (!by)
                return res.status(400).json({ success: false, message: "Enter your name." });

            if (status === "CANCELLED" && !note)
                return res.status(400).json({ success: false, message: "Say why it is cancelled." });

            const r = st.byCode.get(String(req.params.code));

            if (!r)
                return res.status(404).json({ success: false, message: "No such request." });

            if (!st.close.run(status, by, Date.now(), note, r.id).changes)
                return res.status(409).json({ success: false, message: `${r.code} is already ${r.status === "DONE" ? "done" : "cancelled"}.` });

            const closed = st.byCode.get(r.code);

            notify(closed, `bom-${path}`);

            res.json({ success: true, request: withLines(closed) });

        });

    }

    router.post("/admin/bom/refresh", authenticateToken, requireAdmin, async (req, res) => {

        try {

            const items = await qbBom.refreshItems();

            res.json({ success: true, items, status: qbBom.status() });

        }

        catch (err) {

            res.status(503).json({ success: false, message: err.message, status: qbBom.status() });

        }

    });

    return router;

}

module.exports = { bomRoutes };
