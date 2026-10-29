//------------------------------------------------------
// Downtime and Near Miss alert types (Option B)
//
// Both can be raised; unknown types are refused; the
// notifications read "NEAR MISS ALERT" with an icon (the
// Telegram text had no fallback icon). Google Chat is
// captured from a stubbed axios.post; nothing leaves the
// process.
//------------------------------------------------------

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { app } = require("./helpers").loadApp();

mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

const { buildMessage } = require("../services/telegram");
const { sendGoogleChatCard } = require("../services/googleChat");

const realPost = axios.post;

let floor;

before(async () => {

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === "Team A");

    await request(app).post("/work-centers").set(admin)
        .send({ name: "Assembly", production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

});

after(() => {

    axios.post = realPost;
    process.env.APP_ENV = "test";
    delete process.env.GOOGLE_CHAT_WEBHOOK;

});

const raise = type =>
    request(app).post("/alerts").set(floor).send({ productionLine: "Team A", workCenter: "Assembly", type });

test("DOWNTIME and NEAR_MISS can be raised like the original five", async () => {

    for (const type of ["DOWNTIME", "NEAR_MISS"]) {

        const res = await raise(type);

        assert.equal(res.status, 200, res.text);
        assert.equal(res.body.alert.type, type);

    }

});

test("an unknown type is refused with the list of valid types", async () => {

    for (const type of ["FIRE", "near_miss", "QUALITY ", "<b>x</b>"]) {

        const res = await raise(type);

        assert.equal(res.status, 400, type);
        assert.match(res.body.message, /Unknown alert type/);
        assert.match(res.body.message, /DOWNTIME, NEAR_MISS/);

    }

});

const nearMiss = {
    id: 9,
    type: "NEAR_MISS",
    status: "ACTIVE",
    production_line: "Team A",
    work_center: "Assembly",
    requested: Date.parse("2026-10-29T14:00:00Z")
};

test("Telegram: NEAR MISS ALERT with its icon; Downtime has its own icon", () => {

    const text = buildMessage(nearMiss, "CREATED");

    assert.match(text, /⚠️ NEAR MISS ALERT/);
    assert.doesNotMatch(text, /undefined|NEAR_MISS/);

    assert.match(buildMessage({ ...nearMiss, type: "DOWNTIME" }, "CREATED"), /🟪 DOWNTIME ALERT/);

});

test("Google Chat: the card header reads NEAR MISS ALERT", async () => {

    const posts = [];

    process.env.APP_ENV = "production";
    process.env.GOOGLE_CHAT_WEBHOOK = "https://chat.test/hook";
    axios.post = async (url, body) => { posts.push(body); return { data: {} }; };

    await sendGoogleChatCard(nearMiss, "CREATED");

    const card = JSON.stringify(posts[0]);

    assert.match(card, /NEAR MISS ALERT/);
    assert.doesNotMatch(card, /NEAR_MISS ALERT/);

});
