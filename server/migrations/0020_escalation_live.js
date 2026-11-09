//------------------------------------------------------
// 0020 Escalation live in Slack (Nov 9 2026, Slack S4)
//
// escalation_settings: send_slack '0' / '1', the Admin →
// Escalation switch. '0' (default) = shadow mode as before:
// log only, nothing sent. '1' = each due step is also posted as
// @mentions in the alert's #andon-alerts thread.
// escalation_log.slack_sent_at / slack_error: what happened to
// each step's Slack post (shown in the Admin log).
//
// Reversible: down drops the table and both columns.
//------------------------------------------------------

function up(db) {

    db.exec("CREATE TABLE escalation_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)");
    db.prepare("INSERT INTO escalation_settings (key, value, updated_at) VALUES ('send_slack', '0', ?)").run(Date.now());
    db.exec("ALTER TABLE escalation_log ADD COLUMN slack_sent_at INTEGER");
    db.exec("ALTER TABLE escalation_log ADD COLUMN slack_error TEXT");

}

function down(db) {

    db.exec("ALTER TABLE escalation_log DROP COLUMN slack_error");
    db.exec("ALTER TABLE escalation_log DROP COLUMN slack_sent_at");
    db.exec("DROP TABLE IF EXISTS escalation_settings");

}

module.exports = { up, down };
