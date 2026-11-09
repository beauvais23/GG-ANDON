//------------------------------------------------------
// Slack S5: cut-over. Slack is the alert channel.
//
// An alert posted in Slack gets every update in Slack only (no
// Telegram, no Google Chat). Slack off or failed → Telegram +
// Chat as the backup, with a log warning. An alert from the
// parallel run (has a Telegram message) keeps its Telegram and
// Chat updates. Near misses, BOM requests and the backup
// warning follow the same rule. Telegram and Chat senders are
// replaced; Slack is faked (axios.post); no network.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

// Telegram / Google Chat senders recorded instead of sent. Put in
// place before the app loads (the notification code keeps the
// functions it loaded).
const legacy = [];

const telegram = require("../services/telegram");
const googleChat = require("../services/googleChat");

telegram.sendTelegram = async (alert, event) => { legacy.push(`telegram:${event}:${alert.id}`); return 900 + alert.id; };
googleChat.sendGoogleChatCard = async (alert, event, webhook) => { legacy.push(`chat:${event}:${alert.id}${webhook ? ":nearmiss" : ""}`); };

const updatePath = require.resolve("../services/telegramUpdate");

require.cache[updatePath] = {
    id: updatePath, filename: updatePath, loaded: true,
    exports: { updateTelegram: async alert => { legacy.push(`telegram:update:${alert.id}`); } }
};

const { loadApp } = require("./helpers");

const { app } = loadApp();

const { db } = require("../database");
const { createQbBom } = require("../services/qbBom");

mock.method(console, "log", () => {});

const warnings = [];

mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
mock.method(console, "error", () => {});

const slack = [];
const chatPosts = [];
let failWith = null;

axios.post = async (url, body) => {

    if (!url.startsWith("https://slack.com/api/")) {

        chatPosts.push({ url, body });
        return { status: 200, data: {} };

    }

    slack.push({ method: url.split("/").pop(), body });

    if (failWith)
        return { status: 200, data: { ok: false, error: failWith } };

    return { status: 200, data: { ok: true, channel: body.channel, ts: `${Date.now()}.${slack.length}` } };

};

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

const settle = () => new Promise(r => setTimeout(r, 80));

function production() {

    process.env.APP_ENV = "production";
    process.env.SLACK_BOT_TOKEN = "xoxb-prod-test";
    process.env.SLACK_CHANNEL_ANDON = "C_ANDON";
    process.env.SLACK_CHANNEL_NEAR_MISS = "C_NEARMISS";
    process.env.SLACK_CHANNEL_BOM = "C_BOM";
    process.env.SLACK_CHANNEL_SYSTEM = "C_SYSTEM";
    process.env.GOOGLE_CHAT_NEAR_MISS_WEBHOOK = "https://chat.test/nearmiss";

}

let floor;
const LINE = "Team A";
const WC = "S5 Station";

before(async () => {

    const login = async (username, password) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });
    const admin = await login("test_admin", "test-admin-pw");

    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const line = (lines.body.data || lines.body).find(l => l.name === LINE);

    await request(app).post("/work-centers").set(admin).send({ name: WC, production_line_id: line.id, facility: "Malta", display_order: 1, active: 1 });
    await request(app).post("/response-team").set(admin).send({ name: "Lead One", department: "Operations" }).expect(201);

});

const raise = async type => (await request(app).post("/alerts").set(floor).send({ productionLine: LINE, workCenter: WC, type }).expect(200)).body.alert.id;
const row = id => db.prepare("SELECT * FROM alerts WHERE id = ?").get(id);

function reset() {

    production();
    legacy.length = 0;
    slack.length = 0;
    chatPosts.length = 0;
    warnings.length = 0;
    failWith = null;

}

test("Slack set up: new alert → Slack only; acknowledge / resolve → Slack only; no Telegram, no Google Chat", async () => {

    reset();

    const id = await raise("QUALITY");

    await waitFor(() => row(id).slack_ts);
    await settle();

    assert.equal(slack.filter(c => c.method === "chat.postMessage").length, 1);
    assert.deepEqual(legacy, []);
    assert.equal(row(id).telegram_message_id, null);

    await request(app).patch(`/alerts/${id}/acknowledge`).set(floor).send({ acknowledgedBy: "Lead One" }).expect(200);
    await waitFor(() => slack.some(c => c.method === "chat.update"));
    await request(app).patch(`/alerts/${id}/resolve`).set(floor).send({ resolvedBy: "Lead One", resolutionNotes: "Fixed" }).expect(200);
    await waitFor(() => slack.filter(c => c.method === "chat.update").length >= 2);
    await settle();

    assert.deepEqual(legacy, [], "nothing to Telegram or Chat");
    assert.equal(warnings.filter(w => /not in Slack/.test(w)).length, 0);

});

test("Slack fails on a new alert → Telegram + Chat backup, warning logged; its updates keep going to Telegram + Chat", async () => {

    reset();
    failWith = "channel_not_found";

    const id = await raise("MAINTENANCE");

    await waitFor(() => legacy.includes(`telegram:CREATED:${id}`));

    assert.ok(legacy.includes(`chat:CREATED:${id}`));
    assert.equal(row(id).slack_ts, null);
    assert.ok(row(id).telegram_message_id, "Telegram message ID saved");
    assert.ok(warnings.some(w => new RegExp(`Alert #${id} .*not in Slack`).test(w)));

    failWith = null;
    legacy.length = 0;

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({ reason: "Test", cancelledBy: "Lead One" }).expect(200);
    await waitFor(() => legacy.length >= 2);

    assert.ok(legacy.includes(`chat:CANCELLED:${id}`));
    assert.ok(legacy.includes(`telegram:update:${id}`));

});

test("parallel-run alert (in Slack and Telegram) → updates go to Slack and Telegram + Chat until it closes", async () => {

    reset();

    const id = await raise("MATERIAL");

    await waitFor(() => row(id).slack_ts);
    db.prepare("UPDATE alerts SET telegram_message_id = '77' WHERE id = ?").run(id);
    legacy.length = 0;

    await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({ reason: "Test", cancelledBy: "Lead One" }).expect(200);
    await waitFor(() => legacy.length >= 2 && slack.some(c => c.method === "chat.update"));

    assert.ok(legacy.includes(`chat:CANCELLED:${id}`));
    assert.ok(legacy.includes(`telegram:update:${id}`));

});

test("near miss: Slack #safety-near-miss only (no Near Miss Chat space); Slack failure → the Chat space as backup", async () => {

    reset();

    const id = await raise("NEAR_MISS");

    await waitFor(() => row(id).slack_ts);
    await settle();

    assert.equal(slack[0].body.channel, "C_NEARMISS");
    assert.deepEqual(legacy, []);

    failWith = "not_in_channel";

    const bad = await raise("NEAR_MISS");

    await waitFor(() => legacy.length >= 1);

    assert.deepEqual(legacy, [`chat:REPORTED:${bad}:nearmiss`], "Chat space, never Telegram");

});

test("Slack not set up in production → Telegram + Chat as before", async () => {

    reset();
    delete process.env.SLACK_CHANNEL_ANDON;

    const id = await raise("SUPERVISOR");

    await waitFor(() => legacy.length >= 2);

    assert.deepEqual(legacy.sort(), [`chat:CREATED:${id}`, `telegram:CREATED:${id}`].sort());
    assert.equal(slack.length, 0);

});

test("BOM request: Slack #bom-changes only; Slack off → the BOM Chat space", async () => {

    reset();
    process.env.GOOGLE_CHAT_BOM_WEBHOOK = "https://chat.test/bom";

    const ins = db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand) VALUES (?, ?, ?, ?, 1, 0)");

    ins.run("KIT-5", "InventoryAssembly", "Kit five", "");
    ins.run("20-555-A", "Inventory", "Bolt", "ea");
    ins.run("20-556-A", "Inventory", "Nut", "ea");
    db.prepare("INSERT INTO qb_sync_log (kind, started_at, finished_at, ok, rows) VALUES ('items', ?, ?, 1, 3)").run(Date.now(), Date.now());
    db.prepare("INSERT OR REPLACE INTO qb_bom_lines (assembly, line, component, qty, uom) VALUES ('KIT-5', 1, '20-555-A', 4, 'ea')").run();
    db.prepare("INSERT OR REPLACE INTO qb_bom_lines (assembly, line, component, qty, uom) VALUES ('KIT-5', 2, '20-556-A', 2, 'ea')").run();
    db.prepare("INSERT OR REPLACE INTO qb_bom_fetched (assembly, fetched_at) VALUES ('KIT-5', ?)").run(Date.now());

    const send = async (line, component) => (await request(app).post("/bom/requests").set(floor)
        .send({ sku: "KIT-5", reason: "Correction", requestedBy: "Tester", lines: [{ action: "CHANGE_QTY", line, component, newQty: 9 }] }).expect(201)).body.request.code;

    const code = await send(1, "20-555-A");

    await waitFor(() => db.prepare("SELECT slack_ts FROM bom_requests WHERE code = ?").get(code).slack_ts);
    await request(app).post(`/bom/requests/${code}/done`).set(floor).send({ by: "QB Editor" }).expect(200);
    await waitFor(() => slack.some(c => c.method === "chat.update"));
    await settle();

    assert.equal(chatPosts.length, 0, "no Chat card or reply");

    delete process.env.SLACK_CHANNEL_BOM;

    const off = await send(2, "20-556-A");

    await waitFor(() => chatPosts.length >= 1);

    assert.match(chatPosts[0].url, /^https:\/\/chat.test\/bom\?threadKey=/);
    assert.ok(db.prepare("SELECT chat_sent_at FROM bom_requests WHERE code = ?").get(off).chat_sent_at);

    delete process.env.GOOGLE_CHAT_BOM_WEBHOOK;

});

test("system warning (QuickBooks): #mos-system in Slack", async () => {

    reset();

    const qb = createQbBom({ db, query: async () => [], now: () => Date.parse("2026-11-12T15:00:00Z") });

    qb.warnSystem("S5 check");
    await waitFor(() => slack.length >= 1);

    assert.equal(slack[0].body.channel, "C_SYSTEM");
    assert.equal(chatPosts.length, 0);

});
