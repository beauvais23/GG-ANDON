//------------------------------------------------------
// Telegram resolution notes (defect #14b)
//
// A Telegram button can't carry text, so a Telegram
// resolve first saves TELEGRAM_DEFAULT_NOTE. Right after,
// the bot asks the resolver in the group to reply with
// what fixed it (force_reply). The first text reply to
// that prompt replaces the default note.
//
// The prompt names the alert ("what fixed alert #N"), so
// no extra table is needed: the reply carries the
// prompt's text back in reply_to_message.
//------------------------------------------------------

const axios = require("axios");
const { notificationsEnabled } = require("./appEnv");
const { notifyTimeoutMs } = require("./notificationQueue");

const TELEGRAM_DEFAULT_NOTE = "Resolved from Telegram";
const NOTE_MAX = 500;
const PROMPT_PATTERN = /what fixed alert #(\d+)\?/;

function escapeHtml(text) {

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

function telegramName(from) {

    return (from?.first_name || "Telegram user") +
        (from?.last_name ? " " + from.last_name : "");

}

async function sendTelegramMessage(body) {

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!notificationsEnabled() || !token || !chatId)
        return null;

    const response = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: chatId, parse_mode: "HTML", ...body },
        { timeout: notifyTimeoutMs() }
    );

    return response.data;

}

// Ask the person who pressed Resolve what fixed it.
async function promptForNote(alert, from) {

    const name = escapeHtml(telegramName(from));

    // A text mention lets force_reply open the reply box
    // for that person only (selective).
    const who = from?.id
        ? `<a href="tg://user?id=${Number(from.id)}">${name}</a>`
        : name;

    const where = [alert.type, alert.production_line, alert.work_center]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");

    return sendTelegramMessage({
        text:
            `📝 ${who}, what fixed alert #${alert.id}?\n` +
            `${where}\n` +
            "Reply to this message. Your reply becomes the resolution note.",
        reply_markup: {
            force_reply: true,
            selective: true,
            input_field_placeholder: "What fixed it?"
        }
    });

}

// Which alert a group message answers, or null when it
// isn't a reply to one of our note prompts in our chat.
function noteReplyAlertId(message) {

    const prompt = message?.reply_to_message;

    if (!prompt || !prompt.from?.is_bot || message.from?.is_bot)
        return null;

    if (String(message.chat?.id) !== String(process.env.TELEGRAM_CHAT_ID))
        return null;

    const match = PROMPT_PATTERN.exec(prompt.text || "");

    return match ? Number(match[1]) : null;

}

// Short reply in the thread, so the group sees the outcome.
function replyInThread(message, text) {

    return sendTelegramMessage({
        text,
        reply_to_message_id: message.message_id
    });

}

module.exports = {
    TELEGRAM_DEFAULT_NOTE,
    NOTE_MAX,
    telegramName,
    promptForNote,
    noteReplyAlertId,
    replyInThread
};
