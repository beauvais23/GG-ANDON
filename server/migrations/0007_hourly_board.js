//------------------------------------------------------
// 0007 Hour-by-hour board, H1: families, rates, plans
// (Nov 3 2026)
//
// - product_families: one row per SKU prefix, copied from
//   the G&G SHIP REPORT's Team A / Team B tabs (the same
//   prefix → team logic), plus the SpaceX families and the
//   Coating station. A SKU belongs to the family whose
//   prefix it starts with (hyphens ignored, longest prefix
//   wins); SKUs that match no prefix (accessories,
//   numbered parts, CNTL) are on no board.
// - rates: units per hour for a family, or for one SKU
//   (overrides its family), each with an effective date.
//   Entered by hand in Admin.
// - plans / plan_runs: a board's day as a sequence of runs
//   (SKU + qty, or no qty = to end of shift). Each run keeps
//   the rate used when the plan was saved (snapshot).
//
// Reversible: down drops the four tables.
//------------------------------------------------------

const TEAM_A = ["DMXP4", "DMXP8", "FBL2", "FBL4", "FBL8", "FPX2", "FPX4", "FPX8", "MAX6", "MAXPT6", "TRX2", "TRX4", "TRX8", "VVLBFP", "Z-DMX"];
const TEAM_B = ["EDGE6", "EDGE8", "GPX2", "GPX4", "GPX6", "GPX8", "HLX2", "HLX4", "HLX8", "NANO4", "NANO6", "RTX4", "VAC4", "VAC6", "VAC8", "VLS6", "VLS8", "VPX2", "VPX4", "VPX8", "WPX2", "WPX4", "WPX6", "WPX8", "WPXP2"];

const FAMILIES = [
    ...TEAM_A.map(p => ["Team A", p]),
    ...TEAM_B.map(p => ["Team B", p]),
    ["Gigabay", "GIGA"],
    ["Gigabay - Vertical", "GIGA8-VERT"],
    ["Terabay", "TERA"],
    ["Deca", "DECA"],
    ["Coating", "30-"]
];

function up(db) {

    db.exec(`
        CREATE TABLE product_families (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board TEXT NOT NULL,
            prefix TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER,
            updated_at INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER,
            sku TEXT,
            units_per_hour REAL NOT NULL CHECK (units_per_hour > 0),
            effective_date TEXT NOT NULL,
            created_at INTEGER,
            CHECK ((family_id IS NULL) <> (sku IS NULL))
        )
    `);

    db.exec("CREATE INDEX idx_rates_family ON rates (family_id, effective_date)");
    db.exec("CREATE INDEX idx_rates_sku ON rates (sku, effective_date)");

    db.exec(`
        CREATE TABLE plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board TEXT NOT NULL,
            plan_date TEXT NOT NULL,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE (board, plan_date)
        )
    `);

    db.exec(`
        CREATE TABLE plan_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            sku TEXT NOT NULL,
            family_id INTEGER NOT NULL,
            qty INTEGER,
            rate REAL NOT NULL
        )
    `);

    const now = Date.now();
    const add = db.prepare("INSERT INTO product_families (board, prefix, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)");

    for (const [board, prefix] of FAMILIES)
        add.run(board, prefix, now, now);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS plan_runs");
    db.exec("DROP TABLE IF EXISTS plans");
    db.exec("DROP TABLE IF EXISTS rates");
    db.exec("DROP TABLE IF EXISTS product_families");

}

module.exports = { up, down, FAMILIES };
