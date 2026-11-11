import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Admin → Users (Google sign-in, Nov 11 2026). Admin only.
//------------------------------------------------------

async function call(path, { method = "GET", body } = {}) {

    const token = localStorage.getItem("authToken");
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 401) {

        localStorage.removeItem("authToken");
        window.location.href = "/login";
        throw new Error("Authentication required. Redirecting to login.");

    }

    const data = await response.json().catch(() => ({ message: `The server answered ${response.status}` }));

    if (!response.ok)
        throw new Error(data.message || "Request failed.");

    return data;

}

export const getUsers = () => call("/admin/users");
export const updateUser = (email, body) => call(`/admin/users/${encodeURIComponent(email)}`, { method: "PUT", body });
