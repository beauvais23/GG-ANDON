import config from "../config/config";

const API = config.apiBaseUrl;

//------------------------------------------------------
// Hour-by-hour board (H1). Plans and rates are admin only.
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


const enc = encodeURIComponent;

export const getBoards = () => call("/hourly/boards");
export const getProducts = (board, date) => call(`/hourly/products?board=${enc(board)}&date=${date}`);
export const resolveSku = (sku, date) => call(`/hourly/resolve?sku=${enc(sku)}&date=${date}`);
export const getPlan = (board, date) => call(`/hourly/plan/${enc(board)}/${date}`);
export const savePlan = (board, date, runs) => call(`/admin/hourly/plan/${enc(board)}/${date}`, { method: "PUT", body: { runs } });
export const addRate = rate => call("/admin/hourly/rates", { method: "POST", body: rate });
export const deleteRate = id => call(`/admin/hourly/rates/${id}`, { method: "DELETE" });
