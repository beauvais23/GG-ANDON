const axios = require("axios");
const { supervisorUrl } = require("../config");
const { notificationsEnabled } = require("./appEnv");
const { notifyTimeoutMs } = require("./notificationQueue");
const { label } = require("./alertTypes");

//------------------------------------------------------
// Slack, S1–S2 (Nov 9 2026): andon alerts in #andon-alerts
//
// One message per alert (chat.postMessage), updated in place
// (chat.update) on acknowledge / resolve / cancel / note, with a
// short reply in its thread for each step. Runs beside Telegram
// and Google Chat (parallel run, 1 week). Near misses are not
// sent to Slack yet (S3).
// S2: Acknowledge / Resolve / Cancel buttons on open alerts, shown
// only when this environment's signing secret is set (presses are
// verified in routes/slack.js); Resolve and Cancel open a box.
//
// Bot tokens (Slack Web API, Bearer):
//   production: SLACK_BOT_TOKEN + SLACK_CHANNEL_ANDON, read only
//               when APP_ENV=production
//   anywhere else: SLACK_STAGING_BOT_TOKEN + SLACK_STAGING_CHANNEL
//               (a separate staging Slack app, invited only to
//               #mos-staging, so it cannot post to production
//               channels; hard rule 6)
// Tokens are never logged. Slack answers HTTP 200 with ok:false
// on errors; those are thrown with Slack's error code.
//------------------------------------------------------

const API = "https://slack.com/api";

// Signing secret of this environment's Slack app (verifies button
// presses). Without it the message has no buttons.
function signingSecret() {

    return (notificationsEnabled() ? process.env.SLACK_SIGNING_SECRET : process.env.SLACK_STAGING_SIGNING_SECRET) || null;

}

function slackConfig() {

    const cfg = notificationsEnabled()
        ? { token: process.env.SLACK_BOT_TOKEN, channel: process.env.SLACK_CHANNEL_ANDON }
        : { token: process.env.SLACK_STAGING_BOT_TOKEN, channel: process.env.SLACK_STAGING_CHANNEL };

    return cfg.token && cfg.channel ? cfg : null;

}

async function slackApi(method, body, token, post = axios.post) {

    let data;

    try {

        ({ data } = await post(`${API}/${method}`, body, {
            timeout: notifyTimeoutMs(),
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }
        }));

    }

    catch (err) {

        throw new Error(`Slack ${method} failed${err.response ? ` (HTTP ${err.response.status})` : ""}: ${err.code || err.message}`);

    }

    if (!data || data.ok !== true)
        throw new Error(`Slack ${method} failed: ${(data && data.error) || "no reply"}`);

    return data;

}

//------------------------------------------------------
// Message
//------------------------------------------------------

const ICONS = { QUALITY: "🔴", MAINTENANCE: "🟧", MATERIAL: "🟨", SUPERVISOR: "🟦", SAFETY: "🟩", DOWNTIME: "🟪", NEAR_MISS: "⚠️" };
const STATUS = { ACTIVE: "🚨 *ACTIVE*", ACKNOWLEDGED: "👷 *ACKNOWLEDGED*", RESOLVED: "✅ *RESOLVED*", CANCELLED: "✖️ *CANCELLED*" };

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const clock = ms => new Date(Number(ms)).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

function span(fromMs, toMs) {

    const min = Math.max(0, Math.round((toMs - fromMs) / 60000));

    return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

}

function endOf(alert) {

    if (alert.status === "RESOLVED")
        return alert.resolved;

    if (alert.status === "CANCELLED")
        return alert.cancelled_at || alert.updated_at;

    return null;

}

function summary(alert) {

    return `${ICONS[alert.type] || "⚪"} ${label(alert.type)} alert #${alert.id} · ${alert.production_line} / ${alert.work_center} · ${alert.status}`;

}

function alertBlocks(alert, now = Date.now()) {

    const end = endOf(alert);
    const fields = [
        `*Line*\n${esc(alert.production_line)}`,
        `*Work center*\n${esc(alert.work_center)}`,
        `*Raised*\n${clock(alert.requested)}`,
        `*${end ? "Duration" : "Open for"}*\n${span(alert.requested, end || now)}`
    ];

    if (alert.acknowledged_by)
        fields.push(`*Acknowledged*\n${esc(alert.acknowledged_by)} · ${alert.acknowledged ? clock(alert.acknowledged) : ""}`);

    if (alert.status === "RESOLVED" && alert.resolved_by)
        fields.push(`*Resolved by*\n${esc(alert.resolved_by)}`);

    const blocks = [
        { type: "header", text: { type: "plain_text", text: `${ICONS[alert.type] || "⚪"} ${label(alert.type)} ALERT #${alert.id}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: STATUS[alert.status] || `*${esc(alert.status)}*` } },
        { type: "section", fields: fields.map(text => ({ type: "mrkdwn", text })) }
    ];

    if (alert.resolution_notes && (alert.status === "RESOLVED" || alert.status === "CANCELLED"))
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${alert.status === "CANCELLED" ? "Cancel reason" : "Resolution"}*\n${esc(alert.resolution_notes).slice(0, 2500)}` } });

    const buttons = alertButtons(alert);

    if (buttons.length && signingSecret())
        blocks.push({ type: "actions", block_id: "alert_actions", elements: buttons });

    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${supervisorUrl}|Open the Response Center> · G&G ManufacturingOS` }] });

    return blocks;

}

// Open alert → Acknowledge (ACTIVE) or Resolve (ACKNOWLEDGED), and
// Cancel. The value is the alert ID.
function alertButtons(alert) {

    const id = String(alert.id);

    if (alert.status === "ACTIVE")
        return [
            { type: "button", action_id: "ack", text: { type: "plain_text", text: "👷 Acknowledge" }, style: "primary", value: id },
            { type: "button", action_id: "cancel", text: { type: "plain_text", text: "Cancel" }, value: id }
        ];

    if (alert.status === "ACKNOWLEDGED")
        return [
            { type: "button", action_id: "resolve", text: { type: "plain_text", text: "✅ Resolve" }, style: "primary", value: id },
            { type: "button", action_id: "cancel", text: { type: "plain_text", text: "Cancel" }, value: id }
        ];

    return [];

}

// Same reasons as the tablet (#28).
const CANCEL_REASONS = ["Pressed by mistake", "Problem cleared itself", "Test", "Other"];

function resolveModal(alert) {

    return {
        type: "modal",
        callback_id: "resolve_alert",
        private_metadata: String(alert.id),
        title: { type: "plain_text", text: `Resolve alert #${alert.id}` },
        submit: { type: "plain_text", text: "Resolve" },
        close: { type: "plain_text", text: "Back" },
        blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${esc(label(alert.type))}* · ${esc(alert.production_line)} / ${esc(alert.work_center)}` } },
            { type: "input", block_id: "note", label: { type: "plain_text", text: "What fixed it?" }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 500 } }
        ]
    };

}

function cancelModal(alert) {

    return {
        type: "modal",
        callback_id: "cancel_alert",
        private_metadata: String(alert.id),
        title: { type: "plain_text", text: `Cancel alert #${alert.id}` },
        submit: { type: "plain_text", text: "Cancel alert" },
        close: { type: "plain_text", text: "Keep it open" },
        blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${esc(label(alert.type))}* · ${esc(alert.production_line)} / ${esc(alert.work_center)}` } },
            {
                type: "input", block_id: "reason", label: { type: "plain_text", text: "Why cancel this alert?" },
                element: { type: "static_select", action_id: "value", options: CANCEL_REASONS.map(r => ({ text: { type: "plain_text", text: r }, value: r })) }
            },
            { type: "input", block_id: "other", optional: true, label: { type: "plain_text", text: "If Other: what happened?" }, element: { type: "plain_text_input", action_id: "value", max_length: 200 } }
        ]
    };

}

async function openModal(triggerId, view, post) {

    const cfg = slackConfig();

    if (!cfg)
        throw new Error("Slack is not set up in this environment.");

    return slackApi("views.open", { trigger_id: triggerId, view }, cfg.token, post);

}

// Private answer to the person who pressed (response_url from Slack).
async function tellUser(responseUrl, text, post = axios.post) {

    if (!responseUrl || !/^https:\/\/hooks\.slack\.com\//.test(responseUrl))
        return;

    try {

        await post(responseUrl, { response_type: "ephemeral", replace_original: false, text }, { timeout: notifyTimeoutMs() });

    }

    catch (err) {

        console.error(`✗ Slack: could not answer the press: ${err.code || err.message}`);

    }

}

function stepText(alert) {

    if (alert.status === "ACKNOWLEDGED")
        return `👷 Acknowledged by *${esc(alert.acknowledged_by || "someone")}* after ${span(alert.requested, alert.acknowledged || Date.now())}`;

    if (alert.status === "RESOLVED")
        return `✅ Resolved by *${esc(alert.resolved_by || "someone")}* after ${span(alert.requested, alert.resolved || Date.now())}${alert.resolution_notes ? `: ${esc(alert.resolution_notes).slice(0, 500)}` : ""}`;

    if (alert.status === "CANCELLED")
        return `✖️ Cancelled${alert.resolution_notes ? `: ${esc(alert.resolution_notes).slice(0, 500)}` : ""}`;

    return null;

}

//------------------------------------------------------
// Send / update
//------------------------------------------------------

const db = () => require("../database");

// New alert → one message; its channel + ts are saved on the alert.
async function postAlertToSlack(alert, post) {

    const cfg = slackConfig();

    if (!cfg || alert.type === "NEAR_MISS")
        return null;

    const r = await slackApi("chat.postMessage", { channel: cfg.channel, text: summary(alert), blocks: alertBlocks(alert), unfurl_links: false }, cfg.token, post);

    db().db.prepare("UPDATE alerts SET slack_channel = ?, slack_ts = ? WHERE id = ?").run(r.channel, r.ts, alert.id);

    console.log(`✓ Slack: alert #${alert.id} posted`);

    return r.ts;

}

// Status change (acknowledged / resolved / cancelled) or note: the
// message is redrawn from the latest row; `step` adds a thread reply.
async function updateAlertInSlack(alert, { step = true, post } = {}) {

    const cfg = slackConfig();
    const latest = db().statements.getAlert.get(alert.id);

    if (!cfg || !latest || !latest.slack_ts)
        return false;

    await slackApi("chat.update", { channel: latest.slack_channel, ts: latest.slack_ts, text: summary(latest), blocks: alertBlocks(latest) }, cfg.token, post);

    const reply = step ? stepText(latest) : null;

    if (reply)
        await slackApi("chat.postMessage", { channel: latest.slack_channel, thread_ts: latest.slack_ts, text: reply }, cfg.token, post);

    console.log(`✓ Slack: alert #${latest.id} updated (${latest.status})`);

    return true;

}

module.exports = { slackConfig, signingSecret, slackApi, alertBlocks, alertButtons, stepText, postAlertToSlack, updateAlertInSlack, span, resolveModal, cancelModal, openModal, tellUser, CANCEL_REASONS };
