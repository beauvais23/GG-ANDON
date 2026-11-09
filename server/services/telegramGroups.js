const { notificationsEnabled } = require("./appEnv");
const { notifyTimeoutMs } = require("./notificationQueue");
const { isConnectError } = require("./network");
const { supervisorUrl } = require("../config");
const { formatDate } = require("./alertFormatter");

//------------------------------------------------------
// Telegram groups (Director, Nov 9 2026): near misses go to a
// Near Miss group and BOM change requests to a BOM group, with
// the same bot as the ANDON channel (TELEGRAM_BOT_TOKEN).
// Production only (hard rule 6: no Telegram outside it).
// Variables are read at send time.
//------------------------------------------------------

const CHAT_VARS = { nearMiss: "TELEGRAM_NEAR_MISS_CHAT_ID", bom: "TELEGRAM_BOM_CHAT_ID" };

function groupConfig(kind) {

    if (!notificationsEnabled())
        return null;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env[CHAT_VARS[kind]];

    return token && chatId ? { token, chatId } : null;

}

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Frontend root (SUPERVISOR_URL ends in /supervisor).
const appUrl = () => supervisorUrl.replace(/\/supervisor\/?$/, "");

const requestUrl = code => `${appUrl()}/bom/requests?code=${encodeURIComponent(code)}`;

async function call(method, cfg, body) {

    const post = () => fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
        method: "POST",
        signal: AbortSignal.timeout(notifyTimeoutMs()),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, parse_mode: "HTML", disable_web_page_preview: true, ...body })
    });

    let response;

    try {

        response = await post();

    }

    catch (err) {

        // Nothing reached Telegram, so one retry can't double-post (#27).
        if (method !== "sendMessage" || !isConnectError(err))
            throw new Error(`Telegram ${method} failed: ${err.cause?.code || err.code || err.name}`);

        await new Promise(r => setTimeout(r, 2000));

        response = await post();

    }

    const result = await response.json();

    if (!result.ok) {

        // Same text twice (e.g. a redraw that changed nothing): fine.
        if (/message is not modified/i.test(result.description || ""))
            return null;

        throw new Error(`Telegram ${method} failed: ${result.description || "no reply"}`);

    }

    return result.result;

}

//------------------------------------------------------
// Near miss → Near Miss group
//------------------------------------------------------

function nearMissText(alert) {

    const voided = alert.status === "CANCELLED";

    return [
        `⚠️ <b>NEAR MISS REPORTED #${alert.id}</b>`,
        "",
        `📍 <b>${esc(alert.production_line)}</b> / ${esc(alert.work_center)}`,
        `🕒 ${formatDate(alert.requested)}`,
        "",
        voided
            ? `❌ <b>VOIDED</b>${alert.resolution_notes ? `: ${esc(alert.resolution_notes)}` : ""}`
            : "📝 <b>LOGGED</b> (no response needed; fill out the Near Miss form)"
    ].join("\n");

}

// Returns the message ID, or null when the group isn't set up.
async function postNearMissToTelegram(alert) {

    const cfg = groupConfig("nearMiss");

    if (!cfg) {

        if (notificationsEnabled())
            console.warn(`TELEGRAM_NEAR_MISS_CHAT_ID not set: near miss #${alert.id} not sent to Telegram.`);

        return null;

    }

    const msg = await call("sendMessage", cfg, { text: nearMissText(alert) });
    const id = String(msg.message_id);

    require("../database").db.prepare("UPDATE alerts SET telegram_group_message_id = ? WHERE id = ?").run(id, alert.id);

    console.log(`✓ Telegram: near miss #${alert.id} posted to the Near Miss group`);

    return id;

}

// Undo / Admin void: redraw the group message.
async function updateNearMissInTelegram(alert) {

    const cfg = groupConfig("nearMiss");
    const latest = require("../database").statements.getAlert.get(alert.id);

    if (!cfg || !latest || !latest.telegram_group_message_id)
        return false;

    await call("editMessageText", cfg, { message_id: Number(latest.telegram_group_message_id), text: nearMissText(latest) });

    console.log(`✓ Telegram: near miss #${latest.id} updated (${latest.status})`);

    return true;

}

//------------------------------------------------------
// BOM change request → BOM group
//------------------------------------------------------

const ACTION = { CHANGE_QTY: "🟧 CHANGE QTY", DELETE: "🟥 DELETE", ADD: "🟩 ADD" };

function bomLine(l) {

    const what = l.action === "ADD"
        ? `qty <b>${esc(l.new_qty)}</b>`
        : l.action === "DELETE"
            ? `line ${esc(l.line)} · was qty ${esc(l.old_qty)}`
            : `line ${esc(l.line)} · qty <b>${esc(l.old_qty)} → ${esc(l.new_qty)}</b>`;

    return `${ACTION[l.action]} <code>${esc(l.component)}</code> · ${what}${l.description ? `\n      <i>${esc(String(l.description).slice(0, 80))}</i>` : ""}`;

}

function bomText(req, lines) {

    const status = req.status === "DONE"
        ? `✅ <b>DONE in QuickBooks</b> by ${esc(req.closed_by)}${req.close_note ? `: ${esc(req.close_note)}` : ""}`
        : req.status === "CANCELLED"
            ? `✖️ <b>CANCELLED</b> by ${esc(req.closed_by)}${req.close_note ? `: ${esc(req.close_note)}` : ""}`
            : "🟦 <b>OPEN</b>";

    return [
        `🧾 <b>BOM CHANGE REQUEST ${esc(req.code)}</b>`,
        status,
        "",
        `<b>${esc(req.sku)}</b> · ${esc(req.line_group || "Other")}`,
        req.sku_description ? `<i>${esc(String(req.sku_description).slice(0, 120))}</i>` : null,
        "",
        `<b>Changes (${lines.length})</b>`,
        ...lines.map(bomLine),
        "",
        `Reason: <b>${esc(req.reason)}</b>`,
        req.reference ? `NCM / ECO: ${esc(req.reference)}` : null,
        `Requested by: ${esc(req.requested_by)}`,
        req.note ? `Note: ${esc(req.note)}` : null,
        "",
        `<a href="${requestUrl(req.code)}">Open request</a>`
    ].filter(v => v !== null).join("\n");

}

// New request: one message; its ID and any error saved on the request.
async function postBomToTelegram(req, lines) {

    const cfg = groupConfig("bom");
    const { db } = require("../database");

    if (!cfg) {

        if (notificationsEnabled())
            db.prepare("UPDATE bom_requests SET telegram_error = ? WHERE id = ?").run("Not sent: BOM Telegram group not set up (TELEGRAM_BOM_CHAT_ID)", req.id);

        return null;

    }

    try {

        const msg = await call("sendMessage", cfg, { text: bomText(req, lines) });

        db.prepare("UPDATE bom_requests SET telegram_message_id = ?, telegram_error = NULL WHERE id = ?").run(String(msg.message_id), req.id);

        console.log(`✓ Telegram: ${req.code} posted to the BOM group`);

        return String(msg.message_id);

    }

    catch (err) {

        db.prepare("UPDATE bom_requests SET telegram_error = ? WHERE id = ?").run(String(err.message).slice(0, 300), req.id);
        throw err;

    }

}

// Done / Cancelled: redraw the message and reply to it.
async function updateBomInTelegram(req, lines) {

    const cfg = groupConfig("bom");
    const latest = require("../database").db.prepare("SELECT * FROM bom_requests WHERE id = ?").get(req.id);

    if (!cfg || !latest || !latest.telegram_message_id)
        return false;

    const messageId = Number(latest.telegram_message_id);

    await call("editMessageText", cfg, { message_id: messageId, text: bomText(latest, lines) });

    const reply = latest.status === "DONE"
        ? `✅ ${esc(latest.code)} done in QuickBooks by <b>${esc(latest.closed_by)}</b>${latest.close_note ? `: ${esc(latest.close_note)}` : ""}`
        : `✖️ ${esc(latest.code)} cancelled by <b>${esc(latest.closed_by)}</b>${latest.close_note ? `: ${esc(latest.close_note)}` : ""}`;

    await call("sendMessage", cfg, { text: reply, reply_parameters: { message_id: messageId, allow_sending_without_reply: true } });

    console.log(`✓ Telegram: ${latest.code} updated (${latest.status})`);

    return true;

}

function describeTelegramGroups() {

    if (!notificationsEnabled())
        return "Telegram groups: off (not production)";

    const on = k => (groupConfig(k) ? "on" : "off");

    return `Telegram groups: near miss ${on("nearMiss")}, BOM ${on("bom")}`;

}

module.exports = {
    groupConfig,
    nearMissText,
    bomText,
    requestUrl,
    postNearMissToTelegram,
    updateNearMissInTelegram,
    postBomToTelegram,
    updateBomInTelegram,
    describeTelegramGroups
};
