//------------------------------------------------------
// Off-site backup copy to Google Drive (defect #22)
//
// Every backup file in the backup folder (daily and
// before-migration) is copied to a Google Shared Drive
// folder. It is a sync: list the Drive folder, upload
// whatever is missing, oldest first. A failed upload is
// retried on the next check, so one bad run catches up
// by itself. Drive keeps every copy (local retention
// does not apply there).
//
// Configuration (both required, otherwise off):
//   GDRIVE_SERVICE_ACCOUNT_JSON  service account key (secret)
//   GDRIVE_BACKUP_FOLDER_ID      Shared Drive folder ID
//
// Login: a JWT signed with the service account key is
// exchanged for an access token (no Google library).
// Nothing here ever logs the key or the token.
//------------------------------------------------------

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const { listBackups } = require("../migrations/restore");
const { notificationsEnabled } = require("./appEnv");
const { dateNY } = require("./nyTime");

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive";

const TIMEOUT_MS = 30 * 1000;
const STALE_HOURS = 26;

const state = {
    token: null,            // { value, expiresAt }
    knownRemote: null,      // Set of file names confirmed in Drive
    lastSyncAt: null,
    lastError: null,
    lastErrorAt: null,
    lastAlertDate: null,
    running: false
};

//------------------------------------------------------
// Configuration
//------------------------------------------------------

function offsiteConfig() {

    const raw = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
    const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;

    if (!raw || !folderId)
        return { enabled: false, reason: "GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_BACKUP_FOLDER_ID not set" };

    let credentials;

    try {

        credentials = JSON.parse(raw);

    } catch {

        return { enabled: false, reason: "GDRIVE_SERVICE_ACCOUNT_JSON is not valid JSON" };

    }

    if (!credentials.client_email || !credentials.private_key)
        return { enabled: false, reason: "GDRIVE_SERVICE_ACCOUNT_JSON has no client_email or private_key" };

    return { enabled: true, credentials, folderId };

}

//------------------------------------------------------
// Google API calls
//------------------------------------------------------

async function call(url, options, timeoutMs) {

    const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {

        let detail = "";

        try {

            const body = await response.json();

            detail = body.error?.message || body.error_description || body.error || "";

        } catch {
            // not JSON
        }

        throw new Error(`Google API ${response.status}${detail ? `: ${detail}` : ""}`);

    }

    return response;

}

async function accessToken(credentials, timeoutMs) {

    if (state.token && state.token.expiresAt > Date.now() + 60 * 1000)
        return state.token.value;

    const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";

    const assertion = jwt.sign(
        { iss: credentials.client_email, scope: SCOPE, aud: tokenUri },
        credentials.private_key,
        { algorithm: "RS256", expiresIn: 3600 }
    );

    const response = await call(tokenUri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion
        })
    }, timeoutMs);

    const body = await response.json();

    state.token = {
        value: body.access_token,
        expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000
    };

    return state.token.value;

}

async function listRemote(folderId, token, timeoutMs) {

    const names = new Set();
    let pageToken = "";

    do {

        const params = new URLSearchParams({
            q: `'${folderId}' in parents and trashed = false`,
            fields: "nextPageToken, files(name)",
            pageSize: "1000",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
            corpora: "allDrives"
        });

        if (pageToken)
            params.set("pageToken", pageToken);

        const response = await call(`${DRIVE_API}?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        }, timeoutMs);

        const body = await response.json();

        for (const file of body.files || [])
            names.add(file.name);

        pageToken = body.nextPageToken || "";

    } while (pageToken);

    return names;

}

// Resumable upload: one call for the metadata, one for the bytes.
// Works for any size (a simple upload stops at 5 MB).
async function uploadFile(full, folderId, token, timeoutMs) {

    const name = path.basename(full);
    const bytes = fs.readFileSync(full);

    const session = await call(`${DRIVE_UPLOAD}?uploadType=resumable&supportsAllDrives=true`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "application/octet-stream",
            "X-Upload-Content-Length": String(bytes.length)
        },
        body: JSON.stringify({ name, parents: [folderId] })
    }, timeoutMs);

    const location = session.headers.get("location");

    if (!location)
        throw new Error("Google API: no upload location returned");

    await call(location, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes
    }, timeoutMs);

}

//------------------------------------------------------
// Sync
//------------------------------------------------------

// Copies every local backup that is not yet in Drive.
// Never throws: a failure is recorded and retried later.
// When every local file is already known to be in Drive,
// it returns without any network call.
async function syncOffsite(dir, { timeoutMs = TIMEOUT_MS } = {}) {

    const config = offsiteConfig();

    if (!config.enabled)
        return { enabled: false, uploaded: [] };

    if (state.running)
        return { enabled: true, uploaded: [], busy: true };

    const local = listBackups(dir).sort(); // oldest first

    if (state.knownRemote && local.every(file => state.knownRemote.has(file))) {

        state.lastSyncAt = Date.now();

        return { enabled: true, uploaded: [] };

    }

    state.running = true;

    const uploaded = [];

    try {

        const token = await accessToken(config.credentials, timeoutMs);
        const remote = await listRemote(config.folderId, token, timeoutMs);

        state.knownRemote = remote;

        for (const file of local.filter(f => !remote.has(f))) {

            await uploadFile(path.join(dir, file), config.folderId, token, timeoutMs);

            remote.add(file);
            uploaded.push(file);

            console.log(`✓ Off-site backup copied to Google Drive: ${file}`);

        }

        state.lastSyncAt = Date.now();
        state.lastError = null;
        state.lastErrorAt = null;

    } catch (err) {

        state.lastError = err.name === "TimeoutError"
            ? `Timed out after ${timeoutMs} ms`
            : err.message;

        state.lastErrorAt = Date.now();

        console.error("✗ Off-site backup failed:", state.lastError);

    } finally {

        state.running = false;

    }

    return { enabled: true, uploaded, error: state.lastError };

}

//------------------------------------------------------
// Status and alert
//------------------------------------------------------

// andon-20261027T210500Z-daily-2026-10-27.db -> epoch ms
function stampOf(file) {

    const m = /^andon-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(file);

    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;

}

function offsiteStatus(now = Date.now()) {

    const config = offsiteConfig();

    let newestOffsite = null;
    let newestOffsiteAt = null;

    for (const file of state.knownRemote || []) {

        const at = stampOf(file);

        if (at !== null && (newestOffsiteAt === null || at > newestOffsiteAt)) {
            newestOffsite = file;
            newestOffsiteAt = at;
        }

    }

    return {
        enabled: config.enabled,
        reason: config.enabled ? null : config.reason,
        lastSyncAt: state.lastSyncAt,
        lastError: state.lastError,
        lastErrorAt: state.lastErrorAt,
        newestOffsite,
        newestOffsiteAt,
        stale: config.enabled &&
            (newestOffsiteAt === null || now - newestOffsiteAt > STALE_HOURS * 3600 * 1000),
        inDrive: [...(state.knownRemote || [])]
    };

}

// Production only: one Google Chat message per New York day
// while the newest copy in Drive is over 26 hours old.
async function alertIfStale(now = Date.now()) {

    const status = offsiteStatus(now);

    if (!status.stale || !notificationsEnabled())
        return false;

    const webhook = process.env.GOOGLE_CHAT_WEBHOOK;
    const today = dateNY(now);

    if (!webhook || state.lastAlertDate === today)
        return false;

    const newest = status.newestOffsiteAt
        ? new Date(status.newestOffsiteAt).toLocaleString("en-US", {
            timeZone: "America/New_York",
            dateStyle: "medium",
            timeStyle: "short"
        })
        : "none yet";

    const text = [
        "⚠️ ANDON off-site backup is behind.",
        `Newest copy in Google Drive: ${newest} ET.`,
        status.lastError ? `Last error: ${status.lastError}` : null,
        "Check /admin → Backups."
    ].filter(Boolean).join("\n");

    try {

        await axios.post(webhook, { text }, { timeout: TIMEOUT_MS });

        state.lastAlertDate = today;

        console.warn("Off-site backup is stale; Google Chat warning sent.");

        return true;

    } catch (err) {

        console.error("Off-site backup warning to Google Chat failed:", err.message);

        return false;

    }

}

// Called by the daily backup timer (boot, then every 10 min).
async function offsiteTick(dir, now = Date.now()) {

    if (!offsiteConfig().enabled)
        return;

    await syncOffsite(dir);
    await alertIfStale(now);

}

function describeOffsite() {

    const config = offsiteConfig();

    return config.enabled
        ? "Off-site backup: Google Drive (service account configured)"
        : `Off-site backup: off (${config.reason})`;

}

// Tests only.
function resetOffsiteState() {

    Object.assign(state, {
        token: null,
        knownRemote: null,
        lastSyncAt: null,
        lastError: null,
        lastErrorAt: null,
        lastAlertDate: null,
        running: false
    });

}

module.exports = {
    STALE_HOURS,
    syncOffsite,
    offsiteStatus,
    alertIfStale,
    offsiteTick,
    describeOffsite,
    resetOffsiteState
};
