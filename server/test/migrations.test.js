const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { tempDir } = require("./helpers");
const {
    migrateUp,
    migrateDown,
    pruneBackups,
    backupDirFor,
    KEEP_BACKUPS
} = require("../migrations/runner");

// Schema exactly as the pre-migration database.js (39e8b5d5) created it,
// i.e. what the live database has today.
const LIVE_SCHEMA = fs.readFileSync(
    path.join(__dirname, "fixtures", "schema-39e8b5d5.sql"),
    "utf8"
);

// A migrations folder holding only 0001, for tests about the baseline itself.
function baselineOnly() {

    const dir = tempDir();

    fs.copyFileSync(
        path.join(__dirname, "..", "migrations", "0001_baseline.js"),
        path.join(dir, "0001_baseline.js")
    );

    return dir;

}

function open() {

    const dbPath = path.join(tempDir(), "andon.db");

    return { db: new Database(dbPath), dbPath };

}

function schemaOf(db) {

    return db.prepare(`
        SELECT type, name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
          AND name <> 'schema_migrations'
        ORDER BY type, name
    `).all();

}

function backups(dbPath) {

    const dir = backupDirFor(dbPath);

    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];

}

test("fresh database: 0001 creates the schema, no backup, rerun is a no-op", () => {

    const { db, dbPath } = open();
    const dir = baselineOnly();

    assert.deepEqual(migrateUp(db, dbPath, dir), ["0001_baseline"]);

    const tables = schemaOf(db).filter(r => r.type === "table").map(r => r.name);

    assert.deepEqual(tables, [
        "alerts",
        "kpi_history",
        "production_lines",
        "response_team",
        "work_centers"
    ]);

    assert.equal(backups(dbPath).length, 0);

    assert.deepEqual(migrateUp(db, dbPath, dir), []);

    assert.equal(backups(dbPath).length, 0);

});

test("live database (39e8b5d5 schema + data): 0001 changes nothing and backs up first", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    db.prepare(`
        INSERT INTO alerts
        (production_line, work_center, type, status, requested, created_at, updated_at)
        VALUES ('Team A', 'Assembly', 'QUALITY', 'RESOLVED', 1, 1, 2)
    `).run();

    const schemaBefore = schemaOf(db);
    const alertsBefore = db.prepare("SELECT * FROM alerts").all();

    assert.deepEqual(migrateUp(db, dbPath, baselineOnly()), ["0001_baseline"]);

    assert.deepEqual(schemaOf(db), schemaBefore);
    assert.deepEqual(db.prepare("SELECT * FROM alerts").all(), alertsBefore);

    const files = backups(dbPath);

    assert.equal(files.length, 1);
    assert.match(files[0], /^andon-\d{8}T\d{6}Z-before-0001\.db$/);

    const copy = new Database(path.join(backupDirFor(dbPath), files[0]), { readonly: true });

    assert.deepEqual(copy.prepare("SELECT * FROM alerts").all(), alertsBefore);

    copy.close();

});

test("older database missing the message-id columns gets them added", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);
    db.exec("ALTER TABLE alerts DROP COLUMN google_message_id");
    db.exec("ALTER TABLE alerts DROP COLUMN telegram_message_id");

    migrateUp(db, dbPath);

    const columns = db.prepare("PRAGMA table_info(alerts)").all().map(c => c.name);

    assert.ok(columns.includes("google_message_id"));
    assert.ok(columns.includes("telegram_message_id"));

});

test("baseline cannot be reverted", () => {

    const { db, dbPath } = open();
    const dir = baselineOnly();

    migrateUp(db, dbPath, dir);

    assert.throws(() => migrateDown(db, dbPath, dir), /cannot be reverted/);

    const versions = db.prepare("SELECT version FROM schema_migrations").all();

    assert.deepEqual(versions, [{ version: 1 }]);

});

test("numbered up/down: applies in order, down reverts the latest with a backup", () => {

    const dir = tempDir();

    fs.writeFileSync(path.join(dir, "0001_first.js"), `
        module.exports = {
            up: db => db.exec("CREATE TABLE a (id INTEGER)"),
            down: db => db.exec("DROP TABLE a")
        };`);

    fs.writeFileSync(path.join(dir, "0002_second.js"), `
        module.exports = {
            up: db => db.exec("CREATE TABLE b (id INTEGER)"),
            down: db => db.exec("DROP TABLE b")
        };`);

    const { db, dbPath } = open();

    assert.deepEqual(migrateUp(db, dbPath, dir), ["0001_first", "0002_second"]);

    assert.equal(migrateDown(db, dbPath, dir), "0002_second");

    const tables = schemaOf(db).map(r => r.name);

    assert.deepEqual(tables, ["a"]);
    assert.ok(backups(dbPath).some(f => f.includes("before-down-0002")));

    assert.deepEqual(migrateUp(db, dbPath, dir), ["0002_second"]);

});

test("a failing migration rolls back and is not recorded", () => {

    const dir = tempDir();

    fs.writeFileSync(path.join(dir, "0001_broken.js"), `
        module.exports = {
            up: db => { db.exec("CREATE TABLE c (id INTEGER)"); db.exec("NOT SQL"); },
            down: () => {}
        };`);

    const { db, dbPath } = open();

    assert.throws(() => migrateUp(db, dbPath, dir));

    assert.deepEqual(schemaOf(db), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 0);

});

test(`backups: only the newest ${KEEP_BACKUPS} are kept`, () => {

    const dir = tempDir();

    for (let i = 1; i <= KEEP_BACKUPS + 3; i++) {

        fs.writeFileSync(
            path.join(dir, `andon-202601${String(i).padStart(2, "0")}T000000Z-before-0001.db`),
            ""
        );

    }

    fs.writeFileSync(path.join(dir, "unrelated.txt"), "");

    pruneBackups(dir);

    const left = fs.readdirSync(dir).sort();

    assert.equal(left.filter(f => f.startsWith("andon-")).length, KEEP_BACKUPS);
    assert.ok(!left.includes("andon-20260101T000000Z-before-0001.db"));
    assert.ok(left.includes(`andon-202601${KEEP_BACKUPS + 3}T000000Z-before-0001.db`));
    assert.ok(left.includes("unrelated.txt"));

});

test("0002: cancelled_at added and backfilled for CANCELLED rows only; down drops it", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    const insert = db.prepare(`
        INSERT INTO alerts
        (production_line, work_center, type, status, requested, resolved, created_at, updated_at)
        VALUES ('Team A', 'Assembly', 'QUALITY', ?, 1000, ?, 1000, ?)
    `);

    insert.run("CANCELLED", 5000, 5000);
    insert.run("RESOLVED", 9000, 9000);
    insert.run("CANCELLED", null, 7000);
    insert.run("ACTIVE", null, 1000);

    migrateUp(db, dbPath);

    const rows = db.prepare("SELECT status, resolved, cancelled_at FROM alerts ORDER BY id").all();

    // resolved on the first row is cleared again by 0004 (#19).
    assert.deepEqual(rows, [
        { status: "CANCELLED", resolved: null, cancelled_at: 5000 },
        { status: "RESOLVED", resolved: 9000, cancelled_at: null },
        { status: "CANCELLED", resolved: null, cancelled_at: 7000 },
        { status: "ACTIVE", resolved: null, cancelled_at: null }
    ]);

    migrateDown(db, dbPath); // 0004
    migrateDown(db, dbPath); // 0003 (no-op)
    migrateDown(db, dbPath); // 0002

    const columns = db.prepare("PRAGMA table_info(alerts)").all().map(c => c.name);

    assert.ok(!columns.includes("cancelled_at"));

});

test("0003: availability normalized to Available/Responding/Busy/Away", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    const insert = db.prepare(`
        INSERT INTO response_team (name, department, availability)
        VALUES (?, 'Ops', ?)
    `);

    const input = ["AVAILABLE", "available", "Responding", "RESPONDING", "busy", " Away ", "Off Site"];

    input.forEach((value, i) => insert.run(`Person ${i}`, value));

    migrateUp(db, dbPath);

    const values = db.prepare("SELECT availability FROM response_team ORDER BY id").all().map(r => r.availability);

    assert.deepEqual(values, ["Available", "Available", "Responding", "Responding", "Busy", "Away", "Off Site"]);

});

test("0004: cancelled alerts lose the copied resolved time; resolved alerts untouched; down restores it", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    const insert = db.prepare(`
        INSERT INTO alerts
        (production_line, work_center, type, status, requested, resolved, created_at, updated_at)
        VALUES ('Team A', 'Assembly', 'QUALITY', ?, 1000, ?, 1000, ?)
    `);

    insert.run("CANCELLED", 5000, 5000);  // old cancel: resolved = cancel time
    insert.run("RESOLVED", 9000, 9000);
    insert.run("ACKNOWLEDGED", null, 2000);

    migrateUp(db, dbPath);

    const read = () => db.prepare("SELECT status, resolved, cancelled_at FROM alerts ORDER BY id").all();

    assert.deepEqual(read(), [
        { status: "CANCELLED", resolved: null, cancelled_at: 5000 },
        { status: "RESOLVED", resolved: 9000, cancelled_at: null },
        { status: "ACKNOWLEDGED", resolved: null, cancelled_at: null }
    ]);

    migrateDown(db, dbPath); // 0004

    assert.deepEqual(read()[0], { status: "CANCELLED", resolved: 5000, cancelled_at: 5000 });
    assert.equal(read()[1].resolved, 9000);

});
