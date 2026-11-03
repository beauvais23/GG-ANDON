//------------------------------------------------------
// 0008 SKU list per board (Nov 3 2026)
//
// product_skus: the SKUs listed under each family in
// Admin → Products & rates. Seeded with the 19 active
// SpaceX SKUs in QuickBooks on Nov 3 2026 (the ANDON
// server can't reach QuickBooks, so the list is kept
// here and edited in Admin: add a SKU, remove a SKU).
// A listed SKU uses its family's rate unless it has its
// own rate. Team A / Team B stay family-only for now.
//
// Reversible: down drops the table.
//------------------------------------------------------

const SPACEX_SKUS = [
    ["GIGA", "GIGA4-TRI-48K-480V"],
    ["GIGA", "GIGA4-TRI-SO-48K-480V"],
    ["GIGA", "GIGA8-TRI-48K-480V"],
    ["GIGA", "GIGA8-TRI-48K-EM-480V"],
    ["GIGA", "GIGA8-TRI-HO-48K-LR-EH-480V"],
    ["GIGA", "GIGA8-TRI-HO-48K-LR-EH-EM-480V"],
    ["GIGA", "GIGA8-TRI-LO-48K-480V"],
    ["GIGA", "GIGA8-TRI-LO-48K-EM-480V"],
    ["GIGA", "GIGA8-TRI-SO-48K-480V"],
    ["GIGA", "GIGA8-TRI-SO-48K-EM-480V"],
    ["GIGA", "GIGA8-TRI-SO-48K-LR-EH-480V"],
    ["GIGA", "GIGA8-TRI-SO-48K-LR-EH-EM-480V"],
    ["GIGA8-VERT", "GIGA8-VERT-48K-480V"],
    ["TERA", "TERA1-48K-480V"],
    ["TERA", "TERA2-1D1U-48K-480V"],
    ["TERA", "TERA2-1D1U-48K-EM-480V"],
    ["TERA", "TERA4-2D2U-48K-480V"],
    ["TERA", "TERA4-2D2U-48K-EM-480V"],
    ["DECA", "DECA8-SO-48K-480V"]
];

function up(db) {

    db.exec(`
        CREATE TABLE product_skus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER,
            updated_at INTEGER
        )
    `);

    db.exec("CREATE INDEX idx_product_skus_family ON product_skus (family_id)");

    const now = Date.now();
    const family = db.prepare("SELECT id FROM product_families WHERE prefix = ?");
    const add = db.prepare("INSERT INTO product_skus (family_id, sku, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)");

    for (const [prefix, sku] of SPACEX_SKUS) {

        const f = family.get(prefix);

        if (f)
            add.run(f.id, sku, now, now);

    }

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS product_skus");

}

module.exports = { up, down, SPACEX_SKUS };
