//------------------------------------------------------
// Slack S4: escalation live in Slack (migration 0020)
//
// Switch off (default) = shadow: logged, nothing sent. Switch
// on = each due step also posted in the alert's #andon-alerts
// thread with @mentions of the people in that role; people
// without a Slack member ID by name, empty roles flagged; no
// Slack message for the alert → a new message in the channel;
// errors saved on the log row. Times are New York.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});

const { db, statements } = require("../database");
const { evaluateEscalations } = require("../services/escalation");

const MIN = 60 * 1000;
// Mon Nov 2 2026 is EST (UTC-5).
const mon = (h, m) => Date.parse(`2026-11-02T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

const calls = [];
let failWith = null;

axios.post = async (url, body) => {

    if (!url.startsWith("https://slack.com/api/"))
        return { status: 200, data: {} };

    calls.push(body);

    return { status: 200, data: failWith ? { ok: false, error: failWith } : { ok: true, channel: body.channel, ts: "1.1" } };

};

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

const addPerson = db.prepare(`
    INSERT INTO response_team (name, department, availability, active, role, line_group, slack_user_id, created_at, updated_at)
    VALUES (?, 'Operations', 'Available', 1, ?, ?, ?, 0, 0)
`);

const addAlert = db.prepare(`
    INSERT INTO alerts (facility, production_line, work_center, type, status, requested, priority, created_at, updated_at, slack_channel, slack_ts)
    VALUES ('Malta', ?, 'Assembly', ?, 'ACTIVE', ?, 'NORMAL', ?, ?, ?, ?)
`);

const alertAt = (type, line, requested, ts = "1700000000.000100") => addAlert.run(line, type, requested, requested, requested, ts ? "C_ANDON" : null, ts).lastInsertRowid;

let admin;

before(async () => {

    process.env.APP_ENV = "production";
    process.env.SLACK_BOT_TOKEN = "xoxb-prod-test";
    process.env.SLACK_CHANNEL_ANDON = "C_ANDON";

    addPerson.run("Lead Team A", "Production Lead", "Team A", "U0LEADA01");
    addPerson.run("Lead SpaceX", "Production Lead", "SpaceX", "U0LEADS01");
    addPerson.run("Prod Manager", "Production Manager", null, "U0PRODM01");
    addPerson.run("Mfg Manager", "Manufacturing Manager", null, null);

    admin = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: "test_admin", password: "test-admin-pw" })).body.token}` };

});

test("switch off (default): steps are logged, nothing is sent", async () => {

    const id = alertAt("QUALITY", "Team A", mon(10, 0));

    calls.length = 0;
    evaluateEscalations(statements, mon(10, 1));
    await new Promise(r => setTimeout(r, 50));

    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM escalation_log WHERE alert_id = ?").get(id).n > 0);
    assert.equal(calls.length, 0);

    const matrix = await request(app).get("/admin/escalation").set(admin).expect(200);

    assert.equal(matrix.body.live, false);
    assert.equal(matrix.body.shadow, true);
    assert.equal(matrix.body.slackReady, true);

    db.prepare("UPDATE alerts SET status = 'CANCELLED' WHERE id = ?").run(id);

});

test("switch: admin only; refused (409) when Slack isn't set up; on and off", async () => {

    const floor = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token}` };

    await request(app).put("/admin/escalation/settings").set(floor).send({ sendSlack: true }).expect(403);
    await request(app).put("/admin/escalation/settings").set(admin).send({ sendSlack: "yes" }).expect(400);

    delete process.env.SLACK_CHANNEL_ANDON;
    await request(app).put("/admin/escalation/settings").set(admin).send({ sendSlack: true }).expect(409);
    process.env.SLACK_CHANNEL_ANDON = "C_ANDON";

    await request(app).put("/admin/escalation/settings").set(admin).send({ sendSlack: true }).expect(200);

    assert.equal((await request(app).get("/admin/escalation").set(admin)).body.live, true);

});

test("live: at start one thread post @mentioning the line's lead; no Slack ID → name; empty role flagged; result saved on the log", async () => {

    const id = alertAt("SAFETY", "Team A", mon(10, 0));

    calls.length = 0;
    evaluateEscalations(statements, mon(10, 0) + 30 * 1000);
    await waitFor(() => calls.length >= 1);

    assert.equal(calls.length, 1, "all steps that fired together → one post");
    assert.equal(calls[0].channel, "C_ANDON");
    assert.equal(calls[0].thread_ts, "1700000000.000100");
    assert.match(calls[0].text, /New alert.*SAFETY #\d+ · Team A \/ Assembly/);
    assert.match(calls[0].text, /Production Lead: <@U0LEADA01>/);
    assert.doesNotMatch(calls[0].text, /U0LEADS01/, "SpaceX lead not on a Team A alert");
    assert.match(calls[0].text, /CI and Safety Specialist: ⚠️ nobody has this role/);

    await waitFor(() => db.prepare("SELECT COUNT(*) AS n FROM escalation_log WHERE alert_id = ? AND slack_sent_at IS NOT NULL").get(id).n > 0);

    // 10 working minutes later: Production Manager (5) and Manufacturing Manager (10).
    calls.length = 0;
    evaluateEscalations(statements, mon(10, 10) + 30 * 1000);
    await waitFor(() => calls.length >= 1);

    assert.match(calls[0].text, /5 min unacknowledged/);
    assert.match(calls[0].text, /Production Manager: <@U0PRODM01>/);
    assert.match(calls[0].text, /Manufacturing Manager: Mfg Manager \(no Slack ID\)/);

    // Nothing new → nothing sent.
    calls.length = 0;
    evaluateEscalations(statements, mon(10, 11));
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls.length, 0);

    db.prepare("UPDATE alerts SET status = 'CANCELLED' WHERE id = ?").run(id);

});

test("live: alert without a Slack message → new message in #andon-alerts; Slack error saved on the log rows; near misses never", async () => {

    const id = alertAt("DOWNTIME", "Gigabay", mon(11, 40), null);

    calls.length = 0;
    evaluateEscalations(statements, mon(11, 41));
    await waitFor(() => calls.length >= 1);

    assert.equal(calls[0].channel, "C_ANDON");
    assert.equal(calls[0].thread_ts, undefined);
    assert.match(calls[0].text, /<@U0LEADS01>/);

    db.prepare("UPDATE alerts SET status = 'CANCELLED' WHERE id = ?").run(id);

    failWith = "not_in_channel";

    const bad = alertAt("QUALITY", "Team A", mon(13, 0));

    evaluateEscalations(statements, mon(13, 1));
    await waitFor(() => db.prepare("SELECT COUNT(*) AS n FROM escalation_log WHERE alert_id = ? AND slack_error IS NOT NULL").get(bad).n > 0);

    assert.match(db.prepare("SELECT slack_error FROM escalation_log WHERE alert_id = ? LIMIT 1").get(bad).slack_error, /not_in_channel/);

    failWith = null;
    db.prepare("UPDATE alerts SET status = 'CANCELLED' WHERE id = ?").run(bad);

    const nearMiss = alertAt("NEAR_MISS", "Team A", mon(13, 30));

    calls.length = 0;
    evaluateEscalations(statements, mon(13, 31));
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM escalation_log WHERE alert_id = ?").get(nearMiss).n, 0);

});

test("switch back off: shadow again, nothing sent", async () => {

    await request(app).put("/admin/escalation/settings").set(admin).send({ sendSlack: false }).expect(200);

    const id = alertAt("QUALITY", "Team A", mon(14, 30));

    calls.length = 0;
    evaluateEscalations(statements, mon(14, 31));
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls.length, 0);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM escalation_log WHERE alert_id = ?").get(id).n > 0);

});
