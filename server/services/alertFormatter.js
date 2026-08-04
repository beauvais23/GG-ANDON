//------------------------------------------------------
// Time Zone
//------------------------------------------------------

const TIME_ZONE = "America/New_York";

//------------------------------------------------------
// Alert Colors
//------------------------------------------------------

const alertColors = {
    QUALITY: "#D32F2F",
    MAINTENANCE: "#F57C00",
    MATERIAL: "#FBC02D",
    SUPERVISOR: "#1976D2",
    SAFETY: "#2E7D32"
};

//------------------------------------------------------
// Alert Icons
//------------------------------------------------------

const alertIcons = {
    QUALITY: "🔴",
    MAINTENANCE: "🟧",
    MATERIAL: "🟨",
    SUPERVISOR: "🟦",
    SAFETY: "🟩"
};

//------------------------------------------------------
// Status Icons
//------------------------------------------------------

const statusIcons = {
    CREATED: "🚨",
    ACTIVE: "🚨",
    ACKNOWLEDGED: "👷",
    RESOLVED: "✅",
    CANCELLED: "❌"
};

//------------------------------------------------------
// Friendly Date Formatting
//------------------------------------------------------

function formatDate(timestamp) {

    if (!timestamp) return "—";

    const date = new Date(Number(timestamp));

    const today = new Date();

    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    const dateOnly = date.toLocaleDateString("en-US", {
        timeZone: TIME_ZONE
    });

    const todayOnly = today.toLocaleDateString("en-US", {
        timeZone: TIME_ZONE
    });

    const yesterdayOnly = yesterday.toLocaleDateString("en-US", {
        timeZone: TIME_ZONE
    });

    const clock = date.toLocaleTimeString("en-US", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit"
    });

    if (dateOnly === todayOnly) {

        return `Today • ${clock}`;

    }

    if (dateOnly === yesterdayOnly) {

        return `Yesterday • ${clock}`;

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

function getElapsed(alert) {

    const start = Number(alert.requested);

    const end = Number(alert.resolved || Date.now());

    const totalSeconds = Math.floor((end - start) / 1000);

    const days = Math.floor(totalSeconds / 86400);

    const hours = Math.floor((totalSeconds % 86400) / 3600);

    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const seconds = totalSeconds % 60;

    if (days > 0) {

        return `${days}d ${hours}h`;

    }

    if (hours > 0) {

        return `${hours}h ${minutes}m`;

    }

    return `${minutes}m ${seconds}s`;

}

//------------------------------------------------------
// Shared Formatter
//------------------------------------------------------

function formatAlert(alert) {

    return {

        icon:
            alertIcons[alert.type] || "⚪",

        color:
            alertColors[alert.type] || "#607D8B",

        title:
            `${alert.type} ALERT`,

        facility:
            alert.facility,

        line:
            alert.production_line || alert.productionLine,

        workCenter:
            alert.work_center || alert.workCenter,

        requested:
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
            alert.resolution_notes,

        elapsed:
            getElapsed(alert)

    };

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    alertColors,
    alertIcons,
    statusIcons,
    getElapsed,
    formatDate,
    formatAlert

};