//------------------------------------------------------
// Outbound connections (defect #27)
//
// Node tries a host's IPv4 address for only 250 ms
// before switching to IPv6. Railway has no IPv6, so a
// slow IPv4 connect to Telegram failed outright
// ("ETIMEDOUT ...; ENETUNREACH 2001:...") about 0.25 s
// after the call started, and alert #72 (Oct 29) never
// reached Telegram. Give IPv4 2 s and try it first.
// Applies to fetch and axios (Telegram, Google Chat,
// Google Drive): neither sets its own value.
//------------------------------------------------------

const net = require("net");
const dns = require("dns");

const CONNECT_ATTEMPT_MS = 2000;

net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_MS);
dns.setDefaultResultOrder("ipv4first");

// Errors raised while opening the connection, so the
// request never reached the server and is safe to send
// again. A time-out after connecting is not included:
// Telegram may already have posted the message.
const CONNECT_CODES = new Set([
    "ETIMEDOUT",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "UND_ERR_CONNECT_TIMEOUT"
]);

function isConnectError(err) {

    const cause = err?.cause || err;

    const codes = [
        cause?.code,
        ...(cause?.errors || []).map(e => e?.code)
    ];

    return codes.some(code => CONNECT_CODES.has(code));

}

module.exports = {
    CONNECT_ATTEMPT_MS,
    isConnectError
};
