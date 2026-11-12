const test = require("node:test");
const assert = require("node:assert/strict");

const { loadApp } = require("./helpers");
const { buildHealthReport, createWeeklyHealth, duePeriod } = require("../services/weeklyHealth");

//------------------------------------------------------
// Weekly #mos-system health post (Director, Nov 11 2026): Mondays from
// 7:00 AM New York time, once per week (survives restarts), ✅ / ⚠️ per
// check, a failed send retries on the next check.
//------------------------------------------------------

const H = 3600 * 1000;
const MON_0700 = Date.parse("2026-11-16T12:00:00Z"); // Mon 7:00 AM EST

const good = now => ({
    now,
    offsite: { enabled: true, stale: false, newestOffsiteAt: now - 15 * H },
    qb: { configured: true, items: 4834, itemsAt: now - 3 * H, bomAll: 29885, bomAllAt: now - 3 * H },
    notify: { channels: { "Slack #andon-alerts": true, "Telegram ANDON": true }, escalation: "LIVE in Slack" },
    week: { alerts: 12, resolved: 10, cancelled: 2, open: 0, nearMisses: 1 }
});

test("report: all OK → one ✅ header; stale backup, old QuickBooks pull and a missing channel are each flagged", () => {

    const ok = buildHealthReport(good(MON_0700));

    assert.equal(ok.ok, true);
    assert.match(ok.text, /^✅ \*Weekly system check: all systems OK\*/);
    assert.match(ok.text, /Off-site backup \(Google Drive\): newest copy 15 h ago/);
    assert.match(ok.text, /4,834 items/);
    assert.match(ok.text, /12 andon alerts \(10 resolved, 2 cancelled, 0 still open\), 1 near miss · escalation LIVE in Slack/);

    const bad = good(MON_0700);

    bad.offsite = { enabled: true, stale: true, newestOffsiteAt: MON_0700 - 50 * H, lastError: "invalid_grant" };
    bad.qb.bomAllAt = MON_0700 - 30 * H;
    bad.notify.channels["Telegram ANDON"] = false;

    const r = buildHealthReport(bad);

    assert.equal(r.problems, 3);
    assert.match(r.text, /^⚠️ \*Weekly system check: 3 items need attention\*/);
    assert.match(r.text, /⚠️ Off-site backup .* 2 days ago · last error: invalid_grant/);
    assert.match(r.text, /⚠️ QuickBooks BOMs/);
    assert.match(r.text, /⚠️ Notifications: not set up: Telegram ANDON/);
    assert.match(r.text, /✅ QuickBooks item list/);

    const sr = buildHealthReport({ ...good(MON_0700), shipReport: { enabled: true, lastOk: false, lastOkAt: MON_0700 - 40 * H, lastError: "Ship Report read failed: 403" } });

    assert.equal(sr.problems, 1);
    assert.match(sr.text, /⚠️ Ship Report → backlog notes: last read 40 h ago · Ship Report read failed: 403/);

    const off = buildHealthReport({ ...good(MON_0700), offsite: { enabled: false, reason: "GDRIVE_BACKUP_FOLDER_ID not set" }, qb: { configured: false } });

    assert.equal(off.problems, 2);

});

test("due: Monday from 7:00 AM New York time (EST and EDT); not 6:59, not Tuesday", () => {

    assert.equal(duePeriod(MON_0700), "2026-11-16");
    assert.equal(duePeriod(MON_0700 - 60000), null);
    assert.equal(duePeriod(MON_0700 + 24 * H), null);
    assert.equal(duePeriod(Date.parse("2026-07-13T11:00:00Z")), "2026-07-13", "Mon 7:00 AM EDT");
    assert.equal(duePeriod(Date.parse("2026-07-13T10:59:00Z")), null);

});

test("tick: sends once per week even across restarts; a failed send is retried; nothing outside Monday", async () => {

    loadApp();

    const { db } = require("../database");
    const posts = [];
    let fail = true;

    const make = () => createWeeklyHealth({
        db,
        qbBom: { status: () => ({ configured: true, items: 10, itemsOk: { finished_at: MON_0700 - H }, bomAll: 5, bomAllOk: { finished_at: MON_0700 - H } }) },
        offsiteStatus: now => ({ enabled: true, stale: false, newestOffsiteAt: now - H }),
        postSystem: async text => { if (fail) return false; posts.push(text); return true; },
        channels: () => ({ "Slack #mos-system": true }),
        escalationMode: () => "shadow (nothing sent)"
    });

    const w = make();

    assert.equal(await w.tick(MON_0700 - 60000), null, "6:59 → not yet");
    assert.equal(await w.tick(MON_0700), null, "Slack not reachable → not recorded");

    fail = false;

    assert.ok(await w.tick(MON_0700 + 10 * 60000), "retried on the next check");
    assert.equal(await make().tick(MON_0700 + 20 * 60000), null, "a restart doesn't send it again");
    assert.equal(posts.length, 1);
    assert.match(posts[0], /all systems OK/);
    assert.ok(await make().tick(MON_0700 + 7 * 24 * H), "next Monday sends again");

});
