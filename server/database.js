const Database = require("better-sqlite3");
const path = require("path");

const dbPath =
    process.env.DATABASE_PATH ||
    path.join(__dirname, "andon.db");

console.log(`✓ Database path: ${dbPath}`);

// Must run before the database is opened.
require("./migrations/restore").restoreIfRequested(dbPath);

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

//------------------------------------------------------
// Schema (numbered migrations in ./migrations)
//------------------------------------------------------

const { migrateUp } = require("./migrations/runner");

migrateUp(db, dbPath);

// Month buckets for trends use New York time, not UTC.
const { monthNY } = require("./services/nyTime");

db.function(
    "ny_month",
    { deterministic: true },
    ms => (ms === null ? null : monthNY(Number(ms)))
);

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
// Response Team
//
// Not seeded. People are entered per environment in
// Admin → Responders (CLAUDE.md hard rule 4).
//------------------------------------------------------

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

        getDuplicateActiveAlert: db.prepare(`
        SELECT *
        FROM alerts
        WHERE production_line = ?
          AND work_center = ?
          AND type = ?
          AND status IN ('ACTIVE', 'ACKNOWLEDGED')
        ORDER BY requested ASC
        LIMIT 1
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

SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) AS resolvedAlerts

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

ny_month(requested) AS month,

COUNT(*) AS total

FROM alerts

GROUP BY month

ORDER BY month

`),

// Response and resolution trends are computed in working
// time by services/workingTime.js (#18).

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

// Only replaces the placeholder note a Telegram resolve
// wrote; the first note added wins (#14b).
getAlertsNeedingNote: db.prepare(`
    SELECT *
    FROM alerts
    WHERE status='RESOLVED'
      AND resolution_notes=?
    ORDER BY resolved DESC
    LIMIT 50
`),

saveTelegramNote: db.prepare(`
    UPDATE alerts
    SET
        resolution_notes=?,
        updated_at=?
    WHERE
        id=?
        AND status='RESOLVED'
        AND resolution_notes=?
`),

// "Clear all" on Needs a resolution note.
clearAllTelegramNotes: db.prepare(`
    UPDATE alerts
    SET
        resolution_notes=?,
        updated_at=?
    WHERE
        status='RESOLVED'
        AND resolution_notes=?
`),

cancelAlert: db.prepare(`
    UPDATE alerts
    SET
        status='CANCELLED',
        cancelled_at=?,
        updated_at=?,
        resolution_notes=COALESCE(?, resolution_notes)
    WHERE id=?
`),

// NEAR_MISS is saved already closed: no acknowledge, no wait.
logNearMiss: db.prepare(`
    UPDATE alerts
    SET
        status='RESOLVED',
        resolved=requested,
        resolved_by=?,
        resolution_notes=?,
        updated_at=?,
        duration_seconds=0
    WHERE
        id=?
        AND status='ACTIVE'
        AND type='NEAR_MISS'
`),

// "Pressed by mistake" on a logged near miss: cancelled, and the
// copied resolve time cleared like any cancel (#19).
cancelLoggedNearMiss: db.prepare(`
    UPDATE alerts
    SET
        status='CANCELLED',
        cancelled_at=?,
        updated_at=?,
        resolved=NULL,
        resolved_by=NULL,
        duration_seconds=NULL,
        resolution_notes=?
    WHERE
        id=?
        AND status='RESOLVED'
        AND type='NEAR_MISS'
        AND resolution_notes=?
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
          AND archived_at IS NULL
        ORDER BY name
    `),

    // Includes archived: the duplicate-name check uses it.


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

countAcknowledgedAlertsFor: db.prepare(`
    SELECT COUNT(*) AS n
    FROM alerts
    WHERE assigned_to=?
      AND status='ACKNOWLEDGED'
`),

updateResponderAvailability: db.prepare(`
    UPDATE response_team
    SET
        availability=?,
        updated_at=?
    WHERE name=?
`),

//--------------------------------------------------
// Archive (#15): never DELETE lines or responders
//--------------------------------------------------

archiveResponder: db.prepare(`
    UPDATE response_team
    SET
        active=0,
        archived_at=?,
        updated_at=?
    WHERE id=?
      AND archived_at IS NULL
`),

restoreResponder: db.prepare(`
    UPDATE response_team
    SET
        active=1,
        archived_at=NULL,
        updated_at=?
    WHERE id=?
      AND archived_at IS NOT NULL
`),

getArchivedResponseTeam: db.prepare(`
    SELECT *
    FROM response_team
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at DESC
`),

countOpenAlertsForLine: db.prepare(`
    SELECT COUNT(*) AS n
    FROM alerts
    WHERE production_line=?
      AND status IN ('ACTIVE', 'ACKNOWLEDGED')
`),

//--------------------------------------------------
// Production Lines
//--------------------------------------------------

getProductionLines: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE archived_at IS NULL
    ORDER BY display_order
`),

getActiveProductionLines: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE active = 1
      AND archived_at IS NULL
    ORDER BY display_order
`),

getProductionLine: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE id=?
`),

getProductionLineByName: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE name=?
`),

getArchivedProductionLines: db.prepare(`
    SELECT *
    FROM production_lines
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at DESC
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

// Work centers stay with the line, untouched; they are
// hidden while the line is archived and return with it.
archiveProductionLine: db.prepare(`
    UPDATE production_lines
    SET
        active=0,
        archived_at=?,
        modified=?
    WHERE id=?
      AND archived_at IS NULL
`),

restoreProductionLine: db.prepare(`
    UPDATE production_lines
    SET
        active=1,
        archived_at=NULL,
        modified=?
    WHERE id=?
      AND archived_at IS NOT NULL
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
    WHERE pl.archived_at IS NULL
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
      AND pl.archived_at IS NULL
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
        AND pl.archived_at IS NULL
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
        AND pl.archived_at IS NULL
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
`)

};

console.log("✓ SQLite database ready");

module.exports = {
    db,
    dbPath,
    statements
};