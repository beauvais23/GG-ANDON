//------------------------------------------------------
// 0009 Hour-by-hour board, H2: actuals (Nov 3 2026)
//
// - board_taps: one row per good unit through Final Test
//   (PCB Coating: the Production work center), one tap per
//   unit on the tablet. tap_id is made on the tablet, so a
//   tap re-sent from the offline queue is stored once.
//   period is the hour period of the tap (0 = 6:00-7:00 …
//   10 = 4:00-4:30) on the New York date plan_date.
//   undone_at marks a tap taken back with Undo (kept, not
//   counted).
// - hourly_settings: RAG thresholds (percent of plan):
//   green at or above green_pct, amber at or above
//   amber_pct, red below. Admin-editable.
//
// Reversible: down drops both tables.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE board_taps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tap_id TEXT NOT NULL UNIQUE,
            board TEXT NOT NULL,
            plan_date TEXT NOT NULL,
            period INTEGER NOT NULL,
            sku TEXT NOT NULL,
            production_line TEXT,
            work_center TEXT,
            tapped_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            undone_at INTEGER
        )
    `);

    db.exec("CREATE INDEX idx_board_taps_day ON board_taps (board, plan_date)");

    db.exec(`
        CREATE TABLE hourly_settings (
            key TEXT PRIMARY KEY,
            value REAL NOT NULL,
            updated_at INTEGER
        )
    `);

    const add = db.prepare("INSERT INTO hourly_settings (key, value, updated_at) VALUES (?, ?, ?)");

    add.run("green_pct", 100, Date.now());
    add.run("amber_pct", 90, Date.now());

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS hourly_settings");
    db.exec("DROP TABLE IF EXISTS board_taps");

}

module.exports = { up, down };
