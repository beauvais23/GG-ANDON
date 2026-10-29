const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { tempDir } = require("./helpers");
const { backupDirFor } = require("../migrations/runner");
const { restoreIfRequested } = require("../migrations/restore");

let dbPath;
let backupDir;

function writeDb(file, value) {

    fs.rmSync(file, { force: true });

    const db = new Database(file);

    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run(value);
    db.close();

}

function readValue(file) {

    const db = new Database(file, { readonly: true });
    const row = db.prepare("SELECT v FROM t").get();

    db.close();

    return row.v;

}

function setValue(file, value) {

    const db = new Database(file);

    db.prepare("UPDATE t SET v = ?").run(value);
    db.close();

}

beforeEach(() => {

    dbPath = path.join(tempDir(), "andon.db");
    backupDir = backupDirFor(dbPath);

    fs.mkdirSync(backupDir);

    writeDb(path.join(backupDir, "andon-20261027T100000Z-before-0002.db"), "good");
    writeDb(dbPath, "bad");

});

afterEach(() => {

    delete process.env.RESTORE_BACKUP;
    delete process.env.RESTORE_FROM_DRIVE;
    delete process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
    delete process.env.GDRIVE_BACKUP_FOLDER_ID;

});

test("no RESTORE_BACKUP: nothing changes", () => {

    assert.equal(restoreIfRequested(dbPath), null);
    assert.equal(readValue(dbPath), "bad");

});

test("restores the named backup and snapshots the current database first", () => {

    process.env.RESTORE_BACKUP = "andon-20261027T100000Z-before-0002.db";

    const record = restoreIfRequested(dbPath);

    assert.equal(readValue(dbPath), "good");
    assert.match(record.snapshotOfPrevious, /-before-restore\.db$/);
    assert.equal(readValue(path.join(backupDir, record.snapshotOfPrevious)), "bad");

    const marker = JSON.parse(fs.readFileSync(path.join(backupDir, "last-restore.json"), "utf8"));

    assert.equal(marker.file, "andon-20261027T100000Z-before-0002.db");

});

test("a forgotten variable does not restore again on the next boot", () => {

    process.env.RESTORE_BACKUP = "andon-20261027T100000Z-before-0002.db";

    restoreIfRequested(dbPath);

    setValue(dbPath, "new work after restore");

    assert.equal(restoreIfRequested(dbPath), null);
    assert.equal(readValue(dbPath), "new work after restore");

});

test("rejects names that are not backup files (no path traversal)", () => {

    for (const name of ["../andon.db", "/etc/passwd", "andon.db", "andon-x.db/../../y.db"]) {

        process.env.RESTORE_BACKUP = name;

        assert.equal(restoreIfRequested(dbPath), null, name);
        assert.equal(readValue(dbPath), "bad");

    }

});

test("missing backup file: skipped, current database kept", () => {

    process.env.RESTORE_BACKUP = "andon-20990101T000000Z-before-0009.db";

    assert.equal(restoreIfRequested(dbPath), null);
    assert.equal(readValue(dbPath), "bad");

});

test("corrupt backup file: skipped, current database kept", () => {

    const name = "andon-20261027T110000Z-before-0003.db";

    fs.writeFileSync(path.join(backupDir, name), "not a sqlite file");

    process.env.RESTORE_BACKUP = name;

    assert.equal(restoreIfRequested(dbPath), null);
    assert.equal(readValue(dbPath), "bad");

});

test("stale WAL from the old database is not replayed onto the restored one", () => {

    // Leave an un-checkpointed WAL next to the live file.
    const live = new Database(dbPath);

    live.pragma("journal_mode = WAL");
    live.pragma("wal_autocheckpoint = 0");
    live.prepare("UPDATE t SET v = 'in-wal-only'").run();

    const walCopy = fs.readFileSync(dbPath + "-wal");

    live.close();
    fs.writeFileSync(dbPath + "-wal", walCopy);

    process.env.RESTORE_BACKUP = "andon-20261027T100000Z-before-0002.db";

    const record = restoreIfRequested(dbPath);

    assert.equal(readValue(dbPath), "good");
    assert.equal(readValue(path.join(backupDir, record.snapshotOfPrevious)), "in-wal-only");

});

test("restoring the oldest of 14 backups works (pruning runs after the copy)", () => {

    for (let i = 1; i <= 13; i++) {

        writeDb(
            path.join(backupDir, `andon-202611${String(i).padStart(2, "0")}T000000Z-before-0002.db`),
            `later-${i}`
        );

    }

    process.env.RESTORE_BACKUP = "andon-20261027T100000Z-before-0002.db";

    restoreIfRequested(dbPath);

    assert.equal(readValue(dbPath), "good");
    assert.equal(fs.readdirSync(backupDir).filter(f => f.startsWith("andon-")).length, 14);

});

//------------------------------------------------------
// RESTORE_FROM_DRIVE (#22 part 2). The download itself is
// tested in offsiteBackup.test.js; here a fake downloader
// stands in for the child process.
//------------------------------------------------------

const DRIVE_FILE = "andon-20261028T210500Z-daily-2026-10-28.db";

function fakeDownload(value, calls = []) {

    return (name, dir) => {

        calls.push(name);
        fs.mkdirSync(dir, { recursive: true });
        writeDb(path.join(dir, name), value);

        return true;

    };

}

test("RESTORE_FROM_DRIVE: downloads the file, then restores it with a snapshot first", () => {

    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    const calls = [];
    const record = restoreIfRequested(dbPath, { download: fakeDownload("from drive", calls) });

    assert.deepEqual(calls, [DRIVE_FILE]);
    assert.equal(readValue(dbPath), "from drive");
    assert.equal(record.file, DRIVE_FILE);
    assert.equal(readValue(path.join(backupDir, record.snapshotOfPrevious)), "bad");

});

test("RESTORE_FROM_DRIVE: next boot with the variable still set does not download or restore again", () => {

    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    restoreIfRequested(dbPath, { download: fakeDownload("from drive") });
    setValue(dbPath, "new work after the restore");

    const calls = [];

    assert.equal(restoreIfRequested(dbPath, { download: fakeDownload("again", calls) }), null);
    assert.deepEqual(calls, []);
    assert.equal(readValue(dbPath), "new work after the restore");

});

test("RESTORE_FROM_DRIVE: failed download skips the restore and keeps the current database", () => {

    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    assert.equal(restoreIfRequested(dbPath, { download: () => false }), null);
    assert.equal(readValue(dbPath), "bad");

});

test("RESTORE_FROM_DRIVE: lost volume (no database, no backup folder) is rebuilt from Drive", () => {

    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dbPath)); // the new, empty volume

    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    const record = restoreIfRequested(dbPath, { download: fakeDownload("from drive") });

    assert.equal(readValue(dbPath), "from drive");
    assert.equal(record.snapshotOfPrevious, null);

});

test("RESTORE_BACKUP and RESTORE_FROM_DRIVE both set: nothing is downloaded or restored", () => {

    process.env.RESTORE_BACKUP = "andon-20261027T100000Z-before-0002.db";
    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    const calls = [];

    assert.equal(restoreIfRequested(dbPath, { download: fakeDownload("x", calls) }), null);
    assert.deepEqual(calls, []);
    assert.equal(readValue(dbPath), "bad");

});

test("RESTORE_FROM_DRIVE: names that are not backup files are rejected before any download", () => {

    for (const bad of ["../andon.db", "andon-x.db' or name != '", "secret.txt"]) {

        process.env.RESTORE_FROM_DRIVE = bad;

        const calls = [];

        assert.equal(restoreIfRequested(dbPath, { download: fakeDownload("x", calls) }), null, bad);
        assert.deepEqual(calls, [], bad);

    }

    assert.equal(readValue(dbPath), "bad");

});

test("RESTORE_FROM_DRIVE with the real child process: Drive not configured -> skipped, boots normally", () => {

    process.env.RESTORE_FROM_DRIVE = DRIVE_FILE;

    assert.equal(restoreIfRequested(dbPath), null);
    assert.equal(readValue(dbPath), "bad");
    assert.equal(fs.existsSync(path.join(backupDir, DRIVE_FILE)), false);

});
