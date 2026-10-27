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

    assert.deepEqual(migrateUp(db, dbPath), ["0001_baseline"]);

    const tables = schemaOf(db).filter(r => r.type === "table").map(r => r.name);

    assert.deepEqual(tables, [
        "alerts",
        "kpi_history",
        "production_lines",
        "response_team",
        "work_centers"
    ]);

    assert.equal(backups(dbPath).length, 0);

    assert.deepEqual(migrateUp(db, dbPath), []);

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

    assert.deepEqual(migrateUp(db, dbPath), ["0001_baseline"]);

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

    migrateUp(db, dbPath);

    assert.throws(() => migrateDown(db, dbPath), /cannot be reverted/);

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
