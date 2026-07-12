const Database = require("better-sqlite3");

const db = new Database("andon.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS alerts (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    facility TEXT NOT NULL,

    production_line TEXT NOT NULL,

    work_center TEXT NOT NULL,

    type TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',

    requested INTEGER NOT NULL,

    acknowledged INTEGER,

    resolved INTEGER,

    acknowledged_by TEXT,

    resolved_by TEXT,

    resolution_notes TEXT,

    priority TEXT DEFAULT 'NORMAL',

    shift TEXT,

    created_at INTEGER NOT NULL,

    updated_at INTEGER NOT NULL,

    duration_seconds INTEGER

);
`);

const statements = {

    insertAlert: db.prepare(`
        INSERT INTO alerts
        (
            facility,
            production_line,
            work_center,
            type,
            status,
            requested,
            priority,
            created_at,
            updated_at
        )
        VALUES
        (
            ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?
        )
    `),

    getAlert: db.prepare(`
        SELECT *
        FROM alerts
        WHERE id = ?
    `),

    getAllAlerts: db.prepare(`
        SELECT *
        FROM alerts
        ORDER BY requested DESC
    `),

    getActiveAlerts: db.prepare(`
        SELECT *
        FROM alerts
        WHERE status IN ('ACTIVE','ACKNOWLEDGED')
        ORDER BY requested ASC
    `),

    acknowledgeAlert: db.prepare(`
        UPDATE alerts
        SET
            status='ACKNOWLEDGED',
            acknowledged=?,
            acknowledged_by=?,
            updated_at=?
        WHERE id=?
    `),

    resolveAlert: db.prepare(`
        UPDATE alerts
        SET
            status='RESOLVED',
            resolved=?,
            resolved_by=?,
            resolution_notes=?,
            updated_at=?,
            duration_seconds=(?-requested)/1000
        WHERE id=?
    `),

    cancelAlert: db.prepare(`
        UPDATE alerts
        SET
            status='CANCELLED',
            resolved=?,
            updated_at=?
        WHERE id=?
    `)

};

console.log("✓ SQLite database ready");

module.exports = {
    db,
    statements
};