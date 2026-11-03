//------------------------------------------------------
// 0010 Hour-by-hour board: count corrections (Nov 3 2026)
//
// board_adjustments: a lead's correction to an hour's
// Actual for one SKU (missed taps, double taps, wrong SKU,
// wrong hour), as a signed delta with a required reason and
// the name of who made it. Kept as an audit trail: a
// correction is never edited or deleted; a wrong one is
// fixed by another correction. Actual = taps + corrections,
// never below 0.
//
// Reversible: down drops the table.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE board_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board TEXT NOT NULL,
            plan_date TEXT NOT NULL,
            period INTEGER NOT NULL,
            sku TEXT NOT NULL,
            delta INTEGER NOT NULL CHECK (delta <> 0),
            reason TEXT NOT NULL,
            adjusted_by TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);

    db.exec("CREATE INDEX idx_board_adjustments_day ON board_adjustments (board, plan_date)");

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS board_adjustments");

}

module.exports = { up, down };
