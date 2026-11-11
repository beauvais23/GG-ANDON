//------------------------------------------------------
// 0024 Backlog & delivery risk (Director, Nov 10 2026)
//
// qb_open_so_lines gets the fields the backlog page shows:
//   unit_price  QuickBooks UnitPrice (open $ = open qty × price)
//   sales_rep   QuickBooks SalesRep (rep agency, e.g. GG-DI)
//   industry    CustomFields Industry (Industrial / Car Wash)
//   project     CustomFields ProjectName
// They fill on the next order refresh (hourly).
//
// backlog_notes: one row per sales order, entered on the page and
// kept across every QuickBooks refresh until someone clears it:
// recovery date, material clear date, ops comment, sales note,
// last updated by / at (any login + a typed name, like BOM requests).
// backlog_note_log: every change (field, old, new, by, at).
//
// Reversible: down drops both tables and the four columns.
//------------------------------------------------------

const COLUMNS = [["unit_price", "REAL"], ["sales_rep", "TEXT"], ["industry", "TEXT"], ["project", "TEXT"]];

function up(db) {

    for (const [name, type] of COLUMNS)
        db.exec(`ALTER TABLE qb_open_so_lines ADD COLUMN ${name} ${type}`);

    db.exec(`
        CREATE TABLE backlog_notes (
            so TEXT PRIMARY KEY,
            recovery_date TEXT,
            material_clear_date TEXT,
            ops_comment TEXT,
            sales_note TEXT,
            updated_by TEXT,
            updated_at INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE backlog_note_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            so TEXT NOT NULL,
            field TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_by TEXT,
            changed_at INTEGER NOT NULL
        )
    `);

    db.exec("CREATE INDEX idx_backlog_note_log_so ON backlog_note_log (so)");

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS backlog_note_log");
    db.exec("DROP TABLE IF EXISTS backlog_notes");

    for (const [name] of [...COLUMNS].reverse())
        db.exec(`ALTER TABLE qb_open_so_lines DROP COLUMN ${name}`);

}

module.exports = { up, down };
