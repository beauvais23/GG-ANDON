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

module.exports = { ALERT_TYPES, isAlertType, label };
