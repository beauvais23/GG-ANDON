//------------------------------------------------------
// Weekly health post → Slack #mos-system (Director, Nov 11 2026)
//
// #mos-system only hears about problems, so silence could also mean the
// warning path itself is broken. Every Monday from 7:00 AM New York
// time (checked every 10 min) one post lists each check with ✅ / ⚠️:
//   - off-site backup: newest copy in Google Drive ≤ 26 h old
//   - QuickBooks item list: last good refresh ≤ 26 h old
//   - QuickBooks BOM pull: last good pull ≤ 26 h old
//   - Ship Report → backlog notes: last good read ≤ 26 h (when set up)
//   - notifications: Slack andon / near miss / BOM / system and the
//     Telegram ANDON channel + groups set up (production)
// plus last week's alert counts and escalation LIVE / SHADOW (info).
// Header: "✅ All systems OK" or "⚠️ N item(s) need attention".
// Sent once per week (system_reports, kind 'weekly_health', period =
// that Monday's New York date); a failed send retries on the next check.
//------------------------------------------------------

const { dateNY } = require("./nyTime");

const KIND = "weekly_health";
const SEND_HOUR = 7;
const CHECK_MINUTES = 10;
const STALE_HOURS = 26;
const HOUR = 3600 * 1000;

const nyParts = ms => {

    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" })
        .formatToParts(new Date(ms)).map(x => [x.type, x.value]));

    return { weekday: p.weekday, hour: Number(p.hour) };

};

// Monday on or after SEND_HOUR New York time → that Monday's date; else null.
function duePeriod(now) {

    const { weekday, hour } = nyParts(now);

    return weekday === "Mon" && hour >= SEND_HOUR ? dateNY(now) : null;

}

const age = (at, now) => {

    if (!at)
        return "never";

    const h = (now - at) / HOUR;

    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;

};

const n = v => Number(v || 0).toLocaleString("en-US");

// Pure: inputs → { ok, problems, text }.
function buildHealthReport({ now, offsite, qb, notify, week, shipReport = null }) {

    const checks = [];
    const fresh = at => Boolean(at) && now - at <= STALE_HOURS * HOUR;

    checks.push(offsite.enabled
        ? { ok: !offsite.stale, text: `Off-site backup (Google Drive): newest copy ${age(offsite.newestOffsiteAt, now)}${offsite.lastError ? ` · last error: ${offsite.lastError}` : ""}` }
        : { ok: false, text: `Off-site backup (Google Drive): off (${offsite.reason || "not set up"})` });

    if (!qb.configured)
        checks.push({ ok: false, text: "QuickBooks (CData): not set up" });

    else {

        checks.push({ ok: fresh(qb.itemsAt), text: `QuickBooks item list: ${n(qb.items)} items, refreshed ${age(qb.itemsAt, now)}` });
        checks.push({ ok: fresh(qb.bomAllAt), text: `QuickBooks BOMs: ${n(qb.bomAll)} lines, pulled ${age(qb.bomAllAt, now)}` });

    }

    if (shipReport?.enabled)
        checks.push({ ok: fresh(shipReport.lastOkAt), text: `Ship Report → backlog notes: last read ${age(shipReport.lastOkAt, now)}${shipReport.lastOk === false && shipReport.lastError ? ` · ${shipReport.lastError}` : ""}` });

    const missing = Object.entries(notify.channels).filter(([, on]) => !on).map(([k]) => k);

    checks.push({ ok: !missing.length, text: missing.length ? `Notifications: not set up: ${missing.join(", ")}` : `Notifications: ${Object.keys(notify.channels).join(", ")} set up` });

    const problems = checks.filter(c => !c.ok).length;
    const head = problems ? `⚠️ *Weekly system check: ${problems} item${problems === 1 ? "" : "s"} need${problems === 1 ? "s" : ""} attention*` : "✅ *Weekly system check: all systems OK*";

    const text = [
        head,
        ...checks.map(c => `${c.ok ? "✅" : "⚠️"} ${c.text}`),
        `ℹ️ Last 7 days: ${n(week.alerts)} andon alert${week.alerts === 1 ? "" : "s"} (${n(week.resolved)} resolved, ${n(week.cancelled)} cancelled, ${n(week.open)} still open), ${n(week.nearMisses)} near miss${week.nearMisses === 1 ? "" : "es"} · escalation ${notify.escalation}`,
        "_Posted every Monday at 7 AM. Problems are also posted here the day they happen._"
    ].join("\n");

    return { ok: problems === 0, problems, text };

}

function createWeeklyHealth({ db, qbBom, offsiteStatus, postSystem, channels, escalationMode, shipReportStatus = () => null, nowFn = Date.now }) {

    const st = {
        sent: db.prepare("SELECT 1 FROM system_reports WHERE kind = ? AND period = ?"),
        save: db.prepare("INSERT OR IGNORE INTO system_reports (kind, period, sent_at, ok, summary) VALUES (?, ?, ?, ?, ?)"),
        week: db.prepare(`SELECT
                SUM(CASE WHEN type != 'NEAR_MISS' THEN 1 ELSE 0 END) AS alerts,
                SUM(CASE WHEN type != 'NEAR_MISS' AND status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN type != 'NEAR_MISS' AND status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN type != 'NEAR_MISS' AND status IN ('ACTIVE', 'ACKNOWLEDGED') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN type = 'NEAR_MISS' AND status != 'CANCELLED' THEN 1 ELSE 0 END) AS nearMisses
            FROM alerts WHERE requested >= ?`)
    };

    function report(now = nowFn()) {

        const q = qbBom.status();

        return buildHealthReport({
            now,
            offsite: offsiteStatus(now),
            qb: { configured: q.configured, items: q.items, itemsAt: q.itemsOk?.finished_at, bomAll: q.bomAll, bomAllAt: q.bomAllOk?.finished_at },
            notify: { channels: channels(), escalation: escalationMode() },
            week: st.week.get(now - 7 * 24 * HOUR),
            shipReport: shipReportStatus()
        });

    }

    // Returns the report when sent, else null.
    async function tick(now = nowFn()) {

        const period = duePeriod(now);

        if (!period || st.sent.get(KIND, period))
            return null;

        const r = report(now);

        if (!(await postSystem(r.text)))
            return null;

        st.save.run(KIND, period, now, r.ok ? 1 : 0, r.text.split("\n")[0]);
        console.log(`Weekly system check posted (${r.ok ? "all OK" : `${r.problems} problem(s)`}).`);

        return r;

    }

    function start() {

        const run = () => tick().catch(err => console.error("✗ Weekly system check:", err.message));

        run();
        setInterval(run, CHECK_MINUTES * 60 * 1000).unref();

    }

    return { tick, report, start };

}

module.exports = { buildHealthReport, createWeeklyHealth, duePeriod, KIND, SEND_HOUR };
