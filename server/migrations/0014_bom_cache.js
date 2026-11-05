//------------------------------------------------------
// 0014 QuickBooks BOM cache (Nov 5 2026)
//
// The BOM viewer reads QuickBooks Desktop through CData
// Connect AI (read only; never writes to QuickBooks).
//
// qb_items:      every QuickBooks item (active and inactive),
//                replaced as a whole on each item refresh
//                (about 4,800 rows; nightly + Admin Refresh).
// qb_bom_lines:  level-1 BOM lines per assembly, fetched when
//                someone opens that BOM; kept 1 hour, and kept
//                as the last good copy if CData is down.
// qb_bom_fetched: when each assembly's lines were fetched.
// qb_sync_log:   each refresh / fetch: ok or the error.
//
// Reversible: down drops the four tables.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE qb_items (
            full_name TEXT PRIMARY KEY,
            type TEXT,
            description TEXT,
            uom TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            on_hand REAL,
            time_modified TEXT
        )
    `);

    db.exec(`
        CREATE TABLE qb_bom_lines (
            assembly TEXT NOT NULL,
            line INTEGER NOT NULL,
            component TEXT NOT NULL,
            qty REAL,
            uom TEXT,
            PRIMARY KEY (assembly, line)
        )
    `);

    db.exec(`
        CREATE TABLE qb_bom_fetched (
            assembly TEXT PRIMARY KEY,
            fetched_at INTEGER NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE qb_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            finished_at INTEGER,
            ok INTEGER NOT NULL DEFAULT 0,
            rows INTEGER,
            error TEXT
        )
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS qb_sync_log");
    db.exec("DROP TABLE IF EXISTS qb_bom_fetched");
    db.exec("DROP TABLE IF EXISTS qb_bom_lines");
    db.exec("DROP TABLE IF EXISTS qb_items");

}

module.exports = { up, down };
