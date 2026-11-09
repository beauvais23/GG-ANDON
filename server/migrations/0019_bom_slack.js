//------------------------------------------------------
// 0019 Slack message per BOM change request (Nov 9 2026, Slack S3)
//
// bom_requests.slack_channel / slack_ts: the #bom-changes message
// posted for the request, so Done / Cancelled redraw it and reply
// in its thread. Empty for requests sent before Slack S3.
//
// Reversible: down drops both columns.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE bom_requests ADD COLUMN slack_channel TEXT");
    db.exec("ALTER TABLE bom_requests ADD COLUMN slack_ts TEXT");

}

function down(db) {

    db.exec("ALTER TABLE bom_requests DROP COLUMN slack_ts");
    db.exec("ALTER TABLE bom_requests DROP COLUMN slack_channel");

}

module.exports = { up, down };
