const test = require("node:test");
const { before } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

//------------------------------------------------------
// Slack S2: button presses (POST /slack/interact). Signature
// required; the Slack user must be linked to a responder;
// Acknowledge / Resolve box / Cancel box change the alert exactly
// like the web screens; lost races get a private answer.
// Slack is faked (axios.post); no network.
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { alertBlocks } = require("../services/slack");

const SECRET = "staging-signing-secret-test";
const calls = [];

axios.post = async (url, body) => {

    calls.push({ url, body });

    if (url.startsWith("https://slack.com/api/"))
        return { status: 200, data: { ok: true, channel: body.channel, ts: String(Date.now()) } };

    return { status: 200, data: {} };

};

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

function signed(payload, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {

    const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const sig = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");

    return request(app).post("/slack/interact").set("Content-Type", "application/x-www-form-urlencoded")
        .set("X-Slack-Request-Timestamp", String(ts)).set("X-Slack-Signature", sig).send(raw);

}

const press = (actionId, alertId, user = "U0LINKED1") => ({
    type: "block_actions", user: { id: user }, trigger_id: "trig-1", response_url: "https://hooks.slack.com/actions/T1/1/x",
    actions: [{ action_id: actionId, value: String(alertId) }]
});

const submit = (callbackId, alertId, values, user = "U0LINKED1") => ({
    type: "view_submission", user: { id: user },
    view: { callback_id: callbackId, private_metadata: String(alertId), state: { values } }
});

let floor;
let admin;
let leadId;
const LINE = "Team A";
const WC = "Slack Button Station";

before(async () => {

    process.env.SLACK_STAGING_BOT_TOKEN = "xoxb-staging-test";
    process.env.SLACK_STAGING_CHANNEL = "C_STAGING";
    process.env.SLACK_STAGING_SIGNING_SECRET = SECRET;

    const login = async (username, password) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin).send({ name: WC, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    const lead = await request(app).post("/response-team").set(admin).send({ name: "Slack Lead", department: "Operations" }).expect(201);

    leadId = lead.body.data?.id ?? lead.body.responder?.id ?? lead.body.id ?? db.prepare("SELECT id FROM response_team WHERE name = 'Slack Lead'").get().id;

    await request(app).post("/response-team").set(admin).send({ name: "Other Lead", department: "Operations" }).expect(201);

});

async function raise(type = "QUALITY") {

    const r = await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type }).expect(200);

    return r.body.alert.id;

}

const row = id => db.prepare("SELECT * FROM alerts WHERE id = ?").get(id);
const lastEphemeral = () => [...calls].reverse().find(c => c.url.startsWith("https://hooks.slack.com/"));

test("signature: missing, wrong secret or older than 5 minutes → 401; nothing changes", async () => {

    const id = await raise();

    await request(app).post("/slack/interact").set("Content-Type", "application/x-www-form-urlencoded").send("payload={}").expect(401);
    await signed(press("ack", id), { secret: "wrong" }).expect(401);
    await signed(press("ack", id), { ts: Math.floor(Date.now() / 1000) - 600 }).expect(401);

    assert.equal(row(id).status, "ACTIVE");

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({}).expect(200);

});

test("linking: Slack member ID set in Admin → Responders; bad format 400; already used by another responder 409", async () => {

    const other = db.prepare("SELECT id FROM response_team WHERE name = 'Other Lead'").get().id;
    const base = { name: "Slack Lead", department: "Operations", availability: "Available", active: 1 };

    await request(app).put(`/response-team/${leadId}`).set(admin).send({ ...base, slack_user_id: "bob" }).expect(400);
    await request(app).put(`/response-team/${leadId}`).set(admin).send({ ...base, slack_user_id: "u0linked1" }).expect(200);

    assert.equal(db.prepare("SELECT slack_user_id FROM response_team WHERE id = ?").get(leadId).slack_user_id, "U0LINKED1");

    await request(app).put(`/response-team/${other}`).set(admin).send({ name: "Other Lead", department: "Operations", availability: "Available", active: 1, slack_user_id: "U0LINKED1" }).expect(409);
    await request(app).put(`/response-team/${leadId}`).set(admin).send(base).expect(200);

    assert.equal(db.prepare("SELECT slack_user_id FROM response_team WHERE id = ?").get(leadId).slack_user_id, "U0LINKED1", "leaving the field out keeps the link");

});

test("unlinked Slack user: nothing recorded, private answer says how to link", async () => {

    const id = await raise();

    calls.length = 0;
    await signed(press("ack", id, "U0STRANGER")).expect(200);
    await waitFor(() => lastEphemeral());

    assert.equal(row(id).status, "ACTIVE");
    assert.match(lastEphemeral().body.text, /isn't linked to a responder/);
    assert.equal(lastEphemeral().body.response_type, "ephemeral");

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({}).expect(200);

});

test("Acknowledge → recorded under the linked responder (Responding); the Slack message is updated; a second press is told who has it", async () => {

    const id = await raise();

    await waitFor(() => row(id).slack_ts);
    calls.length = 0;

    await signed(press("ack", id)).expect(200);

    assert.equal(row(id).status, "ACKNOWLEDGED");
    assert.equal(row(id).acknowledged_by, "Slack Lead");
    assert.equal(db.prepare("SELECT availability FROM response_team WHERE id = ?").get(leadId).availability, "Responding");

    await waitFor(() => calls.some(c => c.url.endsWith("chat.update")));

    const update = calls.find(c => c.url.endsWith("chat.update"));

    assert.match(JSON.stringify(update.body.attachments), /"action_id":"resolve"/, "acknowledged message offers Resolve");

    calls.length = 0;
    await signed(press("ack", id)).expect(200);
    await waitFor(() => lastEphemeral());

    assert.match(lastEphemeral().body.text, /already acknowledged by Slack Lead/);

});

test("Resolve → box opens; empty note refused; note → RESOLVED by the responder, responder Available again", async () => {

    const id = db.prepare("SELECT id FROM alerts WHERE status = 'ACKNOWLEDGED' AND acknowledged_by = 'Slack Lead' ORDER BY id DESC").get().id;

    calls.length = 0;
    await signed(press("resolve", id)).expect(200);

    const open = calls.find(c => c.url.endsWith("views.open"));

    assert.equal(open.body.trigger_id, "trig-1");
    assert.equal(open.body.view.callback_id, "resolve_alert");

    const empty = await signed(submit("resolve_alert", id, { note: { value: { value: "  " } } })).expect(200);

    assert.equal(empty.body.response_action, "errors");
    assert.equal(row(id).status, "ACKNOWLEDGED");

    const ok = await signed(submit("resolve_alert", id, { note: { value: { value: "Re-seated the connector" } } })).expect(200);

    assert.deepEqual(ok.body, {});
    assert.equal(row(id).status, "RESOLVED");
    assert.equal(row(id).resolved_by, "Slack Lead");
    assert.equal(row(id).resolution_notes, "Re-seated the connector");
    assert.equal(db.prepare("SELECT availability FROM response_team WHERE id = ?").get(leadId).availability, "Available");

    calls.length = 0;
    await signed(press("resolve", id)).expect(200);
    await waitFor(() => lastEphemeral());

    assert.match(lastEphemeral().body.text, /already resolved by Slack Lead/);

});

test("Cancel → box with the tablet's reasons; Other needs text; Test → CANCELLED 'Cancelled by <name>: Test'; Resolve on an ACTIVE alert says acknowledge first", async () => {

    const id = await raise("DOWNTIME");

    calls.length = 0;
    await signed(press("resolve", id)).expect(200);
    await waitFor(() => lastEphemeral());

    assert.match(lastEphemeral().body.text, /Acknowledge alert #\d+ before resolving/);

    await signed(press("cancel", id)).expect(200);

    assert.equal(calls.find(c => c.url.endsWith("views.open")).body.view.callback_id, "cancel_alert");

    const other = await signed(submit("cancel_alert", id, { reason: { value: { selected_option: { value: "Other" } } }, other: { value: { value: "" } } })).expect(200);

    assert.equal(other.body.errors.other, "Say what happened.");

    await signed(submit("cancel_alert", id, { reason: { value: { selected_option: { value: "Test" } } }, other: { value: { value: null } } })).expect(200);

    assert.equal(row(id).status, "CANCELLED");
    assert.equal(row(id).resolution_notes, "Cancelled by Slack Lead: Test");

});

test("buttons appear only when this environment's signing secret is set, and only on open alerts", () => {

    const a = { id: 1, type: "QUALITY", production_line: "Team A", work_center: "X", requested: Date.now() };

    assert.match(JSON.stringify(alertBlocks({ ...a, status: "ACTIVE" })), /"action_id":"ack"/);
    assert.doesNotMatch(JSON.stringify(alertBlocks({ ...a, status: "RESOLVED", resolved: Date.now() })), /action_id/);

    delete process.env.SLACK_STAGING_SIGNING_SECRET;

    assert.doesNotMatch(JSON.stringify(alertBlocks({ ...a, status: "ACTIVE" })), /action_id/);

    process.env.SLACK_STAGING_SIGNING_SECRET = SECRET;

});
