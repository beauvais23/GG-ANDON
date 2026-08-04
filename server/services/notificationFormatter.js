//------------------------------------------------------
// Time Zone
//------------------------------------------------------

const TIME_ZONE = "America/New_York";

//------------------------------------------------------
// Icons
//------------------------------------------------------

const alertIcons = {
    QUALITY: "🔴",
    MAINTENANCE: "🟧",
    MATERIAL: "🟨",
    SUPERVISOR: "🟦",
    SAFETY: "🟩"
};

const statusIcons = {
    CREATED: "🚨",
    ACTIVE: "🚨",
    ACKNOWLEDGED: "🟡",
    RESOLVED: "🟢",
    CANCELLED: "⚪"
};

const priorityIcons = {
    LOW: "🟢",
    NORMAL: "🟢",
    HIGH: "🟡",
    CRITICAL: "🔴"
};

//------------------------------------------------------
// Friendly Date
//------------------------------------------------------

function formatDate(timestamp) {

    if (!timestamp)
        return "—";

    const date = new Date(Number(timestamp));

    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    const timeOptions = {

        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit"

    };

    const day = date.toLocaleDateString("en-US", {

        timeZone: TIME_ZONE

    });

    const todayDay = today.toLocaleDateString("en-US", {

        timeZone: TIME_ZONE

    });

    const yesterdayDay = yesterday.toLocaleDateString("en-US", {

        timeZone: TIME_ZONE

    });

    if (day === todayDay) {

        return `Today • ${date.toLocaleTimeString("en-US", timeOptions)}`;

    }

    if (day === yesterdayDay) {

        return `Yesterday • ${date.toLocaleTimeString("en-US", timeOptions)}`;

    }

    return date.toLocaleString("en-US", {

        timeZone: TIME_ZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"

    });

}

//------------------------------------------------------
// Elapsed Time
//------------------------------------------------------

function formatElapsed(alert) {

    if (!alert.requested)
        return "0m 0s";

    const start = Number(alert.requested);

    const end = Number(alert.resolved || Date.now());

    const seconds = Math.floor((end - start) / 1000);

    const hours = Math.floor(seconds / 3600);

    const minutes = Math.floor((seconds % 3600) / 60);

    const remaining = seconds % 60;

    if (hours > 0) {

        return `${hours}h ${minutes}m`;

    }

    return `${minutes}m ${remaining}s`;

}

//------------------------------------------------------
// Notification Formatter
//------------------------------------------------------

function formatNotification(alert, status) {

    return {

        icon: alertIcons[alert.type] || "⚪",

        statusIcon: statusIcons[status] || "⚪",

        priorityIcon:
            priorityIcons[alert.priority || "NORMAL"] || "🟢",

        title: `${alert.type} ALERT`,

        status,

        facility:
            alert.facility,

        productionLine:
            alert.production_line ||
            alert.productionLine,

        workCenter:
            alert.work_center ||
            alert.workCenter,

        responder:
            alert.assigned_to ||
            alert.acknowledged_by ||
            alert.resolved_by ||
            "Unassigned",

        priority:
            alert.priority || "NORMAL",

        created:
            formatDate(alert.requested),

        acknowledged:
            formatDate(alert.acknowledged),

        resolved:
            formatDate(alert.resolved),

        acknowledgedBy:
            alert.acknowledged_by,

        resolvedBy:
            alert.resolved_by,

        notes:
            alert.resolution_notes || "",

        elapsed:
            formatElapsed(alert)

    };

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {
    formatNotification,
    formatDate,
    formatElapsed
};