import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Material check (open orders × BOM explosion).
//------------------------------------------------------

export async function getMrp({ weeks, group, holds, refresh }) {

    const token = localStorage.getItem("authToken");
    const q = new URLSearchParams({ weeks: String(weeks), group, holds: holds ? "1" : "0", refresh: refresh ? "1" : "0" });

    const response = await fetch(`${API}/mrp?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

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
