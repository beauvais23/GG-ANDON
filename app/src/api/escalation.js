import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Admin → Escalation (shadow mode). Admin only.
//------------------------------------------------------

function headers(json) {

    const token = localStorage.getItem("authToken");

    return {
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

}

async function call(path, { method = "GET", body } = {}) {

    const response = await fetch(`${API}${path}`, {
        method,
        headers: headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (response.status === 401 || response.status === 403) {

        localStorage.removeItem("authToken");
        window.location.href = "/login";
        throw new Error("Authentication required. Redirecting to login.");

    }

    const data = await response.json();

    if (!response.ok)
        throw new Error(data.message || "Request failed.");

    return data;

}

export const getEscalation = () => call("/admin/escalation");
export const setEscalationLive = sendSlack => call("/admin/escalation/settings", { method: "PUT", body: { sendSlack } });
export const getEscalationLog = (days = 14) => call(`/admin/escalation/log?days=${days}`);
export const addEscalationRule = rule => call("/admin/escalation/rules", { method: "POST", body: rule });
export const updateEscalationRule = (id, changes) => call(`/admin/escalation/rules/${id}`, { method: "PUT", body: changes });
export const deleteEscalationRule = id => call(`/admin/escalation/rules/${id}`, { method: "DELETE" });
export const setPersonRole = (id, role, lineGroup) => call(`/admin/escalation/people/${id}`, { method: "PUT", body: { role, lineGroup } });
