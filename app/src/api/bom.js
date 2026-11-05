import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// BOM viewer (QuickBooks through CData, read only).
//------------------------------------------------------

async function call(path, { method = "GET" } = {}) {

    const token = localStorage.getItem("authToken");

    const response = await fetch(`${API}${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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
