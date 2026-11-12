require("dotenv").config();

// Before any outbound call: IPv4 gets 2 s to connect (#27).
require("./services/network");

const {
    authenticateToken,
    requireAdmin
} = require("./middleware/auth");

const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const {
    db,
    dbPath,
    statements
} = require("./database");

console.log("Statements loaded:");
console.log(Object.keys(statements));

const {
    notifyCreated,
    notifyAcknowledged,
    notifyResolved,
    notifyCancelled,
    notifyNoteAdded
} = require("./services/notificationManager");

const { updateTelegram } = require("./services/telegramUpdate");

const { telegramWebhookUrl } = require("./config");
const { notificationsEnabled } = require("./services/appEnv");
const {
    ALERT_TYPES,
    isAlertType,
    NEAR_MISS_LOGGED_BY,
    NEAR_MISS_LOGGED_NOTE,
    NEAR_MISS_UNDO_MS,
    isLoggedNearMiss
} = require("./services/alertTypes");
const { startOfDayNY } = require("./services/nyTime");
const { workingMs, overtimeDatesFrom, responseStats } = require("./services/workingTime");
const { startDailyBackups } = require("./services/dailyBackup");
const { ROLES, STEPS, lineGroupOf, startEscalationShadow, isLive } = require("./services/escalation");
const { BOARDS, familyFor, rateFor, priceRuns, planFor } = require("./services/hourlyBoard");
const { PERIODS } = require("./services/hourlyPlan");
const { countStationFor, fpyOf, periodAt, withActuals, PCB_STATION } = require("./services/hourlyActual");
const { buildReport } = require("./services/hourlyReport");
const { checkRows } = require("./services/rateImport");
const { createQbBom } = require("./services/qbBom");
const { bomRoutes } = require("./routes/bom");
const { mrpRoutes } = require("./routes/mrp");
const { inventoryRoutes } = require("./routes/inventory");
const { backlogRoutes } = require("./routes/backlog");
const { slackRoutes } = require("./routes/slack");
const { dateNY } = require("./services/nyTime");
const { offsiteStatus } = require("./services/offsiteBackup");
const {
    notifyTimeoutMs,
    queueNotification
} = require("./services/notificationQueue");
const { backupDirFor } = require("./migrations/runner");
const {
    NAME_PATTERN: BACKUP_NAME,
    listBackups
} = require("./migrations/restore");
const fs = require("fs");
const path = require("path");
const {
    AVAILABILITY,
    normalizeAvailability
} = require("./services/availability");

//------------------------------------------------------
// Responder availability after an alert closes (defect #20)
//
// Sets each named responder back to Available, unless they
// still hold another ACKNOWLEDGED alert; then their status
// is left as it is (normally Responding). Call it after the
// alert's own status has been updated.
//------------------------------------------------------

function releaseResponders(names, now) {

    for (const name of new Set(names.filter(Boolean))) {

        const { n } =
            statements.countAcknowledgedAlertsFor.get(name);

        if (n === 0) {

            statements.updateResponderAvailability.run(
                "Available",
                now,
                name
            );

        }

    }

}

const app = express();

app.use((req, res, next) => {
    console.log("REQUEST:", req.method, req.url);
    next();
});

const PORT =
    process.env.PORT || 3001;


//------------------------------------------------------
// Middleware
//------------------------------------------------------

app.use(cors());

// 2 MB: a whole-sheet paste (e.g. the Ship Report into Backlog → Import
// notes) runs past the 100 KB default (staging, Nov 11 2026). A body that
// is too large or not JSON gets a JSON answer, not Express's HTML page.
app.use(express.json({ limit: "2mb" }));

app.use((err, req, res, next) => {

    if (err?.type === "entity.too.large")
        return res.status(413).json({ success: false, message: "Too much pasted at once (over 2 MB). Paste fewer rows." });

    if (err?.type === "entity.parse.failed")
        return res.status(400).json({ success: false, message: "The request was not valid JSON." });

    next(err);

});

// Google sign-in (ggled.net) + Admin → Users: routes/users.js
app.use(require("./routes/users").usersRoutes(db));

// BOM viewer (QuickBooks via CData, read only): routes/bom.js
const qbBom = createQbBom({ db });

app.use(bomRoutes(qbBom, db));

// Material check (open orders × BOM explosion): routes/mrp.js
app.use(mrpRoutes(qbBom));
app.use(inventoryRoutes(qbBom));
const backlogRouter = backlogRoutes(qbBom, db);

app.use(backlogRouter);

// Slack buttons (S2): signed requests only; routes/slack.js
app.use(slackRoutes({ statements, releaseResponders, queueNotification, notifyAcknowledged, notifyResolved, notifyCancelled }));

//------------------------------------------------------
// Authentication
//------------------------------------------------------

app.post("/auth/login", (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        //--------------------------------------------------
        // Determine User Role
        //--------------------------------------------------

        let role = null;

        if (
            username === process.env.ADMIN_USERNAME &&
            password === process.env.ADMIN_PASSWORD
        ) {

            role = "admin";

        }

        else if (
            username === process.env.PRODUCTION_USERNAME &&
            password === process.env.PRODUCTION_PASSWORD
        ) {

            role = "production";

        }

        //--------------------------------------------------
        // Invalid Credentials
        //--------------------------------------------------

        else {

            return res.status(401).json({

                success: false,

                message: "Invalid username or password."

            });

        }

        //--------------------------------------------------
        // Create Authentication Token
        //--------------------------------------------------

        const token = jwt.sign(

            {
                username,
                role
            },

            process.env.AUTH_SECRET,

            {
                expiresIn: process.env.JWT_EXPIRES_IN || "12h"
            }

        );

        //--------------------------------------------------
        // Login Successful
        //--------------------------------------------------

        res.json({

            success: true,

            token,

            role

        });

    }

    catch (err) {

        console.error(
            "Authentication Error:",
            err.message
        );

        res.status(500).json({

            success: false,

            message:
                "Authentication failed."

        });

    }

});

//------------------------------------------------------
// Root
//------------------------------------------------------

app.get("/", (req, res) => {

    res.json({

        application:
            "ManufacturingOS",

        version:
            "6.0",

        status:
            "Running"

    });

});



//------------------------------------------------------
// Health
//------------------------------------------------------

app.get("/health", (req, res) => {

    res.json({

        success:
            true,

        timestamp:
            Date.now()

    });

});


//------------------------------------------------------
// Create Alert
//------------------------------------------------------

app.post("/alerts", authenticateToken, async (req, res) => {

    try {

        const {
            productionLine,
            workCenter,
            type,
            priority = "NORMAL"
        } = req.body;

        //--------------------------------------------------
        // Validate Required Fields
        //--------------------------------------------------

        if (!productionLine || !workCenter || !type) {

            return res.status(400).json({

                success: false,

                message:
                    "Production Line, Work Center, and Alert Type are required."

            });

        }

        // Only the known types (Option B adds DOWNTIME, NEAR_MISS).
        if (!isAlertType(type)) {

            return res.status(400).json({
                success: false,
                message: `Unknown alert type "${String(type).slice(0, 40)}". Use one of: ${ALERT_TYPES.join(", ")}.`
            });

        }

        //--------------------------------------------------
        // Validate Production Line + Work Center
        //--------------------------------------------------

        const validWorkCenter =
            statements.getValidWorkCenter.get(
                productionLine,
                workCenter
            );

        if (!validWorkCenter) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Work Center for the selected Production Line."

            });

        }

        //--------------------------------------------------
        // Use Database Values
        //
        // Do not trust facility or other location data
        // supplied by the frontend.
        //--------------------------------------------------

        const validatedProductionLine =
            validWorkCenter.production_line_name;

        const validatedWorkCenter =
            validWorkCenter.name;

        const facility =
            validWorkCenter.facility;

        //--------------------------------------------------
        // Prevent Duplicate Active Alerts
        //--------------------------------------------------

        const existingAlert =
            statements.getDuplicateActiveAlert.get(
                validatedProductionLine,
                validatedWorkCenter,
                type
            );

        if (existingAlert) {

            return res.status(409).json({

                success: false,

                duplicate: true,

                message:
                    `An active ${type} alert already exists for ` +
                    `${validatedProductionLine} / ${validatedWorkCenter}.`,

                alert: existingAlert

            });

        }
        
        //--------------------------------------------------
        // Create Alert
        //--------------------------------------------------

             
        const now = Date.now();

        const result =
            statements.insertAlert.run(

                facility,

                validatedProductionLine,

                validatedWorkCenter,

                type,

                now,

                priority,

                now,

                now

            );

        // A near miss is a report: logged closed right away.
        if (type === "NEAR_MISS") {

            statements.logNearMiss.run(
                NEAR_MISS_LOGGED_BY,
                NEAR_MISS_LOGGED_NOTE,
                now,
                result.lastInsertRowid
            );

        }

        //--------------------------------------------------
        // Get Created Alert
        //--------------------------------------------------

        const alert =
            statements.getAlert.get(
                result.lastInsertRowid
            );

        //--------------------------------------------------
        // Safety Check
        //--------------------------------------------------

        if (!alert) {

            throw new Error(
                "Alert was created but could not be retrieved."
            );

        }

        //--------------------------------------------------
        // Logging
        //--------------------------------------------------

        console.log(
            `✓ Created Alert #${alert.id} ` +
            `(${alert.type}) ` +
            `[${alert.production_line} / ${alert.work_center}] ` +
            `[Facility: ${alert.facility}]`
        );

        //--------------------------------------------------
        // Send Notifications
        //--------------------------------------------------

        // In the background: the tablet gets its answer right away.
        queueNotification(alert.id, "created", () => notifyCreated(alert));

        //--------------------------------------------------
        // Response
        //--------------------------------------------------

        res.json({

            success: true,

            alert

        });

    }

    catch (err) {

        console.error("Create Alert Error:");

        console.error(err);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

});


//------------------------------------------------------
// Get Active Alerts
//------------------------------------------------------

app.get(
    "/alerts/active",
    authenticateToken,
    (req, res) => {

        try {

            const alerts =
                statements
                    .getActiveAlerts
                    .all();


            res.json(
                alerts
            );

        }

        catch (err) {

            console.error(
                "Get Active Alerts Error:",
                err
            );

            res.status(500).json({

                success:
                    false,

                message:
                    err.message

            });

        }

    }
);


//------------------------------------------------------
// Get All Alerts
//------------------------------------------------------

app.get(
"/alerts",
authenticateToken,
(req, res) => {

        try {

            const alerts =
                statements
                    .getAllAlerts
                    .all();


            res.json(
                alerts
            );

        }

        catch (err) {

            console.error(
                "Get All Alerts Error:",
                err
            );

            res.status(500).json({

                success:
                    false,

                message:
                    err.message

            });

        }

    }
);

//------------------------------------------------------
// Resolution notes for Telegram resolves (#14b)
//
// A Telegram resolve can't carry text, so it saves
// TELEGRAM_DEFAULT_NOTE. These alerts are listed under
// "Needs a resolution note" until someone adds the note.
//------------------------------------------------------

app.get("/alerts/needs-note", authenticateToken, (req, res) => {

    res.json(statements.getAlertsNeedingNote.all(TELEGRAM_DEFAULT_NOTE));

});

app.patch("/alerts/:id/note", authenticateToken, (req, res) => {

    const { note, addedBy } = req.body || {};
    const clean = typeof note === "string" ? note.trim() : "";

    if (!clean || clean.length > 500) {

        return res.status(400).json({
            success: false,
            message: "A note of 1 to 500 characters is required."
        });

    }

    const alert = statements.getAlert.get(req.params.id);

    if (!alert) {

        return res.status(404).json({
            success: false,
            message: "Alert not found."
        });

    }

    const by = typeof addedBy === "string" ? addedBy.trim() : "";

    const text = by && by !== alert.resolved_by
        ? `${clean} (note by ${by})`
        : clean;

    // Only replaces the Telegram placeholder: first note wins,
    // a web resolve's note is never overwritten.
    const saved = statements.saveTelegramNote.run(
        text,
        Date.now(),
        alert.id,
        TELEGRAM_DEFAULT_NOTE
    ).changes === 1;

    if (!saved) {

        return res.status(409).json({
            success: false,
            message: `Alert #${alert.id} already has a resolution note.`
        });

    }

    console.log(`✓ Resolution note added to Alert #${alert.id}${by ? ` by ${by}` : ""}`);

    // The Telegram channel message shows the note under RESOLUTION.
    queueNotification(alert.id, "note added", () => notifyNoteAdded(alert));

    res.json({ success: true, alert: statements.getAlert.get(alert.id) });

});

// Clear without a note: the alert leaves the list and keeps
// a note saying it was cleared, and by whom.
function clearedNote(by) {

    const name = typeof by === "string" ? by.trim().slice(0, 100) : "";

    return `${TELEGRAM_DEFAULT_NOTE}; no note${name ? ` (cleared by ${name})` : " (cleared)"}`;

}

app.patch("/alerts/:id/note/clear", authenticateToken, (req, res) => {

    const { clearedBy } = req.body || {};

    const alert = statements.getAlert.get(req.params.id);

    if (!alert) {

        return res.status(404).json({
            success: false,
            message: "Alert not found."
        });

    }

    const cleared = statements.saveTelegramNote.run(
        clearedNote(clearedBy),
        Date.now(),
        alert.id,
        TELEGRAM_DEFAULT_NOTE
    ).changes === 1;

    if (!cleared) {

        return res.status(409).json({
            success: false,
            message: `Alert #${alert.id} already has a resolution note.`
        });

    }

    console.log(`✓ Needs-a-note cleared for Alert #${alert.id}`);

    res.json({ success: true, alert: statements.getAlert.get(alert.id) });

});

app.post("/alerts/needs-note/clear", authenticateToken, (req, res) => {

    const { clearedBy } = req.body || {};

    const cleared = statements.clearAllTelegramNotes.run(
        clearedNote(clearedBy),
        Date.now(),
        TELEGRAM_DEFAULT_NOTE
    ).changes;

    console.log(`✓ Needs-a-note cleared for ${cleared} alert(s)`);

    res.json({ success: true, cleared });

});

//------------------------------------------------------
// Executive Dashboard
//------------------------------------------------------

app.get(
    "/dashboard/executive",
    authenticateToken,
    (req, res) => {

    try {

        // Response/resolution times are working seconds (#18).
        const {
            avgResponseSeconds,
            avgResolutionSeconds,
            responseTrend,
            resolutionTrend
        } = responseStats(statements.getAllAlerts.all());

        const kpis = {
            ...statements.getDashboardKPIs.get(),
            avgResponseSeconds,
            avgResolutionSeconds
        };

        const pareto = statements.getAlertPareto.all();

        const monthlyTrend =
            statements.getMonthlyTrend.all();

        res.json({

            kpis,

            pareto,

            monthlyTrend,

            responseTrend,

            resolutionTrend

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

});

//------------------------------------------------------
// Get Response Team
//------------------------------------------------------

app.get("/response-team", authenticateToken, (req, res) => {

    try {

        const team = statements.getResponseTeam.all();

        res.json(team);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Get Production Lines
//------------------------------------------------------

app.get("/production-lines", authenticateToken, (req, res) => {

    try {

        const lines =
            statements.getProductionLines.all();

        res.json(lines);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Create Production Line
//------------------------------------------------------

app.post("/production-lines", authenticateToken, requireAdmin, (req, res) => {

    try {

        const {
            name,
            facility,
            description = "",
            display_order = 0,
            color = "#1976d2",
            active = true
        } = req.body;

        if (!name || !facility) {

            return res.status(400).json({
                success: false,
                message: "Name and Facility are required."
            });

        }

        // Names are unique, archived lines included (#15).
        const taken = statements.getProductionLineByName.get(name);

        if (taken) {

            return res.status(409).json({
                success: false,
                message: taken.archived_at
                    ? `An archived line is named ${name}. Restore it from Admin → Archived.`
                    : `A production line named ${name} already exists.`
            });

        }

        const now = Date.now();

        statements.insertProductionLine.run(

            name,
            facility,
            description,
            Number(display_order),
            color,
            active ? 1 : 0,
            now,
            now

        );

        res.json({
            success: true
        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Reorder body check (#21)
//
// Both order routes take [{ id, display_order }, ...].
// Anything else is a 400, not a 500. The whole list is
// applied in one transaction: an unknown id changes
// nothing.
//------------------------------------------------------

function reorderError(items) {

    if (!Array.isArray(items) || items.length === 0) {

        return "Body must be a non-empty list of { id, display_order }.";

    }

    for (const item of items) {

        if (
            !item ||
            !Number.isInteger(item.id) ||
            !Number.isInteger(item.display_order) ||
            item.display_order < 0
        ) {

            return "Each item needs an integer id and a display_order of 0 or more.";

        }

    }

    return null;

}

function applyOrder(statement, items, label, res) {

    const error = reorderError(items);

    if (error) {

        return res.status(400).json({ success: false, message: error });

    }

    const now = Date.now();

    const applyAll = db.transaction(() => {

        const notFound = items
            .filter(item => statement.run(item.display_order, now, item.id).changes === 0)
            .map(item => item.id);

        if (notFound.length) {

            // Throwing rolls back every update in this list.
            throw Object.assign(new Error("unknown id"), { notFound });

        }

    });

    try {

        applyAll();

    }

    catch (err) {

        if (!err.notFound) throw err;

        return res.status(400).json({
            success: false,
            message: `Unknown ${label} id: ${err.notFound.join(", ")}. Nothing was changed.`
        });

    }

    return res.json({ success: true });

}

//------------------------------------------------------
// Update Production Line Order
//------------------------------------------------------

app.put("/production-lines/order", authenticateToken, requireAdmin, (req, res) => {

    try {

        applyOrder(statements.updateProductionLineDisplayOrder, req.body, "production line", res);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Update Production Line
//------------------------------------------------------

app.put("/production-lines/:id", authenticateToken, requireAdmin, (req, res) => {

    try {

        const {
            name,
            facility,
            description = "",
            display_order = 0,
            color = "#1976d2",
            active = true
        } = req.body;

        statements.updateProductionLine.run(

            name,
            facility,
            description,
            Number(display_order),
            color,
            active ? 1 : 0,
            Date.now(),
            req.params.id

        );

        res.json({
            success: true
        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});



//------------------------------------------------------
// Delete Production Line
//------------------------------------------------------

app.delete("/production-lines/:id", authenticateToken, requireAdmin, (req, res) => {

    // Archive, never DELETE (#15). Alerts and work centers
    // keep pointing at the line; Admin can restore it.
    try {

        const line = statements.getProductionLine.get(req.params.id);

        if (!line || line.archived_at) {

            return res.status(404).json({
                success: false,
                message: "Production line not found."
            });

        }

        const open = statements.countOpenAlertsForLine.get(line.name).n;

        if (open > 0) {

            return res.status(409).json({
                success: false,
                message: `${line.name} has ${open} open alert(s). Resolve or cancel them before archiving the line.`
            });

        }

        const now = Date.now();

        statements.archiveProductionLine.run(now, now, line.id);

        console.log(`Production line archived by ${req.user.username}: ${line.name}`);

        res.json({
            success: true,
            message: `${line.name} archived. Restore it from Admin → Archived.`
        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Archived Production Lines (#15)
//------------------------------------------------------

app.get("/production-lines/archived", authenticateToken, requireAdmin, (req, res) => {

    res.json(statements.getArchivedProductionLines.all());

});

app.post("/production-lines/:id/restore", authenticateToken, requireAdmin, (req, res) => {

    const line = statements.getProductionLine.get(req.params.id);

    if (!line || !line.archived_at) {

        return res.status(404).json({
            success: false,
            message: "Archived production line not found."
        });

    }

    statements.restoreProductionLine.run(Date.now(), line.id);

    console.log(`Production line restored by ${req.user.username}: ${line.name}`);

    res.json({
        success: true,
        message: `${line.name} restored.`
    });

});

//------------------------------------------------------
// Get Work Centers
//------------------------------------------------------

app.get("/work-centers", authenticateToken, (req, res) => {

    try {

        const workCenters =
            statements.getWorkCenters.all();

        res.json(workCenters);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Get Active Work Centers
//------------------------------------------------------

app.get("/work-centers/active", authenticateToken, (req, res) => {

    try {

        const workCenters =
            statements.getActiveWorkCenters.all();

        res.json(workCenters);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Get Work Centers for Production Line
//------------------------------------------------------

app.get("/work-centers/line/:productionLine", authenticateToken, (req, res) => {

    try {

        const workCenters =
            statements.getWorkCentersByProductionLineName.all(
                req.params.productionLine
            );

        res.json(workCenters);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Create Work Center
//------------------------------------------------------

app.post("/work-centers", authenticateToken, requireAdmin, (req, res) => {

    try {

        const {
    production_line_id,
    name,
    facility = "Malta",
    display_order = 0,
    active = true
} = req.body;

        if (!production_line_id || !name) {

            return res.status(400).json({
                success: false,
                message: "Production Line and Name are required."
            });

        }

        const now = Date.now();

console.log("POST /work-centers");
console.log({
    production_line_id,
    name,
    facility,
    display_order,
    active
});        

statements.insertWorkCenter.run(

    production_line_id,
    name,
    facility || "Malta",
    display_order || 0,
    active ? 1 : 0,
    now,
    now

);

        res.json({
            success: true
        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

});

//------------------------------------------------------
// Update Work Center Order
//------------------------------------------------------

app.put("/work-centers/order", authenticateToken, requireAdmin, (req, res) => {

    try {

        applyOrder(statements.updateWorkCenterDisplayOrder, req.body, "work center", res);

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Update Work Center
//------------------------------------------------------

app.put("/work-centers/:id", authenticateToken, requireAdmin, (req, res) => {

    try {

        const {

            name,
            facility,
            production_line_id,
            display_order = 0,
            active = true

        } = req.body;

        statements.updateWorkCenter.run(

            name,
            production_line_id,
            facility,
            Number(display_order),
            active ? 1 : 0,
            Date.now(),
            req.params.id

        );

        res.json({

            success: true

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Acknowledge Alert
//------------------------------------------------------

app.patch(
    "/alerts/:id/acknowledge", authenticateToken,
    async (req, res) => {

        try {

            const alertId =
                Number(req.params.id);

            const {
                acknowledgedBy
            } = req.body;

            //--------------------------------------------------
            // Validate Alert ID
            //--------------------------------------------------

            if (!alertId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert ID is required."

                });

            }

            //--------------------------------------------------
            // Validate Responder
            //--------------------------------------------------

            if (!acknowledgedBy) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Responder is required."

                });

            }

            //--------------------------------------------------
            // Validate Responder Exists
            //--------------------------------------------------

            const responder =
                statements
                    .getResponseTeam
                    .all()
                    .find(
                        person =>
                            person.name === acknowledgedBy
                    );

            if (!responder) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid responder."

                });

            }

            //--------------------------------------------------
            // Get Alert
            //--------------------------------------------------

            const alert =
                statements.getAlert.get(
                    alertId
                );

            if (!alert) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Alert not found."

                });

            }

            //--------------------------------------------------
            // Validate Status
            //--------------------------------------------------

            if (alert.status !== "ACTIVE") {

                return res.status(400).json({

                    success: false,

                    message:
                        `Alert cannot be acknowledged because its current status is ${alert.status}.`

                });

            }

            //--------------------------------------------------
            // Acknowledge Alert
            //--------------------------------------------------

            const now =
                Date.now();

            const result =
                statements.acknowledgeAlert.run(

                    now,

                    responder.name,

                    responder.name,

                    now,

                    alertId

                );

            //--------------------------------------------------
            // Verify Update
            //--------------------------------------------------

            if (result.changes === 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert could not be acknowledged."

                });

            }

            // Same as the Telegram acknowledge path.
            statements.updateResponderAvailability.run(
                "Responding",
                now,
                responder.name
            );

            //--------------------------------------------------
            // Get Updated Alert
            //--------------------------------------------------

            const updatedAlert =
                statements.getAlert.get(
                    alertId
                );

            //--------------------------------------------------
            // Logging
            //--------------------------------------------------

            console.log(

                `✓ Acknowledged Alert #${updatedAlert.id} ` +
                `by ${updatedAlert.acknowledged_by} ` +
                `[${updatedAlert.production_line} / ${updatedAlert.work_center}]`

            );

            //--------------------------------------------------
            // Notification
            //--------------------------------------------------

            queueNotification(updatedAlert.id, "acknowledged", () => notifyAcknowledged(
                updatedAlert
            ));

            //--------------------------------------------------
            // Response
            //--------------------------------------------------

            res.json({

                success: true,

                alert: updatedAlert

            });

        }

        catch (err) {

            console.error(
                "Acknowledge Alert Error:"
            );

            console.error(err);

            res.status(500).json({

                success: false,

                message:
                    err.message

            });

        }

    }
);


//------------------------------------------------------
// Resolve Alert
//------------------------------------------------------

app.patch(
    "/alerts/:id/resolve", authenticateToken,
    async (req, res) => {

        try {

            const alertId =
                Number(req.params.id);

            const {
                resolvedBy,
                resolutionNotes = ""
            } = req.body;

            //--------------------------------------------------
            // Validate Alert ID
            //--------------------------------------------------

            if (!alertId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert ID is required."

                });

            }

            //--------------------------------------------------
            // Validate Resolver
            //--------------------------------------------------

            if (!resolvedBy) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Resolver is required."

                });

            }

            //--------------------------------------------------
            // Validate Resolution Note
            //--------------------------------------------------

            const cleanNotes =
                typeof resolutionNotes === "string"
                    ? resolutionNotes.trim()
                    : "";

            if (!cleanNotes || cleanNotes.length > 500) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Resolution note is required (up to 500 characters)."

                });

            }

            //--------------------------------------------------
            // Get Alert
            //--------------------------------------------------

            const alert =
                statements.getAlert.get(
                    alertId
                );

            if (!alert) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Alert not found."

                });

            }

            //--------------------------------------------------
            // Validate Status
            //--------------------------------------------------

            if (alert.status !== "ACKNOWLEDGED") {

                return res.status(400).json({

                    success: false,

                    message:
                        `Alert cannot be resolved because its current status is ${alert.status}.`

                });

            }

            //--------------------------------------------------
            // Validate Resolver
            //--------------------------------------------------

            const resolver =
                statements
                    .getResponseTeam
                    .all()
                    .find(
                        person =>
                            person.name === resolvedBy
                    );

            if (!resolver) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid resolver."

                });

            }

            //--------------------------------------------------
            // Resolve Alert
            //--------------------------------------------------

            const now =
                Date.now();

            const result =
                statements.resolveAlert.run(

                    now,

                    resolver.name,

                    cleanNotes,

                    now,

                    now,

                    alertId

                );

            //--------------------------------------------------
            // Verify Update
            //--------------------------------------------------

            if (result.changes === 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert could not be resolved."

                });

            }

            // Same as the Telegram resolve path.
            releaseResponders(
                [alert.assigned_to, resolver.name],
                now
            );

            //--------------------------------------------------
            // Get Updated Alert
            //--------------------------------------------------

            const updatedAlert =
                statements.getAlert.get(
                    alertId
                );

            //--------------------------------------------------
            // Logging
            //--------------------------------------------------

            console.log(

                `✓ Resolved Alert #${updatedAlert.id} ` +
                `by ${updatedAlert.resolved_by} ` +
                `[${updatedAlert.production_line} / ${updatedAlert.work_center}]`

            );

            //--------------------------------------------------
            // Notification
            //--------------------------------------------------

            queueNotification(updatedAlert.id, "resolved", () => notifyResolved(
                updatedAlert
            ));

            //--------------------------------------------------
            // Response
            //--------------------------------------------------

            res.json({

                success: true,

                alert: updatedAlert

            });

        }

        catch (err) {

            console.error(
                "Resolve Alert Error:"
            );

            console.error(err);

            res.status(500).json({

                success: false,

                message:
                    err.message

            });

        }

    }
);


//------------------------------------------------------
// Cancel Alert
//------------------------------------------------------

app.patch(
    "/alerts/:id/cancel", authenticateToken,
    async (req, res) => {

        try {

            const alertId =
                Number(req.params.id);

            //--------------------------------------------------
            // Validate Alert ID
            //--------------------------------------------------

            if (!alertId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert ID is required."

                });

            }

            //--------------------------------------------------
            // Get Alert
            //--------------------------------------------------

            const alert =
                statements.getAlert.get(
                    alertId
                );

            if (!alert) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Alert not found."

                });

            }

            //--------------------------------------------------
            // Validate Status
            //--------------------------------------------------

            // "Pressed by mistake" on a near miss the tablet just logged.
            if (isLoggedNearMiss(alert)) {

                if (Date.now() - Number(alert.requested) > NEAR_MISS_UNDO_MS) {

                    return res.status(400).json({
                        success: false,
                        message: "This near miss was logged more than 10 minutes ago and can no longer be undone."
                    });

                }

                const now = Date.now();
                const by = typeof req.body?.cancelledBy === "string" ? req.body.cancelledBy.trim().slice(0, 100) : "";
                const why = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim().slice(0, 500) : "Pressed by mistake";

                statements.cancelLoggedNearMiss.run(
                    now,
                    now,
                    `Cancelled${by ? ` by ${by}` : ""}: ${why}`,
                    alert.id,
                    NEAR_MISS_LOGGED_NOTE
                );

                const undone = statements.getAlert.get(alert.id);

                console.log(`✓ Near miss #${alert.id} undone [${alert.production_line} / ${alert.work_center}]`);

                queueNotification(alert.id, "cancelled", () => notifyCancelled(undone));

                return res.json({ success: true, alert: undone });

            }

            if (
                alert.status !== "ACTIVE" &&
                alert.status !== "ACKNOWLEDGED"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        `Alert cannot be cancelled because its current status is ${alert.status}.`

                });

            }

            //--------------------------------------------------
            // Optional reason (#26): the supervisor and dashboard
            // screens require one; the tablet sends none.
            //--------------------------------------------------

            const { reason, cancelledBy } = req.body || {};

            let cancelNote = null;

            if (reason !== undefined) {

                const cleanReason =
                    typeof reason === "string" ? reason.trim() : "";

                const cleanBy =
                    typeof cancelledBy === "string" ? cancelledBy.trim().slice(0, 100) : "";

                if (!cleanReason || cleanReason.length > 500) {

                    return res.status(400).json({

                        success: false,

                        message:
                            "Cancel reason is required (up to 500 characters)."

                    });

                }

                cancelNote =
                    `Cancelled${cleanBy ? ` by ${cleanBy}` : ""}: ${cleanReason}`;

            }

            //--------------------------------------------------
            // Cancel Alert
            //--------------------------------------------------

            const now =
                Date.now();

            const result =
                statements.cancelAlert.run(

                    now,

                    now,

                    cancelNote,

                    alertId

                );

            //--------------------------------------------------
            // Verify Update
            //--------------------------------------------------

            if (result.changes === 0) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Alert could not be cancelled."

                });

            }

            // An acknowledged alert had a responder set to Responding.
            if (alert.status === "ACKNOWLEDGED") {

                releaseResponders([alert.assigned_to], now);

            }

            //--------------------------------------------------
            // Get Updated Alert
            //--------------------------------------------------

            const updatedAlert =
                statements.getAlert.get(
                    alertId
                );

            //--------------------------------------------------
            // Logging
            //--------------------------------------------------

            console.log(

                `✓ Cancelled Alert #${updatedAlert.id} ` +
                `[${updatedAlert.production_line} / ${updatedAlert.work_center}]`

            );

            //--------------------------------------------------
            // Notification
            //--------------------------------------------------

            queueNotification(updatedAlert.id, "cancelled", () => notifyCancelled(
                updatedAlert
            ));

            //--------------------------------------------------
            // Response
            //--------------------------------------------------

            res.json({

                success: true,

                alert: updatedAlert

            });

        }

        catch (err) {

            console.error(
                "Cancel Alert Error:"
            );

            console.error(err);

            res.status(500).json({

                success: false,

                message:
                    err.message

            });

        }

    }
);

//------------------------------------------------------
// Dashboard KPI Summary
//------------------------------------------------------

app.get("/dashboard/kpis", authenticateToken, (req, res) => {

    try {

        const alerts = statements.getAllAlerts.all();

        const active = alerts.filter(a => a.status === "ACTIVE").length;

        const acknowledged = alerts.filter(
            a => a.status === "ACKNOWLEDGED"
        ).length;

        const resolved = alerts.filter(
            a => a.status === "RESOLVED"
        );

        // Working minutes, not clock time (#18).
        const overtimeDates = overtimeDatesFrom(alerts);

        const mttr =
            resolved.length === 0
                ? 0
                : Math.round(
                    resolved.reduce((sum, alert) => {

                        return sum + workingMs(
                            Number(alert.requested || 0),
                            Number(alert.resolved || 0),
                            overtimeDates
                        );

                    }, 0) /
                    resolved.length /
                    60000
                );

        res.json({

            active,
            acknowledged,
            resolvedToday: resolved.filter(
                a => a.resolved >= startOfDayNY()
            ).length,
            mttr

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Create Responder
//------------------------------------------------------



app.post("/response-team", authenticateToken, requireAdmin, (req, res) => {

    try {

        const {

    name,
    department,
    job_title,
    phone,
    email,
    availability = "Available",
    active = 1

} = req.body;

        //--------------------------------------------------
        // Validation
        //--------------------------------------------------

        const now = Date.now();

const cleanName = (name || "").trim();

const cleanDepartment = (department || "").trim();

if (!cleanName) {

    return res.status(400).json({

        success: false,

        message: "Responder name is required."

    });

}

if (!cleanDepartment) {

    return res.status(400).json({

        success: false,

        message: "Department is required."

    });

}

const cleanAvailability = normalizeAvailability(availability);

if (availability !== undefined && !cleanAvailability) {

    return res.status(400).json({

        success: false,

        message: `Availability must be one of: ${AVAILABILITY.join(", ")}.`

    });

}

        //--------------------------------------------------
        // Duplicate Check
        //--------------------------------------------------

        const existing = statements
            .getAllResponseTeam
            .all()
            .find(x => x.name.toLowerCase() === cleanName.toLowerCase());

        if (existing) {

            return res.status(409).json({

                success: false,
                message: existing.archived_at
                    ? "An archived responder has this name. Restore them from Admin → Archived."
                    : "Responder already exists."

            });

        }

        //--------------------------------------------------
        // Insert
        //--------------------------------------------------

        const result = statements.insertResponseTeam.run(

    cleanName,
    cleanDepartment,
    job_title,
    phone,
    email,
    cleanAvailability ?? availability,
    active,
    now,
    now

);

        const responder =
            statements.getResponder.get(result.lastInsertRowid);

        res.status(201).json({

            success: true,
            responder

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Update Responder
//------------------------------------------------------

app.put("/response-team/:id", authenticateToken, requireAdmin, (req, res) => {

    try {

        const now = Date.now();

        const {

    name,
    department,
    job_title,
    phone,
    email,
    availability,
    active

} = req.body;

        //----------------------------------------------
        // Validation
        //----------------------------------------------

        const cleanName = (name || "").trim();

const cleanDepartment = (department || "").trim();

if (!cleanName) {

    return res.status(400).json({

        success: false,

        message: "Responder name is required."

    });

}

if (!cleanDepartment) {

    return res.status(400).json({

        success: false,

        message: "Department is required."

    });

}

const cleanAvailability = normalizeAvailability(availability);

if (availability !== undefined && !cleanAvailability) {

    return res.status(400).json({

        success: false,

        message: `Availability must be one of: ${AVAILABILITY.join(", ")}.`

    });

}

        

        // Slack member ID (S2): optional; "" clears it. One active responder per Slack user.
        const slackId = req.body.slack_user_id === undefined ? undefined : String(req.body.slack_user_id || "").trim().toUpperCase();

        if (slackId && !/^[UW][A-Z0-9]{6,20}$/.test(slackId)) {

            return res.status(400).json({
                success: false,
                message: "Slack member ID looks like U0123ABCD (Slack profile → ⋮ → Copy member ID)."
            });

        }

        if (slackId) {

            const owner = statements.getResponderBySlack.get(slackId);

            if (owner && String(owner.id) !== String(req.params.id)) {

                return res.status(409).json({
                    success: false,
                    message: `That Slack member ID is already linked to ${owner.name}.`
                });

            }

        }

        //----------------------------------------------
        // Verify responder exists
        //----------------------------------------------

        const existing =
            statements.getResponder.get(req.params.id);

        if (!existing) {

            return res.status(404).json({

                success: false,
                message: "Responder not found."

            });

        }

        //----------------------------------------------
        // Update
        //----------------------------------------------

        statements.updateResponseTeam.run(

    cleanName,
    cleanDepartment,
    job_title,
    phone,
    email,
    cleanAvailability ?? availability,
    active,
    now,
    req.params.id

);

        if (slackId !== undefined)
            statements.setResponderSlack.run(slackId || null, now, req.params.id);

        const responder =
            statements.getResponder.get(req.params.id);

        res.json({

            success: true,
            responder

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Delete Responder
//------------------------------------------------------

app.delete("/response-team/:id", authenticateToken, requireAdmin, (req, res) => {

    // Archive, never DELETE (#15).
    try {

        const responder =
            statements.getResponder.get(req.params.id);

        if (!responder || responder.archived_at) {

            return res.status(404).json({

                success: false,
                message: "Responder not found."

            });

        }

        const open = statements.countAcknowledgedAlertsFor.get(responder.name).n;

        if (open > 0) {

            return res.status(409).json({
                success: false,
                message: `${responder.name} is responding to ${open} open alert(s). Resolve or cancel them before archiving.`
            });

        }

        const now = Date.now();

        statements.archiveResponder.run(now, now, responder.id);

        console.log(`Responder archived by ${req.user.username}: #${responder.id}`);

        res.json({

            success: true,
            message: "Responder archived. Restore from Admin → Archived."

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

//------------------------------------------------------
// Archived Responders (#15)
//------------------------------------------------------

app.get("/response-team/archived", authenticateToken, requireAdmin, (req, res) => {

    res.json(statements.getArchivedResponseTeam.all());

});

app.post("/response-team/:id/restore", authenticateToken, requireAdmin, (req, res) => {

    const responder = statements.getResponder.get(req.params.id);

    if (!responder || !responder.archived_at) {

        return res.status(404).json({
            success: false,
            message: "Archived responder not found."
        });

    }

    statements.restoreResponder.run(Date.now(), responder.id);

    console.log(`Responder restored by ${req.user.username}: #${responder.id}`);

    res.json({
        success: true,
        message: "Responder restored."
    });

});

//------------------------------------------------------
// Database Backups (admin only)
//
// Lets an admin download backup files from the volume in
// a browser, so a copy can be kept off Railway.
//------------------------------------------------------

//------------------------------------------------------
// Admin → Near misses: void a near miss logged by mistake
// after the tablet's 10-minute Undo (Director, Nov 2 2026).
// Same result as Undo: CANCELLED, out of the counts, kept in
// history with who voided it and why.
//------------------------------------------------------

app.get("/admin/near-misses", authenticateToken, requireAdmin, (req, res) => {

    res.json(statements.getLoggedNearMisses.all(NEAR_MISS_LOGGED_NOTE, 200));

});

app.post("/admin/near-misses/:id/void", authenticateToken, requireAdmin, (req, res) => {

    const alert = statements.getAlert.get(req.params.id);

    if (!alert) {

        return res.status(404).json({ success: false, message: "Alert not found." });

    }

    if (!isLoggedNearMiss(alert)) {

        return res.status(409).json({ success: false, message: `Alert #${alert.id} is not a logged near miss.` });

    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!reason || reason.length > 500) {

        return res.status(400).json({ success: false, message: "A reason of 1 to 500 characters is required." });

    }

    const now = Date.now();

    statements.cancelLoggedNearMiss.run(
        now,
        now,
        `Voided by Admin: ${reason}`,
        alert.id,
        NEAR_MISS_LOGGED_NOTE
    );

    const voided = statements.getAlert.get(alert.id);

    console.log(`✓ Near miss #${alert.id} voided by Admin [${alert.production_line} / ${alert.work_center}]`);

    queueNotification(alert.id, "cancelled", () => notifyCancelled(voided));

    res.json({ success: true, alert: voided });

});

//------------------------------------------------------
// Admin → Escalation (shadow mode, migration 0006)
//
// Roles on people, the rules, and the shadow log of who
// WOULD have been notified. Nothing here sends anything.
//------------------------------------------------------

const ESCALATION_TYPES = ALERT_TYPES.filter(t => t !== "NEAR_MISS");
const MAX_RULE_MINUTES = 480;

app.get("/admin/escalation", authenticateToken, requireAdmin, (req, res) => {

    const lines = statements.getLineGroups.all();

    const live = isLive(statements);

    res.json({
        shadow: !live,
        live,
        slackReady: Boolean(require("./services/slack").slackConfig("andon")),
        roles: ROLES,
        steps: STEPS,
        alertTypes: ["*", ...ESCALATION_TYPES],
        lineGroups: [...new Set(lines.map(l => lineGroupOf(l.name, l.line_group)))],
        rules: statements.getEscalationRules.all(),
        team: statements.getRoutingTeam.all()
    });

});

// Slack S4: the live switch. On = each step is also posted as
// @mentions in the alert's Slack thread; off = shadow (log only).
app.put("/admin/escalation/settings", authenticateToken, requireAdmin, (req, res) => {

    if (typeof req.body?.sendSlack !== "boolean")
        return res.status(400).json({ success: false, message: "sendSlack must be true or false." });

    if (req.body.sendSlack && !require("./services/slack").slackConfig("andon"))
        return res.status(409).json({ success: false, message: "Slack isn't set up on this server (bot token / #andon-alerts channel), so escalations can't be sent." });

    statements.setEscalationSetting.run("send_slack", req.body.sendSlack ? "1" : "0", Date.now());

    console.log(`Escalation matrix switched to ${req.body.sendSlack ? "LIVE in Slack" : "SHADOW (nothing sent)"}`);

    res.json({ success: true, live: req.body.sendSlack });

});

app.post("/admin/escalation/rules", authenticateToken, requireAdmin, (req, res) => {

    const { alertType, step, role } = req.body || {};
    const minutes = step === "START" ? 0 : Number(req.body?.minutes);

    if (!["*", ...ESCALATION_TYPES].includes(alertType) || !STEPS.includes(step) || !ROLES.includes(role) ||
        !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_RULE_MINUTES) {

        return res.status(400).json({
            success: false,
            message: `Need alertType (* or ${ESCALATION_TYPES.join(", ")}), step (${STEPS.join(", ")}), role, and whole minutes 0-${MAX_RULE_MINUTES}.`
        });

    }

    const now = Date.now();
    const result = statements.insertEscalationRule.run(alertType, step, minutes, role, now, now);

    res.status(201).json({ success: true, rule: statements.getEscalationRule.get(result.lastInsertRowid) });

});

app.put("/admin/escalation/rules/:id", authenticateToken, requireAdmin, (req, res) => {

    const rule = statements.getEscalationRule.get(req.params.id);

    if (!rule)
        return res.status(404).json({ success: false, message: "Rule not found." });

    const minutes = rule.step === "START" ? 0 : (req.body?.minutes === undefined ? rule.minutes : Number(req.body.minutes));
    const active = req.body?.active === undefined ? rule.active : (req.body.active ? 1 : 0);

    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_RULE_MINUTES)
        return res.status(400).json({ success: false, message: `Minutes must be a whole number 0-${MAX_RULE_MINUTES}.` });

    statements.updateEscalationRule.run(minutes, active, Date.now(), rule.id);

    res.json({ success: true, rule: statements.getEscalationRule.get(rule.id) });

});

app.delete("/admin/escalation/rules/:id", authenticateToken, requireAdmin, (req, res) => {

    const removed = statements.deleteEscalationRule.run(req.params.id).changes;

    if (!removed)
        return res.status(404).json({ success: false, message: "Rule not found." });

    res.json({ success: true });

});

app.put("/admin/escalation/people/:id", authenticateToken, requireAdmin, (req, res) => {

    const role = req.body?.role || null;
    const lineGroup = role === "Production Lead" && req.body?.lineGroup ? String(req.body.lineGroup).slice(0, 100) : null;

    if (role !== null && !ROLES.includes(role))
        return res.status(400).json({ success: false, message: `Role must be one of: ${ROLES.join(", ")}.` });

    const saved = statements.setResponderRole.run(role, lineGroup, Date.now(), req.params.id).changes;

    if (!saved)
        return res.status(404).json({ success: false, message: "Responder not found." });

    res.json({ success: true });

});

app.get("/admin/escalation/log", authenticateToken, requireAdmin, (req, res) => {

    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);

    const events = statements.getEscalationLog
        .all(Date.now() - days * 24 * 60 * 60 * 1000, 1000)
        .map(e => ({ ...e, recipients: JSON.parse(e.recipients || "[]") }));

    // How often each rule would have fired, and how often nobody had the role.
    const byRule = {};

    for (const e of events) {

        const r = byRule[e.rule_id] || (byRule[e.rule_id] = { rule_id: e.rule_id, step: e.step, minutes: e.minutes, role: e.role, fired: 0, nobody: 0, alerts: new Set() });

        r.fired += 1;
        r.alerts.add(e.alert_id);

        if (!e.recipients.length)
            r.nobody += 1;

    }

    res.json({
        days,
        events: events.slice(0, 200),
        summary: Object.values(byRule).map(({ alerts, ...r }) => ({ ...r, alerts: alerts.size }))
    });

});

//------------------------------------------------------
// Hour-by-hour board, H1 (migration 0007)
//
// Boards, families (Ship Report prefixes) and rates; a
// board's plan per day (runs → hour-by-hour plan). Plans
// and rates are admin only; everyone can view a board.
//------------------------------------------------------

const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));

const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

app.get("/hourly/boards", authenticateToken, (req, res) => {

    const families = statements.getProductFamilies.all().filter(f => f.active);
    const names = [...new Set(families.map(f => f.board))];

    names.sort((a, b) => (BOARDS.indexOf(a) + 1 || 99) - (BOARDS.indexOf(b) + 1 || 99));

    res.json({ boards: names, periods: PERIODS, today: todayNY(), countStations: Object.fromEntries(names.map(n => [n, countStationFor(n)])), pcbStation: PCB_STATION });

});

app.get("/hourly/products", authenticateToken, (req, res) => {

    const date = isDate(req.query.date) ? req.query.date : todayNY();

    const families = statements.getProductFamilies.all()
        .filter(f => !req.query.board || f.board === req.query.board)
        .map(f => {

            const current = statements.getFamilyRateOn.get(f.id, date);

            return { ...f, rate: current ? current.units_per_hour : null, rateEffective: current?.effective_date || null, history: statements.getRatesForFamily.all(f.id) };

        });

    const all = statements.getProductFamilies.all();

    const skuRates = statements.getSkuRates.all()
        .map(r => ({ ...r, family: familyFor(r.sku, all) }))
        .filter(r => !req.query.board || r.family?.board === req.query.board);

    // SKUs listed under each family (0008), with the rate in effect.
    const skus = req.query.board
        ? statements.getBoardSkus.all(req.query.board).map(s => ({ ...s, rate: rateFor(statements, s.sku, { id: s.family_id }, date) }))
        : [];

    res.json({ date, families, skus, skuRates });

});

app.get("/hourly/resolve", authenticateToken, (req, res) => {

    const sku = String(req.query.sku || "").trim().toUpperCase();
    const date = isDate(req.query.date) ? req.query.date : todayNY();
    const family = familyFor(sku, statements.getProductFamilies.all());
    const rate = family ? rateFor(statements, sku, family, date) : null;

    res.json({ sku, family: family ? { id: family.id, prefix: family.prefix, board: family.board } : null, rate });

});

// Bulk import (services/rateImport.js): check, then save all or nothing.
app.post("/admin/hourly/rates/import", authenticateToken, requireAdmin, (req, res) => {

    const { text, unit, effectiveDate, save } = req.body || {};

    if (typeof text !== "string" || !text.trim() || text.length > 100000)
        return res.status(400).json({ success: false, message: "Paste the rows to import (up to 100,000 characters)." });

    if (!["seconds", "perHour"].includes(unit))
        return res.status(400).json({ success: false, message: "unit must be seconds or perHour." });

    const defaultDate = effectiveDate || todayNY();

    if (!isDate(defaultDate))
        return res.status(400).json({ success: false, message: "Effective date must be YYYY-MM-DD." });

    const result = checkRows(statements, text, { unit, defaultDate });

    if (result.rows.length > 1000)
        return res.status(400).json({ success: false, message: "Up to 1,000 rows at a time." });

    if (!save)
        return res.json({ success: true, saved: 0, ...result });

    if (result.errors || !result.ok)
        return res.status(400).json({ success: false, message: result.errors ? `${result.errors} row${result.errors === 1 ? " has" : "s have"} a problem. Nothing was saved.` : "Nothing to save.", ...result });

    const now = Date.now();

    db.transaction(() => {

        for (const r of result.rows)
            statements.insertRate.run(r.target === "family" ? r.familyId : null, r.target === "sku" ? r.sku : null, r.unitsPerHour, r.effectiveDate, now);

    })();

    console.log(`✓ Rates imported: ${result.ok} (${unit})`);

    res.status(201).json({ success: true, saved: result.ok, ...result });

});

app.post("/admin/hourly/rates", authenticateToken, requireAdmin, (req, res) => {

    const { familyId, sku, unitsPerHour, effectiveDate } = req.body || {};
    const rate = Number(unitsPerHour);
    const date = effectiveDate || todayNY();

    if (!(rate > 0) || rate > 10000 || !isDate(date))
        return res.status(400).json({ success: false, message: "Need units per hour (more than 0) and an effective date YYYY-MM-DD." });

    if ((familyId ? 1 : 0) + (sku ? 1 : 0) !== 1)
        return res.status(400).json({ success: false, message: "Give either a family or a SKU." });

    let cleanSku = null;

    if (familyId) {

        if (!statements.getProductFamily.get(familyId))
            return res.status(404).json({ success: false, message: "Family not found." });

    } else {

        cleanSku = String(sku).trim().toUpperCase();

        if (!familyFor(cleanSku, statements.getProductFamilies.all()))
            return res.status(400).json({ success: false, message: `${cleanSku} doesn't match any product family.` });

    }

    const result = statements.insertRate.run(familyId || null, cleanSku, rate, date, Date.now());

    res.status(201).json({ success: true, id: result.lastInsertRowid });

});

app.delete("/admin/hourly/rates/:id", authenticateToken, requireAdmin, (req, res) => {

    if (!statements.deleteRate.run(req.params.id).changes)
        return res.status(404).json({ success: false, message: "Rate not found." });

    res.json({ success: true });

});

// SKU list per board (0008): add (or re-list) a SKU under its
// family, or take it off the list. Rates are untouched.
app.post("/admin/hourly/skus", authenticateToken, requireAdmin, (req, res) => {

    const sku = String(req.body?.sku || "").trim().toUpperCase();

    if (!sku || sku.length > 80)
        return res.status(400).json({ success: false, message: "SKU is required (up to 80 characters)." });

    const family = familyFor(sku, statements.getProductFamilies.all());

    if (!family)
        return res.status(400).json({ success: false, message: `${sku} doesn't match any product family, so it isn't on a board.` });

    const existing = statements.getSku.get(sku);
    const now = Date.now();

    if (existing?.active)
        return res.status(409).json({ success: false, message: `${sku} is already listed.` });

    if (existing)
        statements.relistSku.run(family.id, now, existing.id);
    else
        statements.insertSku.run(family.id, sku, now, now);

    console.log(`✓ SKU listed: ${sku} (${family.prefix}, ${family.board})`);

    res.status(201).json({ success: true, sku, family: { id: family.id, prefix: family.prefix, board: family.board } });

});

app.delete("/admin/hourly/skus/:id", authenticateToken, requireAdmin, (req, res) => {

    if (!statements.unlistSku.run(Date.now(), req.params.id).changes)
        return res.status(404).json({ success: false, message: "SKU not found." });

    res.json({ success: true });

});

const hourlySettings = () => Object.fromEntries(statements.getHourlySettings.all().map(r => [r.key, r.value]));

// Plan + actuals + RAG for one board and day.
const boardDay = (board, date) => ({
    ...withActuals(planFor(statements, board, date), statements.getActuals.all({ board, date }), hourlySettings(), Date.now(), {
        fails: statements.getFailsByPeriod.all(board, date),
        dispositions: statements.getDispositionsByPeriod.all(board, date),
        open: statements.getOpenFailures.all(board, "FINAL").length
    }),
    pcb: pcbDay(board, date),
    corrections: statements.getAdjustments.all(board, date)
});

// PCB Test (0012): PASS / FAIL per board, for PCB FPY. Never part of Actual.
function pcbDay(board, date) {

    const rows = statements.getPcbDay.all(board, date, board, date);
    const pass = rows.filter(r => r.kind === "PASS").reduce((a, r) => a + r.n, 0);
    const fail = rows.filter(r => r.kind === "FAIL").reduce((a, r) => a + r.n, 0);

    return {
        pass,
        fail,
        fpy: fpyOf(pass, fail),
        open: statements.getOpenFailures.all(board, "PCB").length,
        periods: PERIODS.map((p, i) => {

            const ps = rows.filter(r => r.kind === "PASS" && r.period === i).reduce((a, r) => a + r.n, 0);
            const fs = rows.filter(r => r.kind === "FAIL" && r.period === i).reduce((a, r) => a + r.n, 0);

            return { label: p.label, pass: ps, fail: fs, fpy: fpyOf(ps, fs) };

        })
    };

}

const stationOf = s => (s === "PCB" ? "PCB" : "FINAL");

// Count station: a SKU of the board's families. PCB Test (0013): one
// of the board's active PCB part numbers.
function checkSku(board, sku, station) {

    if (stationOf(station) === "PCB") {

        const part = statements.getPcbPart.get(board, sku);

        return part && part.active ? null : `${sku || "Part"} is not a PCB part on the ${board} PCB Test list.`;

    }

    const family = familyFor(sku, statements.getProductFamilies.all());

    return family && family.board === board ? null : `${sku || "SKU"} is not on the ${board} board.`;

}

app.get("/hourly/plan/:board/:date", authenticateToken, (req, res) => {

    if (!isDate(req.params.date))
        return res.status(400).json({ success: false, message: "Date must be YYYY-MM-DD." });

    res.json(boardDay(req.params.board, req.params.date));

});

//------------------------------------------------------
// H2: one tap per good unit (tablet at the count station).
// tapId comes from the tablet, so a re-sent tap (offline
// queue) is stored once. tappedAt is the tablet's time of the
// tap (offline taps count in the hour they were made); one
// more than 24 h old or in the future uses the server time.
//------------------------------------------------------

const TAP_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UNDO_MS = 45 * 1000;   // 30 s on the tablet + delivery grace

app.post("/hourly/taps", authenticateToken, (req, res) => {

    const { tapId, board, sku, tappedAt, productionLine, workCenter, station } = req.body || {};
    const now = Date.now();

    if (!TAP_ID.test(String(tapId || "")))
        return res.status(400).json({ success: false, message: "tapId is required (8-64 letters, digits, - or _)." });

    const existing = statements.getTap.get(tapId);

    if (existing)
        return res.json({ success: true, duplicate: true, tap: existing });

    if (!BOARDS.includes(board))
        return res.status(400).json({ success: false, message: "Unknown board." });

    const cleanSku = String(sku || "").trim().toUpperCase();
    const skuError = checkSku(board, cleanSku, station);

    if (skuError)
        return res.status(400).json({ success: false, message: skuError });

    const t = Number(tappedAt);
    const at = Number.isFinite(t) && t <= now + 2 * 60 * 1000 && t >= now - 24 * 60 * 60 * 1000 ? Math.min(t, now) : now;

    statements.insertTap.run(tapId, board, dateNY(at), periodAt(at), cleanSku, String(productionLine || "").slice(0, 100) || null, String(workCenter || "").slice(0, 100) || null, at, now, stationOf(station));

    res.status(201).json({ success: true, tap: statements.getTap.get(tapId) });

});

app.post("/hourly/taps/:tapId/undo", authenticateToken, (req, res) => {

    const tap = statements.getTap.get(req.params.tapId);

    if (!tap)
        return res.status(404).json({ success: false, message: "Tap not found." });

    if (tap.undone_at)
        return res.json({ success: true, alreadyUndone: true });

    if (Date.now() - tap.created_at > UNDO_MS)
        return res.status(409).json({ success: false, message: "Too late to undo (30 seconds). Ask your lead to correct the count." });

    statements.undoTap.run(Date.now(), tap.tap_id);

    res.json({ success: true });

});

//------------------------------------------------------
// Count corrections (0010, admin): set an hour's Actual for
// one SKU to the right number. Stored as a signed delta with
// a reason and a name; never edited or deleted (audit).
//------------------------------------------------------

app.post("/admin/hourly/corrections", authenticateToken, requireAdmin, (req, res) => {

    const { board, date, period, sku, delta, reason, by } = req.body || {};
    const d = Number(delta);
    const p = Number(period);
    const cleanSku = String(sku || "").trim().toUpperCase();
    const cleanReason = String(reason || "").trim();
    const cleanBy = String(by || "").trim();

    if (!BOARDS.includes(board) || !isDate(date))
        return res.status(400).json({ success: false, message: "Need a board and a date YYYY-MM-DD." });

    if (!Number.isInteger(p) || p < 0 || p >= PERIODS.length)
        return res.status(400).json({ success: false, message: "Unknown hour." });

    if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 500)
        return res.status(400).json({ success: false, message: "The correction must change the count by a whole number (1-500 up or down)." });

    if (cleanReason.length < 3 || cleanReason.length > 200)
        return res.status(400).json({ success: false, message: "A reason is required (3-200 characters)." });

    if (cleanBy.length < 2 || cleanBy.length > 80)
        return res.status(400).json({ success: false, message: "Your name is required." });

    const family = familyFor(cleanSku, statements.getProductFamilies.all());

    if (!family || family.board !== board)
        return res.status(400).json({ success: false, message: `${cleanSku || "SKU"} is not on the ${board} board.` });

    const current = statements.getActuals.all({ board, date }).find(r => r.period === p && r.sku === cleanSku)?.n || 0;

    if (current + d < 0)
        return res.status(400).json({ success: false, message: `That would make ${cleanSku} ${current + d} in that hour. The count can't go below 0.` });

    statements.insertAdjustment.run(board, date, p, cleanSku, d, cleanReason, cleanBy, Date.now());

    console.log(`✓ Count corrected: ${board} ${date} ${PERIODS[p].label} ${cleanSku} ${d > 0 ? "+" : ""}${d} by ${cleanBy}`);

    res.status(201).json({ success: true, ...boardDay(board, date) });

});

//------------------------------------------------------
// H3 (0011): FAIL → failure code; open until REWORK_PASS
// (adds 1 to Actual in the hour it passed) or SCRAP (the
// tablet offers the NCM form). failId from the tablet, so a
// re-sent fail is stored once (offline queue).
//------------------------------------------------------

app.get("/hourly/failure-codes", authenticateToken, (req, res) => {

    res.json({ codes: statements.getFailureCodes.all().filter(c => c.active) });

});

app.post("/hourly/failures", authenticateToken, (req, res) => {

    const { failId, board, sku, code, failedAt, productionLine, workCenter, station } = req.body || {};
    const now = Date.now();

    if (!TAP_ID.test(String(failId || "")))
        return res.status(400).json({ success: false, message: "failId is required (8-64 letters, digits, - or _)." });

    const existing = statements.getFailure.get(failId);

    if (existing)
        return res.json({ success: true, duplicate: true, failure: existing });

    if (!BOARDS.includes(board))
        return res.status(400).json({ success: false, message: "Unknown board." });

    const cleanSku = String(sku || "").trim().toUpperCase();
    const skuError = checkSku(board, cleanSku, station);

    if (skuError)
        return res.status(400).json({ success: false, message: skuError });

    const fc = statements.getFailureCode.get(String(code || ""));

    if (!fc || !fc.active)
        return res.status(400).json({ success: false, message: "Pick a failure code from the list." });

    const t = Number(failedAt);
    const at = Number.isFinite(t) && t <= now + 2 * 60 * 1000 && t >= now - 24 * 60 * 60 * 1000 ? Math.min(t, now) : now;

    statements.insertFailure.run(failId, board, dateNY(at), periodAt(at), cleanSku, fc.code, String(productionLine || "").slice(0, 100) || null, String(workCenter || "").slice(0, 100) || null, at, now, stationOf(station));

    res.status(201).json({ success: true, failure: statements.getFailure.get(failId) });

});

app.post("/hourly/failures/:failId/undo", authenticateToken, (req, res) => {

    const f = statements.getFailure.get(req.params.failId);

    if (!f)
        return res.status(404).json({ success: false, message: "Failure not found." });

    if (f.undone_at)
        return res.json({ success: true, alreadyUndone: true });

    if (f.disposition)
        return res.status(409).json({ success: false, message: "Already dispositioned; it can't be undone." });

    if (Date.now() - f.created_at > UNDO_MS)
        return res.status(409).json({ success: false, message: "Too late to undo (30 seconds). Ask your lead to correct it." });

    statements.undoFailure.run(Date.now(), f.fail_id);

    res.json({ success: true });

});

app.post("/hourly/failures/:failId/disposition", authenticateToken, (req, res) => {

    const f = statements.getFailure.get(req.params.failId);
    const disposition = req.body?.disposition;

    if (!f || f.undone_at)
        return res.status(404).json({ success: false, message: "Failure not found." });

    if (!["REWORK_PASS", "SCRAP"].includes(disposition))
        return res.status(400).json({ success: false, message: "Disposition must be REWORK_PASS or SCRAP." });

    if (f.disposition)
        return res.status(409).json({ success: false, message: `Already ${f.disposition === "SCRAP" ? "scrapped" : "reworked and passed"}.` });

    const now = Date.now();
    const by = String(req.body?.by || "Operator (tablet)").trim().slice(0, 80) || "Operator (tablet)";

    statements.disposeFailure.run(disposition, now, dateNY(now), periodAt(now), by, f.fail_id);

    res.json({ success: true, failure: statements.getFailure.get(f.fail_id) });

});

app.get("/hourly/failures/open/:board", authenticateToken, (req, res) => {

    res.json({ failures: statements.getOpenFailures.all(req.params.board, stationOf(req.query.station)) });

});

app.get("/admin/failure-codes", authenticateToken, requireAdmin, (req, res) => {

    res.json({ codes: statements.getFailureCodes.all() });

});

app.post("/admin/failure-codes", authenticateToken, requireAdmin, (req, res) => {

    const label = String(req.body?.label || "").trim().toUpperCase();
    const m = label.match(/^([A-Z]{2}) (\d{3}) - .{3,100}$/);

    if (!m)
        return res.status(400).json({ success: false, message: 'Write it like the form: "EC 060 - DESCRIPTION".' });

    const code = `${m[1]} ${m[2]}`;

    if (statements.getFailureCode.get(code))
        return res.status(409).json({ success: false, message: `${code} is already on the list.` });

    statements.insertFailureCode.run(code, label, m[1], Date.now(), Date.now());

    res.status(201).json({ success: true, code: statements.getFailureCode.get(code) });

});

app.put("/admin/failure-codes/:id", authenticateToken, requireAdmin, (req, res) => {

    if (typeof req.body?.active !== "boolean")
        return res.status(400).json({ success: false, message: "active must be true or false." });

    if (!statements.setFailureCodeActive.run(req.body.active ? 1 : 0, Date.now(), req.params.id).changes)
        return res.status(404).json({ success: false, message: "Code not found." });

    res.json({ success: true });

});

//------------------------------------------------------
// H4 reports: plan vs actual, FPY, top failure codes, PCB
// Test, demonstrated rates, for a day or a range (max 62
// days). Any login can view.
//------------------------------------------------------

app.get("/reports/hourly", authenticateToken, (req, res) => {

    const from = isDate(req.query.from) ? req.query.from : todayNY();
    const to = isDate(req.query.to) ? req.query.to : from;

    if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62)
        return res.status(400).json({ success: false, message: "Pick a range of up to 62 days, from before to." });

    res.json(buildReport(statements, from, to, boardDay, hourlySettings()));

});

//------------------------------------------------------
// PCB part numbers at PCB Test (0013)
//------------------------------------------------------

app.get("/hourly/pcb-parts/:board", authenticateToken, (req, res) => {

    const all = statements.getPcbParts.all(req.params.board);

    res.json({ parts: req.query.all ? all : all.filter(p => p.active) });

});

app.post("/admin/hourly/pcb-parts", authenticateToken, requireAdmin, (req, res) => {

    const board = req.body?.board;
    const part = String(req.body?.part || "").trim().toUpperCase();
    const description = String(req.body?.description || "").trim().slice(0, 120) || null;

    if (!BOARDS.includes(board))
        return res.status(400).json({ success: false, message: "Unknown board." });

    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(part))
        return res.status(400).json({ success: false, message: "Part number: letters, digits and dashes (3-40)." });

    const existing = statements.getPcbPart.get(board, part);

    if (existing?.active)
        return res.status(409).json({ success: false, message: `${part} is already on the ${board} list.` });

    if (existing)
        statements.setPcbPartActive.run(1, Date.now(), existing.id);
    else
        statements.insertPcbPart.run(board, part, description, board, Date.now(), Date.now());

    res.status(201).json({ success: true, part: statements.getPcbPart.get(board, part) });

});

app.put("/admin/hourly/pcb-parts/:id", authenticateToken, requireAdmin, (req, res) => {

    if (typeof req.body?.active !== "boolean")
        return res.status(400).json({ success: false, message: "active must be true or false." });

    if (!statements.setPcbPartActive.run(req.body.active ? 1 : 0, Date.now(), req.params.id).changes)
        return res.status(404).json({ success: false, message: "Part not found." });

    res.json({ success: true });

});

app.get("/hourly/settings", authenticateToken, (req, res) => res.json(hourlySettings()));

app.put("/admin/hourly/settings", authenticateToken, requireAdmin, (req, res) => {

    const green = Number(req.body?.greenPct);
    const amber = Number(req.body?.amberPct);

    if (!(green > 0 && green <= 200 && amber > 0 && amber < green))
        return res.status(400).json({ success: false, message: "Need green % (1-200) and amber % below it." });

    statements.setHourlySetting.run(green, Date.now(), "green_pct");
    statements.setHourlySetting.run(amber, Date.now(), "amber_pct");

    // FPY colours (0012), optional in the same call.
    if (req.body?.fpyGreenPct !== undefined || req.body?.fpyAmberPct !== undefined) {

        const fg = Number(req.body.fpyGreenPct);
        const fa = Number(req.body.fpyAmberPct);

        if (!(fg > 0 && fg <= 100 && fa > 0 && fa < fg))
            return res.status(400).json({ success: false, message: "Need FPY green % (1-100) and FPY amber % below it." });

        statements.setHourlySetting.run(fg, Date.now(), "fpy_green_pct");
        statements.setHourlySetting.run(fa, Date.now(), "fpy_amber_pct");

    }

    res.json(hourlySettings());

});

app.put("/admin/hourly/plan/:board/:date", authenticateToken, requireAdmin, (req, res) => {

    const { board, date } = req.params;
    const runs = req.body?.runs;

    if (!isDate(date))
        return res.status(400).json({ success: false, message: "Date must be YYYY-MM-DD." });

    if (!Array.isArray(runs) || runs.length > 50)
        return res.status(400).json({ success: false, message: "runs must be a list (up to 50)." });

    const priced = priceRuns(statements, board, date, runs);

    if (priced.error)
        return res.status(400).json({ success: false, message: priced.error });

    const now = Date.now();

    db.transaction(() => {

        let plan = statements.getPlan.get(board, date);

        if (!plan) {

            statements.insertPlan.run(board, date, now, now);
            plan = statements.getPlan.get(board, date);

        } else {

            statements.touchPlan.run(now, plan.id);

        }

        statements.deletePlanRuns.run(plan.id);

        priced.runs.forEach((r, i) => statements.insertPlanRun.run(plan.id, i + 1, r.sku, r.family.id, r.qty, r.rate));

    })();

    console.log(`✓ Plan saved: ${board} ${date} (${priced.runs.length} runs)`);

    res.json({ success: true, ...boardDay(board, date) });

});

app.get("/admin/backups", authenticateToken, requireAdmin, (req, res) => {

    const dir = backupDirFor(dbPath);

    const { inDrive, ...offsite } = offsiteStatus();
    const drive = new Set(inDrive);

    const backups = listBackups(dir).map(file => {

        const stat = fs.statSync(path.join(dir, file));

        return {
            file,
            sizeBytes: stat.size,
            modified: stat.mtimeMs,
            inDrive: drive.has(file)
        };

    });

    res.json({ success: true, backups, offsite });

});

app.get("/admin/backups/:file", authenticateToken, requireAdmin, (req, res) => {

    const file = req.params.file;

    if (!BACKUP_NAME.test(file)) {

        return res.status(400).json({
            success: false,
            message: "Invalid backup file name."
        });

    }

    const full = path.join(backupDirFor(dbPath), file);

    if (!fs.existsSync(full)) {

        return res.status(404).json({
            success: false,
            message: "Backup not found."
        });

    }

    console.log(`Backup downloaded by ${req.user.username}: ${file}`);

    res.download(full, file);

});

//------------------------------------------------------
// Telegram Webhook
//------------------------------------------------------

// Telegram resolves save this note until someone adds the real one
// in the app ("Needs a resolution note" on /supervisor, /dashboard).
const TELEGRAM_DEFAULT_NOTE = "Resolved from Telegram";
const TELEGRAM_NOTE_WHERE = "Response Center or Dashboard → Needs a resolution note";

// Telegram echoes the secret_token we pass to setWebhook in this
// header. No secret configured, or no match: reject (fail closed).
function isFromTelegram(req) {

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const header = req.get("X-Telegram-Bot-Api-Secret-Token");

    if (!secret || !header)
        return false;

    const a = Buffer.from(header);
    const b = Buffer.from(secret);

    return a.length === b.length && crypto.timingSafeEqual(a, b);

}

app.post("/telegram/webhook", async (req, res) => {

    if (!isFromTelegram(req)) {
        return res.sendStatus(401);
    }

    // Outside production setWebhook never runs, so ignore
    // anything posted here (it can't be from our bot).
    if (!notificationsEnabled()) {
        return res.sendStatus(200);
    }

    const callback = req.body.callback_query;

    if (!callback) {
        return res.sendStatus(200);
    }

    const data = String(callback.data || "");

    const responder =
        (callback.from?.first_name || "Telegram user") +
        (callback.from?.last_name ? " " + callback.from.last_name : "");

    //--------------------------------------------------
    // RESOLVE
    //--------------------------------------------------

    if (data.startsWith("resolve_")) {

        const alertId = data.replace("resolve_", "");
        const now = Date.now();

        const result = statements.resolveAlert.run(
            now,
            responder,
            TELEGRAM_DEFAULT_NOTE,
            now,
            now,
            alertId
        );

        if (result.changes === 0) {

            await answerTelegramCallback(
                callback,
                callbackConflictText(statements.getAlert.get(alertId), alertId),
                true
            );

            return res.sendStatus(200);

        }

        const alert = statements.getAlert.get(alertId);

        releaseResponders([alert.assigned_to, responder], now);

        queueNotification(alert.id, "telegram resolved", async () => {
            await notifyResolved(alert);
            await updateTelegram(alert);
        });
        console.log(`✓ Telegram resolved Alert #${alertId} by ${responder}`);

        // A button can't carry text, and the ANDON Telegram is a
        // channel (no replies), so the note is added in the app (#14b).
        await answerTelegramCallback(
            callback,
            `Resolved ✔ Add what fixed it in ManufacturingOS: ${TELEGRAM_NOTE_WHERE}.`,
            true
        );

        return res.sendStatus(200);

    }

    //--------------------------------------------------
    // ACKNOWLEDGE
    //--------------------------------------------------

    if (data.startsWith("ack_")) {

        const alertId = data.replace("ack_", "");
        const now = Date.now();

        const result = statements.acknowledgeAlert.run(
            now,
            responder,
            responder,
            now,
            alertId
        );

        if (result.changes === 0) {

            await answerTelegramCallback(
                callback,
                callbackConflictText(statements.getAlert.get(alertId), alertId),
                true
            );

            return res.sendStatus(200);

        }

        statements.updateResponderAvailability.run(
            "Responding",
            now,
            responder
        );

        const alert = statements.getAlert.get(alertId);

        queueNotification(alert.id, "telegram acknowledged", async () => {
            await notifyAcknowledged(alert);
            await updateTelegram(alert);
        });

        console.log(`✓ Telegram acknowledged Alert #${alertId} by ${responder}`);

        await answerTelegramCallback(callback, "Acknowledged ✔");

        return res.sendStatus(200);

    }

    //--------------------------------------------------
    // Anything else (e.g. the "✅ RESOLVED" button on a
    // finished alert): just stop the spinner.
    //--------------------------------------------------

    await answerTelegramCallback(
        callback,
        data === "resolved" ? "This alert is already resolved." : ""
    );

    res.sendStatus(200);

});

//------------------------------------------------------
// Telegram button answers (defects #23, #24)
//
// Telegram accepts one answer per button press, so each
// path answers exactly once, after the database update.
// A failed answer is logged, never thrown: the alert is
// already updated, and a non-200 makes Telegram resend
// the press.
//------------------------------------------------------

async function answerTelegramCallback(callback, text, showAlert = false) {

    try {

        await axios.post(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
            {
                callback_query_id: callback.id,
                text,
                show_alert: showAlert
            },
            { timeout: notifyTimeoutMs() }
        );

    } catch (error) {

        // Telegram's own reason (e.g. "Bad Request: ...") is in the body.
        console.error(
            "Telegram answerCallbackQuery failed:",
            error.response?.data?.description || error.message
        );

    }

}

// Why an acknowledge or resolve press changed nothing.
function callbackConflictText(alert, alertId) {

    if (!alert)
        return `Alert #${alertId} was not found.`;

    if (alert.status === "RESOLVED")
        return `Already resolved by ${alert.resolved_by || "another responder"}.`;

    if (alert.status === "CANCELLED")
        return "This alert was cancelled.";

    if (alert.status === "ACKNOWLEDGED")
        return `Already acknowledged by ${alert.assigned_to || "another responder"}.`;

    return "Acknowledge this alert before resolving it.";

}

//------------------------------------------------------
// Configure Telegram Webhook
//------------------------------------------------------

async function configureTelegramWebhook() {

    if (!notificationsEnabled()) {

        console.log(
            "Telegram webhook not configured: APP_ENV is not production."
        );

        return;

    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {

        console.log(
            "Telegram webhook not configured: TELEGRAM_BOT_TOKEN missing."
        );

        return;

    }

    // Telegram allows 1-256 chars of A-Z a-z 0-9 _ -
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {

        console.error(
            "Telegram webhook NOT configured: TELEGRAM_WEBHOOK_SECRET missing or invalid (1-256 chars, A-Z a-z 0-9 _ -). Telegram buttons will not work."
        );

        return;

    }

    try {

        const response = await axios.post(

            `https://api.telegram.org/bot${token}/setWebhook`,

            {

                url: telegramWebhookUrl,

                secret_token: secret,

                // Button presses only; the channel can't reply (#14b).
                allowed_updates: ["callback_query"]

            },

            { timeout: notifyTimeoutMs() }

        );

        if (response.data.ok) {

            console.log(
                `✓ Telegram webhook configured: ${telegramWebhookUrl}`
            );

        } else {

            console.error(
                "Telegram webhook configuration failed:",
                response.data
            );

        }

    } catch (err) {

        console.error(
            "Telegram webhook configuration error:",
            err.response?.data || err.message
        );

    }

}

//------------------------------------------------------
// Start Server
//------------------------------------------------------

// Tests import the app without opening a port.
if (require.main === module) {

    app.listen(PORT, "0.0.0.0", async () => {

        console.log("");
        console.log("========================================");
        console.log(" ManufacturingOS Backend v6.0");
        console.log("========================================");
        console.log(` Listening on port ${PORT}`);
        console.log(
            notificationsEnabled()
                ? " Notifications Enabled"
                : " Notifications Disabled (APP_ENV is not production)"
        );
        console.log("========================================");

        startDailyBackups(db, dbPath);

        startEscalationShadow(statements);

        qbBom.start();

        // Ship Report → backlog notes every 30 min (Nov 12 2026).
        backlogRouter.shipReport.start();

        // Weekly "all systems OK" post in #mos-system (Director, Nov 11 2026).
        require("./services/weeklyHealth").createWeeklyHealth({
            db,
            qbBom,
            offsiteStatus: require("./services/offsiteBackup").offsiteStatus,
            postSystem: text => require("./services/slack").postSystemToSlack(text),
            channels: () => {
                const slack = require("./services/slack").slackConfig;
                const groups = require("./services/telegramGroups").groupConfig;
                const prod = notificationsEnabled();
                return {
                    "Slack #andon-alerts": Boolean(slack("andon")),
                    "Slack #safety-near-miss": Boolean(slack("nearMiss")),
                    "Slack #bom-changes": Boolean(slack("bom")),
                    "Slack #mos-system": Boolean(slack("system")),
                    ...(prod ? {
                        "Telegram ANDON": Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
                        "Telegram Near Miss": Boolean(groups("nearMiss")),
                        "Telegram BOM": Boolean(groups("bom"))
                    } : {})
                };
            },
            escalationMode: () => (isLive(statements) ? "LIVE in Slack" : "shadow (nothing sent)"),
            shipReportStatus: () => backlogRouter.shipReport.status()
        }).start();

        console.log(require("./services/slack").describeSlack());
        console.log(require("./services/telegramGroups").describeTelegramGroups());

        await configureTelegramWebhook();

    });

}

module.exports = app;
