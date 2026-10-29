//------------------------------------------------------
// Child process for RESTORE_FROM_DRIVE (defect #22)
//
//   node migrations/fetchFromDrive.js <backup file name> <backup dir>
//
// restore.js runs this synchronously at boot, before the
// database opens (the download itself is async). Exit 0 =
// file is in <backup dir>; exit 1 = reason on stderr.
//------------------------------------------------------

const { downloadFromDrive } = require("../services/offsiteBackup");

const [name, dir] = process.argv.slice(2);

downloadFromDrive(name, dir)
    .then(({ sizeBytes }) => {

        console.log(`✓ RESTORE_FROM_DRIVE: downloaded ${name} (${Math.round(sizeBytes / 1024)} KB).`);
        process.exit(0);

    })
    .catch(err => {

        console.error(`✗ RESTORE_FROM_DRIVE: ${err.name === "TimeoutError" ? "Google Drive timed out" : err.message}`);
        process.exit(1);

    });
