//------------------------------------------------------
// Telegram resolution notes (defect #14b)
//
// After a Telegram Resolve the bot asks the resolver what
// fixed it; the first text reply replaces "Resolved from
// Telegram". axios.post is stubbed, so nothing leaves the
// process; the bot token and chat id are dummies.
//------------------------------------------------------

const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

// Quiet: the server logs every request and notification.
mock.method(console, "log", () => {});

const LINE = "Team A";
const WORK_CENTER = "Note Station";
const CHAT_ID = "-100777";
const WEBHOOK_SECRET = "test-webhook-secret";
const RESOLVER = { id: 42, first_name: "Tele", last_name: "Gram", is_bot: false };
const RESOLVER_NAME = "Tele Gram";
const OTHER = { id: 43, first_name: "Other", is_bot: false };
const BOT = { id: 1, first_name: "ANDON bot", is_bot: true };

const realAxiosPost = axios.post;

let floor;
let sent;       // sendMessage bodies
let nextMessageId = 1000;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

async function getAlert(id) {

    const res = await request(app).get("/alerts").set(floor);

    return (res.body.data || res.body.alerts || res.body).find(a => a.id === id);

}

// Notifications run in the background; wait for them.
async function waitFor(check, what) {

    for (let i = 0; i < 100; i++) {

        const value = check();

        if (value) return value;

        await new Promise(r => setTimeout(r, 10));

    }

    assert.fail(`timed out waiting for ${what}`);

}

async function webhook(body) {

    process.env.APP_ENV = "production";

    try {

        const res = await request(app)
            .post("/telegram/webhook")
            .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
            .send(body);

        assert.equal(res.status, 200, res.text);

    } finally {

        process.env.APP_ENV = "test";

    }

}

// Raise, acknowledge on the web, resolve from Telegram.
// Returns the alert id and the note prompt the bot sent.
async function resolveFromTelegram(type) {

    const raised = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type });

    const id = raised.body.alert.id;

    await request(app)
        .patch(`/alerts/${id}/acknowledge`)
        .set(floor)
        .send({ acknowledgedBy: RESOLVER_NAME });

    // Notifications only run in production.
    process.env.APP_ENV = "production";

    try {

        await webhook({ callback_query: { id: `cb-${id}`, data: `resolve_${id}`, from: RESOLVER } });

    } finally {

        process.env.APP_ENV = "test";

    }

    const prompt = await waitFor(
        () => sent.find(m => m.reply_markup?.force_reply && m.text.includes(`#${id}?`)),
        `note prompt for #${id}`
    );

    return { id, prompt };

}

// What Telegram posts when someone replies to the prompt.
// Telegram returns the prompt as plain text (no HTML).
function reply(prompt, text, from = RESOLVER, extra = {}) {

    return {
        message: {
            message_id: nextMessageId++,
            from,
            chat: { id: Number(CHAT_ID) },
            text,
            reply_to_message: {
                message_id: 900,
                from: BOT,
                chat: { id: Number(CHAT_ID) },
                text: prompt.text.replace(/<[^>]+>/g, "")
            },
            ...extra
        }
    };

}

function answerTo(message) {

    return sent.find(m => m.reply_to_message_id === message.message_id);

}

before(async () => {

    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    process.env.TELEGRAM_CHAT_ID = CHAT_ID;

    axios.post = async (url, body) => {

        if (url.endsWith("/sendMessage")) sent.push(body);

        return { data: { ok: true, result: { message_id: nextMessageId++ } } };

    };

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin)
        .send({ name: WORK_CENTER, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });

    await request(app).post("/response-team").set(admin)
        .send({ name: RESOLVER_NAME, department: "Operations" });

});

beforeEach(() => { sent = []; });

after(() => {

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    axios.post = realAxiosPost;

});

test("Telegram resolve asks the resolver, by mention, what fixed it", async () => {

    const { id, prompt } = await resolveFromTelegram("QUALITY");

    assert.equal(prompt.chat_id, CHAT_ID);
    assert.equal(prompt.parse_mode, "HTML");
    assert.deepEqual(prompt.reply_markup, {
        force_reply: true,
        selective: true,
        input_field_placeholder: "What fixed it?"
    });
    assert.match(prompt.text, /<a href="tg:\/\/user\?id=42">Tele Gram<\/a>, what fixed alert #\d+\?/);
    assert.match(prompt.text, /QUALITY · Team A · Note Station/);

    const alert = await getAlert(id);

    assert.equal(alert.status, "RESOLVED");
    assert.equal(alert.resolution_notes, "Resolved from Telegram");

});

test("the resolver's reply becomes the note; a second reply changes nothing", async () => {

    const { id, prompt } = await resolveFromTelegram("MAINTENANCE");

    const first = reply(prompt, "  Replaced the blown fuse on the conveyor  ");
    await webhook(first);

    const ok = await waitFor(() => answerTo(first.message), "save confirmation");

    assert.equal(ok.text, `✔ Note saved on alert #${id}.`);
    assert.equal((await getAlert(id)).resolution_notes, "Replaced the blown fuse on the conveyor");

    const second = reply(prompt, "Actually it was the relay");
    await webhook(second);

    const no = await waitFor(() => answerTo(second.message), "already-noted answer");

    assert.equal(no.text, `Alert #${id} already has a note. Nothing changed.`);
    assert.equal((await getAlert(id)).resolution_notes, "Replaced the blown fuse on the conveyor");

});

test("a reply from someone else is saved with their name", async () => {

    const { id, prompt } = await resolveFromTelegram("MATERIAL");

    await webhook(reply(prompt, "Pulled parts from Line B stock", OTHER));

    await waitFor(() => sent.find(m => m.text === `✔ Note saved on alert #${id}.`), "confirmation");

    assert.equal((await getAlert(id)).resolution_notes, "Pulled parts from Line B stock (note by Other)");

});

test("no text, or over 500 characters: not saved, and the reply says why", async () => {

    const { id, prompt } = await resolveFromTelegram("SAFETY");

    const photo = reply(prompt, undefined, RESOLVER, { photo: [{ file_id: "x" }] });
    await webhook(photo);

    assert.match((await waitFor(() => answerTo(photo.message), "photo answer")).text, /reply with text/);

    const long = reply(prompt, "x".repeat(501));
    await webhook(long);

    assert.match((await waitFor(() => answerTo(long.message), "long answer")).text, /501 characters, the limit is 500/);
    assert.equal((await getAlert(id)).resolution_notes, "Resolved from Telegram");

    // Still open for a proper reply.
    await webhook(reply(prompt, "Cleaned the spill"));
    await waitFor(() => sent.find(m => m.text === `✔ Note saved on alert #${id}.`), "confirmation");

    assert.equal((await getAlert(id)).resolution_notes, "Cleaned the spill");

});

test("a web resolve's note is never overwritten by a Telegram reply", async () => {

    const { prompt } = await resolveFromTelegram("SUPERVISOR");

    const raised = await request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type: "QUALITY" });

    const id = raised.body.alert.id;

    await request(app).patch(`/alerts/${id}/acknowledge`).set(floor).send({ acknowledgedBy: RESOLVER_NAME });
    await request(app).patch(`/alerts/${id}/resolve`).set(floor)
        .send({ resolvedBy: RESOLVER_NAME, resolutionNotes: "Re-seated the cable" });

    const forged = reply({ text: prompt.text.replace(/#\d+\?/, `#${id}?`) }, "Something else");
    await webhook(forged);

    assert.match((await waitFor(() => answerTo(forged.message), "answer")).text, /already has a note/);
    assert.equal((await getAlert(id)).resolution_notes, "Re-seated the cable");

});

test("ignored: other chats, replies to people, other bot messages, messages from bots", async () => {

    const { id, prompt } = await resolveFromTelegram("QUALITY");

    const cases = [
        reply(prompt, "wrong chat", RESOLVER, { chat: { id: -100999 } }),
        { message: { ...reply(prompt, "to a person").message, reply_to_message: { from: OTHER, text: prompt.text } } },
        { message: { ...reply(prompt, "other bot text").message, reply_to_message: { from: BOT, text: "Daily summary" } } },
        reply(prompt, "bot talking", BOT),
        { message: { message_id: 1, from: RESOLVER, chat: { id: Number(CHAT_ID) }, text: "no reply at all" } }
    ];

    sent = [];

    for (const body of cases) await webhook(body);

    await new Promise(r => setTimeout(r, 100));

    assert.deepEqual(sent, []);
    assert.equal((await getAlert(id)).resolution_notes, "Resolved from Telegram");

});
