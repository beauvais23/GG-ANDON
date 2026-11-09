//------------------------------------------------------
// Near Miss routing (Director, Oct 30 2026; Telegram groups
// Nov 9 2026, Google Chat removed)
//
// NEAR_MISS alerts go to the Near Miss Telegram group
// (TELEGRAM_NEAR_MISS_CHAT_ID), never the ANDON Telegram
// channel; the other types go to the ANDON channel. Nothing
// goes to Google Chat. fetch (Telegram) and axios.post are
// replaced; nothing leaves the process.
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

const NEAR_MISS_GROUP = "-100777";

const realFetch = global.fetch;
const realPost = axios.post;

let sent;
let other;

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
    other = [];

    global.fetch = async (url, opts) => {
        sent.push(`${url.split("/").pop()}:${JSON.parse(opts.body).chat_id}`);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 500 } }));
    };

    axios.post = async url => {
        other.push(url);
        return { data: {} };
    };

    process.env.APP_ENV = "production";
    process.env.TELEGRAM_NEAR_MISS_CHAT_ID = NEAR_MISS_GROUP;

});

after(() => {

    global.fetch = realFetch;
    axios.post = realPost;
    process.env.APP_ENV = "test";
    delete process.env.TELEGRAM_NEAR_MISS_CHAT_ID;
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

test("a new NEAR MISS posts only to the Near Miss Telegram group (message ID saved), not the ANDON channel or Chat", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    await notifyCreated(alert);

    assert.deepEqual(sent, [`sendMessage:${NEAR_MISS_GROUP}`]);
    assert.deepEqual(other, [], "no Google Chat");

    const row = statements.getAlert.get(alert.id);

    assert.equal(row.telegram_message_id, null, "no ANDON channel message");
    assert.equal(row.telegram_group_message_id, "500");

});

test("undo / void of a NEAR MISS edits its Near Miss group message only", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    await notifyCreated(alert);
    sent = [];

    await notifyCancelled(statements.getAlert.get(alert.id));

    assert.deepEqual(sent, [`editMessageText:${NEAR_MISS_GROUP}`]);

});

test("the other six types go to the ANDON Telegram channel only; acknowledge edits that message; no Google Chat", async () => {

    for (const type of ["QUALITY", "MAINTENANCE", "MATERIAL", "SUPERVISOR", "SAFETY", "DOWNTIME"]) {

        const alert = await raiseQuietly(type);

        await notifyCreated(alert);

        assert.deepEqual(sent, ["sendMessage:1"], type);

        sent = [];
        await notifyAcknowledged(statements.getAlert.get(alert.id));

        assert.deepEqual(sent, ["editMessageText:1"], type);
        assert.deepEqual(other, [], type);

        // Close it so the next type isn't a duplicate on the station.
        process.env.APP_ENV = "test";
        await request(app).patch(`/alerts/${alert.id}/cancel`).set(floor).send({ reason: "test" });
        process.env.APP_ENV = "production";

    }

});

test("without TELEGRAM_NEAR_MISS_CHAT_ID a NEAR MISS is not sent to Telegram at all (never the ANDON channel), with a warning", async () => {

    delete process.env.TELEGRAM_NEAR_MISS_CHAT_ID;

    const alert = await raiseQuietly("NEAR_MISS");

    await notifyCreated(alert);

    assert.deepEqual(sent, []);
    assert.ok(console.warn.mock.calls.some(c => /TELEGRAM_NEAR_MISS_CHAT_ID not set/.test(c.arguments[0])));

});

test("a NEAR MISS raised before routing was on keeps its ANDON Telegram message up to date", async () => {

    const alert = await raiseQuietly("NEAR_MISS");

    statements.saveTelegramMessageId.run(321, Date.now(), alert.id);

    await notifyAcknowledged(statements.getAlert.get(alert.id));

    assert.deepEqual(sent, ["editMessageText:1"]);

});
