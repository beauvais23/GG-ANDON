//------------------------------------------------------
// 0001 Baseline
//
// The schema as it existed at commit 39e8b5d5, which
// database.js created on every boot. Every statement is
// IF NOT EXISTS or guarded, so against the live database
// this changes nothing; it only records version 1.
//------------------------------------------------------

function columnExists(db, table, column) {

    return db.prepare(`PRAGMA table_info(${table})`)
        .all()
        .some(c => c.name === column);

}

function up(db) {

    db.exec(`
        CREATE TABLE IF NOT EXISTS alerts (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            facility TEXT,

            production_line TEXT NOT NULL,

            work_center TEXT NOT NULL,

            type TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'ACTIVE',

            requested INTEGER NOT NULL,

            acknowledged INTEGER,

            resolved INTEGER,

            acknowledged_by TEXT,

            assigned_to TEXT,

            resolved_by TEXT,

            resolution_notes TEXT,

            priority TEXT DEFAULT 'NORMAL',

        shift TEXT,

        created_at INTEGER NOT NULL,

        updated_at INTEGER NOT NULL,

        duration_seconds INTEGER,

        google_message_id TEXT,

        telegram_message_id TEXT

        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS response_team (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            department TEXT NOT NULL,

            job_title TEXT,

            phone TEXT,

            email TEXT,

            availability TEXT NOT NULL DEFAULT 'AVAILABLE',

            active INTEGER DEFAULT 1,

            created_at INTEGER,

            updated_at INTEGER

        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS production_lines (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL UNIQUE,

            facility TEXT NOT NULL,

            description TEXT,

            display_order INTEGER NOT NULL,

            color TEXT DEFAULT '#1976d2',

            active INTEGER DEFAULT 1,

            created INTEGER,

            modified INTEGER

        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS work_centers (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            production_line_id INTEGER NOT NULL,

            facility TEXT NOT NULL,

            display_order INTEGER NOT NULL DEFAULT 0,

            active INTEGER DEFAULT 1,

            created INTEGER,

            modified INTEGER

        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS kpi_history (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            month TEXT NOT NULL,

            total_alerts INTEGER DEFAULT 0,

            quality INTEGER DEFAULT 0,

            maintenance INTEGER DEFAULT 0,

            materials INTEGER DEFAULT 0,

            engineering INTEGER DEFAULT 0,

            safety INTEGER DEFAULT 0,

            supervisor_response_seconds REAL DEFAULT 0,

            resolution_seconds REAL DEFAULT 0,

            created INTEGER

        );
    `);

    // Formerly ad-hoc ALTERs wrapped in try/catch
    // (database.js:68-84 at 39e8b5d5).
    for (const column of ["google_message_id", "telegram_message_id"]) {

        if (!columnExists(db, "alerts", column)) {

            db.exec(`ALTER TABLE alerts ADD COLUMN ${column} TEXT`);

        }

    }

}

function down() {

    // Reverting the baseline would drop every table and all
    // alert history. Restore a file from /data/backups instead.
    throw new Error(
        "0001_baseline cannot be reverted. Restore a database backup instead."
    );

}

module.exports = { up, down };
