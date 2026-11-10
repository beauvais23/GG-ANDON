//------------------------------------------------------
// 0023 Inventory search + where used (Director, Nov 10 2026)
//
// qb_items gets the item fields the search and detail page use
// (no costs: Director, Nov 10 2026):
//   part_number           QuickBooks PartNumber (manufacturer P/N)
//   purchase_description  QuickBooks PurchaseDescription
//   preferred_vendor      QuickBooks PreferredVendor
//   on_sales_order        QuickBooks QuantityOnSalesOrder
//   reorder_point         QuickBooks ReorderPoint
//   item_class            QuickBooks Class
// They fill on the next item refresh.
//
// qb_bom_all: every QuickBooks BOM line (Company_BOM, about
// 30,000 rows on Nov 10 2026), pulled whole and replaced in one
// transaction, for "where used". Separate from qb_bom_lines
// (the BOM viewer's per-SKU cache with its own 1 h freshness).
//
// Reversible: down drops the table and the six columns.
//------------------------------------------------------

const COLUMNS = [
    ["part_number", "TEXT"],
    ["purchase_description", "TEXT"],
    ["preferred_vendor", "TEXT"],
    ["on_sales_order", "REAL"],
    ["reorder_point", "REAL"],
    ["item_class", "TEXT"]
];

function up(db) {

    for (const [name, type] of COLUMNS)
        db.exec(`ALTER TABLE qb_items ADD COLUMN ${name} ${type}`);

    db.exec(`
        CREATE TABLE qb_bom_all (
            assembly TEXT NOT NULL,
            line INTEGER NOT NULL,
            component TEXT NOT NULL,
            qty REAL,
            uom TEXT,
            PRIMARY KEY (assembly, line)
        )
    `);

    db.exec("CREATE INDEX idx_qb_bom_all_component ON qb_bom_all (component)");

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS qb_bom_all");

    for (const [name] of [...COLUMNS].reverse())
        db.exec(`ALTER TABLE qb_items DROP COLUMN ${name}`);

}

module.exports = { up, down };
