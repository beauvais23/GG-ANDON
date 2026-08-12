import config from "../config/config";

const API_URL = config.apiBaseUrl;

//------------------------------------------------------
// Authentication Header
//------------------------------------------------------

function getAuthHeaders() {

    const token =
        localStorage.getItem("authToken");

    return token
        ? {
            Authorization:
                `Bearer ${token}`
        }
        : {};
}

//------------------------------------------------------
// Handle Response
//------------------------------------------------------

async function handleResponse(response) {

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
// Get All Work Centers
//------------------------------------------------------

export async function getWorkCenters() {

    const response =
        await fetch(
            `${API_URL}/work-centers`,
            {
                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Get Work Centers by Production Line
//------------------------------------------------------

export async function getWorkCentersByProductionLine(
    productionLine
) {

    const response =
        await fetch(
            `${API_URL}/work-centers/line/${encodeURIComponent(
                productionLine
            )}`,
            {
                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Create Work Center
//------------------------------------------------------

export async function createWorkCenter(
    workCenter
) {

    const response =
        await fetch(
            `${API_URL}/work-centers`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(workCenter)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Update Work Center
//------------------------------------------------------

export async function updateWorkCenter(
    id,
    workCenter
) {

    const response =
        await fetch(
            `${API_URL}/work-centers/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(workCenter)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Update Work Center Display Order
//------------------------------------------------------

export async function updateWorkCenterOrder(
    workCenters
) {

    const response =
        await fetch(
            `${API_URL}/work-centers/order`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(workCenters)
            }
        );

    return handleResponse(response);
}