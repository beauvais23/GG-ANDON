const { sendNotification } = require("./notifications_old");
const { sendTelegram } = require("./telegram");
const { updateTelegram } = require("./telegramUpdate");
const { postAlertToSlack, updateAlertInSlack } = require("./slack");
const { postNearMissToTelegram, updateNearMissInTelegram } = require("./telegramGroups");

//------------------------------------------------------
// Alert channels (Director, Nov 9 2026): Slack + Telegram.
// Google Chat removed.
//
// - Andon alerts: Slack #andon-alerts + the ANDON Telegram
//   channel (buttons).
// - Near misses: Slack #safety-near-miss + the Near Miss
//   Telegram group (no buttons; nothing to acknowledge). Never
//   the ANDON Telegram channel.
//
// Each channel runs on its own: an error in one is logged and
// never stops the other.
//------------------------------------------------------

function safe(label, fn) {

    return Promise.resolve().then(fn).catch(err => console.error(`✗ ${label}:`, err.message));

}

// Acknowledge / resolve / cancel (a near miss: undo / void).
async function notifyUpdate(alert, event) {

    await sendNotification(event, alert);

    const updates = [safe(`Slack update alert #${alert.id}`, () => updateAlertInSlack(alert))];

    if (alert.type === "NEAR_MISS")
        updates.push(safe(`Telegram near miss #${alert.id}`, () => updateNearMissInTelegram(alert)));

    // updateTelegram skips alerts without an ANDON channel message
    // (near misses since Oct 30 2026); older ones are kept current.
    updates.push(safe(`Telegram update alert #${alert.id}`, () => updateTelegram(alert)));

    await Promise.all(updates);

}

//------------------------------------------------------
// Alert Created
//------------------------------------------------------

async function notifyCreated(alert) {

    // Log locally
    await sendNotification("CREATED", alert);

    const slack = safe(`Slack post alert #${alert.id}`, () => postAlertToSlack(alert));

    // Near Miss: logged closed, one "REPORTED" message in the Near
    // Miss group, never the ANDON Telegram channel.
    if (alert.type === "NEAR_MISS") {

        await Promise.all([slack, safe(`Telegram near miss #${alert.id}`, () => postNearMissToTelegram(alert))]);

        return;

    }

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

    await slack;

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

    await Promise.all([
        safe(`Telegram note on alert #${alert.id}`, () => updateTelegram(alert)),
        safe(`Slack note on alert #${alert.id}`, () => updateAlertInSlack(alert, { step: false }))
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
