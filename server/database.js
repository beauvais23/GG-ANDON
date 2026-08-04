const Database = require("better-sqlite3");

const db = new Database("andon.db");

db.pragma("journal_mode = WAL");

//------------------------------------------------------
// Alerts Table
//------------------------------------------------------

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

//------------------------------------------------------
// Database Upgrades
//------------------------------------------------------

try {

    db.exec(`
        ALTER TABLE alerts
        ADD COLUMN google_message_id TEXT
    `);

} catch {}

try {

    db.exec(`
        ALTER TABLE alerts
        ADD COLUMN telegram_message_id TEXT
    `);

} catch {}



//------------------------------------------------------
// Response Team Table
//------------------------------------------------------

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

//------------------------------------------------------
// Production Line Table
//------------------------------------------------------

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

//------------------------------------------------------
// Work Centers Table
//------------------------------------------------------

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

const count =
    db.prepare(
        "SELECT COUNT(*) AS count FROM production_lines"
    ).get();

if (count.count === 0) {

    const now = Date.now();

    const insert =
        db.prepare(`
            INSERT INTO production_lines
            (
                name,
                facility,
                display_order,
                color,
                active,
                created,
                modified
            )
            VALUES
            (?,?,?,?,?,?,?)
        `);

    insert.run("Team A","Malta",1,"#1976d2",1,now,now);
    insert.run("Team B","Malta",2,"#1976d2",1,now,now);
    insert.run("Gigabay","Malta",3,"#1976d2",1,now,now);
    insert.run("Terabay","Malta",4,"#1976d2",1,now,now);

}

//------------------------------------------------------
// KPI History
//------------------------------------------------------

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

//------------------------------------------------------
// Seed Work Centers
//------------------------------------------------------

const wcCount =
    db.prepare(
        "SELECT COUNT(*) AS count FROM work_centers"
    ).get();

if (wcCount.count === 0) {

    const now = Date.now();

    const getLine =
        db.prepare(`
            SELECT id
            FROM production_lines
            WHERE name=?
        `);

    const insertWC =
        db.prepare(`
            INSERT INTO work_centers
            (
                name,
                production_line_id,
                facility,
                display_order,
                active,
                created,
                modified
            )
            VALUES
            (?,?,?,?,?,?,?)
        `);

    const gigabay =
        getLine.get("Gigabay");

    if (gigabay) {

        insertWC.run(
            "Final Test",
            gigabay.id,
            "Malta",
            1,
            1,
            now,
            now
        );

        insertWC.run(
            "Assembly",
            gigabay.id,
            "Malta",
            2,
            1,
            now,
            now
        );

        insertWC.run(
            "Packaging",
            gigabay.id,
            "Malta",
            3,
            1,
            now,
            now
        );

    }

}



//------------------------------------------------------
// Seed Response Team
//------------------------------------------------------

const existing = db
    .prepare("SELECT COUNT(*) AS count FROM response_team")
    .get();

if (existing.count === 0) {

    const insert = db.prepare(`
        INSERT INTO response_team
        (
            name,
            department,
            job_title,
            phone,
            email,
            availability,
            active,
            created_at,
            updated_at
        )
        VALUES
        (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `);

    const now = Date.now();

    insert.run(
        "Steve Vielleux",
        "Operations",
        "Production Manager",
        "",
        "",
        "AVAILABLE",
        1,
        now,
        now
    );

    insert.run(
        "John Smith",
        "Maintenance",
        "Maintenance Technician",
        "",
        "",
        "AVAILABLE",
        1,
        now,
        now
    );

    insert.run(
        "Susan Brown",
        "Leadership",
        "Production Supervisor",
        "",
        "",
        "AVAILABLE",
        1,
        now,
        now
    );

}


//------------------------------------------------------
// SQL Statements
//------------------------------------------------------

const statements = {

    //--------------------------------------------------
    // Alerts
    //--------------------------------------------------

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
        SELECT
    alerts.*,
    response_team.availability
FROM alerts
LEFT JOIN response_team
ON alerts.assigned_to = response_team.name
WHERE alerts.status IN ('ACTIVE','ACKNOWLEDGED')
ORDER BY alerts.requested ASC
    `),

    //--------------------------------------------------
// Executive Dashboard KPI Queries
//--------------------------------------------------

getDashboardKPIs: db.prepare(`

SELECT

COUNT(*) AS totalAlerts,

SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS activeAlerts,

SUM(CASE WHEN status='ACKNOWLEDGED' THEN 1 ELSE 0 END) AS acknowledgedAlerts,

SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) AS resolvedAlerts,

ROUND(AVG(acknowledged-requested)/1000,0) AS avgResponseSeconds,

ROUND(AVG(resolved-requested)/1000,0) AS avgResolutionSeconds

FROM alerts

`),

getAlertPareto: db.prepare(`

SELECT

type,

COUNT(*) AS total

FROM alerts

GROUP BY type

ORDER BY total DESC

`),

getMonthlyTrend: db.prepare(`

SELECT

strftime('%Y-%m', requested/1000,'unixepoch') AS month,

COUNT(*) AS total

FROM alerts

GROUP BY month

ORDER BY month

`),

getResponseTrend: db.prepare(`

SELECT

strftime('%Y-%m', requested/1000,'unixepoch') AS month,

ROUND(AVG(acknowledged-requested)/1000,0) AS responseSeconds

FROM alerts

WHERE acknowledged IS NOT NULL

GROUP BY month

ORDER BY month

`),

getResolutionTrend: db.prepare(`

SELECT

strftime('%Y-%m', requested/1000,'unixepoch') AS month,

ROUND(AVG(resolved-requested)/1000,0) AS resolutionSeconds

FROM alerts

WHERE resolved IS NOT NULL

GROUP BY month

ORDER BY month

`),

    acknowledgeAlert: db.prepare(`
    UPDATE alerts
    SET
        status='ACKNOWLEDGED',
        acknowledged=?,
        acknowledged_by=?,
        assigned_to=?,
        updated_at=?
    WHERE
        id=?
        AND status='ACTIVE'
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
    WHERE
        id=?
        AND status='ACKNOWLEDGED'
`),

cancelAlert: db.prepare(`
    UPDATE alerts
    SET
        status='CANCELLED',
        resolved=?,
        updated_at=?
    WHERE id=?
`),

saveTelegramMessageId: db.prepare(`
    UPDATE alerts
    SET
        telegram_message_id=?,
        updated_at=?
    WHERE id=?
`),

//--------------------------------------------------
// Response Team
//--------------------------------------------------

    //--------------------------------------------------
    // Response Team
    //--------------------------------------------------

    getResponseTeam: db.prepare(`
        SELECT *
        FROM response_team
        WHERE active = 1
        ORDER BY name
    `),

    getAllResponseTeam: db.prepare(`
        SELECT *
        FROM response_team
        ORDER BY name
    `),

    getResponder: db.prepare(`
        SELECT *
        FROM response_team
        WHERE id=?
    `),

    insertResponseTeam: db.prepare(`
        INSERT INTO response_team
        (
            name,
            department,
            job_title,
            phone,
            email,
            availability,
            active,
            created_at,
            updated_at
        )
        VALUES
        (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    `),

    updateResponseTeam: db.prepare(`
    UPDATE response_team
    SET
        name=?,
        department=?,
        job_title=?,
        phone=?,
        email=?,
        availability=?,
        active=?,
        updated_at=?
    WHERE id=?
`),

updateResponderAvailability: db.prepare(`
    UPDATE response_team
    SET
        availability=?,
        updated_at=?
    WHERE name=?
`),

deleteResponseTeam: db.prepare(`
    DELETE FROM response_team
    WHERE id=?
`),

//--------------------------------------------------
// Production Lines
//--------------------------------------------------

getProductionLines: db.prepare(`
    SELECT *
    FROM production_lines
    ORDER BY display_order
`),

getActiveProductionLines: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE active = 1
    ORDER BY display_order
`),

insertProductionLine: db.prepare(`
    INSERT INTO production_lines
    (
        name,
        facility,
        description,
        display_order,
        color,
        active,
        created,
        modified
    )
    VALUES
    (?,?,?,?,?,?,?,?)
`),

updateProductionLine: db.prepare(`
    UPDATE production_lines
    SET
        name=?,
        facility=?,
        description=?,
        display_order=?,
        color=?,
        active=?,
        modified=?
    WHERE id=?
`),

updateProductionLineDisplayOrder: db.prepare(`
    UPDATE production_lines
    SET
        display_order=?,
        modified=?
    WHERE id=?
`),

deleteProductionLine: db.prepare(`
    DELETE FROM production_lines
    WHERE id=?
`),



//--------------------------------------------------
// Work Centers
//--------------------------------------------------

getWorkCenters: db.prepare(`
    SELECT
        wc.*,
        pl.name AS production_line_name
    FROM work_centers wc
    JOIN production_lines pl
        ON wc.production_line_id = pl.id
    ORDER BY
        pl.display_order,
        wc.display_order
`),

getActiveWorkCenters: db.prepare(`
    SELECT
        wc.*,
        pl.name AS production_line_name
    FROM work_centers wc
    JOIN production_lines pl
        ON wc.production_line_id = pl.id
    WHERE wc.active = 1
    ORDER BY
        pl.display_order,
        wc.display_order
`),

getWorkCentersByProductionLine: db.prepare(`
    SELECT *
    FROM work_centers
    WHERE
        production_line_id = ?
        AND active = 1
    ORDER BY display_order
`),

getWorkCentersByProductionLineName: db.prepare(`
    SELECT
        wc.*,
        pl.name AS production_line_name
    FROM work_centers wc
    JOIN production_lines pl
        ON wc.production_line_id = pl.id
    WHERE
        pl.name = ?
        AND wc.active = 1
    ORDER BY wc.display_order
`),

getValidWorkCenter: db.prepare(`
    SELECT
        wc.*,
        pl.name AS production_line_name
    FROM work_centers wc
    JOIN production_lines pl
        ON wc.production_line_id = pl.id
    WHERE
        pl.name = ?
        AND wc.name = ?
        AND pl.active = 1
        AND wc.active = 1
    LIMIT 1
`),

insertWorkCenter: db.prepare(`
    INSERT INTO work_centers
    (
        production_line_id,
        name,
        facility,
        display_order,
        active,
        created,
        modified
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
`),

updateWorkCenter: db.prepare(`
    UPDATE work_centers
    SET
        name=?,
        production_line_id=?,
        facility=?,
        display_order=?,
        active=?,
        modified=?
    WHERE id=?
`),

updateWorkCenterDisplayOrder: db.prepare(`
    UPDATE work_centers
    SET
        display_order=?,
        modified=?
    WHERE id=?
`),

deleteWorkCenter: db.prepare(`
    DELETE FROM work_centers
    WHERE id=?
`)

};

console.log("✓ SQLite database ready");

module.exports = {
    db,
    statements
};