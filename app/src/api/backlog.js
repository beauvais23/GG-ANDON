import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Backlog & delivery risk (QuickBooks orders + notes kept per SO).
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

export const getBacklog = refresh => call(`/backlog${refresh ? "?refresh=1" : ""}`);
export const saveBacklogNote = (so, body) => call(`/backlog/notes/${encodeURIComponent(so)}`, { method: "PUT", body });
export const clearBacklogNote = (so, by) => call(`/backlog/notes/${encodeURIComponent(so)}`, { method: "DELETE", body: { by } });
export const getBacklogHistory = so => call(`/backlog/notes/${encodeURIComponent(so)}/history`);
export const importBacklogNotes = (text, by) => call("/admin/backlog/notes/import", { method: "POST", body: { text, by } });
export const getRepChannels = () => call("/backlog/rep-channels");
export const saveRepChannels = (text, by) => call("/admin/backlog/rep-channels", { method: "PUT", body: { text, by } });
export const getWalmartDemand = () => call("/backlog/walmart-demand");
export const postWalmartDemand = body => call("/backlog/walmart-demand", { method: "POST", body });
