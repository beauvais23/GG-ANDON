//------------------------------------------------------
// Telegram button presses (defects #23, #24).
// Each press must get exactly one answer with the right
// text, and the webhook must always return 200.
//------------------------------------------------------

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

const LINE = "Team A";
const WORK_CENTER = "Telegram Station";
const RESPONDER = "Web Responder";
const TELEGRAM_USER = { first_name: "Tele", last_name: "Gram" };
const TELEGRAM_NAME = "Tele Gram";
const WEBHOOK_SECRET = "test-webhook-secret";

const realAxiosPost = axios.post;

let floor;
let answers;
let telegramDown;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

async function raise(type) {

    const res = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type });

    assert.equal(res.status, 200, `raise ${type}`);

    return res.body.alert.id;

}

async function webAck(id, by = RESPONDER) {

    const res = await request(app)
        .patch(`/alerts/${id}/acknowledge`)
        .set(floor)
        .send({ acknowledgedBy: by });

    assert.equal(res.status, 200);

}

async function getAlert(id) {

    const res = await request(app).get("/alerts").set(floor);
    const list = res.body.data || res.body.alerts || res.body;

    return list.find(a => a.id === id);

}

// Press a Telegram button. Only answerCallbackQuery calls are
// recorded; nothing leaves the process (no bot token is set and
// axios.post is stubbed).
async function press(data) {

    process.env.APP_ENV = "production";

    try {

        const res = await request(app)
            .post("/telegram/webhook")
            .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
            .send({ callback_query: { id: `cb-${data}`, data, from: TELEGRAM_USER } });

        assert.equal(res.status, 200, res.text);

        return answers.filter(a => a.callback_query_id === `cb-${data}`);

    } finally {

        process.env.APP_ENV = "test";

    }

}

before(async () => {

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;

    axios.post = async (url, body) => {

        if (url.endsWith("/answerCallbackQuery")) {

            if (telegramDown)
                throw new Error("Telegram unreachable");

            answers.push(body);

        }

        return { data: { ok: true } };

    };

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin)
        .send({ name: WORK_CENTER, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    for (const name of [RESPONDER, TELEGRAM_NAME]) {

        await request(app).post("/response-team").set(admin)
            .send({ name, department: "Operations" });

    }

});

beforeEach(() => {

    answers = [];
    telegramDown = false;

});

after(() => {

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    axios.post = realAxiosPost;

});

test("#24 resolve: one answer, 'Resolved ✔' (not 'Acknowledged ✔')", async () => {

    const id = await raise("QUALITY");
    await webAck(id);

    const got = await press(`resolve_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, "Resolved ✔");
    assert.equal((await getAlert(id)).status, "RESOLVED");

});

test("acknowledge: one answer, 'Acknowledged ✔'", async () => {

    const id = await raise("SAFETY");

    const got = await press(`ack_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, "Acknowledged ✔");

    const alert = await getAlert(id);

    assert.equal(alert.status, "ACKNOWLEDGED");
    assert.equal(alert.assigned_to, TELEGRAM_NAME);

    await press(`resolve_${id}`);

});

test("acknowledge race: the loser gets one pop-up naming who has it", async () => {

    const id = await raise("MATERIAL");
    await webAck(id);

    const got = await press(`ack_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, `Already acknowledged by ${RESPONDER}.`);
    assert.equal(got[0].show_alert, true);

    await press(`resolve_${id}`);

});

test("#23 resolve or acknowledge of an alert that doesn't exist: 200 and 'not found'", async () => {

    for (const data of ["resolve_999999", "ack_999999", "resolve_abc"]) {

        const got = await press(data);

        assert.equal(got.length, 1, data);
        assert.match(got[0].text, /was not found/, data);

    }

});

test("resolve twice: second press says who resolved it", async () => {

    const id = await raise("MAINTENANCE");
    await webAck(id);

    await press(`resolve_${id}`);

    answers = [];

    const got = await press(`resolve_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, `Already resolved by ${TELEGRAM_NAME}.`);

});

test("resolve on a cancelled alert says it was cancelled", async () => {

    const id = await raise("SUPERVISOR");
    await webAck(id);

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({});

    const got = await press(`resolve_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, "This alert was cancelled.");

});

test("resolve on an alert nobody acknowledged asks for the acknowledge first", async () => {

    const id = await raise("QUALITY");

    const got = await press(`resolve_${id}`);

    assert.equal(got.length, 1);
    assert.equal(got[0].text, "Acknowledge this alert before resolving it.");
    assert.equal((await getAlert(id)).status, "ACTIVE");

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({});

});

test("the '✅ RESOLVED' button only stops the spinner, no 'Acknowledged ✔'", async () => {

    const got = await press("resolved");

    assert.equal(got.length, 1);
    assert.equal(got[0].text, "This alert is already resolved.");

});

test("Telegram unreachable when answering: still 200, alert still resolved", async () => {

    const id = await raise("SAFETY");
    await webAck(id);

    telegramDown = true;

    const got = await press(`resolve_${id}`);

    assert.equal(got.length, 0);
    assert.equal((await getAlert(id)).status, "RESOLVED");

});
