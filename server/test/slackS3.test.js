const test = require("node:test");
const { before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

//------------------------------------------------------
// Slack S3: each kind to its own channel in production
// (andon, near miss, BOM, system); SAFETY alerts also point to
// #safety-near-miss; near miss voided → message redrawn; BOM
// request → #bom-changes, Done → redrawn + thread reply; system
// warnings once per day; startup line; staging = one channel,
// no duplicates. Slack is faked (axios.post); no network.
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { describeSlack, postSystemToSlack } = require("../services/slack");
const { createQbBom } = require("../services/qbBom");

const calls = [];

axios.post = async (url, body) => {

    calls.push({ url, body });

    if (url.startsWith("https://slack.com/api/"))
        return { status: 200, data: { ok: true, channel: body.channel, ts: `${Date.now()}.${calls.length}` } };

    return { status: 200, data: {} };

};

const slack = () => calls.filter(c => c.url.startsWith("https://slack.com/api/"));
const posts = () => slack().filter(c => c.url.endsWith("chat.postMessage"));

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

function production() {

    process.env.APP_ENV = "production";
    process.env.SLACK_BOT_TOKEN = "xoxb-prod-test";
    process.env.SLACK_CHANNEL_ANDON = "C_ANDON";
    process.env.SLACK_CHANNEL_NEAR_MISS = "C_NEARMISS";
    process.env.SLACK_CHANNEL_BOM = "C_BOM";
    process.env.SLACK_CHANNEL_SYSTEM = "C_SYSTEM";
    delete process.env.SLACK_SIGNING_SECRET;

}

function staging() {

    process.env.APP_ENV = "test";
    process.env.SLACK_STAGING_BOT_TOKEN = "xoxb-staging-test";
    process.env.SLACK_STAGING_CHANNEL = "C_STAGING";

}

let floor;
const LINE = "Team A";
const WC = "S3 Station";

before(async () => {

    const login = async (username, password) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });
    const admin = await login("test_admin", "test-admin-pw");

    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin).send({ name: WC, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

});

const raise = async type => (await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type }).expect(200)).body.alert.id;

test("startup line says which Slack parts are on, without tokens or channel IDs", () => {

    production();

    const line = describeSlack();

    assert.equal(line, "Slack (production app): andon on, near miss on, BOM on, system on, buttons off");
    assert.doesNotMatch(line, /xoxb|C_/);

    delete process.env.SLACK_CHANNEL_BOM;

    assert.match(describeSlack(), /BOM off/);

    process.env.SLACK_CHANNEL_BOM = "C_BOM";

});

test("SAFETY alert: message in #andon-alerts plus a pointer in #safety-near-miss linking back", async () => {

    production();
    calls.length = 0;

    const id = await raise("SAFETY");

    await waitFor(() => posts().length >= 2);

    assert.equal(posts()[0].body.channel, "C_ANDON");
    assert.equal(posts()[1].body.channel, "C_NEARMISS");
    assert.match(posts()[1].body.text, new RegExp(`SAFETY alert #${id}.*<#C_ANDON>`));

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({}).expect(200);

});

test("near miss: one message in #safety-near-miss (not #andon-alerts); undo → message shows VOIDED with the reason", async () => {

    production();
    calls.length = 0;

    const id = await raise("NEAR_MISS");

    await waitFor(() => db.prepare("SELECT slack_ts FROM alerts WHERE id = ?").get(id).slack_ts);

    assert.equal(posts().length, 1);
    assert.equal(posts()[0].body.channel, "C_NEARMISS");
    assert.match(JSON.stringify(posts()[0].body.attachments), /NEAR MISS #/);

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({ reason: "Pressed by mistake", cancelledBy: "Operator (tablet)" }).expect(200);
    await waitFor(() => slack().some(c => c.url.endsWith("chat.update")));

    const update = slack().find(c => c.url.endsWith("chat.update"));

    assert.equal(update.body.channel, "C_NEARMISS");
    assert.match(JSON.stringify(update.body.attachments), /VOIDED.*Pressed by mistake/);

});

test("BOM request: message in #bom-changes (ts saved); Done → message shows DONE + a reply in its thread", async () => {

    production();
    calls.length = 0;

    const ins = db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand) VALUES (?, ?, ?, ?, 1, 0)");

    ins.run("KIT-9", "InventoryAssembly", "Kit nine", "");
    ins.run("20-111-A", "Inventory", "Screw", "ea");
    db.prepare("INSERT INTO qb_sync_log (kind, started_at, finished_at, ok, rows) VALUES ('items', ?, ?, 1, 2)").run(Date.now(), Date.now());
    db.prepare("INSERT OR REPLACE INTO qb_bom_lines (assembly, line, component, qty, uom) VALUES ('KIT-9', 1, '20-111-A', 4, 'ea')").run();
    db.prepare("INSERT OR REPLACE INTO qb_bom_fetched (assembly, fetched_at) VALUES ('KIT-9', ?)").run(Date.now());

    const sent = await request(app).post("/bom/requests").set(floor)
        .send({ sku: "KIT-9", reason: "Correction", requestedBy: "Tester", lines: [{ action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 6 }] }).expect(201);
    const code = sent.body.request.code;

    await waitFor(() => db.prepare("SELECT slack_ts FROM bom_requests WHERE code = ?").get(code).slack_ts);

    const msg = posts().find(c => c.body.channel === "C_BOM");

    assert.match(JSON.stringify(msg.body.attachments), new RegExp(`🧾 ${code} · KIT-9`));
    assert.match(JSON.stringify(msg.body.attachments), /CHANGE QTY\* line 1 `20-111-A` \*4 → 6\*/);

    await request(app).post(`/bom/requests/${code}/done`).set(floor).send({ by: "QB Editor", note: "Edited" }).expect(200);
    await waitFor(() => posts().some(c => c.body.thread_ts));

    const ts = db.prepare("SELECT slack_ts FROM bom_requests WHERE code = ?").get(code).slack_ts;

    assert.match(JSON.stringify(slack().find(c => c.url.endsWith("chat.update")).body.attachments), /DONE in QuickBooks/);
    assert.equal(posts().find(c => c.body.thread_ts).body.thread_ts, ts);
    assert.match(posts().find(c => c.body.thread_ts).body.text, /done in QuickBooks by \*QB Editor\*: Edited/);

});

test("system warnings go to #mos-system; QuickBooks failures warn once per New York day", async () => {

    production();
    calls.length = 0;

    assert.equal(await postSystemToSlack("⚠️ test"), true);
    assert.equal(posts()[0].body.channel, "C_SYSTEM");

    let clock = Date.parse("2026-11-09T15:00:00Z");
    const qb = createQbBom({ db, query: async () => [], now: () => clock });

    calls.length = 0;
    qb.warnSystem("first");
    qb.warnSystem("second");
    await waitFor(() => posts().length >= 1);
    await new Promise(r => setTimeout(r, 50));

    assert.equal(posts().length, 1);

    clock += 24 * 3600 * 1000;
    qb.warnSystem("next day");
    await waitFor(() => posts().length >= 2);

    assert.equal(posts().length, 2);

});

test("staging: every kind goes to #mos-staging with the staging token; no SAFETY duplicate in the same channel", async () => {

    staging();
    calls.length = 0;

    const id = await raise("SAFETY");

    await waitFor(() => posts().length >= 1);
    await new Promise(r => setTimeout(r, 100));

    assert.equal(posts().length, 1);
    assert.equal(posts()[0].body.channel, "C_STAGING");

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({}).expect(200);

});
