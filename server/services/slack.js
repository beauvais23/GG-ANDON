const axios = require("axios");
const { supervisorUrl } = require("../config");
const { notificationsEnabled } = require("./appEnv");
const { notifyTimeoutMs } = require("./notificationQueue");
const { label } = require("./alertTypes");

//------------------------------------------------------
// Slack, S1 (Nov 9 2026): andon alerts in #andon-alerts
//
// One message per alert (chat.postMessage), updated in place
// (chat.update) on acknowledge / resolve / cancel / note, with a
// short reply in its thread for each step. Runs beside Telegram
// and Google Chat (parallel run, 1 week). Near misses are not
// sent to Slack yet (S3). No buttons yet (S2).
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

    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${supervisorUrl}|Open the Response Center> · G&G ManufacturingOS` }] });

    return blocks;

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

module.exports = { slackConfig, slackApi, alertBlocks, stepText, postAlertToSlack, updateAlertInSlack, span };
