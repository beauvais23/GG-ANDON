//------------------------------------------------------
// Defect #20: closing one alert must not set a responder
// Available while they still hold another acknowledged
// alert. Covers web resolve, cancel, and Telegram resolve.
//------------------------------------------------------

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

const LINE = "Team A";
const WORK_CENTER = "Availability Station";
const ALICE = "Responder One";
const BOB = "Responder Two";
const TELEGRAM_USER = { first_name: "Tele", last_name: "Responder" };
const TELEGRAM_NAME = "Tele Responder";
const WEBHOOK_SECRET = "test-webhook-secret";

const realAxiosPost = axios.post;

let floor;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

async function raiseAndAck(type, responder) {

    const raised = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type });

    assert.equal(raised.status, 200, `raise ${type}`);

    const id = raised.body.alert.id;

    const acked = await request(app)
        .patch(`/alerts/${id}/acknowledge`)
        .set(floor)
        .send({ acknowledgedBy: responder });

    assert.equal(acked.status, 200, `ack ${type}`);

    return id;

}

function resolve(id, resolvedBy) {

    return request(app)
        .patch(`/alerts/${id}/resolve`)
        .set(floor)
        .send({ resolvedBy, resolutionNotes: "Fixed" });

}

function cancel(id) {

    return request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({});

}

async function availabilityOf(name) {

    const res = await request(app).get("/response-team").set(floor);
    const list = res.body.data || res.body;

    return list.find(r => r.name === name).availability;

}

async function telegramResolve(id) {

    // The webhook only acts when APP_ENV=production. No bot token
    // or chat webhook is set, and axios.post is stubbed (the webhook
    // answers Telegram's callback), so nothing leaves the process.
    process.env.APP_ENV = "production";

    try {

        const res = await request(app)
            .post("/telegram/webhook")
            .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
            .send({ callback_query: { id: "cb", data: `resolve_${id}`, from: TELEGRAM_USER } });

        assert.equal(res.status, 200, res.text);

    } finally {

        process.env.APP_ENV = "test";

    }

}

before(async () => {

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    axios.post = async () => ({ data: { ok: true } });

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin)
        .send({ name: WORK_CENTER, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    for (const name of [ALICE, BOB, TELEGRAM_NAME]) {

        const res = await request(app).post("/response-team").set(admin)
            .send({ name, department: "Operations" });

        assert.equal(res.status, 201);

    }

});

after(() => {

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    axios.post = realAxiosPost;

});

test("web resolve: responder with a second open alert stays Responding until the last one closes", async () => {

    const first = await raiseAndAck("QUALITY", ALICE);
    const second = await raiseAndAck("SAFETY", ALICE);

    assert.equal((await resolve(first, ALICE)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Responding");

    assert.equal((await resolve(second, ALICE)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Available");

});

test("cancel: responder with a second open alert stays Responding until the last one closes", async () => {

    const first = await raiseAndAck("MATERIAL", ALICE);
    const second = await raiseAndAck("MAINTENANCE", ALICE);

    assert.equal((await cancel(first)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Responding");

    assert.equal((await cancel(second)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Available");

});

test("resolved by someone else: the acknowledger is released too", async () => {

    const id = await raiseAndAck("SUPERVISOR", ALICE);

    assert.equal(await availabilityOf(ALICE), "Responding");

    assert.equal((await resolve(id, BOB)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Available");
    assert.equal(await availabilityOf(BOB), "Available");

});

test("resolved by someone else: the resolver keeps Responding if they hold their own open alert", async () => {

    const alices = await raiseAndAck("QUALITY", ALICE);
    const bobs = await raiseAndAck("SAFETY", BOB);

    assert.equal((await resolve(alices, BOB)).status, 200);
    assert.equal(await availabilityOf(ALICE), "Available");
    assert.equal(await availabilityOf(BOB), "Responding");

    assert.equal((await resolve(bobs, BOB)).status, 200);
    assert.equal(await availabilityOf(BOB), "Available");

});

test("Telegram resolve: responder with a second open alert stays Responding until the last one closes", async () => {

    const first = await raiseAndAck("QUALITY", TELEGRAM_NAME);
    const second = await raiseAndAck("SAFETY", TELEGRAM_NAME);

    await telegramResolve(first);
    assert.equal(await availabilityOf(TELEGRAM_NAME), "Responding");

    await telegramResolve(second);
    assert.equal(await availabilityOf(TELEGRAM_NAME), "Available");

});
