//------------------------------------------------------
// 0015 BOM change requests (Nov 6 2026)
//
// A request names one config (QuickBooks assembly) and the
// level-1 lines to change: CHANGE_QTY, DELETE or ADD. Sending
// it posts one card to the BOM alert Google Chat space; the
// person who edits QuickBooks marks it DONE (or anyone
// CANCELS it), which posts a reply in the card's thread.
// The app never writes to QuickBooks and does not check it.
//
// bom_requests: code BOM-YYYY-NNN (New York year, NNN from
//   001, more digits after 999), the BOM as it was when sent
//   (snapshot, JSON), who/when, status, Chat delivery result.
// bom_request_lines: the marked changes.
//
// Reversible: down drops both tables.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE bom_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            year INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            sku TEXT NOT NULL,
            sku_description TEXT,
            line_group TEXT,
            reason TEXT NOT NULL,
            reference TEXT,
            note TEXT,
            requested_by TEXT NOT NULL,
            requested_at INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
            closed_by TEXT,
            closed_at INTEGER,
            close_note TEXT,
            snapshot TEXT,
            bom_as_of INTEGER,
            chat_sent_at INTEGER,
            chat_error TEXT,
            UNIQUE (year, seq)
        )
    `);

    db.exec(`
        CREATE TABLE bom_request_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('CHANGE_QTY', 'DELETE', 'ADD')),
            line INTEGER,
            component TEXT NOT NULL,
            description TEXT,
            old_qty REAL,
            new_qty REAL,
            uom TEXT
        )
    `);

    db.exec("CREATE INDEX idx_bom_request_lines_request ON bom_request_lines (request_id)");

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS bom_request_lines");
    db.exec("DROP TABLE IF EXISTS bom_requests");

}

module.exports = { up, down };
