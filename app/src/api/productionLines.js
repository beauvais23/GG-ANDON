const API =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : `${window.location.protocol}//${window.location.hostname.replace(
            "-5173",
            "-3001"
        )}`;

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
// Get Production Lines
//------------------------------------------------------

export async function getProductionLines() {

    const response =
        await fetch(
            `${API}/production-lines`,
            {
                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Create Production Line
//------------------------------------------------------

export async function createProductionLine(
    line
) {

    const response =
        await fetch(
            `${API}/production-lines`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(line)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Update Production Line
//------------------------------------------------------

export async function updateProductionLine(
    id,
    line
) {

    const response =
        await fetch(
            `${API}/production-lines/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(line)
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Delete Production Line
//------------------------------------------------------

export async function deleteProductionLine(
    id
) {

    const response =
        await fetch(
            `${API}/production-lines/${id}`,
            {
                method: "DELETE",

                headers: {
                    ...getAuthHeaders()
                }
            }
        );

    return handleResponse(response);
}

//------------------------------------------------------
// Update Display Order
//------------------------------------------------------

export async function updateProductionLineOrder(
    lines
) {

    const response =
        await fetch(
            `${API}/production-lines/order`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    ...getAuthHeaders()
                },

                body:
                    JSON.stringify(lines)
            }
        );

    return handleResponse(response);
}