//------------------------------------------------------
// 0021 Telegram groups for near misses and BOM requests
// (Director, Nov 9 2026: Google Chat removed)
//
// alerts.telegram_group_message_id: the near miss message in the
// Near Miss Telegram group (redrawn as VOIDED on undo / void).
// alerts.telegram_message_id stays the main ANDON channel's.
// bom_requests.telegram_message_id / telegram_error: the message
// in the BOM Telegram group (Done / Cancelled edit it and reply
// to it) and the last delivery error.
//
// Reversible: down drops the three columns.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE alerts ADD COLUMN telegram_group_message_id TEXT");
    db.exec("ALTER TABLE bom_requests ADD COLUMN telegram_message_id TEXT");
    db.exec("ALTER TABLE bom_requests ADD COLUMN telegram_error TEXT");

}

function down(db) {

    db.exec("ALTER TABLE bom_requests DROP COLUMN telegram_error");
    db.exec("ALTER TABLE bom_requests DROP COLUMN telegram_message_id");
    db.exec("ALTER TABLE alerts DROP COLUMN telegram_group_message_id");

}

module.exports = { up, down };
