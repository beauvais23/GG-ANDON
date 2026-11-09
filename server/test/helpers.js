//------------------------------------------------------
// Test Helpers
//
// node --test runs each test file in its own process, so
// each file gets its own temporary SQLite database.
// Never points at a real database. Dummy credentials only.
//------------------------------------------------------

const fs = require("fs");
const os = require("os");
const path = require("path");

function tempDir() {

    return fs.mkdtempSync(path.join(os.tmpdir(), "andon-test-"));

}

function loadApp() {

    const dir = tempDir();

    Object.assign(process.env, {
        DATABASE_PATH: path.join(dir, "andon.db"),
        APP_ENV: "test",
        AUTH_SECRET: "test-only-secret",
        ADMIN_USERNAME: "test_admin",
        ADMIN_PASSWORD: "test-admin-pw",
        PRODUCTION_USERNAME: "test_floor",
        PRODUCTION_PASSWORD: "test-floor-pw"
    });

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.GOOGLE_CHAT_WEBHOOK;
    delete process.env.TELEGRAM_NEAR_MISS_CHAT_ID;
    delete process.env.TELEGRAM_BOM_CHAT_ID;
    delete process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
    delete process.env.GDRIVE_BACKUP_FOLDER_ID;
    delete process.env.RESTORE_FROM_DRIVE;
    for (const k of ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ANDON", "SLACK_CHANNEL_NEAR_MISS", "SLACK_CHANNEL_BOM", "SLACK_CHANNEL_SYSTEM", "SLACK_SIGNING_SECRET", "SLACK_STAGING_BOT_TOKEN", "SLACK_STAGING_CHANNEL", "SLACK_STAGING_SIGNING_SECRET"])
        delete process.env[k];

    return { app: require("../index"), dir };

}

module.exports = {
    tempDir,
    loadApp
};
