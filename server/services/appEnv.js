//------------------------------------------------------
// Environment Guard
//------------------------------------------------------

// Outbound notifications (Telegram, Google Chat) and the
// Telegram setWebhook call run only when APP_ENV=production.
// Read at call time so tests can change it.

function notificationsEnabled() {

    return process.env.APP_ENV === "production";

}

module.exports = {
    notificationsEnabled
};
