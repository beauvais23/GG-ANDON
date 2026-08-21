//------------------------------------------------------
// ManufacturingOS Configuration
//------------------------------------------------------

const serverUrl =
    process.env.SERVER_URL ||
    "https://gg-andon-production.up.railway.app";

module.exports = {

    supervisorUrl:
        process.env.SUPERVISOR_URL ||
        "https://manufacturingos-frontend-production.up.railway.app/supervisor",

    serverUrl,

    telegramWebhookUrl:
        `${serverUrl}/telegram/webhook`

};

