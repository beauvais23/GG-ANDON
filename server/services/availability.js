//------------------------------------------------------
// Responder availability: one enum, matching the frontend.
//------------------------------------------------------

const AVAILABILITY = ["Available", "Responding", "Busy", "Away"];

// Returns the canonical value for any casing, or null.
function normalizeAvailability(value) {

    if (typeof value !== "string")
        return null;

    const lower = value.trim().toLowerCase();

    return AVAILABILITY.find(a => a.toLowerCase() === lower) || null;

}

module.exports = {
    AVAILABILITY,
    normalizeAvailability
};
