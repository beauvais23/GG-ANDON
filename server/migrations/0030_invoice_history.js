//------------------------------------------------------
// 0030 SKU History (Director, Nov 13 2026)
//
// Invoiced units per customer, item and month from QuickBooks
// (Company_InvoiceLines, G&G invoices at shipment), summed by
// QuickBooks itself (about 27,000 rows for 24 months on Nov 13 2026).
// Replaced whole after a complete pull, refreshed with the item list
// (older than 20 h) or by admin Refresh; a failed pull keeps the last
// copy. Read by the SKU History page.
//
// Reversible: down drops the table.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE qb_invoice_months (
            customer TEXT NOT NULL,
            item TEXT NOT NULL,
            month TEXT NOT NULL,
            qty REAL NOT NULL,
            PRIMARY KEY (customer, item, month)
        );

        CREATE INDEX idx_qb_invoice_months_item ON qb_invoice_months(item);
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS qb_invoice_months");

}

module.exports = { up, down };
