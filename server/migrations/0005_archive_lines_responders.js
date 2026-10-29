//------------------------------------------------------
// 0005 Archive instead of delete (#15)
//
// Admin "Delete" erased production lines and responders
// for good: a deleted line left its work centers behind
// with no line, and a deleted responder was gone from
// Admin. They are now archived: archived_at is set (and
// active = 0), they are hidden everywhere, and Admin can
// restore them. Nothing existing is archived by this
// migration.
//
// Reversible: down drops the columns; archived rows then
// show again as inactive.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE production_lines ADD COLUMN archived_at INTEGER");
    db.exec("ALTER TABLE response_team ADD COLUMN archived_at INTEGER");

}

function down(db) {

    db.exec("ALTER TABLE production_lines DROP COLUMN archived_at");
    db.exec("ALTER TABLE response_team DROP COLUMN archived_at");

}

module.exports = { up, down };
