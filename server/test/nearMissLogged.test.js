//------------------------------------------------------
// Near misses are logged, not answered (Director, Oct 30 2026)
//
// A NEAR_MISS is a report, not a call for help: it is
// saved already closed, never shows as open, is left out
// of MTTA/MTTR, posts one "REPORTED" card, and the tablet
// can undo it ("Pressed by mistake") for 10 minutes.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});
mock.method(console, "warn", () => {});

const { statements } = require("../database");
const { responseStats } = require("../services/workingTime");
const { sendGoogleChatCard } = require("../services/googleChat");
const { NEAR_MISS_LOGGED_NOTE } = require("../services/alertTypes");

const LINE = "Team A";
const STATION = "Logged Station";

let floor;

const raise = type =>
    request(app).post("/alerts").set(floor)
        .send({ productionLine: LINE, workCenter: STATION, type });

const undo = id =>
    request(app).patch(`/alerts/${id}/cancel`).set(floor)
        .send({ reason: "Pressed by mistake", cancelledBy: "Operator (tablet)" });

const activeIds = async () =>
    (await request(app).get("/alerts/active").set(floor)).body.map(a => a.id);

before(async () => {

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin)
        .send({ name: STATION, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    await request(app).post("/response-team").set(admin)
        .send({ name: "Lead", department: "Operations" });

});

test("a NEAR MISS is saved already closed and never shows as open", async () => {

    const res = await raise("NEAR_MISS");

    assert.equal(res.status, 200, res.text);

    const alert = res.body.alert;

    assert.equal(alert.status, "RESOLVED");
    assert.equal(alert.resolved, alert.requested);
    assert.equal(alert.acknowledged, null);
    assert.equal(alert.resolved_by, "Operator (tablet)");
    assert.equal(alert.resolution_notes, NEAR_MISS_LOGGED_NOTE);
    assert.equal(alert.duration_seconds, 0);
    assert.ok(!(await activeIds()).includes(alert.id));

});

test("near misses on the same station in a row are each logged (no duplicate block)", async () => {

    const first = await raise("NEAR_MISS");
    const second = await raise("NEAR_MISS");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200, second.text);
    assert.notEqual(first.body.alert.id, second.body.alert.id);

});

test("Pressed by mistake undoes a logged near miss: cancelled, resolve time cleared, once only", async () => {

    const { id } = (await raise("NEAR_MISS")).body.alert;

    const res = await undo(id);

    assert.equal(res.status, 200, res.text);

    const after = statements.getAlert.get(id);

    assert.equal(after.status, "CANCELLED");
    assert.equal(after.resolved, null);
    assert.equal(after.resolved_by, null);
    assert.ok(after.cancelled_at);
    assert.equal(after.resolution_notes, "Cancelled by Operator (tablet): Pressed by mistake");

    assert.equal((await undo(id)).status, 400, "already cancelled");

});

test("a near miss can't be undone after 10 minutes", async () => {

    const { id } = (await raise("NEAR_MISS")).body.alert;

    // Backdate it 11 minutes.
    require("../database").db.prepare("UPDATE alerts SET requested = requested - 660000 WHERE id = ?").run(id);

    const res = await undo(id);

    assert.equal(res.status, 400);
    assert.match(res.body.message, /more than 10 minutes/);
    assert.equal(statements.getAlert.get(id).status, "RESOLVED");

});

test("a resolved QUALITY alert still can't be cancelled; other types still open as before", async () => {

    const q = (await raise("QUALITY")).body.alert;

    assert.equal(q.status, "ACTIVE");
    assert.ok((await activeIds()).includes(q.id));

    assert.equal((await request(app).patch(`/alerts/${q.id}/acknowledge`).set(floor).send({ acknowledgedBy: "Lead" })).status, 200);
    assert.equal((await request(app).patch(`/alerts/${q.id}/resolve`).set(floor).send({ resolvedBy: "Lead", resolutionNotes: "Fixed" })).status, 200);

    assert.equal((await undo(q.id)).status, 400);

});

test("MTTA/MTTR leave near misses out", () => {

    // Thu Oct 29 2026, 10:00 AM New York: inside the shift, no break.
    const t = Date.parse("2026-10-29T14:00:00Z");
    const min = 60 * 1000;

    const stats = responseStats([
        { type: "QUALITY", status: "RESOLVED", requested: t, acknowledged: t + 2 * min, resolved: t + 4 * min },
        { type: "NEAR_MISS", status: "RESOLVED", requested: t, acknowledged: t + 10 * min, resolved: t + 10 * min }
    ]);

    assert.equal(stats.avgResponseSeconds, 120);
    assert.equal(stats.avgResolutionSeconds, 240);

});

test("the Google Chat card for a logged near miss reads REPORTED, with no responder or timers", async () => {

    const realPost = axios.post;
    let body;

    axios.post = async (url, payload) => { body = payload; return { data: {} }; };
    process.env.APP_ENV = "production";

    try {

        const alert = (await raise("NEAR_MISS")).body.alert;

        await sendGoogleChatCard(alert, "REPORTED", "https://chat.test/near-miss");

    } finally {

        axios.post = realPost;
        process.env.APP_ENV = "test";

    }

    const text = JSON.stringify(body);

    assert.equal(body.cardsV2[0].card.header.title, "⚠️ NEAR MISS REPORTED");
    assert.match(text, /Team A \/ Logged Station/);
    assert.match(text, /Near Miss &amp; Safety Incident Form/);
    assert.doesNotMatch(text, /Unassigned|PRIORITY|Resolution/);

});

