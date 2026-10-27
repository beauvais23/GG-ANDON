//------------------------------------------------------
// Migration Runner
//
// Files in this folder named NNNN_name.js export
// up(db) and down(db). Applied versions are recorded in
// schema_migrations. Before any migration (up or down)
// runs against a database that already has tables, a
// snapshot is written to <db folder>/backups and only the
// newest KEEP_BACKUPS snapshots are kept.
//
// Backups use VACUUM INTO, which is synchronous: the
// schema must exist before database.js prepares its
// statements at load time, so the async db.backup()
// cannot be awaited here.
//------------------------------------------------------

const fs = require("fs");
const path = require("path");

const KEEP_BACKUPS = 14;
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.js$/;

function listMigrations(dir = __dirname) {

    return fs.readdirSync(dir)
        .filter(file => FILE_PATTERN.test(file))
        .sort()
        .map(file => {

            const migration = require(path.join(dir, file));

            return {
                version: Number(file.match(FILE_PATTERN)[1]),
                name: file.replace(/\.js$/, ""),
                up: migration.up,
                down: migration.down
            };

        });

}

function ensureMigrationsTable(db) {

    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        )
    `);

}

function appliedVersions(db) {

    return new Set(
        db.prepare("SELECT version FROM schema_migrations")
            .all()
            .map(row => row.version)
    );

}

function hasUserTables(db) {

    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name <> 'schema_migrations'
    `).get();

    return row.count > 0;

}

function backupDirFor(dbPath) {

    return process.env.BACKUP_DIR ||
        path.join(path.dirname(dbPath), "backups");

}

function backupDatabase(db, dbPath, label) {

    const dir = backupDirFor(dbPath);

    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z");

    const file = path.join(dir, `andon-${stamp}-${label}.db`);

    db.prepare("VACUUM INTO ?").run(file);

    console.log(`✓ Database backup: ${file}`);

    pruneBackups(dir);

    return file;

}

function pruneBackups(dir, keep = KEEP_BACKUPS) {

    const files = fs.readdirSync(dir)
        .filter(file => /^andon-.*\.db$/.test(file))
        .sort();

    for (const file of files.slice(0, Math.max(0, files.length - keep))) {

        fs.unlinkSync(path.join(dir, file));

        console.log(`  Removed old backup: ${file}`);

    }

}

//------------------------------------------------------
// Apply all pending migrations
//------------------------------------------------------

function migrateUp(db, dbPath, dir = __dirname) {

    ensureMigrationsTable(db);

    const applied = appliedVersions(db);

    const pending =
        listMigrations(dir).filter(m => !applied.has(m.version));

    if (pending.length === 0) {

        console.log("✓ Migrations: up to date");

        return [];

    }

    if (hasUserTables(db)) {

        backupDatabase(
            db,
            dbPath,
            `before-${String(pending[0].version).padStart(4, "0")}`
        );

    }

    const record = db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
    `);

    for (const migration of pending) {

        db.transaction(() => {

            migration.up(db);

            record.run(migration.version, migration.name, Date.now());

        })();

        console.log(`✓ Migration applied: ${migration.name}`);

    }

    return pending.map(m => m.name);

}

//------------------------------------------------------
// Revert the most recently applied migration
//------------------------------------------------------

function migrateDown(db, dbPath, dir = __dirname) {

    ensureMigrationsTable(db);

    const last = db.prepare(`
        SELECT version
        FROM schema_migrations
        ORDER BY version DESC
        LIMIT 1
    `).get();

    if (!last) {

        console.log("Migrations: nothing to revert");

        return null;

    }

    const migration =
        listMigrations(dir).find(m => m.version === last.version);

    if (!migration) {

        throw new Error(`Migration file for version ${last.version} not found.`);

    }

    backupDatabase(
        db,
        dbPath,
        `before-down-${String(migration.version).padStart(4, "0")}`
    );

    db.transaction(() => {

        migration.down(db);

        db.prepare("DELETE FROM schema_migrations WHERE version = ?")
            .run(migration.version);

    })();

    console.log(`✓ Migration reverted: ${migration.name}`);

    return migration.name;

}

module.exports = {
    KEEP_BACKUPS,
    listMigrations,
    migrateUp,
    migrateDown,
    pruneBackups,
    backupDirFor
};

//------------------------------------------------------
// CLI: node migrations/runner.js [status|down]
//------------------------------------------------------

if (require.main === module) {

    const Database = require("better-sqlite3");

    const dbPath =
        process.env.DATABASE_PATH ||
        path.join(__dirname, "..", "andon.db");

    const db = new Database(dbPath);

    const command = process.argv[2] || "status";

    if (command === "down") {

        migrateDown(db, dbPath);

    } else {

        ensureMigrationsTable(db);

        const applied = appliedVersions(db);

        for (const m of listMigrations()) {

            console.log(`${applied.has(m.version) ? "applied" : "pending"}  ${m.name}`);

        }

    }

    db.close();

}
