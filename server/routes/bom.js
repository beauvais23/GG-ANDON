const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { LINE_GROUPS } = require("../services/qbBom");

//------------------------------------------------------
// BOM viewer routes (Nov 5 2026). Read only: QuickBooks is
// never written. Any login views; admins refresh the item list.
// Kept out of index.js (already ~3,800 lines); mounted there.
//------------------------------------------------------

function bomRoutes(qbBom) {

    const router = express.Router();

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
