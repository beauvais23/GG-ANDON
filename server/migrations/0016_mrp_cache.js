//------------------------------------------------------
// 0016 Material check cache (Nov 6 2026)
//
// For the MRP bridge (open orders × BOM explosion):
//   qb_items.on_order  QuickBooks QuantityOnOrder (open POs)
//   qb_open_so_lines   open sales-order lines (replaced as a whole
//                      on each refresh; hold = OpportunityId HOLD)
//   qb_open_po_lines   open purchase-order lines (same)
// Read only from QuickBooks through CData; nothing is written back.
//
// Reversible: down drops the two tables and the column.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE qb_items ADD COLUMN on_order REAL");

    db.exec(`
        CREATE TABLE qb_open_so_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            so TEXT,
            line TEXT,
            customer TEXT,
            item TEXT,
            ordered REAL,
            shipped REAL,
            ship_date TEXT,
            hold INTEGER NOT NULL DEFAULT 0
        )
    `);

    db.exec(`
        CREATE TABLE qb_open_po_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po TEXT,
            line TEXT,
            vendor TEXT,
            item TEXT,
            ordered REAL,
            received REAL,
            expected_date TEXT
        )
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS qb_open_po_lines");
    db.exec("DROP TABLE IF EXISTS qb_open_so_lines");
    db.exec("ALTER TABLE qb_items DROP COLUMN on_order");

}

module.exports = { up, down };
