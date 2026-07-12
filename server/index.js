const express = require("express");
const cors = require("cors");

const { statements } = require("./database");

const app = express();
const PORT = process.env.PORT || 3001;

//------------------------------------------------------
// Middleware
//------------------------------------------------------

app.use(cors());
app.use(express.json());

//------------------------------------------------------
// Root
//------------------------------------------------------

app.get("/", (req, res) => {

    res.json({
        application: "ManufacturingOS",
        version: "6.0",
        status: "Running"
    });

});

//------------------------------------------------------
// Health
//------------------------------------------------------

app.get("/health", (req, res) => {

    res.json({
        success: true,
        timestamp: Date.now()
    });

});

//------------------------------------------------------
// Create Alert
//------------------------------------------------------

app.post("/alerts", (req, res) => {

    try {

        const {
            facility,
            productionLine,
            workCenter,
            type,
            priority = "NORMAL"
        } = req.body;

        if (!facility || !productionLine || !workCenter || !type) {

            return res.status(400).json({
                success: false,
                message: "Missing required fields."
            });

        }

        const now = Date.now();

        console.log({
    facility,
    productionLine,
    workCenter,
    type,
    priority,
    now
});

const result = statements.insertAlert.run(
    facility,
    productionLine,
    workCenter,
    type,
    now,
    priority,
    now,
    now
);

        const alert = statements.getAlert.get(result.lastInsertRowid);

        console.log(`✓ Created Alert #${alert.id} (${alert.type})`);

        res.json({
            success: true,
            alert
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
// Get Active Alerts
//------------------------------------------------------

app.get("/alerts/active", (req, res) => {

    try {

        const alerts = statements.getActiveAlerts.all();

        res.json(alerts);

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
// Get All Alerts
//------------------------------------------------------

app.get("/alerts", (req, res) => {

    try {

        const alerts = statements.getAllAlerts.all();

        res.json(alerts);

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

app.patch("/alerts/:id/acknowledge", (req, res) => {

    try {

        const { acknowledgedBy } = req.body;

        const now = Date.now();

        statements.acknowledgeAlert.run(
            now,
            acknowledgedBy || null,
            now,
            req.params.id
        );

        const alert = statements.getAlert.get(req.params.id);

        res.json({
            success: true,
            alert
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
// Resolve Alert
//------------------------------------------------------

app.patch("/alerts/:id/resolve", (req, res) => {

    try {

        const {
            resolvedBy,
            resolutionNotes
        } = req.body;

        const now = Date.now();

        statements.resolveAlert.run(
            now,
            resolvedBy || null,
            resolutionNotes || "",
            now,
            now,
            req.params.id
        );

        const alert = statements.getAlert.get(req.params.id);

        res.json({
            success: true,
            alert
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
// Cancel Alert
//------------------------------------------------------

app.patch("/alerts/:id/cancel", (req, res) => {

    try {

        const now = Date.now();

        statements.cancelAlert.run(
            now,
            now,
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
// Start Server
//------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("========================================");
    console.log(" ManufacturingOS Backend v6.0");
    console.log("========================================");
    console.log(`Listening on port ${PORT}`);
    console.log("========================================");

});