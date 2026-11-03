//------------------------------------------------------
// 0008 SKU list per board + PCB Coating board name
// (Nov 3 2026)
//
// product_skus: the SKUs listed under each family in
// Admin → Products & rates and offered in the plan
// editor's SKU dropdown. Seeded from data/0008_skus.json:
// the active assemblies in QuickBooks on Nov 3 2026 that
// match a 0007 family (Team A 190, Team B 647, SpaceX 19),
// plus the 30 coatable PCB item numbers. The ANDON server
// can't reach QuickBooks, so later SKUs are added in Admin.
// A listed SKU uses its family's rate unless it has its
// own.
//
// The Coating board is renamed PCB Coating, the name of
// its production line (one board per app line).
//
// Reversible: down drops the list and renames the board
// back.
//------------------------------------------------------

const { families: SEED } = require("./data/0008_skus.json");

const BOARD_OLD = "Coating";
const BOARD_NEW = "PCB Coating";

function renameBoard(db, from, to) {

    db.prepare("UPDATE product_families SET board = ? WHERE board = ?").run(to, from);
    db.prepare("UPDATE plans SET board = ? WHERE board = ?").run(to, from);

}

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
    const add = db.prepare("INSERT OR IGNORE INTO product_skus (family_id, sku, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)");

    for (const [prefix, skus] of Object.entries(SEED)) {

        const f = family.get(prefix);

        if (f)
            for (const sku of skus)
                add.run(f.id, sku, now, now);

    }

    renameBoard(db, BOARD_OLD, BOARD_NEW);

}

function down(db) {

    renameBoard(db, BOARD_NEW, BOARD_OLD);

    db.exec("DROP TABLE IF EXISTS product_skus");

}

module.exports = { up, down };
