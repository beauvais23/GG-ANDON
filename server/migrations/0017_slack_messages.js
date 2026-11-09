//------------------------------------------------------
// 0017 Slack message per alert (Nov 9 2026, Slack S1)
//
// alerts.slack_channel / slack_ts: the #andon-alerts message
// posted for the alert, so acknowledge / resolve / cancel /
// note update the same message (chat.update) and reply in its
// thread. Empty for alerts raised before Slack and for near
// misses (not sent to Slack until S3).
//
// Reversible: down drops both columns.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE alerts ADD COLUMN slack_channel TEXT");
    db.exec("ALTER TABLE alerts ADD COLUMN slack_ts TEXT");

}

function down(db) {

    db.exec("ALTER TABLE alerts DROP COLUMN slack_ts");
    db.exec("ALTER TABLE alerts DROP COLUMN slack_channel");

}

module.exports = { up, down };
