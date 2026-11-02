//------------------------------------------------------
// Near Miss routing (Director, Oct 30 2026)
//
// NEAR_MISS alerts go only to the Near Miss Google Chat
// space (GOOGLE_CHAT_NEAR_MISS_WEBHOOK): no Telegram, no
// ANDON Chat space. Without that variable they fall back
// to the usual channels. fetch (Telegram) and axios.post
// (Google Chat) are replaced; nothing leaves the process.
//------------------------------------------------------

const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

// telegram.js reads its token at load time and loadApp() clears
// it, so set dummy values and load the notification modules fresh.
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_CHAT_ID = "1";

for (const m of ["telegram", "telegramUpdate", "notificationManager"])
    delete require.cache[require.resolve(`../services/${m}`)];

mock.method(console, "log", () => {});
mock.method(console, "warn", () => {});
mock.method(console, "error", () => {});

const { statements } = require("../database");
const {
    notifyCreated,
    notifyAcknowledged,
    notifyResolved,
    notifyCancelled
} = require("../services/notificationManager");

const ANDON_CHAT = "https://chat.test/andon";
const NEAR_MISS_CHAT = "https://chat.test/near-miss";

const realFetch = global.fetch;
const realPost = axios.post;

let sent;

const telegram = () => sent.filter(s => s.startsWith("telegram:"));
const chat = () => sent.filter(s => s.startsWith("chat:"));

let floor;

async function raise(type) {

    const res = await request(app).post("/alerts").set(floor)
        .send({ productionLine: "Team A", workCenter: "Routing Station", type });

    return statements.getAlert.get(res.body.alert.id);

}

before(async () => {

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === "Team A");

    await request(app).post("/work-centers").set(admin)
        .send({ name: "Routing Station", production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

});

beforeEach(() => {

    sent = [];

    global.fetch = async url => {
        sent.push(`telegram:${url.split("/").pop()}`);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 500 } }));
    };

    axios.post = async url => {
        sent.push(`chat:${url}`);
        return { data: {} };
    };

    process.env.APP_ENV = "production";
    process.env.GOOGLE_CHAT_WEBHOOK = ANDON_CHAT;
    process.env.GOOGLE_CHAT_NEAR_MISS_WEBHOOK = NEAR_MISS_CHAT;

});

after(() => {

    global.fetch = realFetch;
    axios.post = realPost;
    process.env.APP_ENV = "test";
    delete process.env.GOOGLE_CHAT_WEBHOOK;
    delete process.env.GOOGLE_CHAT_NEAR_MISS_WEBHOOK;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

});

// Alerts are raised with APP_ENV=test (set by beforeEach only
// after this helper runs), so the route itself sends nothing.
async function raiseQuietly(type) {

    process.env.APP_ENV = "test";
    const alert = await raise(type);
    process.env.APP_ENV = "production";
    sent = [];
    return alert;

}

test("a new NEAR MISS alert posts only to the Near Miss Chat space", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    await notifyCreated(alert);

    assert.deepEqual(chat(), [`chat:${NEAR_MISS_CHAT}`]);
    assert.deepEqual(telegram(), [], "no Telegram");
    assert.equal(statements.getAlert.get(alert.id).telegram_message_id, null);

});

test("acknowledge, resolve and cancel updates of a NEAR MISS go only to the Near Miss space", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    for (const notify of [notifyAcknowledged, notifyResolved, notifyCancelled]) {

        sent = [];
        await notify(alert);

        assert.deepEqual(chat(), [`chat:${NEAR_MISS_CHAT}`], notify.name);
        assert.deepEqual(telegram(), [], notify.name);

    }

});

test("the other six types are unchanged: ANDON Chat space + Telegram", async () => {

    for (const type of ["QUALITY", "MAINTENANCE", "MATERIAL", "SUPERVISOR", "SAFETY", "DOWNTIME"]) {

        const alert = await raiseQuietly(type);

        await notifyCreated(alert);

        assert.deepEqual(chat(), [`chat:${ANDON_CHAT}`], type);
        assert.deepEqual(telegram(), ["telegram:sendMessage"], type);

        // Close it so the next type isn't a duplicate on the station.
        process.env.APP_ENV = "test";
        await request(app).patch(`/alerts/${alert.id}/cancel`).set(floor).send({ reason: "test" });
        process.env.APP_ENV = "production";

    }

});

test("without GOOGLE_CHAT_NEAR_MISS_WEBHOOK a NEAR MISS falls back to the ANDON Chat space (never Telegram: nothing to acknowledge)", async () => {

    delete process.env.GOOGLE_CHAT_NEAR_MISS_WEBHOOK;

    const alert = await raiseQuietly("NEAR_MISS");

    await notifyCreated(alert);

    assert.deepEqual(chat(), [`chat:${ANDON_CHAT}`]);
    assert.deepEqual(telegram(), []);
    assert.ok(console.warn.mock.calls.some(c => /GOOGLE_CHAT_NEAR_MISS_WEBHOOK not set/.test(c.arguments[0])));

});

test("a NEAR MISS raised before routing was on keeps its Telegram message up to date", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    statements.saveTelegramMessageId.run(321, Date.now(), alert.id);

    await notifyAcknowledged(statements.getAlert.get(alert.id));

    assert.deepEqual(chat(), [`chat:${NEAR_MISS_CHAT}`]);
    assert.deepEqual(telegram(), ["telegram:editMessageText"]);

});
