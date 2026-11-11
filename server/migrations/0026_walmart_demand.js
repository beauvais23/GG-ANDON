//------------------------------------------------------
// 0026 Walmart release schedule (Director, Nov 11 2026)
//
// Walmart's demand planner ("G&G INVENTORY DEMAND MM.DD.YYYY.xlsx",
// via Loeb) is pasted on the Backlog page. Each paste replaces the
// schedule: walmart_demand_imports keeps one row per paste (history),
// walmart_releases holds only the current schedule (one row per
// EID × month with a qty). The backlog shows one row per release
// month with its own RAG; the Loeb blanket SOs stay grey.
//
// Reversible: down drops both tables.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE walmart_demand_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_label TEXT,
            imported_by TEXT NOT NULL,
            imported_at INTEGER NOT NULL,
            releases INTEGER NOT NULL,
            units REAL NOT NULL
        );

        CREATE TABLE walmart_releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id INTEGER NOT NULL,
            eid TEXT,
            description TEXT,
            sku TEXT NOT NULL,
            month TEXT NOT NULL,
            immediate INTEGER NOT NULL DEFAULT 0,
            qty REAL NOT NULL,
            commit_qty REAL,
            commit_date TEXT,
            due TEXT NOT NULL,
            notes TEXT
        );

        CREATE INDEX idx_walmart_releases_due ON walmart_releases(due);
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS walmart_releases; DROP TABLE IF EXISTS walmart_demand_imports;");

}

module.exports = { up, down };
