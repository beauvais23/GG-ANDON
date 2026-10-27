//------------------------------------------------------
// Notification timing
//
// Telegram and Google Chat calls must never hold up the
// floor: routes answer the tablet first, then notify in
// the background. Every outbound call has a time limit.
//
// Notifications for the same alert run one after another
// (created → acknowledged → resolved), so a fast
// acknowledge never edits a Telegram message that has not
// been sent yet.
//------------------------------------------------------

// Per-call limit for outbound HTTP (ms). Override with NOTIFY_TIMEOUT_MS.
function notifyTimeoutMs() {

    const ms = Number(process.env.NOTIFY_TIMEOUT_MS);

    return Number.isFinite(ms) && ms > 0 ? ms : 5000;

}

const chains = new Map();

// Runs `task` after any earlier notification for the same alert.
// Errors are logged, never thrown. Returns the promise (for tests).
function queueNotification(alertId, label, task) {

    const key = String(alertId);
    const previous = chains.get(key) || Promise.resolve();

    const next = previous
        .then(() => task())
        .catch(err => {
            console.error(`✗ Notification failed (${label}, alert #${key}):`, err.message);
        })
        .finally(() => {
            if (chains.get(key) === next)
                chains.delete(key);
        });

    chains.set(key, next);

    return next;

}

module.exports = {
    notifyTimeoutMs,
    queueNotification
};
