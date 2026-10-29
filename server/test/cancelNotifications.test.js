//------------------------------------------------------
// Cancelled alerts read as cancelled, not resolved (#19)
//
// Telegram text is built locally; the Google Chat card is
// captured from a stubbed axios.post (APP_ENV=production,
// dummy webhook), so nothing leaves the process.
//------------------------------------------------------

const { test, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

require("./helpers").loadApp();

mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

const { buildMessage } = require("../services/telegram");
const { sendGoogleChatCard } = require("../services/googleChat");

const realPost = axios.post;

after(() => {
    axios.post = realPost;
    process.env.APP_ENV = "test";
    delete process.env.GOOGLE_CHAT_WEBHOOK;
});

const cancelled = {
    id: 7,
    type: "QUALITY",
    status: "CANCELLED",
    production_line: "Gigabay",
    work_center: "Final Test",
    requested: Date.parse("2026-10-29T14:00:00Z"),
    acknowledged: Date.parse("2026-10-29T14:01:00Z"),
    acknowledged_by: "Test Lead",
    assigned_to: "Test Lead",
    resolved: null,
    cancelled_at: Date.parse("2026-10-29T14:03:30Z"),
    resolution_notes: "Cancelled by Test Lead: Smoke test"
};

test("Telegram: cancelled alert shows a Cancelled time and a cancel reason, never Resolved", () => {

    const text = buildMessage(cancelled, "CANCELLED");

    assert.match(text, /CANCELLED/);
    assert.match(text, /Cancelled \.+ <b>/);
    assert.match(text, /CANCEL REASON/);
    assert.match(text, /Smoke test/);
    assert.doesNotMatch(text, /Resolved \.+/);
    assert.doesNotMatch(text, /RESOLUTION/);

});

test("Telegram: a resolved alert is unchanged (Resolved time, RESOLUTION, no Cancelled line)", () => {

    const resolved = {
        ...cancelled,
        status: "RESOLVED",
        resolved: cancelled.cancelled_at,
        cancelled_at: null,
        resolved_by: "Test Lead",
        resolution_notes: "Replaced fixture"
    };

    const text = buildMessage(resolved, "RESOLVED");

    assert.match(text, /Resolved \.+ <b>/);
    assert.match(text, /RESOLUTION/);
    assert.doesNotMatch(text, /Cancelled \.+/);

});

test("Google Chat: cancelled card has no Resolution row and labels the note as the cancel reason", async () => {

    process.env.APP_ENV = "production";
    process.env.GOOGLE_CHAT_WEBHOOK = "https://chat.test/hook";

    let payload;

    axios.post = async (url, body) => { payload = body; return { data: {} }; };

    await sendGoogleChatCard(cancelled, "CANCELLED");

    const json = JSON.stringify(payload);

    assert.ok(payload, "card was sent");
    assert.match(json, /Cancel reason/);
    assert.match(json, /Smoke test/);
    assert.doesNotMatch(json, /🏁/);          // the Resolution elapsed row
    assert.doesNotMatch(json, /"Resolution"/);

});
