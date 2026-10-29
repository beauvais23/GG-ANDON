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
//
// RESTORE_FROM_DRIVE (defect #22) works the same way for a
// backup that exists only in the Google Drive folder, e.g.
// after the Railway volume was lost: the file is downloaded
// into the backup folder first, then restored as above.
// Set one of the two variables, not both.
//------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
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

    console.error(`✗ Restore skipped: ${reason} Booting the current database.`);

    return null;

}

const DRIVE_TIMEOUT_MS = 2 * 60 * 1000;

// Downloads in a child process so the boot can wait for it
// synchronously. Returns true when the file is now local.
function downloadWithChild(name, dir) {

    try {

        execFileSync(
            process.execPath,
            [path.join(__dirname, "fetchFromDrive.js"), name, dir],
            { stdio: "inherit", timeout: DRIVE_TIMEOUT_MS }
        );

        return true;

    } catch {

        return false;

    }

}

function restoreIfRequested(dbPath, { download = downloadWithChild } = {}) {

    const dir = backupDirFor(dbPath);

    const local = (process.env.RESTORE_BACKUP || "").trim();
    const fromDrive = (process.env.RESTORE_FROM_DRIVE || "").trim();

    if (local && fromDrive) {

        logAvailableBackups(dir);

        return skip("both RESTORE_BACKUP and RESTORE_FROM_DRIVE are set; set only one.");

    }

    const name = local || fromDrive;

    if (name && !NAME_PATTERN.test(name)) {

        logAvailableBackups(dir);

        return skip(`"${name}" is not a backup file name (andon-….db).`);

    }

    // Fetch from Drive unless the file is already here (e.g. a
    // later boot with the variable still set).
    if (fromDrive && !fs.existsSync(path.join(dir, name))) {

        console.log(`RESTORE_FROM_DRIVE: downloading ${name} from Google Drive…`);

        if (!download(name, dir))
            return skip(`${name} could not be downloaded from Google Drive.`);

    }

    logAvailableBackups(dir);

    if (!name)
        return null;

    const source = path.join(dir, name);

    if (!fs.existsSync(source))
        return skip(`${name} not found in ${dir}.`);

    const marker = readMarker(dir);

    if (marker && marker.file === name) {

        console.log(
            `RESTORE_BACKUP: ${name} was already restored at ${marker.restoredAt}. ` +
            "Nothing to do. Remove RESTORE_BACKUP / RESTORE_FROM_DRIVE from the Railway variables."
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
    console.log("  Remove RESTORE_BACKUP / RESTORE_FROM_DRIVE from the Railway variables.");

    return record;

}

module.exports = {
    NAME_PATTERN,
    restoreIfRequested,
    listBackups
};
