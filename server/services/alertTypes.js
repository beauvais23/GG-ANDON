//------------------------------------------------------
// Alert types (Option B, Oct 29 2026)
//
// The five original types plus DOWNTIME and NEAR_MISS
// (locked decision: 7 event types). Anything else is
// refused at create. label() is how a type reads in
// Telegram, Google Chat and the screens ("NEAR MISS").
//------------------------------------------------------

const ALERT_TYPES = [
    "QUALITY",
    "MAINTENANCE",
    "MATERIAL",
    "SUPERVISOR",
    "SAFETY",
    "DOWNTIME",
    "NEAR_MISS"
];

function isAlertType(type) {

    return ALERT_TYPES.includes(type);

}

function label(type) {

    return String(type || "").replace(/_/g, " ");

}

//------------------------------------------------------
// Near misses are reports, not calls for help (Director,
// Oct 30 2026): a NEAR_MISS is saved already closed
// ("logged"), never waits for a responder, and is left out
// of MTTA/MTTR. The tablet can undo it for a short time.
//------------------------------------------------------

const NEAR_MISS_LOGGED_BY = "Operator (tablet)";
const NEAR_MISS_LOGGED_NOTE = "Near miss logged; details in the Near Miss & Safety Incident Form";
const NEAR_MISS_UNDO_MS = 10 * 60 * 1000;

function isLoggedNearMiss(alert) {

    return Boolean(alert) &&
        alert.type === "NEAR_MISS" &&
        alert.status === "RESOLVED" &&
        alert.resolution_notes === NEAR_MISS_LOGGED_NOTE;

}

module.exports = {
    ALERT_TYPES,
    isAlertType,
    label,
    NEAR_MISS_LOGGED_BY,
    NEAR_MISS_LOGGED_NOTE,
    NEAR_MISS_UNDO_MS,
    isLoggedNearMiss
};
