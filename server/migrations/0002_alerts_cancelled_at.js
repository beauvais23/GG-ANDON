//------------------------------------------------------
// 0002 alerts.cancelled_at
//
// Cancel used to record its time only in `resolved`, so
// cancelled alerts counted toward MTTR. Add cancelled_at
// and backfill it from `resolved` for existing CANCELLED
// rows. `resolved` is left as is: the Telegram and Google
// Chat formatters still read it for elapsed time.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE alerts ADD COLUMN cancelled_at INTEGER");

    db.exec(`
        UPDATE alerts
        SET cancelled_at = COALESCE(resolved, updated_at)
        WHERE status = 'CANCELLED'
    `);

}

function down(db) {

    db.exec("ALTER TABLE alerts DROP COLUMN cancelled_at");

}

module.exports = { up, down };
