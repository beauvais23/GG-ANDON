//------------------------------------------------------
// 0018 Slack member ID per responder (Nov 9 2026, Slack S2)
//
// response_team.slack_user_id (U…/W…, Slack profile → ⋮ → Copy
// member ID) links a Slack user to a responder, so Acknowledge /
// Resolve / Cancel pressed in Slack are recorded under that
// responder (hard rule 4: entered in Admin, never seeded).
// One Slack user per active responder (checked by the route).
//
// Reversible: down drops the column.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE response_team ADD COLUMN slack_user_id TEXT");

}

function down(db) {

    db.exec("ALTER TABLE response_team DROP COLUMN slack_user_id");

}

module.exports = { up, down };
