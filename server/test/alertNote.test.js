//------------------------------------------------------
// Resolution notes for Telegram resolves (defect #14b)
//
// The ANDON Telegram is a channel: nobody can reply to
// the bot, so a Telegram resolve saves "Resolved from
// Telegram" and the real note is added in the app.
// axios.post is stubbed; nothing leaves the process.
//------------------------------------------------------

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

// Quiet: the server logs every request and notification.
mock.method(console, "log", () => {});

const LINE = "Team A";
const WORK_CENTER = "Note Station";
const WEBHOOK_SECRET = "test-webhook-secret";
const RESOLVER = { id: 42, first_name: "Tele", last_name: "Gram" };
const RESOLVER_NAME = "Tele Gram";

const realAxiosPost = axios.post;

let floor;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

async function raiseAndAck(type) {

    const raised = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type });

    const id = raised.body.alert.id;

    await request(app).patch(`/alerts/${id}/acknowledge`).set(floor)
        .send({ acknowledgedBy: RESOLVER_NAME });

    return id;

}

async function telegramResolve(id) {

    process.env.APP_ENV = "production";

    try {

        const res = await request(app)
            .post("/telegram/webhook")
            .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
            .send({ callback_query: { id: `cb-${id}`, data: `resolve_${id}`, from: RESOLVER } });

        assert.equal(res.status, 200);

    } finally {

        process.env.APP_ENV = "test";

    }

}

const needsNote = async () =>
    (await request(app).get("/alerts/needs-note").set(floor)).body.map(a => a.id);

const addNote = (id, body) =>
    request(app).patch(`/alerts/${id}/note`).set(floor).send(body);

const noteOf = async id =>
    (await request(app).get("/alerts").set(floor)).body.find(a => a.id === id).resolution_notes;

before(async () => {

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    axios.post = async () => ({ data: { ok: true } });

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin)
        .send({ name: WORK_CENTER, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    await request(app).post("/response-team").set(admin)
        .send({ name: RESOLVER_NAME, department: "Operations" });

});

after(() => {

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    axios.post = realAxiosPost;

});

test("a Telegram resolve is listed as needing a note, newest first; a web resolve is not", async () => {

    const older = await raiseAndAck("QUALITY");
    await telegramResolve(older);

    const newer = await raiseAndAck("SAFETY");
    await telegramResolve(newer);

    const web = await raiseAndAck("MATERIAL");
    await request(app).patch(`/alerts/${web}/resolve`).set(floor)
        .send({ resolvedBy: RESOLVER_NAME, resolutionNotes: "Re-seated the cable" });

    const list = await needsNote();

    assert.ok(list.indexOf(newer) < list.indexOf(older), "newest first");
    assert.ok(list.includes(older) && !list.includes(web));

});

test("adding the note saves it, removes the alert from the list, and a second note is refused", async () => {

    const id = await raiseAndAck("MAINTENANCE");
    await telegramResolve(id);

    const res = await addNote(id, { note: "  Replaced the blown fuse  ", addedBy: RESOLVER_NAME });

    assert.equal(res.status, 200, res.text);
    assert.equal(await noteOf(id), "Replaced the blown fuse");
    assert.ok(!(await needsNote()).includes(id));

    const again = await addNote(id, { note: "Actually the relay", addedBy: RESOLVER_NAME });

    assert.equal(again.status, 409);
    assert.equal(await noteOf(id), "Replaced the blown fuse");

});

test("a note added by someone else carries their name", async () => {

    const id = await raiseAndAck("SUPERVISOR");
    await telegramResolve(id);

    await addNote(id, { note: "Pulled stock from Line B", addedBy: "Other Lead" });

    assert.equal(await noteOf(id), "Pulled stock from Line B (note by Other Lead)");

});

test("blank, missing or over-500 notes are a 400; unknown alert 404; web-resolved, open or cancelled 409", async () => {

    const id = await raiseAndAck("QUALITY");
    await telegramResolve(id);

    for (const body of [{}, { note: "" }, { note: "   " }, { note: 5 }, { note: "x".repeat(501) }]) {

        assert.equal((await addNote(id, body)).status, 400, JSON.stringify(body));

    }

    assert.equal(await noteOf(id), "Resolved from Telegram");
    assert.equal((await addNote(999999, { note: "x" })).status, 404);

    const web = await raiseAndAck("SAFETY");
    await request(app).patch(`/alerts/${web}/resolve`).set(floor)
        .send({ resolvedBy: RESOLVER_NAME, resolutionNotes: "Fixed on the web" });

    assert.equal((await addNote(web, { note: "overwrite?" })).status, 409);
    assert.equal(await noteOf(web), "Fixed on the web");

    const open = await raiseAndAck("MATERIAL");

    assert.equal((await addNote(open, { note: "too early" })).status, 409);

    await request(app).patch(`/alerts/${open}/cancel`).set(floor);

    assert.equal((await addNote(open, { note: "cancelled" })).status, 409);

});

test("the Telegram channel is no longer sent a reply prompt", async () => {

    const sent = [];

    axios.post = async (url, body) => { sent.push({ url, body }); return { data: { ok: true } }; };
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    process.env.TELEGRAM_CHAT_ID = "-100777";

    try {

        const id = await raiseAndAck("QUALITY");
        await telegramResolve(id);
        await new Promise(r => setTimeout(r, 100));

        assert.ok(!sent.some(c => c.url.endsWith("/sendMessage")), "no sendMessage");
        assert.ok(!sent.some(c => c.body?.reply_markup?.force_reply), "no force_reply");

    } finally {

        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;
        axios.post = async () => ({ data: { ok: true } });

    }

});
