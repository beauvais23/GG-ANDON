//------------------------------------------------------
// 0029 Backlog lines for accessory orders (Director, Nov 12 2026)
//
// Orders with only accessories / spare parts (leaders, jumpers, caps,
// controls, loose parts) matched no fixture family and showed line
// "Other". Two fixes:
//   line_prefix_key        item prefix → line, used only when the item
//                          is not a fixture SKU or family; admin-edited
//                          on the Backlog page ("Line key"). Seeded from
//                          the Director's corrected list (Nov 12 2026).
//   backlog_notes.line_override   a line set on one SO (detail drawer),
//                          kept across refreshes, logged.
//
// Reversible: down drops the table and the column.
//------------------------------------------------------

const SEED = [
    ["WPX-", "Team B"], ["GPX-", "Team B"], ["VPX-", "Team B"],
    ["DMX-", "Team B"], ["Z-DMX-", "Team B"],
    ["FBL-", "Team A"], ["PLL-", "Team A"]
];

function up(db) {

    db.exec(`
        CREATE TABLE line_prefix_key (
            prefix TEXT PRIMARY KEY,
            line_group TEXT NOT NULL,
            updated_by TEXT,
            updated_at INTEGER
        );

        ALTER TABLE backlog_notes ADD COLUMN line_override TEXT;
    `);

    const add = db.prepare("INSERT INTO line_prefix_key (prefix, line_group, updated_by, updated_at) VALUES (?, ?, 'seed (Director, Nov 12 2026)', ?)");
    const now = Date.now();

    for (const [prefix, line] of SEED)
        add.run(prefix, line, now);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS line_prefix_key; ALTER TABLE backlog_notes DROP COLUMN line_override;");

}

module.exports = { up, down, SEED };
