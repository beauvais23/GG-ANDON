const { sendNotification } = require("./notifications_old");
const { sendGoogleChatCard } = require("./googleChat");
const { sendTelegram } = require("./telegram");
const { updateTelegram } = require("./telegramUpdate");

//------------------------------------------------------
// Alert Created
//------------------------------------------------------

async function notifyCreated(alert) {

    // Log locally
    await sendNotification("CREATED", alert);

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
// Alert Acknowledged
//------------------------------------------------------

async function notifyAcknowledged(alert) {

    await sendNotification("ACKNOWLEDGED", alert);

    await Promise.allSettled([
        sendGoogleChatCard(alert, "ACKNOWLEDGED"),
        updateTelegram(alert)
    ]);

}

//------------------------------------------------------
// Alert Resolved
//------------------------------------------------------

async function notifyResolved(alert) {

    await sendNotification("RESOLVED", alert);

    await Promise.allSettled([
        sendGoogleChatCard(alert, "RESOLVED"),
        updateTelegram(alert)
    ]);

}

//------------------------------------------------------
// Alert Cancelled
//------------------------------------------------------

async function notifyCancelled(alert) {

    await sendNotification("CANCELLED", alert);

    await Promise.allSettled([
        sendGoogleChatCard(alert, "CANCELLED"),
        updateTelegram(alert)
    ]);

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    notifyCreated,
    notifyAcknowledged,
    notifyResolved,
    notifyCancelled

};