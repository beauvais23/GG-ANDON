const test = require("node:test");
const { before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

//------------------------------------------------------
// Slack S1: andon alerts in #andon-alerts (one message per
// alert, updated in place, thread reply per step); staging
// never uses the production token or channel (hard rule 6);
// near misses not sent; a Slack failure never blocks the alert.
// Slack is faked (axios.post); no test touches the network.
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { alertBlocks, stepText, slackConfig } = require("../services/slack");

const calls = [];
let failWith = null;
let nextTs = 1000;

axios.post = async (url, body, opts) => {

    if (!url.startsWith("https://slack.com/api/"))
        return { status: 200, data: {} };

    calls.push({ method: url.split("/").pop(), body, auth: opts.headers.Authorization });

    if (failWith)
        return { status: 200, data: { ok: false, error: failWith } };

    return { status: 200, data: { ok: true, channel: body.channel, ts: body.thread_ts ? `${body.thread_ts}.r` : String(nextTs++) } };

};

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

let floor;
const LINE = "Team A";
const WC = "Slack Test Station";

before(async () => {

    const login = async (username, password) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });
    const admin = await login("test_admin", "test-admin-pw");

    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin).send({ name: WC, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });
    await request(app).post("/response-team").set(admin).send({ name: "Lead One", department: "Operations" }).expect(201);

});

function useStaging() {

    process.env.APP_ENV = "test";
    process.env.SLACK_STAGING_BOT_TOKEN = "xoxb-staging-test";
    process.env.SLACK_STAGING_CHANNEL = "C_STAGING";
    process.env.SLACK_BOT_TOKEN = "xoxb-PRODUCTION-test";
    process.env.SLACK_CHANNEL_ANDON = "C_PRODUCTION";

}

test("message: header, status, line / work center / times, resolution or cancel reason; thread step text", () => {

    const base = { id: 7, type: "QUALITY", production_line: "Team A", work_center: "Final Test", requested: Date.parse("2026-11-09T14:00:00Z") };

    const active = alertBlocks({ ...base, status: "ACTIVE" }, base.requested + 12 * 60000);
    const text = JSON.stringify(active);

    assert.equal(active[0].text.text, "🔴 QUALITY #7 · Team A / Final Test");
    assert.match(text, /ACTIVE/);
    assert.match(text, /Team A/);
    assert.match(text, /ACTIVE\* · open \*12m\* · raised/);

    const resolved = { ...base, status: "RESOLVED", acknowledged: base.requested + 3 * 60000, acknowledged_by: "Lead One", resolved: base.requested + 75 * 60000, resolved_by: "Lead One", resolution_notes: "Replaced <fixture>" };
    const rText = JSON.stringify(alertBlocks(resolved));

    assert.match(rText, /RESOLVED/);
    assert.match(rText, /RESOLVED\* · took \*1h 15m\*/);
    assert.match(rText, /Acknowledged by\*\\nLead One · .* \(3m\)/);
    assert.match(rText, /What fixed it/);
    assert.match(rText, /Replaced &lt;fixture&gt;/, "user text is escaped");
    assert.match(stepText(resolved), /Resolved by \*Lead One\* after 1h 15m: Replaced/);

    assert.match(JSON.stringify(alertBlocks({ ...base, status: "CANCELLED", cancelled_at: base.requested + 60000, resolution_notes: "Cancelled by Operator (tablet): Test" })), /Cancel reason/);

});

test("gate: outside production only the staging token and channel are used, never the production ones; nothing set → off", () => {

    useStaging();

    assert.deepEqual(slackConfig(), { token: "xoxb-staging-test", channel: "C_STAGING" });

    delete process.env.SLACK_STAGING_BOT_TOKEN;

    assert.equal(slackConfig(), null, "production variables are never read outside production");

    process.env.APP_ENV = "production";

    assert.deepEqual(slackConfig(), { token: "xoxb-PRODUCTION-test", channel: "C_PRODUCTION" });

    process.env.APP_ENV = "test";

});

test("flow: raise → one message (ts saved) → acknowledge → message updated + thread reply → resolve → updated + reply", async () => {

    useStaging();
    calls.length = 0;

    const raised = await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type: "MAINTENANCE" }).expect(200);
    const id = raised.body.alert?.id ?? raised.body.id ?? raised.body.data?.id;

    await waitFor(() => db.prepare("SELECT slack_ts FROM alerts WHERE id = ?").get(id).slack_ts);

    const row = db.prepare("SELECT slack_channel, slack_ts FROM alerts WHERE id = ?").get(id);

    assert.equal(row.slack_channel, "C_STAGING");
    assert.ok(row.slack_ts);
    assert.equal(calls[0].method, "chat.postMessage");
    assert.equal(calls[0].auth, "Bearer xoxb-staging-test");
    assert.ok(calls.every(c => c.body.channel === "C_STAGING" && !c.auth.includes("PRODUCTION")));

    await request(app).patch(`/alerts/${id}/acknowledge`).set(floor).send({ acknowledgedBy: "Lead One" }).expect(200);
    await waitFor(() => calls.filter(c => c.body.thread_ts).length === 1);

    const update = calls.find(c => c.method === "chat.update");

    assert.equal(update.body.ts, row.slack_ts);
    assert.match(JSON.stringify(update.body.attachments), /ACKNOWLEDGED/);
    assert.deepEqual(update.body.blocks, [], "clears the old top-level blocks of messages posted before the new look");
    assert.match(calls.find(c => c.body.thread_ts).body.text, /Acknowledged by \*Lead One\*/);

    await request(app).patch(`/alerts/${id}/resolve`).set(floor).send({ resolvedBy: "Lead One", resolutionNotes: "Reset the drive" }).expect(200);
    await waitFor(() => calls.filter(c => c.body.thread_ts).length === 2);

    assert.match(calls.filter(c => c.body.thread_ts)[1].body.text, /Resolved by \*Lead One\*.*Reset the drive/);
    assert.equal(calls.filter(c => c.method === "chat.postMessage" && !c.body.thread_ts).length, 1, "still one alert message");

});

test("near miss (S3): one NEAR MISS REPORTED message, no buttons; a Slack error is logged and the alert is still created and acknowledged", async () => {

    useStaging();
    calls.length = 0;

    await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type: "NEAR_MISS" }).expect(200);
    await waitFor(() => calls.length >= 1);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.channel, "C_STAGING");
    assert.match(JSON.stringify(calls[0].body.attachments), /NEAR MISS #/);
    assert.doesNotMatch(JSON.stringify(calls[0].body.attachments), /action_id/);

    failWith = "channel_not_found";

    const raised = await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type: "DOWNTIME" }).expect(200);
    const id = raised.body.alert?.id ?? raised.body.id ?? raised.body.data?.id;

    await waitFor(() => calls.length >= 1);

    assert.equal(db.prepare("SELECT slack_ts FROM alerts WHERE id = ?").get(id).slack_ts, null);

    await request(app).patch(`/alerts/${id}/acknowledge`).set(floor).send({ acknowledgedBy: "Lead One" }).expect(200);

    failWith = null;

});

test("look (Nov 11 2026): left bar coloured by status, red Cancel with a confirm, G&G mark in the footer; update clears old top-level blocks", () => {

    const { alertMessage, bomMessage, COLOR, logoUrl } = require("../services/slack");
    const base = { id: 9, type: "QUALITY", production_line: "Team A", work_center: "Final Test", requested: Date.parse("2026-11-09T14:00:00Z") };
    const color = status => alertMessage({ ...base, status }).attachments[0].color;

    assert.deepEqual(["ACTIVE", "ACKNOWLEDGED", "RESOLVED", "CANCELLED"].map(color), [COLOR.red, COLOR.amber, COLOR.green, COLOR.grey]);
    assert.equal(alertMessage({ ...base, type: "NEAR_MISS", status: "RESOLVED" }).attachments[0].color, COLOR.amber, "logged near miss = amber");
    assert.equal(alertMessage({ ...base, type: "NEAR_MISS", status: "CANCELLED" }).attachments[0].color, COLOR.grey, "voided = grey");
    assert.match(alertMessage({ ...base, status: "ACTIVE" }).text, /QUALITY alert #9/, "fallback text for notifications");

    const bom = s => bomMessage({ code: "BOM-2026-001", sku: "KIT", status: s }, [], "https://x/bom", "t").attachments[0].color;

    assert.deepEqual(["OPEN", "DONE", "CANCELLED"].map(bom), [COLOR.blue, COLOR.green, COLOR.grey]);

    const { alertButtons } = require("../services/slack");
    const cancel = alertButtons({ ...base, status: "ACTIVE" }).find(b => b.action_id === "cancel");

    assert.equal(cancel.style, "danger");
    assert.equal(cancel.confirm.confirm.text, "Yes, cancel");
    assert.equal(cancel.confirm.deny.text, "Keep it open");
    assert.match(logoUrl(), /\/slack\/gg-mark\.png$/);
    assert.ok(JSON.stringify(alertMessage({ ...base, status: "ACTIVE" })).includes("gg-mark.png"));

});
