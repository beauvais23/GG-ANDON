import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// BOM viewer (QuickBooks through CData, read only).
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

export const getAssemblies = () => call("/bom/assemblies");
export const getBom = sku => call(`/bom/sku/${encodeURIComponent(sku)}`);
export const refreshItems = () => call("/admin/bom/refresh", { method: "POST" });

// BOM change requests (alert to the BOM alert Google Chat space).
export const searchItems = q => call(`/bom/items?q=${encodeURIComponent(q)}`);
export const getReasons = () => call("/bom/reasons");
export const sendRequest = body => call("/bom/requests", { method: "POST", body });
export const listRequests = ({ status, from, to, sku } = {}) => call(`/bom/requests?${new URLSearchParams(Object.entries({ status, from, to, sku }).filter(([, v]) => v))}`);
export const getRequest = code => call(`/bom/requests/${encodeURIComponent(code)}`);
export const closeRequest = (code, kind, body) => call(`/bom/requests/${encodeURIComponent(code)}/${kind}`, { method: "POST", body });
