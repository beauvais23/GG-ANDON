import config from "../config/config";

//------------------------------------------------------
// API Base URL
//------------------------------------------------------

const API_URL = config.apiBaseUrl;

//------------------------------------------------------
// Authentication Header
//------------------------------------------------------

function getAuthHeaders() {
    const token = localStorage.getItem("authToken");

    return token
        ? {
              Authorization: `Bearer ${token}`,
          }
        : {};
}

//------------------------------------------------------
// Handle Authentication Failure
//------------------------------------------------------

function handleResponse(response) {

    if (
        response.status === 401 ||
        response.status === 403
    ) {

        localStorage.removeItem("authToken");

        window.location.href = "/login";

        throw new Error(
            "Authentication required. Redirecting to login."
        );

    }

    return response.json();
}

//------------------------------------------------------
// Create Alert
//------------------------------------------------------

export async function createAlert(alert) {

    const response = await fetch(
        `${API_URL}/alerts`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },

            body: JSON.stringify(alert),
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Get Active Alerts
//------------------------------------------------------

export async function getActiveAlerts() {

    const response = await fetch(
        `${API_URL}/alerts/active`,
        {
            headers: {
                ...getAuthHeaders(),
            },
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Get All Alerts
//------------------------------------------------------

export async function getAllAlerts() {

    const response = await fetch(
        `${API_URL}/alerts`,
        {
            headers: {
                ...getAuthHeaders(),
            },
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Acknowledge Alert
//------------------------------------------------------

export async function acknowledgeAlert(
    id,
    acknowledgedBy
) {

    const response = await fetch(
        `${API_URL}/alerts/${id}/acknowledge`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },

            body: JSON.stringify({
                acknowledgedBy,
            }),
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Resolve Alert
//------------------------------------------------------

export async function resolveAlert(
    id,
    resolvedBy,
    resolutionNotes = ""
) {

    const response = await fetch(
        `${API_URL}/alerts/${id}/resolve`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },

            body: JSON.stringify({
                resolvedBy,
                resolutionNotes,
            }),
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Cancel Alert
//------------------------------------------------------

// reason / cancelledBy: from the supervisor and dashboard
// cancel dialog (#26) and the tablet's one-tap reasons.
export async function cancelAlert(id, { reason, cancelledBy } = {}) {

    const response = await fetch(
        `${API_URL}/alerts/${id}/cancel`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },

            body: JSON.stringify(
                reason === undefined ? {} : { reason, cancelledBy }
            ),
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Resolution notes for Telegram resolves (#14b)
//------------------------------------------------------

export async function getAlertsNeedingNote() {

    const response = await fetch(
        `${API_URL}/alerts/needs-note`,
        {
            headers: getAuthHeaders(),
        }
    );

    return handleResponse(response);
}

export async function addAlertNote(id, note, addedBy) {

    const response = await fetch(
        `${API_URL}/alerts/${id}/note`,
        {
            method: "PATCH",

            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },

            body: JSON.stringify({ note, addedBy }),
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Work Centers
//------------------------------------------------------

export async function getWorkCentersByProductionLine(
    productionLine
) {

    const response = await fetch(
        `${API_URL}/work-centers/line/${encodeURIComponent(
            productionLine
        )}`,
        {
            headers: {
                ...getAuthHeaders(),
            },
        }
    );

    return handleResponse(response);
}

//------------------------------------------------------
// Executive Dashboard
//------------------------------------------------------

export async function getExecutiveDashboard() {

    const response = await fetch(
        `${API_URL}/dashboard/executive`,
        {
            headers: {
                ...getAuthHeaders(),
            },
        }
    );

    return handleResponse(response);
}