const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { searchItems, whereUsed } = require("../services/inventorySearch");

//------------------------------------------------------
// Inventory search + where used (Director, Nov 10 2026).
// Any login; read only; QuickBooks data through the cached item
// list and BOM table (refreshed about nightly, Admin Refresh).
// No costs or prices (Director, Nov 10 2026).
//------------------------------------------------------

const PUBLIC_FIELDS = ["full_name", "type", "description", "purchase_description", "part_number", "uom", "active",
    "on_hand", "on_order", "on_sales_order", "reorder_point", "preferred_vendor", "item_class", "time_modified"];

const pick = it => (it ? Object.fromEntries(PUBLIC_FIELDS.map(k => [k, it[k] ?? null])) : null);

const yes = v => v === "1" || v === "true";

function inventoryRoutes(qbBom) {

    const router = express.Router();

    router.get("/inventory/search", authenticateToken, (req, res) => {

        const q = String(req.query.q || "").slice(0, 100);
        const { items, total } = searchItems(qbBom.searchIndex(), q, { includeInactive: yes(req.query.inactive), limit: 50 });

        res.json({ q, total, items: items.map(it => ({ ...pick(it), score: it.score })), status: qbBom.status() });

    });

    router.get("/inventory/item/:name", authenticateToken, (req, res) => {

        const item = qbBom.itemOf(req.params.name);

        if (!item)
            return res.status(404).json({ success: false, message: `${req.params.name} is not in the QuickBooks item list.` });

        const includeInactive = yes(req.query.inactive);
        const used = whereUsed(item.full_name, qbBom.parentsOf, qbBom.itemOf, { includeInactive });

        const about = name => {

            const it = qbBom.itemOf(name);

            return {
                description: it?.description ?? null,
                active: it ? it.active : null,
                on_hand: it?.on_hand ?? null,
                on_sales_order: it?.on_sales_order ?? null,
                lineGroup: qbBom.lineGroupOf(name)
            };

        };

        res.json({
            item: pick(item),
            whereUsed: {
                includeInactive,
                direct: used.direct.map(d => ({ ...d, ...about(d.assembly) })),
                tops: used.tops.map(t => ({ ...t, ...about(t.assembly) })),
                loops: used.loops,
                truncated: used.truncated
            },
            status: qbBom.status()
        });

    });

    // Item list + every BOM line, now (admin).
    router.post("/admin/inventory/refresh", authenticateToken, requireAdmin, async (req, res) => {

        try {

            const [items, bomLines] = await Promise.all([qbBom.refreshItems(), qbBom.refreshAllBoms()]);

            res.json({ success: true, items, bomLines, status: qbBom.status() });

        }

        catch (err) {

            res.status(503).json({ success: false, message: err.message, status: qbBom.status() });

        }

    });

    return router;

}

module.exports = { inventoryRoutes };
