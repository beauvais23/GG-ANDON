const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
// Through the API, with a Telegram API that hangs
//------------------------------------------------------

const realFetch = global.fetch;
let hits = 0;
let aborted = 0;
let floor;

before(async () => {

    const admin = await request(app).post("/auth/login").send({ username: "test_admin", password: "test-admin-pw" });
    const floorLogin = await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" });

    floor = { Authorization: `Bearer ${floorLogin.body.token}` };

    const adminAuth = { Authorization: `Bearer ${admin.body.token}` };
    const lines = await request(app).get("/production-lines").set(adminAuth);
    const line = (lines.body.data || lines.body).find(l => l.name === "Team A");

    await request(app).post("/work-centers").set(adminAuth)
        .send({ name: "Slow Telegram", production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    // Never answers; gives up only when the time limit aborts it.
    global.fetch = (url, opts) => new Promise((resolve, reject) => {
        hits++;
        opts.signal.addEventListener("abort", () => { aborted++; reject(opts.signal.reason); });
    });

    process.env.APP_ENV = "production";
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_NEAR_MISS_CHAT_ID = "-100";
    process.env.NOTIFY_TIMEOUT_MS = "400";

});

after(() => {

    global.fetch = realFetch;
    process.env.APP_ENV = "test";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_NEAR_MISS_CHAT_ID;
    delete process.env.NOTIFY_TIMEOUT_MS;

});

test("tablet gets its answer without waiting for a hung Telegram; each call is cut off at the limit", async () => {

    const started = Date.now();

    const raise = () => request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: "Team A", workCenter: "Slow Telegram", type: "NEAR_MISS" });

    const first = await raise();
    const second = await raise();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.ok(Date.now() - started < 300, `raise took ${Date.now() - started} ms`);

    // Two alerts, two queues: both cut off after 400 ms.
    await sleep(900);

    assert.equal(hits, 2, "both Telegram calls were attempted");
    assert.equal(aborted, 2, "and both were cut off at the time limit");

});
