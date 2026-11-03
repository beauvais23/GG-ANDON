//------------------------------------------------------
// 0012 PCB Test PASS / FAIL and FPY colours (Nov 3 2026)
//
// - board_taps.station and board_failures.station: FINAL
//   (the count station; counts toward the board's Actual)
//   or PCB (the PCB Test work center: PASS / FAIL per board
//   for PCB FPY; never part of Actual). Existing rows are
//   FINAL.
// - hourly_settings fpy_green_pct 99 (company FPY target,
//   Director, Nov 3 2026) and fpy_amber_pct 97.
//
// Reversible: down removes the settings and the columns.
//------------------------------------------------------

function up(db) {

    db.exec("ALTER TABLE board_taps ADD COLUMN station TEXT NOT NULL DEFAULT 'FINAL'");
    db.exec("ALTER TABLE board_failures ADD COLUMN station TEXT NOT NULL DEFAULT 'FINAL'");

    const add = db.prepare("INSERT OR IGNORE INTO hourly_settings (key, value, updated_at) VALUES (?, ?, ?)");

    add.run("fpy_green_pct", 99, Date.now());
    add.run("fpy_amber_pct", 97, Date.now());

}

function down(db) {

    db.exec("DELETE FROM hourly_settings WHERE key IN ('fpy_green_pct', 'fpy_amber_pct')");
    db.exec("ALTER TABLE board_failures DROP COLUMN station");
    db.exec("ALTER TABLE board_taps DROP COLUMN station");

}

module.exports = { up, down };
