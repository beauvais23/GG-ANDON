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

    migrateDown(db, dbPath); // 0008

    migrateDown(db, dbPath); // 0007
    migrateDown(db, dbPath); // 0006
    migrateDown(db, dbPath); // 0005
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

    migrateDown(db, dbPath); // 0008

    migrateDown(db, dbPath); // 0007
    migrateDown(db, dbPath); // 0006
    migrateDown(db, dbPath); // 0005
    migrateDown(db, dbPath); // 0004

    assert.deepEqual(read()[0], { status: "CANCELLED", resolved: 5000, cancelled_at: 5000 });
    assert.equal(read()[1].resolved, 9000);

});

test("0005: archived_at added to production_lines and response_team, empty; down drops both", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    db.prepare("INSERT INTO production_lines (name, facility, display_order) VALUES ('Team A', 'Malta', 1)").run();
    db.prepare("INSERT INTO response_team (name, department) VALUES ('Test Responder', 'Operations')").run();

    migrateUp(db, dbPath);

    const cols = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

    assert.ok(cols("production_lines").includes("archived_at"));
    assert.ok(cols("response_team").includes("archived_at"));

    // Nothing existing is archived.
    assert.equal(db.prepare("SELECT archived_at FROM production_lines").get().archived_at, null);
    assert.equal(db.prepare("SELECT archived_at FROM response_team").get().archived_at, null);

    migrateDown(db, dbPath); // 0008

    migrateDown(db, dbPath); // 0007
    migrateDown(db, dbPath); // 0006
    migrateDown(db, dbPath); // 0005

    assert.ok(!cols("production_lines").includes("archived_at"));
    assert.ok(!cols("response_team").includes("archived_at"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM production_lines").get().n, 1);

});

test("0006: line groups set by name, role/line_group columns, default escalation rules; down drops it all", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    const line = db.prepare("INSERT INTO production_lines (name, facility, display_order) VALUES (?, 'Malta', ?)");

    ["Team A", "Team B", "Gigabay", "Gigabay - Vertical", "Terabay", "Deca", "Test Line"].forEach((n, i) => line.run(n, i + 1));

    migrateUp(db, dbPath);

    const groups = db.prepare("SELECT name, line_group FROM production_lines ORDER BY display_order").all();

    assert.deepEqual(groups.map(g => g.line_group), ["Team A", "Team B", "SpaceX", "SpaceX", "SpaceX", "SpaceX", null]);

    const cols = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

    assert.ok(cols("response_team").includes("role") && cols("response_team").includes("line_group"));

    const rules = db.prepare("SELECT alert_type, step, minutes, role FROM escalation_rules ORDER BY id").all();

    assert.equal(rules.length, 13);
    assert.deepEqual(rules[0], { alert_type: "*", step: "START", minutes: 0, role: "Production Lead" });
    assert.ok(rules.some(r => r.alert_type === "QUALITY" && r.role === "Manufacturing Engineer"));
    assert.ok(rules.some(r => r.step === "OPEN_ACK" && r.minutes === 30));
    assert.ok(!rules.some(r => r.alert_type === "NEAR_MISS"));

    migrateDown(db, dbPath); // 0008

    migrateDown(db, dbPath); // 0007
    migrateDown(db, dbPath); // 0006

    assert.ok(!cols("response_team").includes("role"));
    assert.ok(!cols("production_lines").includes("line_group"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'escalation_%'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM production_lines").get().n, 7);

});

test("0007: product families from the Ship Report prefixes (+ SpaceX and the 30 coatable PCBs), empty rates and plans; down drops them", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    migrateUp(db, dbPath);

    const fams = db.prepare("SELECT board, prefix FROM product_families").all();
    const on = board => fams.filter(f => f.board === board).map(f => f.prefix);

    assert.equal(on("Team A").length, 15);
    assert.equal(on("Team B").length, 25);
    assert.ok(on("Team A").includes("Z-DMX") && on("Team B").includes("WPXP2"));
    assert.deepEqual(on("Gigabay - Vertical"), ["GIGA8-VERT"]);
    assert.equal(on("Coating").length, 30);
    assert.ok(on("Coating").includes("30-72027-000-C") && !on("Coating").includes("30-"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM rates").get().n, 0);

    migrateDown(db, dbPath); // 0008

    migrateDown(db, dbPath); // 0007

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('product_families', 'rates', 'plans', 'plan_runs')").get().n, 0);

});

test("0008: the 19 SpaceX SKUs are listed under GIGA / GIGA8-VERT / TERA / DECA; down drops the list", () => {

    const { db, dbPath } = open();

    db.exec(LIVE_SCHEMA);

    migrateUp(db, dbPath);

    const rows = db.prepare("SELECT f.prefix, COUNT(*) AS n FROM product_skus s JOIN product_families f ON f.id = s.family_id GROUP BY f.prefix ORDER BY f.prefix").all();

    assert.deepEqual(rows, [{ prefix: "DECA", n: 1 }, { prefix: "GIGA", n: 12 }, { prefix: "GIGA8-VERT", n: 1 }, { prefix: "TERA", n: 5 }]);

    migrateDown(db, dbPath); // 0008

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'product_skus'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM product_families").get().n, 74);

});
