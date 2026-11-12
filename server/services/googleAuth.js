//------------------------------------------------------
// Google sign-in (Director, Nov 11 2026): verifies a Google
// Identity Services ID token without a new library: Google's public
// keys (JWKS, cached for their max-age) + jsonwebtoken (RS256),
// audience = GOOGLE_CLIENT_ID, issuer accounts.google.com, email
// verified, Workspace domain (hd) = ALLOWED_EMAIL_DOMAIN (default
// ggled.net). The ID token is never stored or logged.
//------------------------------------------------------

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

let fetchKeys = async () => {

    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });

    if (!res.ok)
        throw new Error(`Google keys: HTTP ${res.status}`);

    const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get("cache-control") || "") || [])[1]) || 3600;

    return { keys: (await res.json()).keys || [], maxAge };

};

let cache = { keys: [], until: 0 };

// Tests swap Google's key endpoint for their own.
function setKeyFetcher(fn) {

    fetchKeys = fn;
    cache = { keys: [], until: 0 };

}

async function keyFor(kid) {

    if (Date.now() > cache.until || !cache.keys.some(k => k.kid === kid)) {

        const { keys, maxAge } = await fetchKeys();

        cache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };

    }

    const jwk = cache.keys.find(k => k.kid === kid);

    if (!jwk)
        throw new Error("Unknown Google signing key.");

    return crypto.createPublicKey({ key: jwk, format: "jwk" });

}

const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || "").trim() || null;
const allowedDomain = () => (process.env.ALLOWED_EMAIL_DOMAIN || "ggled.net").trim().toLowerCase();

// Returns { email, name } or throws an Error with a user-facing message.
async function verifyGoogleIdToken(idToken) {

    const clientId = googleClientId();

    if (!clientId)
        throw new Error("Google sign-in is not set up.");

    const header = jwt.decode(String(idToken || ""), { complete: true })?.header;

    if (!header?.kid)
        throw new Error("Not a Google sign-in token.");

    let claims;

    try {

        claims = jwt.verify(idToken, await keyFor(header.kid), { algorithms: ["RS256"], audience: clientId, issuer: ISSUERS });

    } catch (err) {

        throw new Error(/expired/i.test(err.message) ? "Google sign-in expired; try again." : `Google sign-in could not be verified (${err.message}).`);

    }

    const email = String(claims.email || "").toLowerCase();
    const domain = allowedDomain();

    if (!claims.email_verified || claims.hd !== domain || !email.endsWith(`@${domain}`))
        throw new Error(`Only ${domain} accounts can sign in.`);

    return { email, name: String(claims.name || email.split("@")[0]).slice(0, 80) };

}

const adminEmails = () => new Set(String(process.env.ADMIN_EMAILS || "").split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));

module.exports = { verifyGoogleIdToken, setKeyFetcher, googleClientId, allowedDomain, adminEmails };
