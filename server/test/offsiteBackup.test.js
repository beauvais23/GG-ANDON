//------------------------------------------------------
// Off-site backup copy to Google Drive (defect #22)
//
// global.fetch is replaced by a fake Google (token
// endpoint + Drive files API) and axios.post by a fake
// Google Chat, so nothing leaves the process. The
// service account key is generated per test run.
//------------------------------------------------------

const { test, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const { tempDir } = require("./helpers");
const {
    syncOffsite,
    offsiteStatus,
    alertIfStale,
    resetOffsiteState
} = require("../services/offsiteBackup");

// Quiet: the service logs every copy and failure.
mock.method(console, "log", () => {});
mock.method(console, "error", () => {});
mock.method(console, "warn", () => {});

const T = iso => Date.parse(iso);

const FOLDER = "folder-staging";
const TOKEN_URI = "https://oauth2.test/token";
const CLIENT_EMAIL = "andon-backup@test.iam.gserviceaccount.com";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

const realFetch = global.fetch;
const realAxiosPost = axios.post;

let dir;
let drive;      // [{ name, parents, bytes }]
let calls;      // ["token", "list", "session", "put"]
let failNext;   // status code for the next Drive call, or "hang"
let chat;       // Google Chat posts

function json(status, body, headers = {}) {

    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers }
    });

}

// Fake Google.
async function fakeFetch(url, options = {}) {

    const u = new URL(url);

    if (failNext === "hang") {

        return new Promise((resolve, reject) =>
            options.signal.addEventListener("abort", () => reject(options.signal.reason)));

    }

    if (failNext) {

        const status = failNext;

        failNext = null;

        return json(status, { error: { message: "backend error" } });

    }

    if (url === TOKEN_URI) {

        calls.push("token");

        const assertion = new URLSearchParams(options.body.toString()).get("assertion");
        const claims = jwt.verify(assertion, publicKey, { algorithms: ["RS256"], audience: TOKEN_URI });

        assert.equal(claims.iss, CLIENT_EMAIL);
        assert.equal(claims.scope, "https://www.googleapis.com/auth/drive");

        return json(200, { access_token: "tok-123", expires_in: 3600 });

    }

    assert.equal(options.headers?.Authorization ?? "Bearer tok-123", "Bearer tok-123");

    if (u.pathname === "/drive/v3/files") {

        calls.push("list");

        assert.equal(u.searchParams.get("supportsAllDrives"), "true");

        const folder = /^'(.+)' in parents/.exec(u.searchParams.get("q"))[1];

        return json(200, {
            files: drive.filter(f => f.parents.includes(folder)).map(f => ({ name: f.name }))
        });

    }

    if (u.pathname === "/upload/drive/v3/files" && options.method === "POST") {

        calls.push("session");

        const meta = JSON.parse(options.body);
        const id = drive.push({ ...meta, bytes: null }) - 1;

        return json(200, {}, { Location: `https://upload.test/session/${id}` });

    }

    if (u.hostname === "upload.test" && options.method === "PUT") {

        calls.push("put");

        drive[Number(u.pathname.split("/").pop())].bytes = Buffer.from(options.body);

        return json(200, { id: "file" });

    }

    throw new Error(`unexpected call ${options.method || "GET"} ${url}`);

}

function configure() {

    process.env.GDRIVE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: "service_account",
        client_email: CLIENT_EMAIL,
        private_key: privateKey,
        token_uri: TOKEN_URI
    });

    process.env.GDRIVE_BACKUP_FOLDER_ID = FOLDER;

}

function writeBackup(name, content = name) {

    fs.writeFileSync(path.join(dir, name), content);

}

const OLD = "andon-20261027T183744Z-before-0001.db";
const DAILY = "andon-20261027T210821Z-daily-2026-10-27.db";
const NEWER = "andon-20261028T210500Z-daily-2026-10-28.db";

// AbortSignal.timeout() does not keep Node alive by itself; the running
// server does in production. Keep this test process alive the same way.
let keepAlive;

before(() => { keepAlive = setInterval(() => {}, 1000); });
after(() => clearInterval(keepAlive));

beforeEach(() => {

    dir = tempDir();
    drive = [];
    calls = [];
    failNext = null;
    chat = [];

    resetOffsiteState();

    global.fetch = fakeFetch;
    axios.post = async (url, body) => { chat.push({ url, body }); return { data: {} }; };

});

afterEach(() => {

    global.fetch = realFetch;
    axios.post = realAxiosPost;

    delete process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
    delete process.env.GDRIVE_BACKUP_FOLDER_ID;
    delete process.env.GOOGLE_CHAT_WEBHOOK;
    process.env.APP_ENV = "test";

});

test("not configured: off, no network call, reason shown", async () => {

    writeBackup(DAILY);

    const result = await syncOffsite(dir);

    assert.equal(result.enabled, false);
    assert.deepEqual(calls, []);
    assert.match(offsiteStatus().reason, /not set/);
    assert.equal(offsiteStatus().stale, false);

});

test("invalid key JSON: off, and the reason never repeats the value", async () => {

    process.env.GDRIVE_SERVICE_ACCOUNT_JSON = "secret-looking{not json";
    process.env.GDRIVE_BACKUP_FOLDER_ID = FOLDER;

    assert.equal((await syncOffsite(dir)).enabled, false);
    assert.equal(offsiteStatus().reason, "GDRIVE_SERVICE_ACCOUNT_JSON is not valid JSON");
    assert.deepEqual(calls, []);

});

test("uploads every local backup, oldest first, into the folder, byte for byte; skips .partial", async () => {

    configure();

    writeBackup(DAILY, Buffer.from([0, 1, 2, 255]));
    writeBackup(OLD);
    writeBackup("andon-20261029T210000Z-daily-2026-10-29.db.partial");

    const result = await syncOffsite(dir);

    assert.deepEqual(result.uploaded, [OLD, DAILY]);
    assert.deepEqual(drive.map(f => f.name), [OLD, DAILY]);
    assert.ok(drive.every(f => f.parents[0] === FOLDER));
    assert.deepEqual([...drive[1].bytes], [0, 1, 2, 255]);
    assert.equal(offsiteStatus().lastError, null);

});

test("files already in Drive are not uploaded again; a later run with nothing new makes no call", async () => {

    configure();

    drive.push({ name: OLD, parents: [FOLDER], bytes: Buffer.from("x") });
    writeBackup(OLD);
    writeBackup(DAILY);

    assert.deepEqual((await syncOffsite(dir)).uploaded, [DAILY]);

    calls = [];

    assert.deepEqual((await syncOffsite(dir)).uploaded, []);
    assert.deepEqual(calls, []);

    // A new backup appears: one listing, one upload, token reused.
    writeBackup(NEWER);
    calls = [];

    assert.deepEqual((await syncOffsite(dir)).uploaded, [NEWER]);
    assert.deepEqual(calls, ["list", "session", "put"]);

});

test("a failed run is recorded, does not throw, and the next run catches up", async () => {

    configure();

    writeBackup(DAILY);
    failNext = 500;

    const failed = await syncOffsite(dir);

    assert.deepEqual(failed.uploaded, []);
    assert.match(offsiteStatus().lastError, /Google API 500: backend error/);

    const retried = await syncOffsite(dir);

    assert.deepEqual(retried.uploaded, [DAILY]);
    assert.equal(offsiteStatus().lastError, null);

});

test("a Google call that never answers times out instead of hanging", async () => {

    configure();

    writeBackup(DAILY);
    failNext = "hang";

    const started = Date.now();
    const result = await syncOffsite(dir, { timeoutMs: 200 });

    assert.ok(Date.now() - started < 2000);
    assert.deepEqual(result.uploaded, []);
    assert.equal(offsiteStatus().lastError, "Timed out after 200 ms");

});

test("status: newest copy in Drive and stale after 26 hours", async () => {

    configure();

    writeBackup(OLD);
    writeBackup(DAILY);
    await syncOffsite(dir);

    const status = offsiteStatus(T("2026-10-28T15:00:00Z")); // 18 h after DAILY

    assert.equal(status.newestOffsite, DAILY);
    assert.equal(status.newestOffsiteAt, T("2026-10-27T21:08:21Z"));
    assert.equal(status.stale, false);
    assert.deepEqual(status.inDrive.sort(), [OLD, DAILY]);

    assert.equal(offsiteStatus(T("2026-10-28T23:09:00Z")).stale, true); // 26 h 1 min

});

test("stale alert: Google Chat once per New York day, production only", async () => {

    configure();
    process.env.GOOGLE_CHAT_WEBHOOK = "https://chat.test/hook";

    writeBackup(DAILY);
    await syncOffsite(dir);

    const late = T("2026-10-29T14:00:00Z"); // Oct 29, 41 h after DAILY

    // Not production: nothing.
    assert.equal(await alertIfStale(late), false);
    assert.equal(chat.length, 0);

    process.env.APP_ENV = "production";

    assert.equal(await alertIfStale(late), true);
    assert.equal(chat.length, 1);
    assert.equal(chat[0].url, "https://chat.test/hook");
    assert.match(chat[0].body.text, /off-site backup is behind/);
    assert.match(chat[0].body.text, /Oct 27, 2026, 5:08 PM ET/);

    // Same New York day: not repeated.
    assert.equal(await alertIfStale(late + 3600 * 1000), false);
    assert.equal(chat.length, 1);

    // Not stale: nothing.
    assert.equal(await alertIfStale(T("2026-10-28T12:00:00Z")), false);

});
