import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Inventory search + where used (QuickBooks through CData, read only).
//------------------------------------------------------

async function call(path, { method = "GET", body } = {}) {

    const token = localStorage.getItem("authToken");

    const response = await fetch(`${API}${path}`, {
        method,
        headers: {
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (response.status === 401 || response.status === 403) {

        localStorage.removeItem("authToken");
        window.location.href = "/login";
        throw new Error("Authentication required. Redirecting to login.");

    }

    const data = await response.json();

    if (!response.ok)
        throw Object.assign(new Error(data.message || "Request failed."), { data });

    return data;

}

export const searchInventory = (q, inactive) => call(`/inventory/search?q=${encodeURIComponent(q)}${inactive ? "&inactive=1" : ""}`);
export const getInventoryItem = (name, inactive) => call(`/inventory/item/${encodeURIComponent(name)}${inactive ? "?inactive=1" : ""}`);
export const refreshInventory = () => call("/admin/inventory/refresh", { method: "POST" });
