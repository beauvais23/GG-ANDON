//------------------------------------------------------
// Telegram connection failures (defect #27)
//
// Oct 29: alert #72 never reached Telegram. The connect
// failed after Node's 250 ms IPv4 attempt and the IPv6
// fallback was unreachable on Railway. IPv4 now gets 2 s,
// and the new-alert post retries once when the
// connection itself failed. fetch is replaced; nothing
// leaves the process.
//------------------------------------------------------

const { test, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const net = require("net");
const dns = require("dns");

// telegram.js reads its token at load time. Dummy values.
process.env.APP_ENV = "production";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_CHAT_ID = "1";

mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

const { sendTelegram } = require("../services/telegram");
const { isConnectError, CONNECT_ATTEMPT_MS } = require("../services/network");

const realFetch = global.fetch;

const ALERT = { id: 72, type: "QUALITY", production_line: "Gigabay - Vertical", work_center: "PCB Test", requested: Date.now(), status: "ACTIVE" };

// The error Node's fetch threw for alert #72 (Oct 29, 1:06 PM).
function connectFailure() {

    const aggregate = new AggregateError([
        Object.assign(new Error("connect ETIMEDOUT 149.154.166.110:443"), { code: "ETIMEDOUT" }),
        Object.assign(new Error("connect ENETUNREACH 2001:67c:4e8:f004::9:443"), { code: "ENETUNREACH" })
    ]);

    aggregate.code = "ETIMEDOUT";

    return new TypeError("fetch failed", { cause: aggregate });

}

const ok = id => new Response(JSON.stringify({ ok: true, result: { message_id: id } }));

let calls;

function fakeTelegram(...steps) {

    calls = 0;

    global.fetch = async () => {

        const step = steps[Math.min(calls++, steps.length - 1)];

        if (step instanceof Error) throw step;

        return step();

    };

}

beforeEach(() => { calls = 0; });

after(() => {

    global.fetch = realFetch;
    process.env.APP_ENV = "test";

});

test("IPv4 gets 2 s to connect and is tried first (was 250 ms, IPv6 first)", () => {

    assert.equal(CONNECT_ATTEMPT_MS, 2000);
    assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), 2000);
    assert.equal(dns.getDefaultResultOrder(), "ipv4first");

});

test("the server applies the network settings at startup", () => {

    const source = require("fs").readFileSync(require.resolve("../index"), "utf8");

    // Loaded right after dotenv, before any route or service sends anything.
    assert.match(source.split("\n").slice(0, 6).join("\n"), /require\("\.\/services\/network"\)/);

});

test("a failed connection is retried once and the alert is posted", async () => {

    fakeTelegram(connectFailure(), () => ok(258));

    assert.equal(await sendTelegram(ALERT, "CREATED", { retryDelayMs: 10 }), 258);
    assert.equal(calls, 2);

});

test("two failed connections: gives up after one retry (no loop)", async () => {

    fakeTelegram(connectFailure(), connectFailure());

    assert.equal(await sendTelegram(ALERT, "CREATED", { retryDelayMs: 10 }), null);
    assert.equal(calls, 2);

});

test("a time-out after connecting is not retried (Telegram may already have posted it)", async () => {

    fakeTelegram(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    assert.equal(await sendTelegram(ALERT, "CREATED", { retryDelayMs: 10 }), null);
    assert.equal(calls, 1);

});

test("a Telegram error answer (400) is not retried", async () => {

    fakeTelegram(() => new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request" })));

    assert.equal(await sendTelegram(ALERT, "CREATED", { retryDelayMs: 10 }), null);
    assert.equal(calls, 1);

});

test("isConnectError: connect-phase failures only", () => {

    // fetch (alert #72) and axios (Acknowledge pop-up, Oct 28 and 29) shapes.
    assert.equal(isConnectError(connectFailure()), true);
    assert.equal(isConnectError(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" })), true);
    assert.equal(isConnectError(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } })), true);

    assert.equal(isConnectError(new DOMException("timeout", "TimeoutError")), false);
    assert.equal(isConnectError(new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } })), false);
    assert.equal(isConnectError(new Error("Bad Request")), false);
    assert.equal(isConnectError(undefined), false);

});
