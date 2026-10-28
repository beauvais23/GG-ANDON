const { test, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { tempDir } = require("./helpers");
const { backupDirFor, pruneBackups, KEEP_BACKUPS } = require("../migrations/runner");
const { runDailyBackupIfDue } = require("../services/dailyBackup");

const T = iso => Date.parse(iso);

// The backup service logs every backup. Under load, that output
// sometimes corrupts the test runner's channel ("Unable to
// deserialize cloned data"), failing CI at random. Keep it quiet.
mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

let db;
let dbPath;

function dailyFiles() {

    const dir = backupDirFor(dbPath);

    return fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.includes("-daily-")).sort()
        : [];

}

beforeEach(() => {

    dbPath = path.join(tempDir(), "andon.db");
    db = new Database(dbPath);
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t VALUES ('live data')").run();

});

afterEach(() => {

    db.close();
    delete process.env.DAILY_BACKUP_HOUR;

});

test("nothing before 5 pm New York; one backup after; not repeated the same day", async () => {

    // 4:59 pm EDT
    assert.equal(await runDailyBackupIfDue(db, dbPath, T("2026-10-27T20:59:00Z")), null);
    assert.deepEqual(dailyFiles(), []);

    // 5:05 pm EDT
    const file = await runDailyBackupIfDue(db, dbPath, T("2026-10-27T21:05:00Z"));

    assert.match(path.basename(file), /^andon-20261027T210500Z-daily-2026-10-27\.db$/);

    const copy = new Database(file, { readonly: true });

    assert.equal(copy.prepare("SELECT v FROM t").get().v, "live data");
    copy.close();

    // 6:00 pm and 11:30 pm EDT, same New York date (11:30 pm is already Oct 28 in UTC)
    assert.equal(await runDailyBackupIfDue(db, dbPath, T("2026-10-27T22:00:00Z")), null);
    assert.equal(await runDailyBackupIfDue(db, dbPath, T("2026-10-28T03:30:00Z")), null);

    assert.equal(dailyFiles().length, 1);

});

test("next day: waits for 5 pm again, then backs up", async () => {

    await runDailyBackupIfDue(db, dbPath, T("2026-10-27T21:05:00Z"));

    // Oct 28, 9:00 am EDT
    assert.equal(await runDailyBackupIfDue(db, dbPath, T("2026-10-28T13:00:00Z")), null);

    // Oct 28, 5:00 pm EDT
    assert.ok(await runDailyBackupIfDue(db, dbPath, T("2026-10-28T21:00:00Z")));

    assert.deepEqual(
        dailyFiles().map(f => f.slice(-13)),
        ["2026-10-27.db", "2026-10-28.db"]
    );

});

test("catch-up: server down at 5 pm, boots at 10 pm, backs up then", async () => {

    // 10:00 pm EST in January
    const file = await runDailyBackupIfDue(db, dbPath, T("2026-01-16T03:00:00Z"));

    assert.match(path.basename(file), /-daily-2026-01-15\.db$/);

});

test("DAILY_BACKUP_HOUR overrides 17; invalid values fall back to 17", async () => {

    process.env.DAILY_BACKUP_HOUR = "9";

    // 9:10 am EDT
    assert.ok(await runDailyBackupIfDue(db, dbPath, T("2026-10-27T13:10:00Z")));

    process.env.DAILY_BACKUP_HOUR = "25";

    // Oct 28, 4:00 pm EDT: before the fallback hour 17
    assert.equal(await runDailyBackupIfDue(db, dbPath, T("2026-10-28T20:00:00Z")), null);

});

test(`retention: ${KEEP_BACKUPS} daily and ${KEEP_BACKUPS} other backups kept separately`, () => {

    const dir = tempDir();

    for (let i = 1; i <= KEEP_BACKUPS + 2; i++) {

        const day = String(i).padStart(2, "0");

        fs.writeFileSync(path.join(dir, `andon-202610${day}T210000Z-daily-2026-10-${day}.db`), "");

    }

    for (let i = 1; i <= 3; i++)
        fs.writeFileSync(path.join(dir, `andon-2026090${i}T000000Z-before-000${i}.db`), "");

    pruneBackups(dir);

    const left = fs.readdirSync(dir);

    assert.equal(left.filter(f => f.includes("-daily-")).length, KEEP_BACKUPS);
    assert.equal(left.filter(f => f.includes("-before-")).length, 3);
    assert.ok(!left.includes("andon-20261001T210000Z-daily-2026-10-01.db"));

});

test("an interrupted backup (.partial) is cleaned up and does not count as today's", async () => {

    const dir = backupDirFor(dbPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "andon-20261027T210000Z-daily-2026-10-27.db.partial"), "cut off");

    const file = await runDailyBackupIfDue(db, dbPath, T("2026-10-27T21:10:00Z"));

    assert.ok(file);
    assert.ok(!fs.readdirSync(dir).some(f => f.endsWith(".partial")));

});
