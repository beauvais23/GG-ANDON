//------------------------------------------------------
// 0028 Ship Report → backlog notes sync (Director, Nov 12 2026)
//
// The backlog page reads the G&G SHIP REPORT sheet (COMMENTS,
// RECOVERY DATE, SO NOTE) every 30 min. ship_report_seen keeps the
// last value read per SO and field, so only a value that changed in
// the sheet is written to backlog_notes; edits made on the page stay
// until the sheet changes again. ship_report_runs logs each pull.
//
// Reversible: down drops both tables.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE ship_report_seen (
            so TEXT PRIMARY KEY,
            comment TEXT,
            recovery_date TEXT,
            so_note TEXT,
            seen_at INTEGER NOT NULL
        );

        CREATE TABLE ship_report_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at INTEGER NOT NULL,
            finished_at INTEGER,
            ok INTEGER NOT NULL DEFAULT 0,
            trigger TEXT,
            sos INTEGER,
            changed INTEGER,
            warnings TEXT,
            error TEXT
        );
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS ship_report_seen; DROP TABLE IF EXISTS ship_report_runs;");

}

module.exports = { up, down };
