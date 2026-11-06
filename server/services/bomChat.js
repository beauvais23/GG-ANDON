const axios = require("axios");
const { supervisorUrl } = require("../config");
const { notificationsEnabled } = require("./appEnv");
const { notifyTimeoutMs } = require("./notificationQueue");
const { describeLine } = require("./bomRequest");

//------------------------------------------------------
// BOM alert Google Chat space (Nov 6 2026)
//
// One card per BOM change request; Done / Cancelled are posted
// as a reply in that card's thread (threadKey = request code).
// Production posts to GOOGLE_CHAT_BOM_WEBHOOK only. Anywhere
// else, only to GOOGLE_CHAT_BOM_WEBHOOK_STAGING when set (a
// test space); the production variable is never read outside
// production (hard rule 6).
//------------------------------------------------------

function bomWebhook() {

    return notificationsEnabled()
        ? process.env.GOOGLE_CHAT_BOM_WEBHOOK || null
        : process.env.GOOGLE_CHAT_BOM_WEBHOOK_STAGING || null;

}

// Frontend root (SUPERVISOR_URL ends in /supervisor).
const appUrl = () => supervisorUrl.replace(/\/supervisor\/?$/, "");

const requestUrl = code => `${appUrl()}/bom/requests?code=${encodeURIComponent(code)}`;

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const COLORS = { CHANGE_QTY: "#F2A33A", DELETE: "#F85149", ADD: "#3FB950" };
const LABELS = { CHANGE_QTY: "CHANGE QTY", DELETE: "DELETE", ADD: "ADD" };

function lineWidget(l) {

    const what = l.action === "ADD"
        ? `qty <b>${esc(l.new_qty)}</b>`
        : l.action === "DELETE"
            ? `line ${esc(l.line)} · was qty ${esc(l.old_qty)}`
            : `line ${esc(l.line)} · qty <b>${esc(l.old_qty)} → ${esc(l.new_qty)}</b>`;

    return {
        decoratedText: {
            topLabel: LABELS[l.action],
            text: `<font color="${COLORS[l.action]}"><b>${esc(l.component)}</b></font> · ${what}`,
            bottomLabel: (l.description || "").slice(0, 120),
            wrapText: true
        }
    };

}

function requestCard(req, lines) {

    const details = [
        ["Reason", req.reason],
        ["NCM / ECO", req.reference],
        ["Requested by", req.requested_by],
        ["Note", req.note]
    ].filter(([, v]) => v);

    return {
        text: `BOM change request ${req.code}: ${req.sku} (${lines.length} change${lines.length === 1 ? "" : "s"})`,
        cardsV2: [{
            cardId: `bom-${req.code}`,
            card: {
                header: { title: "🧾 BOM CHANGE REQUEST", subtitle: `${req.code} · ${req.line_group || "Other"}` },
                sections: [
                    {
                        widgets: [{
                            decoratedText: {
                                topLabel: "CONFIG",
                                text: `<b>${esc(req.sku)}</b>`,
                                bottomLabel: (req.sku_description || "").slice(0, 120),
                                wrapText: true
                            }
                        }]
                    },
                    { header: `Changes (${lines.length})`, widgets: lines.map(lineWidget) },
                    {
                        widgets: [
                            ...details.map(([k, v]) => ({ decoratedText: { topLabel: k.toUpperCase(), text: esc(v), wrapText: true } })),
                            { buttonList: { buttons: [{ text: "OPEN REQUEST", onClick: { openLink: { url: requestUrl(req.code) } } }] } }
                        ]
                    }
                ]
            }
        }]
    };

}

function closedMessage(req) {

    return req.status === "DONE"
        ? { text: `✅ ${req.code} DONE in QuickBooks by ${req.closed_by}${req.close_note ? `: ${req.close_note}` : ""}` }
        : { text: `✖️ ${req.code} CANCELLED by ${req.closed_by}${req.close_note ? `: ${req.close_note}` : ""}` };

}

// Posts in the request's thread. Returns { sent } or { skipped }.
async function postToSpace(code, payload, post = axios.post) {

    const webhook = bomWebhook();

    if (!webhook)
        return { skipped: notificationsEnabled() ? "BOM alert space not set up (GOOGLE_CHAT_BOM_WEBHOOK)" : "not production and no staging BOM space" };

    const url = new URL(webhook);

    url.searchParams.set("threadKey", code);
    url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");

    try {

        await post(url.toString(), payload, { timeout: notifyTimeoutMs() });

    }

    catch (err) {

        // Never log the webhook URL (it carries the space's key).
        throw new Error(`Google Chat post failed${err.response ? ` (HTTP ${err.response.status})` : ""}: ${err.code || "error"}`);

    }

    return { sent: true };

}

module.exports = { bomWebhook, requestCard, closedMessage, postToSpace, requestUrl, describeLine };
