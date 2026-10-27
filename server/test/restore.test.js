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
