//------------------------------------------------------
// Restore From Backup (RESTORE_BACKUP)
//
// Set RESTORE_BACKUP on the Railway service to the file
// name of a backup in <db folder>/backups, e.g.
//   andon-20261027T165140Z-before-0001.db
// On the next boot, before the database is opened:
//   1. the current database is snapshotted (-before-restore)
//   2. the backup is checked (PRAGMA quick_check)
//   3. the backup replaces the database
// The restored file name is recorded in last-restore.json,
// so a forgotten variable never restores twice. Any
// problem skips the restore and boots the current database.
//------------------------------------------------------

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const {
    backupDirFor,
    backupDatabase,
    pruneBackups
} = require("./runner");

const NAME_PATTERN = /^andon-[A-Za-z0-9_-]+\.db$/;
const MARKER = "last-restore.json";

function listBackups(dir) {

    if (!fs.existsSync(dir))
        return [];

    return fs.readdirSync(dir)
        .filter(file => NAME_PATTERN.test(file))
        .sort()
        .reverse();

}

function logAvailableBackups(dir) {

    const files = listBackups(dir);

    console.log(`Backups in ${dir} (newest first): ${files.length}`);

    for (const file of files) {

        const kb = Math.round(fs.statSync(path.join(dir, file)).size / 1024);

        console.log(`  ${file} (${kb} KB)`);

    }

}

function readMarker(dir) {

    try {

        return JSON.parse(fs.readFileSync(path.join(dir, MARKER), "utf8"));

    } catch {

        return null;

    }

}

function isHealthy(file) {

    try {

        const db = new Database(file, { readonly: true, fileMustExist: true });

        const result = db.pragma("quick_check", { simple: true });

        db.close();

        return result === "ok";

    } catch {

        return false;

    }

}

function skip(reason) {

    console.error(`✗ RESTORE_BACKUP skipped: ${reason} Booting the current database.`);

    return null;

}

function restoreIfRequested(dbPath) {

    const dir = backupDirFor(dbPath);

    logAvailableBackups(dir);

    const name = (process.env.RESTORE_BACKUP || "").trim();

    if (!name)
        return null;

    if (!NAME_PATTERN.test(name))
        return skip(`"${name}" is not a backup file name (andon-….db).`);

    const source = path.join(dir, name);

    if (!fs.existsSync(source))
        return skip(`${name} not found in ${dir}.`);

    const marker = readMarker(dir);

    if (marker && marker.file === name) {

        console.log(
            `RESTORE_BACKUP: ${name} was already restored at ${marker.restoredAt}. ` +
            "Nothing to do. Remove RESTORE_BACKUP from the Railway variables."
        );

        return null;

    }

    if (!isHealthy(source))
        return skip(`${name} failed the SQLite integrity check.`);

    //--------------------------------------------------
    // Snapshot the current database first, so the
    // restore itself can be undone. No pruning yet: the
    // file being restored may be the oldest one.
    //--------------------------------------------------

    let snapshot = null;

    if (fs.existsSync(dbPath)) {

        const current = new Database(dbPath);

        snapshot = backupDatabase(current, dbPath, "before-restore", { prune: false });

        current.close();

    }

    //--------------------------------------------------
    // Replace: copy to a temp file, drop stale WAL/SHM
    // files so they are not replayed onto the restored
    // data, then rename into place.
    //--------------------------------------------------

    const temp = `${dbPath}.restoring`;

    fs.copyFileSync(source, temp);

    for (const suffix of ["-wal", "-shm"]) {

        fs.rmSync(dbPath + suffix, { force: true });

    }

    fs.renameSync(temp, dbPath);

    const record = {
        file: name,
        restoredAt: new Date().toISOString(),
        snapshotOfPrevious: snapshot ? path.basename(snapshot) : null
    };

    fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(record, null, 2));

    pruneBackups(dir);

    console.log(`✓ RESTORED database from ${name}.`);
    console.log(`  Previous database saved as ${record.snapshotOfPrevious}.`);
    console.log("  Remove RESTORE_BACKUP from the Railway variables.");

    return record;

}

module.exports = {
    restoreIfRequested,
    listBackups
};
