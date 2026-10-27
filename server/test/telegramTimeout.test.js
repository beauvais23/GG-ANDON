const { test, after } = require("node:test");
const assert = require("node:assert/strict");

// telegram.js reads its token at load time, so set up before requiring it.
// Dummy values; the real API is never called (fetch is replaced below).
process.env.APP_ENV = "production";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_CHAT_ID = "1";
process.env.NOTIFY_TIMEOUT_MS = "300";

const realFetch = global.fetch;
let sawSignal = false;

// A Telegram API that never answers; honours the abort signal.
global.fetch = (url, options) => new Promise((resolve, reject) => {

    sawSignal = Boolean(options && options.signal);

    options.signal.addEventListener("abort", () => reject(options.signal.reason));

});

const { sendTelegram } = require("../services/telegram");

// AbortSignal.timeout() does not keep Node alive by itself; the running
// server does in production. Keep this test process alive the same way.
const keepAlive = setInterval(() => {}, 1000);

after(() => {
    global.fetch = realFetch;
    clearInterval(keepAlive);
});

test("sendTelegram gives up after NOTIFY_TIMEOUT_MS instead of hanging", async () => {

    const started = Date.now();

    const result = await sendTelegram(
        { id: 1, type: "QUALITY", production_line: "Team A", work_center: "Assembly", requested: Date.now(), status: "ACTIVE" },
        "CREATED"
    );

    const ms = Date.now() - started;

    assert.equal(result, null);
    assert.equal(sawSignal, true);
    assert.ok(ms >= 250 && ms < 1500, `took ${ms} ms`);

});
