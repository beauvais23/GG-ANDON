require("dotenv").config();

const authenticateToken = require("./middleware/auth");

const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const {
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
        // Validate credentials
        //--------------------------------------------------

        if (
            username !== process.env.APP_USERNAME ||
            password !== process.env.APP_PASSWORD
        ) {

            return res.status(401).json({

                success: false,

                message: "Invalid username or password."

            });

        }

        //--------------------------------------------------
        // Create authentication token
        //--------------------------------------------------

        const token = jwt.sign(

            {
                username
            },

            process.env.AUTH_SECRET,

            {
                expiresIn: "8h"
            }

        );

        //--------------------------------------------------
        // Login successful
        //--------------------------------------------------

        res.json({

            success: true,

            token

        });

    }

    catch (err) {

        console.error(
            "Authentication Error:",
            err.message
        );

        res.status(500).json({

            success: false,

            message: "Authentication failed."

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

        await notifyCreated(alert);

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

app.post("/production-lines", authenticateToken, (req, res) => {

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

app.put("/production-lines/order", authenticateToken, (req, res) => {

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

app.put("/production-lines/:id", authenticateToken, (req, res) => {

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

app.delete("/production-lines/:id", authenticateToken, (req, res) => {

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

app.post("/work-centers", authenticateToken, (req, res) => {

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

app.put("/work-centers/order", authenticateToken, (req, res) => {

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

app.put("/work-centers/:id", authenticateToken, (req, res) => {

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

            await notifyAcknowledged(
                updatedAlert
            );

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

                    resolutionNotes,

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

            await notifyResolved(
                updatedAlert
            );

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

            await notifyCancelled(
                updatedAlert
            );

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
            resolvedToday: resolved.length,
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



app.post("/response-team", authenticateToken, (req, res) => {

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
    availability,
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

app.put("/response-team/:id", authenticateToken, (req, res) => {

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
    availability,
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

app.delete("/response-team/:id", authenticateToken, (req, res) => {

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
// Telegram Test
//------------------------------------------------------

app.get("/telegram/test", async (req, res) => {

    console.log("Telegram Test Route Hit");

    const { sendTelegram } =
        require("./services/telegram");

    const testAlert = {

        id: 999999,

        type: "QUALITY",

        production_line: "Gigabay",

        work_center: "Final Test",

        priority: "HIGH",

        status: "ACTIVE",

        requested: Date.now(),

        assigned_to: null,

        acknowledged_by: null,

        resolved_by: null,

        resolution_notes: ""

    };

    const messageId =
        await sendTelegram(
            testAlert,
            "CREATED"
        );

    res.json({

        success: !!messageId,

        messageId

    });

});

//------------------------------------------------------
// Telegram Webhook
//------------------------------------------------------

app.post("/telegram/webhook", async (req, res) => {

    const callback = req.body.callback_query;

    if (!callback) {
        return res.sendStatus(200);
    }

//--------------------------------------------------
// RESOLVE
//--------------------------------------------------

if (callback.data.startsWith("resolve_")) {

    const alertId = callback.data.replace("resolve_", "");

    const responder =
        callback.from.first_name +
        (callback.from.last_name ? " " + callback.from.last_name : "");

    const now = Date.now();

    const result = statements.resolveAlert.run(

    now,
    responder,
    "Resolved from Telegram",
    now,
    now,
    alertId

);

//----------------------------------------------
// Already resolved
//----------------------------------------------

if (result.changes === 0) {

    const alert = statements.getAlert.get(alertId);

    await axios.post(

        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,

        {

            callback_query_id: callback.id,

            text: `Already resolved by ${alert.resolved_by || "another responder"}`,

            show_alert: true

        }

    );

    return res.sendStatus(200);

}

//----------------------------------------------
// Success
//----------------------------------------------

statements.updateResponderAvailability.run(

    "Available",

    now,

    responder

);

const alert = statements.getAlert.get(alertId);

await notifyResolved(alert);

await updateTelegram(alert);

    console.log(
        `✓ Telegram resolved Alert #${alertId} by ${responder}`
    );

}    

    console.log("Telegram Callback:");
    console.log(JSON.stringify(callback, null, 2));

    //--------------------------------------------------
    // Stop Telegram spinner
    //--------------------------------------------------

    await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
        callback_query_id: callback.id,
        text: "Acknowledged ✔"
    }
);

    //--------------------------------------------------
    // ACKNOWLEDGE
    //--------------------------------------------------

    if (callback.data.startsWith("ack_")) {

        const alertId = callback.data.replace("ack_", "");

        const responder =
            callback.from.first_name +
            (callback.from.last_name ? " " + callback.from.last_name : "");

        const now = Date.now();

        const result = statements.acknowledgeAlert.run(

    now,
    responder,
    responder,
    now,
    alertId

);

//--------------------------------------------------
// Someone already acknowledged it
//--------------------------------------------------

if (result.changes === 0) {

    const alert = statements.getAlert.get(alertId);

    await axios.post(

        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,

        {

            callback_query_id: callback.id,

            text: `Already acknowledged by ${alert.assigned_to}`,

            show_alert: true

        }

    );

    return res.sendStatus(200);

}

//--------------------------------------------------
// Success
//--------------------------------------------------

statements.updateResponderAvailability.run(

    "Responding",

    now,

    responder

);

const alert = statements.getAlert.get(alertId);

await notifyAcknowledged(alert);

await updateTelegram(alert);

console.log(
    `✓ Telegram acknowledged Alert #${alertId} by ${responder}`
);

    }

    res.sendStatus(200);

});

//------------------------------------------------------
// Start Server
//------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log(" ManufacturingOS Backend v6.0");
    console.log("========================================");
    console.log(` Listening on port ${PORT}`);
    console.log(" Notifications Enabled");
    console.log("========================================");

});
