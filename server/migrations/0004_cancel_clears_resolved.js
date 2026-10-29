//------------------------------------------------------
// 0004 Cancelled alerts have no resolved time (#19)
//
// Cancel used to write its time into `resolved` as well
// as `cancelled_at`, so Telegram and Google Chat showed a
// cancelled alert as "Resolved". Cancel no longer writes
// `resolved`; this clears it on existing CANCELLED rows
// where it is only a copy of the cancel time.
//
// Reversible: down copies cancelled_at back into resolved
// for CANCELLED rows that have none.
//------------------------------------------------------

function up(db) {

    db.exec(`
        UPDATE alerts
        SET resolved = NULL
        WHERE status = 'CANCELLED'
          AND resolved IS NOT NULL
          AND resolved = cancelled_at
    `);

}

function down(db) {

    db.exec(`
        UPDATE alerts
        SET resolved = cancelled_at
        WHERE status = 'CANCELLED'
          AND resolved IS NULL
          AND cancelled_at IS NOT NULL
    `);

}

module.exports = { up, down };
