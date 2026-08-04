const {
    buildMessage,
    buildKeyboard
} = require("./telegram");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

//------------------------------------------------------
// Update Existing Telegram Message
//------------------------------------------------------

const { statements } = require("../database");

async function updateTelegram(alert) {

    //------------------------------------------------------
    // Always reload the latest alert
    //------------------------------------------------------

    alert = statements.getAlert.get(alert.id);

    if (!alert)
        return;

    if (!alert.telegram_message_id)
        return;

    if (!TOKEN || !CHAT_ID)
        return;

    if (!alert.telegram_message_id)
        return;

    const payload = {

        chat_id: CHAT_ID,

        message_id: alert.telegram_message_id,

        text: buildMessage(alert, alert.status),

        parse_mode: "HTML",

        reply_markup: buildKeyboard(alert, alert.status)

    };

    const response = await fetch(

        `https://api.telegram.org/bot${TOKEN}/editMessageText`,

        {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify(payload)

        }

    );

    const result = await response.json();

    if (!result.ok) {

        console.error("Telegram Update Failed:");
        console.error(result);

        return;

    }

    console.log(
        `✓ Telegram message updated (#${alert.telegram_message_id})`
    );

}

module.exports = {
    updateTelegram
};