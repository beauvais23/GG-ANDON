import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Admin → Near misses: list logged near misses and void
// one logged by mistake (Nov 2 2026). Admin only.
//------------------------------------------------------

function getAuthHeaders() {

    const token = localStorage.getItem("authToken");

    return token ? { Authorization: `Bearer ${token}` } : {};

}

function checkAuth(response) {

    if (response.status === 401 || response.status === 403) {

        localStorage.removeItem("authToken");

        window.location.href = "/login";

        throw new Error("Authentication required. Redirecting to login.");

    }

}

export async function getLoggedNearMisses() {

    const response = await fetch(`${API}/admin/near-misses`, { headers: getAuthHeaders() });

    checkAuth(response);

    const data = await response.json();

    if (!response.ok)
        throw new Error(data.message || "Could not load near misses.");

    return data;

}

export async function voidNearMiss(id, reason) {

    const response = await fetch(`${API}/admin/near-misses/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ reason })
    });

    checkAuth(response);

    return response.json();

}
