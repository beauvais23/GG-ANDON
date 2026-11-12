//------------------------------------------------------
// 0026 Weekly #mos-system health post (Director, Nov 11 2026)
//
// One row per report sent (kind + period), so a redeploy on a Monday
// never sends the weekly "all systems OK" post twice.
//
// Reversible: down drops the table.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE system_reports (
            kind TEXT NOT NULL,
            period TEXT NOT NULL,
            sent_at INTEGER NOT NULL,
            ok INTEGER NOT NULL,
            summary TEXT,
            PRIMARY KEY (kind, period)
        )
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS system_reports");

}

module.exports = { up, down };
