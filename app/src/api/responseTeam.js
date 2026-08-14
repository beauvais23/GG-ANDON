import config from "../config/config";

const API = config.apiBaseUrl;

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

    const data =
        await response.json();

    if (!response.ok) {

        throw new Error(
            data.message ||
            "Request failed."
        );

    }

    return data;
}

//------------------------------------------------------
// Get Response Team
//------------------------------------------------------

export async function getResponseTeam() {

    const response =
        await fetch(
            `${API}/response-team`,
            {
                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Create Responder
//------------------------------------------------------

export async function createResponder(
    responder
) {

    const response =
        await fetch(
            `${API}/response-team`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(responder)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Update Responder
//------------------------------------------------------

export async function updateResponder(
    id,
    responder
) {

    const response =
        await fetch(
            `${API}/response-team/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(responder)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Delete Responder
//------------------------------------------------------

export async function deleteResponder(
    id
) {

    const response =
        await fetch(
            `${API}/response-team/${id}`,
            {
                method: "DELETE",

                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}