const { sendNotification } = require("./notifications_old");
const { sendGoogleChatCard } = require("./googleChat");
const { sendTelegram } = require("./telegram");
const { updateTelegram } = require("./telegramUpdate");
const { postAlertToSlack, updateAlertInSlack, slackConfig } = require("./slack");
const { notificationsEnabled } = require("./appEnv");

//------------------------------------------------------
// S5 cut-over (Director, Nov 9 2026): Slack is the alert channel.
//
// An alert lives where it was first posted:
// - posted in Slack → every update goes to Slack only;
// - Slack not set up, or the post failed → Telegram + Google
//   Chat as before (backup while their variables still exist),
//   with a log warning, so no alert goes unannounced;
// - raised during the parallel run (has a Telegram message) →
//   Telegram and Chat keep getting its updates until it closes.
//------------------------------------------------------

// A Slack error is logged and never stops the rest.
function slackSafe(label, fn) {

    return Promise.resolve().then(fn).catch(err => console.error(`✗ Slack ${label}:`, err.message));

}

function latestRow(alert) {

    const { statements } = require("../database");

    return statements.getAlert.get(alert.id) || alert;

}

function warnBackup(alert) {

    if (notificationsEnabled())
        console.warn(`⚠️ Alert #${alert.id} (${alert.type}) is not in Slack: sent to Telegram / Google Chat instead (backup).`);

}

//------------------------------------------------------
// Near Miss routing (Director, Oct 30 2026)
//
// NEAR_MISS alerts go only to the "Near Miss & Safety
// Incident Alert" Google Chat space: no Telegram, no ANDON
// Chat space. If GOOGLE_CHAT_NEAR_MISS_WEBHOOK is not set
// they fall back to the ANDON Chat space, so none are lost.
//------------------------------------------------------

function nearMissWebhook(alert) {

    if (alert.type !== "NEAR_MISS")
        return null;

    const webhook = process.env.GOOGLE_CHAT_NEAR_MISS_WEBHOOK;

    if (!webhook)
        console.warn("GOOGLE_CHAT_NEAR_MISS_WEBHOOK not set: NEAR MISS sent to the ANDON Chat space.");

    return webhook || null;

}

// Acknowledge / resolve / cancel updates. A Near Miss alert
// raised before the routing was on still has a Telegram
// message, so that message is kept up to date.
async function notifyUpdate(alert, event) {

    await sendNotification(event, alert);

    const latest = latestRow(alert);
    const slack = slackSafe(`update alert #${alert.id}`, () => updateAlertInSlack(alert));

    const inSlack = latest.slack_ts && slackConfig(latest.type === "NEAR_MISS" ? "nearMiss" : "andon");

    if (inSlack && !latest.telegram_message_id) {

        await slack;
        return;

    }

    await Promise.allSettled([slack, legacyUpdate(alert, event)]);

}

// Telegram + Google Chat update (backup, parallel-run alerts).
async function legacyUpdate(alert, event) {

    const nearMiss = nearMissWebhook(alert);

    const updates = [
        nearMiss
            ? sendGoogleChatCard(alert, event, nearMiss)
            : sendGoogleChatCard(alert, event)
    ];

    if (!nearMiss || alert.telegram_message_id)
        updates.push(updateTelegram(alert));

    await Promise.allSettled(updates);

}

//------------------------------------------------------
// Alert Created
//------------------------------------------------------

async function notifyCreated(alert) {

    // Log locally
    await sendNotification("CREATED", alert);

    // Slack: #andon-alerts, or #safety-near-miss for a near miss.
    await slackSafe(`post alert #${alert.id}`, () => postAlertToSlack(alert));

    if (latestRow(alert).slack_ts)
        return;

    warnBackup(alert);

    await legacyCreated(alert);

}

// Telegram + Google Chat (backup when Slack is off or failed).
async function legacyCreated(alert) {

    // Near Miss: logged closed, one "REPORTED" card, never Telegram
    // (there is nothing to acknowledge). Its own Chat space when set.
    if (alert.type === "NEAR_MISS") {

        const nearMiss = nearMissWebhook(alert);

        await (nearMiss
            ? sendGoogleChatCard(alert, "REPORTED", nearMiss)
            : sendGoogleChatCard(alert, "REPORTED"));

        return;

    }

    // Google Chat
    await sendGoogleChatCard(alert, "CREATED");

    // Telegram (returns message ID)
    const telegramMessageId =
        await sendTelegram(alert, "CREATED");

    // Save Telegram message ID
    if (telegramMessageId) {

        const { statements } = require("../database");

        statements.saveTelegramMessageId.run(
            telegramMessageId,
            Date.now(),
            alert.id
        );

    }

}

//------------------------------------------------------
// Alert Acknowledged / Resolved / Cancelled
//------------------------------------------------------

const notifyAcknowledged = alert => notifyUpdate(alert, "ACKNOWLEDGED");
const notifyResolved = alert => notifyUpdate(alert, "RESOLVED");
const notifyCancelled = alert => notifyUpdate(alert, "CANCELLED");

// Resolution note added later (Telegram resolves): redraw the
// Telegram and Slack messages; no new Slack thread reply.
async function notifyNoteAdded(alert) {

    await Promise.allSettled([
        updateTelegram(alert),
        slackSafe(`note on alert #${alert.id}`, () => updateAlertInSlack(alert, { step: false }))
    ]);

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    notifyCreated,
    notifyAcknowledged,
    notifyResolved,
    notifyCancelled,
    notifyNoteAdded

};