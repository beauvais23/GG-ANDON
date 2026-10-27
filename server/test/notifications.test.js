const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { queueNotification } = require("../services/notificationQueue");

const { app } = loadApp();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

//------------------------------------------------------
// Queue
//------------------------------------------------------

test("same alert: notifications run in order even when the first is slow", async () => {

    const order = [];

    queueNotification(101, "created", async () => { await sleep(80); order.push("created"); });
    queueNotification(101, "acknowledged", async () => { order.push("acknowledged"); });
    await queueNotification(101, "resolved", async () => { order.push("resolved"); });

    assert.deepEqual(order, ["created", "acknowledged", "resolved"]);

});

test("different alerts do not wait for each other", async () => {

    const order = [];

    const slow = queueNotification(201, "created", async () => { await sleep(80); order.push("alert 201"); });
    await queueNotification(202, "created", async () => { order.push("alert 202"); });

    assert.deepEqual(order, ["alert 202"]);

    await slow;

    assert.deepEqual(order, ["alert 202", "alert 201"]);

});

test("a failing notification is logged, not thrown, and the next one still runs", async () => {

    let ran = false;

    await queueNotification(301, "created", async () => { throw new Error("chat down"); });
    await queueNotification(301, "acknowledged", async () => { ran = true; });

    assert.equal(ran, true);

});

//------------------------------------------------------
// Through the API, with a Google Chat endpoint that hangs
//------------------------------------------------------

let hang;
let hits = 0;
let floor;

before(async () => {

    // Accepts the request and never answers.
    hang = http.createServer(() => { hits++; });

    await new Promise(resolve => hang.listen(0, "127.0.0.1", resolve));

    const admin = await request(app).post("/auth/login").send({ username: "test_admin", password: "test-admin-pw" });
    const floorLogin = await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" });

    floor = { Authorization: `Bearer ${floorLogin.body.token}` };

    const adminAuth = { Authorization: `Bearer ${admin.body.token}` };
    const lines = await request(app).get("/production-lines").set(adminAuth);
    const line = (lines.body.data || lines.body).find(l => l.name === "Team A");

    await request(app).post("/work-centers").set(adminAuth)
        .send({ name: "Slow Chat", production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    await request(app).post("/response-team").set(adminAuth)
        .send({ name: "Queue Tester", department: "Operations" });

    process.env.APP_ENV = "production";
    process.env.GOOGLE_CHAT_WEBHOOK = `http://127.0.0.1:${hang.address().port}/chat`;
    process.env.NOTIFY_TIMEOUT_MS = "400";

});

after(() => {

    process.env.APP_ENV = "test";
    delete process.env.GOOGLE_CHAT_WEBHOOK;
    delete process.env.NOTIFY_TIMEOUT_MS;
    hang.closeAllConnections();
    hang.close();

});

test("tablet gets its answer without waiting for a hung Google Chat; the call is cut off", async () => {

    const started = Date.now();

    const raised = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: "Team A", workCenter: "Slow Chat", type: "QUALITY" });

    const raiseMs = Date.now() - started;

    assert.equal(raised.status, 200);
    assert.ok(raiseMs < 300, `raise took ${raiseMs} ms`);

    const ackStarted = Date.now();

    const acked = await request(app)
        .patch(`/alerts/${raised.body.alert.id}/acknowledge`)
        .set(floor)
        .send({ acknowledgedBy: "Queue Tester" });

    assert.equal(acked.status, 200);
    assert.ok(Date.now() - ackStarted < 300, "acknowledge did not wait for Chat");

    // created (400 ms limit) then acknowledged (400 ms limit), one after the other.
    await sleep(1100);

    assert.equal(hits, 2, "both Chat calls were attempted, in turn, and timed out");

});
