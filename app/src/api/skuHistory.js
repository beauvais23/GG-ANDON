import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// SKU History: invoiced units by month (QuickBooks invoices, read only).
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

const q = (name, months) => `name=${encodeURIComponent(name)}&months=${months}`;

export const getHistoryCustomers = () => call("/sku-history/customers");
export const getCustomerHistory = (name, months) => call(`/sku-history/customer?${q(name, months)}`);
export const getItemHistory = (name, months) => call(`/sku-history/item?${q(name, months)}`);
export const refreshSkuHistory = () => call("/admin/sku-history/refresh", { method: "POST" });
