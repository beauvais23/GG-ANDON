const express = require("express");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { customerView, itemView, monthList } = require("../services/skuHistory");
const { dateNY } = require("../services/nyTime");

//------------------------------------------------------
// SKU History (Director, Nov 13 2026): invoiced units by month for a
// customer or an item, rolling 6-month average, estimated annual
// usage. Any login (units only, no prices). Data: qb_invoice_months
// (QuickBooks invoices, last 24 months, nightly).
//------------------------------------------------------

const WINDOWS = [13, 24];

function skuHistoryRoutes(qbBom, db) {

    const router = express.Router();

    const st = {
        customers: db.prepare(`SELECT customer, SUM(qty) AS units, COUNT(DISTINCT item) AS items, MAX(month) AS last_month
            FROM qb_invoice_months GROUP BY customer ORDER BY customer`),
        ofCustomer: db.prepare("SELECT item, month, qty FROM qb_invoice_months WHERE customer = ?"),
        ofItem: db.prepare("SELECT customer, month, qty FROM qb_invoice_months WHERE item = ?")
    };

    const window = q => (WINDOWS.includes(Number(q)) ? Number(q) : 13);
    const describe = name => qbBom.itemOf(name)?.description || null;
    const meta = () => {

        const s = qbBom.status();

        return { asOf: s.invoicesOk?.finished_at || null, rows: s.invoices, error: s.invoicesLast && !s.invoicesLast.ok ? s.invoicesLast.error : null };

    };

    router.get("/sku-history/customers", authenticateToken, (req, res) => {

        res.json({ success: true, customers: st.customers.all(), ...meta() });

    });

    router.get("/sku-history/customer", authenticateToken, (req, res) => {

        const name = String(req.query.name || "");
        const today = dateNY(Date.now());
        const rows = st.ofCustomer.all(name);

        if (!name || !rows.length)
            return res.status(404).json({ success: false, message: "No invoiced units for that customer in the last 24 months." });

        res.json({ success: true, customer: name, ...customerView({ rows, months: monthList(today, window(req.query.months)), today, describe }), ...meta() });

    });

    router.get("/sku-history/item", authenticateToken, (req, res) => {

        const name = String(req.query.name || "");
        const today = dateNY(Date.now());
        const it = qbBom.itemOf(name);

        if (!name || (!it && !st.ofItem.all(name).length))
            return res.status(404).json({ success: false, message: "No such item." });

        const view = itemView({ item: name, rowsOfItem: n => st.ofItem.all(n), parentsOf: qbBom.parentsOf, months: monthList(today, window(req.query.months)), today, describe });

        res.json({ success: true, ...view, onHand: it?.on_hand ?? null, onOrder: it?.on_order ?? null, type: it?.type || null, ...meta() });

    });

    router.post("/admin/sku-history/refresh", authenticateToken, requireAdmin, async (req, res) => {

        try { res.json({ success: true, rows: await qbBom.refreshInvoices(), ...meta() }); }

        catch (err) { res.status(502).json({ success: false, message: err.message }); }

    });

    return router;

}

module.exports = { skuHistoryRoutes };
