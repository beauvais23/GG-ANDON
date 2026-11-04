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

// Admin → Near misses (Void). Newest first.
getLoggedNearMisses: db.prepare(`
    SELECT id, production_line, work_center, requested
    FROM alerts
    WHERE type='NEAR_MISS'
      AND status='RESOLVED'
      AND resolution_notes=?
    ORDER BY requested DESC
    LIMIT ?
`),

//--------------------------------------------------
// Escalation matrix, shadow mode (0006)
//--------------------------------------------------

getEscalationRules: db.prepare(`
    SELECT * FROM escalation_rules
    ORDER BY alert_type <> '*', alert_type, CASE step WHEN 'START' THEN 0 WHEN 'UNACK' THEN 1 ELSE 2 END, minutes, role
`),

getActiveEscalationRules: db.prepare(`
    SELECT * FROM escalation_rules WHERE active = 1
`),

getEscalationRule: db.prepare(`
    SELECT * FROM escalation_rules WHERE id = ?
`),

insertEscalationRule: db.prepare(`
    INSERT INTO escalation_rules (alert_type, step, minutes, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
`),

updateEscalationRule: db.prepare(`
    UPDATE escalation_rules SET minutes = ?, active = ?, updated_at = ? WHERE id = ?
`),

deleteEscalationRule: db.prepare(`
    DELETE FROM escalation_rules WHERE id = ?
`),

getRoutingTeam: db.prepare(`
    SELECT id, name, department, job_title, role, line_group, active
    FROM response_team
    WHERE archived_at IS NULL
    ORDER BY name
`),

setResponderRole: db.prepare(`
    UPDATE response_team SET role = ?, line_group = ?, updated_at = ?
    WHERE id = ? AND archived_at IS NULL
`),

getLineGroups: db.prepare(`
    SELECT name, line_group
    FROM production_lines
    WHERE archived_at IS NULL
`),

getAlertsSince: db.prepare(`
    SELECT * FROM alerts WHERE requested >= ?
`),

logEscalation: db.prepare(`
    INSERT OR IGNORE INTO escalation_log
    (alert_id, rule_id, alert_type, production_line, step, minutes, role, recipients, fired_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`),

getEscalationLog: db.prepare(`
    SELECT * FROM escalation_log WHERE fired_at >= ? ORDER BY fired_at DESC LIMIT ?
`),

//--------------------------------------------------
// Hour-by-hour board, H1 (0007)
//--------------------------------------------------

getProductFamilies: db.prepare(`
    SELECT * FROM product_families ORDER BY board, prefix
`),

getProductFamily: db.prepare(`
    SELECT * FROM product_families WHERE id = ?
`),

getFamilyRateOn: db.prepare(`
    SELECT * FROM rates WHERE family_id = ? AND effective_date <= ?
    ORDER BY effective_date DESC, id DESC LIMIT 1
`),

getSkuRateOn: db.prepare(`
    SELECT * FROM rates WHERE sku = ? AND effective_date <= ?
    ORDER BY effective_date DESC, id DESC LIMIT 1
`),

getRatesForFamily: db.prepare(`
    SELECT * FROM rates WHERE family_id = ? ORDER BY effective_date DESC, id DESC
`),

getSkuRates: db.prepare(`
    SELECT * FROM rates WHERE sku IS NOT NULL ORDER BY sku, effective_date DESC, id DESC
`),

insertRate: db.prepare(`
    INSERT INTO rates (family_id, sku, units_per_hour, effective_date, created_at)
    VALUES (?, ?, ?, ?, ?)
`),

deleteRate: db.prepare(`
    DELETE FROM rates WHERE id = ?
`),

getBoardSkus: db.prepare(`
    SELECT s.id, s.sku, s.family_id, f.prefix, f.board
    FROM product_skus s JOIN product_families f ON f.id = s.family_id
    WHERE s.active = 1 AND f.board = ?
    ORDER BY f.prefix, s.sku
`),

getListedSkus: db.prepare(`
    SELECT sku FROM product_skus WHERE active = 1
`),

getSku: db.prepare(`
    SELECT * FROM product_skus WHERE sku = ?
`),

insertSku: db.prepare(`
    INSERT INTO product_skus (family_id, sku, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
`),

relistSku: db.prepare(`
    UPDATE product_skus SET family_id = ?, active = 1, updated_at = ? WHERE id = ?
`),

unlistSku: db.prepare(`
    UPDATE product_skus SET active = 0, updated_at = ? WHERE id = ? AND active = 1
`),

//--------------------------------------------------
// Hour-by-hour board, H2 (0009)
//--------------------------------------------------

getTap: db.prepare(`
    SELECT * FROM board_taps WHERE tap_id = ?
`),

insertTap: db.prepare(`
    INSERT OR IGNORE INTO board_taps (tap_id, board, plan_date, period, sku, production_line, work_center, tapped_at, created_at, station)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`),

undoTap: db.prepare(`
    UPDATE board_taps SET undone_at = ? WHERE tap_id = ? AND undone_at IS NULL
`),

// Actual per hour and SKU = taps (not undone) + corrections (0010).
getActuals: db.prepare(`
    SELECT period, sku, SUM(n) AS n, SUM(adj) AS adjusted FROM (
        SELECT period, sku, COUNT(*) AS n, 0 AS adj FROM board_taps
        WHERE board = @board AND plan_date = @date AND undone_at IS NULL AND station = 'FINAL'
        GROUP BY period, sku
        UNION ALL
        SELECT period, sku, SUM(delta) AS n, SUM(delta) AS adj FROM board_adjustments
        WHERE board = @board AND plan_date = @date
        GROUP BY period, sku
    )
    GROUP BY period, sku
`),

insertAdjustment: db.prepare(`
    INSERT INTO board_adjustments (board, plan_date, period, sku, delta, reason, adjusted_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`),

getAdjustments: db.prepare(`
    SELECT * FROM board_adjustments WHERE board = ? AND plan_date = ? ORDER BY created_at DESC, id DESC
`),

getHourlySettings: db.prepare(`
    SELECT key, value FROM hourly_settings
`),

setHourlySetting: db.prepare(`
    UPDATE hourly_settings SET value = ?, updated_at = ? WHERE key = ?
`),

//--------------------------------------------------
// Hour-by-hour board, H3 (0011): failures, rework, scrap
//--------------------------------------------------

getFailureCodes: db.prepare(`
    SELECT * FROM failure_codes ORDER BY sort, code
`),

getFailureCode: db.prepare(`
    SELECT * FROM failure_codes WHERE code = ?
`),

insertFailureCode: db.prepare(`
    INSERT INTO failure_codes (code, label, grp, sort, active, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 10 FROM failure_codes), 1, ?, ?)
`),

setFailureCodeActive: db.prepare(`
    UPDATE failure_codes SET active = ?, updated_at = ? WHERE id = ?
`),

getFailure: db.prepare(`
    SELECT * FROM board_failures WHERE fail_id = ?
`),

insertFailure: db.prepare(`
    INSERT OR IGNORE INTO board_failures (fail_id, board, plan_date, period, sku, code, production_line, work_center, failed_at, created_at, station)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`),

undoFailure: db.prepare(`
    UPDATE board_failures SET undone_at = ? WHERE fail_id = ? AND undone_at IS NULL AND disposition IS NULL
`),

disposeFailure: db.prepare(`
    UPDATE board_failures
    SET disposition = ?, disposition_at = ?, disposition_date = ?, disposition_period = ?, disposition_by = ?
    WHERE fail_id = ? AND undone_at IS NULL AND disposition IS NULL
`),

getOpenFailures: db.prepare(`
    SELECT * FROM board_failures
    WHERE board = ? AND station = ? AND undone_at IS NULL AND disposition IS NULL
    ORDER BY failed_at
`),

getFailsByPeriod: db.prepare(`
    SELECT period, code, COUNT(*) AS n FROM board_failures
    WHERE board = ? AND plan_date = ? AND undone_at IS NULL AND station = 'FINAL'
    GROUP BY period, code
`),

getDispositionsByPeriod: db.prepare(`
    SELECT disposition_period AS period, disposition, sku, COUNT(*) AS n FROM board_failures
    WHERE board = ? AND disposition_date = ? AND undone_at IS NULL AND disposition IS NOT NULL AND station = 'FINAL'
    GROUP BY disposition_period, disposition, sku
`),

//--------------------------------------------------
// PCB Test (0012) and reports (H4)
//--------------------------------------------------

getPcbDay: db.prepare(`
    SELECT 'PASS' AS kind, period, sku, NULL AS code, COUNT(*) AS n FROM board_taps
    WHERE board = ? AND plan_date = ? AND station = 'PCB' AND undone_at IS NULL
    GROUP BY period, sku
    UNION ALL
    SELECT 'FAIL' AS kind, period, sku, code, COUNT(*) AS n FROM board_failures
    WHERE board = ? AND plan_date = ? AND station = 'PCB' AND undone_at IS NULL
    GROUP BY period, sku, code
`),

reportTaps: db.prepare(`
    SELECT board, plan_date, period, sku, station, COUNT(*) AS n FROM board_taps
    WHERE plan_date BETWEEN ? AND ? AND undone_at IS NULL
    GROUP BY board, plan_date, period, sku, station
`),

reportAdjustments: db.prepare(`
    SELECT board, plan_date, period, sku, SUM(delta) AS n FROM board_adjustments
    WHERE plan_date BETWEEN ? AND ?
    GROUP BY board, plan_date, period, sku
`),

reportFailures: db.prepare(`
    SELECT board, plan_date, period, sku, code, station, COUNT(*) AS n FROM board_failures
    WHERE plan_date BETWEEN ? AND ? AND undone_at IS NULL
    GROUP BY board, plan_date, period, sku, code, station
`),

reportDispositions: db.prepare(`
    SELECT board, disposition_date AS plan_date, disposition_period AS period, sku, station, disposition, COUNT(*) AS n FROM board_failures
    WHERE disposition_date BETWEEN ? AND ? AND undone_at IS NULL AND disposition IS NOT NULL
    GROUP BY board, disposition_date, disposition_period, sku, station, disposition
`),

reportPlans: db.prepare(`
    SELECT * FROM plans WHERE plan_date BETWEEN ? AND ? ORDER BY plan_date, board
`),

openFailureCounts: db.prepare(`
    SELECT board, station, COUNT(*) AS n FROM board_failures
    WHERE undone_at IS NULL AND disposition IS NULL
    GROUP BY board, station
`),

getPcbParts: db.prepare(`
    SELECT * FROM board_pcb_parts WHERE board = ? ORDER BY sort, part
`),

getPcbPart: db.prepare(`
    SELECT * FROM board_pcb_parts WHERE board = ? AND part = ?
`),

insertPcbPart: db.prepare(`
    INSERT INTO board_pcb_parts (board, part, description, sort, active, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 10 FROM board_pcb_parts WHERE board = ?), 1, ?, ?)
`),

setPcbPartActive: db.prepare(`
    UPDATE board_pcb_parts SET active = ?, updated_at = ? WHERE id = ?
`),

getPlan: db.prepare(`
    SELECT * FROM plans WHERE board = ? AND plan_date = ?
`),

getPlanRuns: db.prepare(`
    SELECT * FROM plan_runs WHERE plan_id = ? ORDER BY seq
`),

insertPlan: db.prepare(`
    INSERT INTO plans (board, plan_date, created_at, updated_at) VALUES (?, ?, ?, ?)
`),

touchPlan: db.prepare(`
    UPDATE plans SET updated_at = ? WHERE id = ?
`),

deletePlanRuns: db.prepare(`
    DELETE FROM plan_runs WHERE plan_id = ?
`),

insertPlanRun: db.prepare(`
    INSERT INTO plan_runs (plan_id, seq, sku, family_id, qty, rate) VALUES (?, ?, ?, ?, ?, ?)
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