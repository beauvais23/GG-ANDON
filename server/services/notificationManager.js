const { sendNotification } = require("./notifications_old");
const { sendGoogleChatCard } = require("./googleChat");
const { sendTelegram } = require("./telegram");
const { updateTelegram } = require("./telegramUpdate");

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

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    notifyCreated,
    notifyAcknowledged,
    notifyResolved,
    notifyCancelled

};