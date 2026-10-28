require("dotenv").config();

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
    notifyCancelled
} = require("./services/notificationManager");

const { updateTelegram } = require("./services/telegramUpdate");

const { telegramWebhookUrl } = require("./config");
const { notificationsEnabled } = require("./services/appEnv");
const { startOfDayNY } = require("./services/nyTime");
const { startDailyBackups } = require("./services/dailyBackup");
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

app.use(express.json());

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
// Executive Dashboard
//------------------------------------------------------

app.get(
    "/dashboard/executive",
    authenticateToken,
    (req, res) => {

    try {

        const kpis = statements.getDashboardKPIs.get();

        const pareto = statements.getAlertPareto.all();

        const monthlyTrend =
            statements.getMonthlyTrend.all();

        const responseTrend =
            statements.getResponseTrend.all();

        const resolutionTrend =
            statements.getResolutionTrend.all();

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
// Update Production Line Order
//------------------------------------------------------

app.put("/production-lines/order", authenticateToken, requireAdmin, (req, res) => {

    try {

        const lines = req.body;

        const now = Date.now();

        for (const line of lines) {

            statements.updateProductionLineDisplayOrder.run(

                line.display_order,
                now,
                line.id

            );

        }

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

    try {

        statements.deleteProductionLine.run(
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

        const workCenters = req.body;

        const now = Date.now();

        for (const wc of workCenters) {

            statements.updateWorkCenterDisplayOrder.run(

                wc.display_order,
                now,
                wc.id

            );

        }

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
            // Cancel Alert
            //--------------------------------------------------

            const now =
                Date.now();

            const result =
                statements.cancelAlert.run(

                    now,

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

        const mttr =
            resolved.length === 0
                ? 0
                : Math.round(
                    resolved.reduce((sum, alert) => {

                        return sum + (
                            (alert.resolved || 0) -
                            (alert.requested || 0)
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
                message: "Responder already exists."

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

    try {

        const responder =
            statements.getResponder.get(req.params.id);

        if (!responder) {

            return res.status(404).json({

                success: false,
                message: "Responder not found."

            });

        }

        statements.deleteResponseTeam.run(req.params.id);

        res.json({

            success: true,
            message: "Responder deleted."

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
// Database Backups (admin only)
//
// Lets an admin download backup files from the volume in
// a browser, so a copy can be kept off Railway.
//------------------------------------------------------

app.get("/admin/backups", authenticateToken, requireAdmin, (req, res) => {

    const dir = backupDirFor(dbPath);

    const backups = listBackups(dir).map(file => {

        const stat = fs.statSync(path.join(dir, file));

        return {
            file,
            sizeBytes: stat.size,
            modified: stat.mtimeMs
        };

    });

    res.json({ success: true, backups });

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
            "Resolved from Telegram",
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

        await answerTelegramCallback(callback, "Resolved ✔");

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

        console.error("Telegram answerCallbackQuery failed:", error.message);

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

                secret_token: secret

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

        await configureTelegramWebhook();

    });

}

module.exports = app;
