//------------------------------------------------------
// Daily Database Backup
//
// Every CHECK_MINUTES, and once at boot: if it is at or
// after DAILY_BACKUP_HOUR (New York time, default 17 =
// 5 pm, after the 4:30 pm shift end) and no daily backup
// exists for today's New York date, write one to
// <db folder>/backups as andon-<UTC time>-daily-<date>.db.
// Checking on an interval (not one timer) means a server
// that was down at 5 pm catches up when it comes back.
// The newest 14 daily backups are kept.
//------------------------------------------------------

const fs = require("fs");
const path = require("path");

const { backupDirFor, pruneBackups } = require("../migrations/runner");
const { dateNY, hourNY } = require("./nyTime");

const CHECK_MINUTES = 10;

function backupHour() {

    const hour = Number(process.env.DAILY_BACKUP_HOUR ?? 17);

    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 17;

}

let running = false;

async function runDailyBackupIfDue(db, dbPath, now = Date.now()) {

    if (running || hourNY(now) < backupHour())
        return null;

    const dir = backupDirFor(dbPath);
    const today = dateNY(now);

    fs.mkdirSync(dir, { recursive: true });

    // A backup cut off by a restart or redeploy leaves a .partial file.
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".partial")))
        fs.rmSync(path.join(dir, file), { force: true });

    if (fs.readdirSync(dir).some(file => file.endsWith(`-daily-${today}.db`)))
        return null;

    running = true;

    try {

        const stamp = new Date(now).toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d+Z$/, "Z");

        const file = path.join(dir, `andon-${stamp}-daily-${today}.db`);

        // Online backup: does not block requests while it copies.
        // Written under a temporary name so an interrupted copy is
        // never mistaken for today's backup.
        await db.backup(`${file}.partial`);

        fs.renameSync(`${file}.partial`, file);

        console.log(`✓ Daily backup: ${file}`);

        pruneBackups(dir);

        return file;

    } catch (err) {

        console.error("✗ Daily backup failed:", err.message);

        return null;

    } finally {

        running = false;

    }

}

function startDailyBackups(db, dbPath) {

    console.log(
        `Daily backup: after ${backupHour()}:00 New York time, checked every ${CHECK_MINUTES} min`
    );

    runDailyBackupIfDue(db, dbPath);

    setInterval(
        () => runDailyBackupIfDue(db, dbPath),
        CHECK_MINUTES * 60 * 1000
    ).unref();

}

module.exports = {
    runDailyBackupIfDue,
    startDailyBackups
};
