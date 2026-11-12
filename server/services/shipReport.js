//------------------------------------------------------
// Ship Report → backlog notes (Director, Nov 12 2026)
//
// Reads Steve's "G&G SHIP REPORT" Google Sheet with the off-site
// backup service account (read only; the sheet is shared with it as
// Viewer) and fills the backlog notes, so nobody copies and pastes:
//   COMMENTS (col P)      → Ops comment   (Steve owns these)
//   RECOVERY DATE (col Q) → Recovery date (M/D/YYYY)
//   SO NOTE (col R)       → Sales note (customer view)
// Columns are found by their header text, so a moved column still
// works. The sheet has one row per SO line: per SO, distinct texts are
// joined with " · " and the latest recovery date wins.
// Only a value that CHANGED in the sheet since the last read is
// written (ship_report_seen), so an edit or clear on the page stays
// until the sheet changes it again; a blank cell never clears a note;
// SOs not open in QuickBooks are skipped. Runs at boot and every 30
// min, and from Admin "Pull from Ship Report".
//------------------------------------------------------

const jwt = require("jsonwebtoken");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TIMEOUT_MS = 30 * 1000;
const EVERY_MIN = 30;
const BY = "Ship Report";
const MAX_TEXT = 1000;

function shipReportConfig() {

    const sheetId = (process.env.SHIP_REPORT_SHEET_ID || "").trim();
    const tab = (process.env.SHIP_REPORT_TAB || "G&G SHIP REPORT").trim();
    const raw = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;

    if (!sheetId)
        return { enabled: false, reason: "SHIP_REPORT_SHEET_ID not set" };

    let credentials;

    try { credentials = JSON.parse(raw || ""); }

    catch { return { enabled: false, reason: "GDRIVE_SERVICE_ACCOUNT_JSON not set or not valid JSON" }; }

    if (!credentials.client_email || !credentials.private_key)
        return { enabled: false, reason: "GDRIVE_SERVICE_ACCOUNT_JSON has no client_email or private_key" };

    return { enabled: true, sheetId, tab, credentials };

}

//------------------------------------------------------
// Pure: sheet rows → one entry per SO
//------------------------------------------------------

const pad = n => String(n).padStart(2, "0");

// M/D/YYYY, M/D/YY or YYYY-MM-DD → YYYY-MM-DD; blank → ""; else null.
function sheetDate(v) {

    const s = String(v ?? "").trim();

    if (!s)
        return "";

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    let iso = null;

    if (m)
        iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)))
        iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[1])}-${pad(m[2])}`;

    if (!iso)
        return null;

    const d = new Date(`${iso}T12:00:00Z`);

    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;

}

function findColumns(rows) {

    for (let i = 0; i < Math.min(rows.length, 10); i++) {

        const h = (rows[i] || []).map(c => String(c || "").trim().toUpperCase());
        const so = h.findIndex(c => /^SO\s*#?$/.test(c));
        const comment = h.findIndex(c => c === "COMMENTS" || c === "COMMENT");
        const recovery = h.findIndex(c => /RECOVERY/.test(c));
        const soNote = h.findIndex(c => c === "SO NOTE" || c === "SO NOTES");

        if (so >= 0 && (comment >= 0 || recovery >= 0 || soNote >= 0))
            return { headerAt: i, so, comment, recovery, soNote };

    }

    return null;

}

function sheetToNotes(rows) {

    const cols = findColumns(rows);

    if (!cols)
        throw new Error("Couldn't find the header row (SO#, COMMENTS, RECOVERY DATE, SO NOTE) in the Ship Report.");

    const bySo = new Map();
    const warnings = [];
    const cell = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");

    for (let i = cols.headerAt + 1; i < rows.length; i++) {

        const r = rows[i] || [];
        const so = cell(r, cols.so);

        if (!so)
            continue;

        const e = bySo.get(so) || { so, comments: [], recovery: "", soNotes: [] };
        const c = cell(r, cols.comment);
        const n = cell(r, cols.soNote);
        const rawDate = cell(r, cols.recovery);
        const d = sheetDate(rawDate);

        if (c && !e.comments.includes(c)) e.comments.push(c);
        if (n && !e.soNotes.includes(n)) e.soNotes.push(n);

        if (d === null)
            warnings.push(`${so}: recovery date "${rawDate}" not read`);
        else if (d && d > e.recovery)
            e.recovery = d;

        bySo.set(so, e);

    }

    return {
        sos: [...bySo.values()].map(e => ({ so: e.so, comment: e.comments.join(" · ").slice(0, MAX_TEXT), recoveryDate: e.recovery, soNote: e.soNotes.join(" · ").slice(0, MAX_TEXT) })),
        warnings: [...new Set(warnings)].slice(0, 50)
    };

}

// Pure: which fields to write. A field is written when the sheet value
// is not blank and differs from what was read last time.
function planSync(sheetSos, seenOf, isOpen) {

    const changes = [];

    for (const s of sheetSos) {

        if (!isOpen(s.so))
            continue;

        const seen = seenOf(s.so) || {};
        const body = {};

        if (s.comment && s.comment !== (seen.comment || "")) body.opsComment = s.comment;
        if (s.recoveryDate && s.recoveryDate !== (seen.recovery_date || "")) body.recoveryDate = s.recoveryDate;
        if (s.soNote && s.soNote !== (seen.so_note || "")) body.salesNote = s.soNote;

        changes.push({ so: s.so, body, sheet: s });

    }

    return changes;

}

//------------------------------------------------------
// Google Sheets read
//------------------------------------------------------

let token = null;

async function accessToken(credentials, post = fetch) {

    if (token && token.expiresAt > Date.now() + 60000)
        return token.value;

    const tokenUri = credentials.token_uri || "https://oauth2.googleapis.com/token";
    const assertion = jwt.sign({ iss: credentials.client_email, scope: SCOPE, aud: tokenUri }, credentials.private_key, { algorithm: "RS256", expiresIn: 3600 });
    const res = await post(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.json().catch(() => ({}));

    if (!res.ok)
        throw new Error(`Google sign-in for the service account failed (${res.status}${body.error_description ? `: ${body.error_description}` : ""})`);

    token = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };

    return token.value;

}

async function readSheet(cfg, get = fetch) {

    const range = encodeURIComponent(`'${cfg.tab.replace(/'/g, "''")}'!A1:Z`);
    const res = await get(`${SHEETS_API}/${cfg.sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${await accessToken(cfg.credentials, get)}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {

        const msg = body.error?.message || res.statusText;
        const hint = res.status === 403 ? (/has not been used|disabled/i.test(msg) ? " (turn on the Google Sheets API in Google Cloud project gg-andon-backups)" : ` (share the Ship Report with ${cfg.credentials.client_email} as Viewer)`) : res.status === 404 ? " (check SHIP_REPORT_SHEET_ID / SHIP_REPORT_TAB)" : "";

        throw new Error(`Ship Report read failed: ${res.status} ${msg}${hint}`);

    }

    return body.values || [];

}

//------------------------------------------------------
// Sync: read, plan, write through the backlog's saveNote
//------------------------------------------------------

function createShipReportSync({ db, saveNote, fetchRows, config = shipReportConfig, nowFn = Date.now }) {

    const st = {
        seen: db.prepare("SELECT * FROM ship_report_seen WHERE so = ?"),
        setSeen: db.prepare(`INSERT INTO ship_report_seen (so, comment, recovery_date, so_note, seen_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(so) DO UPDATE SET comment = excluded.comment, recovery_date = excluded.recovery_date, so_note = excluded.so_note, seen_at = excluded.seen_at`),
        open: db.prepare("SELECT DISTINCT so FROM qb_open_so_lines WHERE ordered > shipped"),
        start: db.prepare("INSERT INTO ship_report_runs (started_at, trigger) VALUES (?, ?)"),
        finish: db.prepare("UPDATE ship_report_runs SET finished_at = ?, ok = ?, sos = ?, changed = ?, warnings = ?, error = ? WHERE id = ?"),
        last: db.prepare("SELECT * FROM ship_report_runs ORDER BY id DESC LIMIT 1"),
        lastOk: db.prepare("SELECT * FROM ship_report_runs WHERE ok = 1 ORDER BY id DESC LIMIT 1"),
        prune: db.prepare("DELETE FROM ship_report_runs WHERE id <= (SELECT MAX(id) - 200 FROM ship_report_runs)")
    };

    let running = null;

    async function run(trigger = "timer") {

        if (running)
            return running;

        running = (async () => {

            const cfg = config();

            if (!cfg.enabled)
                return { ok: false, skipped: true, error: cfg.reason };

            const now = nowFn();
            const id = st.start.run(now, trigger).lastInsertRowid;

            try {

                const { sos, warnings } = sheetToNotes(await fetchRows(cfg));
                const open = new Set(st.open.all().map(r => String(r.so)));
                const plan = planSync(sos, so => st.seen.get(so), so => open.has(so));
                let changed = 0;

                db.transaction(() => {

                    for (const p of plan) {

                        if (Object.keys(p.body).length && saveNote(p.so, p.body, BY).changed)
                            changed++;

                        st.setSeen.run(p.so, p.sheet.comment, p.sheet.recoveryDate, p.sheet.soNote, now);

                    }

                })();

                st.finish.run(nowFn(), 1, plan.length, changed, warnings.length ? JSON.stringify(warnings) : null, null, id);
                st.prune.run();

                return { ok: true, sos: plan.length, changed, warnings };

            } catch (err) {

                st.finish.run(nowFn(), 0, null, null, null, String(err.message).slice(0, 500), id);
                console.error("✗ Ship Report sync:", err.message);

                return { ok: false, error: err.message };

            }

        })();

        try { return await running; } finally { running = null; }

    }

    function status() {

        const cfg = config();
        const last = st.last.get() || null;

        return {
            enabled: cfg.enabled,
            reason: cfg.enabled ? null : cfg.reason,
            serviceAccount: cfg.enabled ? cfg.credentials.client_email : null,
            lastRunAt: last?.finished_at || last?.started_at || null,
            lastOk: last ? Boolean(last.ok) : null,
            lastError: last && !last.ok ? last.error : null,
            lastChanged: last?.changed ?? null,
            lastSos: last?.sos ?? null,
            lastOkAt: st.lastOk.get()?.finished_at || null,
            warnings: last?.warnings ? JSON.parse(last.warnings) : []
        };

    }

    function start() {

        if (!config().enabled) {

            console.log(`Ship Report sync: off (${config().reason})`);
            return;

        }

        console.log(`Ship Report sync: on, every ${EVERY_MIN} min`);
        run("boot");
        setInterval(() => run("timer"), EVERY_MIN * 60 * 1000).unref();

    }

    return { run, status, start };

}

module.exports = { createShipReportSync, shipReportConfig, sheetToNotes, planSync, sheetDate, readSheet, BY };
