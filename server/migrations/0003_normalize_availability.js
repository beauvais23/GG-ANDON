//------------------------------------------------------
// 0003 Normalize response_team.availability
//
// One enum, matching the frontend: Available, Responding,
// Busy, Away. Rows seeded as 'AVAILABLE' (or any other
// casing of these four) are rewritten. Other values are
// left alone.
//------------------------------------------------------

const AVAILABILITY = ["Available", "Responding", "Busy", "Away"];

function up(db) {

    const update = db.prepare(`
        UPDATE response_team
        SET availability = ?
        WHERE LOWER(TRIM(availability)) = LOWER(?)
          AND availability <> ?
    `);

    for (const value of AVAILABILITY)
        update.run(value, value, value);

}

function down() {

    // The original casing is not recorded, so there is nothing
    // to restore. The app reads all four values the same way the
    // old code did; restore the pre-0003 backup if needed.

}

module.exports = { up, down, AVAILABILITY };
