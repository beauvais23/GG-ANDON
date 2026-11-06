const axios = require("axios");

//------------------------------------------------------
// CData Connect AI client (Nov 5 2026)
//
// Read-only SQL against QuickBooks Desktop through CData
// Connect AI's REST API: POST https://cloud.cdata.com/api/query
// with Basic auth (CDATA_USER = account email, CDATA_PAT =
// Personal Access Token). Never writes to QuickBooks.
//
// The credentials are never logged: errors keep only the
// HTTP status and CData's message.
//------------------------------------------------------

const URL = "https://cloud.cdata.com/api/query";
const TIMEOUT_MS = 30000;
const PAGE = 1000;

// Where the QuickBooks views live (same names the Claude
// connector uses). Overridable if the workspace differs.
const schema = () => process.env.CDATA_SCHEMA || "[Company].[ROOT]";

const configured = () => Boolean(process.env.CDATA_USER && process.env.CDATA_PAT);

// SQL string literal: values come from our own item list, but
// quotes are doubled anyway.
const lit = value => `'${String(value).replace(/'/g, "''")}'`;

// CData's error text, wherever the reply carries it.
function errorText(data) {

    if (typeof data === "string")
        return data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "empty reply";

    if (!data || typeof data !== "object")
        return null;

    const first = Array.isArray(data.results) ? data.results[0] : null;
    const err = data.error || (first && first.error) || data.errors;

    if (err)
        return typeof err === "string" ? err : err.message || JSON.stringify(err).slice(0, 300);

    return data.message || null;

}

function rowsOf(data) {

    const result = data && Array.isArray(data.results) ? data.results[0] : null;

    if (!result || !Array.isArray(result.schema) || !Array.isArray(result.rows)) {

        const keys = data && typeof data === "object" ? Object.keys(data).join(", ") : typeof data;

        throw new Error(`CData returned no result set: ${errorText(data) || `reply had ${keys || "nothing"}`}`);

    }

    const names = result.schema.map(c => c.columnLabel || c.columnName);

    return result.rows.map(row => Object.fromEntries(names.map((n, i) => [n, row[i]])));

}

async function query(sql) {

    if (!configured())
        throw new Error("QuickBooks connection not set up (CDATA_USER / CDATA_PAT missing).");

    const params = process.env.CDATA_WORKSPACE ? { workspace: process.env.CDATA_WORKSPACE } : undefined;

    try {

        const response = await axios.post(URL, { query: sql }, {
            params,
            timeout: TIMEOUT_MS,
            auth: { username: process.env.CDATA_USER, password: process.env.CDATA_PAT },
            // A redirect (e.g. to a login page) is an error, not data.
            maxRedirects: 0
        });

        return rowsOf(response.data);

    }

    catch (err) {

        const status = err.response ? err.response.status : null;
        const message = err.response ? errorText(err.response.data) : null;

        throw new Error(`CData query failed${status ? ` (HTTP ${status})` : ""}: ${String(message || err.message).slice(0, 300)}`);

    }

}

// All rows of an ORDER BY query, PAGE rows at a time.
async function queryAll(sql, run = query) {

    const all = [];

    for (let offset = 0; ; offset += PAGE) {

        const rows = await run(`${sql} LIMIT ${PAGE} OFFSET ${offset}`);

        all.push(...rows);

        if (rows.length < PAGE)
            return all;

    }

}

module.exports = { query, queryAll, configured, schema, lit, rowsOf, errorText, PAGE };
