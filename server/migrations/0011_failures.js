//------------------------------------------------------
// 0011 Hour-by-hour board, H3: failures, rework, scrap
// (Nov 3 2026)
//
// - failure_codes: the NCM form's Failure Code list (57,
//   from the Director, Nov 3 2026), shown on the tablet
//   after FAIL. Admin-editable (add, turn off).
// - board_failures: one row per unit that failed at the
//   count station. fail_id is made on the tablet (offline
//   queue, stored once). It stays open until dispositioned:
//   REWORK_PASS (adds 1 to Actual in the hour it passed,
//   Director option A) or SCRAP (the tablet offers the NCM
//   form). undone_at = taken back within 30 s.
//
// FPY = first-pass good / (first-pass good + first-pass
// fails); reworked passes are not first-pass good.
//
// Reversible: down drops both tables.
//------------------------------------------------------

const CODES = [
    "FA 010 - APPEARANCE / AESTHETIC ISSUE",
    "FA 020 - ASSEMBLY / FIT ISSUE",
    "FA 030 - CONTAMINATION",
    "FA 040 - DAMAGED",
    "FA 050 - DIMENSIONAL ISSUE",
    "FA 060 - FUNCTIONAL TEST FAILURE",
    "FA 070 - INCORRECT COMPONENT",
    "FA 080 - LABELING / IDENTIFICATION ISSUE",
    "FA 090 - LEAK TEST FAILURE",
    "FA 100 - MISSING / LOOSE COMPONENT",
    "FA 110 - FALSE POSITIVE LEAK TEST",
    "FA 120 - OPTIC / GLARE CONTROL ISSUE",
    "FA 130 - BURN FAILURE",
    "EC 010 - APPEARANCE / AESTHETIC ISSUE",
    "EC 020 - ASSEMBLY / FIT ISSUES",
    "EC 030 - DAMAGED COMPONENT",
    "EC 040 - DIMENSIONAL ISSUE",
    "EC 050 - INCORRECT COMPONENT / ASSEMBLY",
    "EC 060 - MISSING COMPONENT",
    "EC 070 - MOLDING / EXTRUSION ISSUE",
    "EC 080 - GLUE ISSUES",
    "TH 010 - APPEARANCE / AESTHETIC ISSUE",
    "TH 020 - ASSEMBLY / FIT ISSUE",
    "TH 030 - CONTAMINATION",
    "TH 040 - DAMAGED TUBE",
    "TH 050 - DIMENSIONAL ISSUE",
    "TH 060 - GLUE ISSUES",
    "TH 070 - MOLDING / EXTRUSION ISSUE",
    "BA 010 - APPEARANCE / AESTHETIC ISSUE",
    "BA 020 - BOARD PROGRAMMING ISSUE",
    "BA 030 - DAMAGED BOARD",
    "BA 040 - DIMENSIONAL ISSUE",
    "BA 050 - HALF LIT / PARTIAL FUNCTION",
    "BA 060 - INCORRECT COMPONENT ASSEMBLY",
    "BA 070 - LIGHT / SECTION BLOCKING",
    "BA 080 - LIGHT FLICKERING",
    "BA 090 - MISSING / LOOSE / DAMAGED COMPONENT (SOLDERING)",
    "BA 100 - NO POWER",
    "BA 110 - INCORRECT WATTS / VOLTAGE",
    "HA 010 - DAMAGED COMPONENT",
    "HA 020 - EXPOSED WIRING / MISSING INSULATION",
    "HA 030 - INCORRECT COMPONENT / ASSEMBLY",
    "HA 040 - DIMENSIONAL ISSUE",
    "HA 050 - MISSING / LOOSE / DAMAGED COMPONENT",
    "HA 060 - FUNCTIONAL ISSE",                       // spelled as in the form (pre-fill must match)
    "HA 070 - GLUE NOT CURED / GLUE MISSING",
    "CB 010 - COMPONENT ISSUE",
    "CB 020 - DAMAGED COMPONENT",
    "CB 030 - ELECTRICAL FAILURE",
    "CB 040 - INCORRECT COMPONENT / ASSEMBLY",
    "CB 050 - PROGRAMMING ISSUE",
    "DV 010 - PROGRAMMING ISSUE",
    "DV 020 - DAMAGED UNIT",
    "DV 030 - FUNCTIONAL FAILURE",
    "AL 010 - APPEARANCE / AESTHETIC ISSUE",
    "AL 020 - DIMENSIONAL ISSUE",
    "AL 030 - DAMAGED"
];

function up(db) {

    db.exec(`
        CREATE TABLE failure_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            grp TEXT NOT NULL,
            sort INTEGER NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER,
            updated_at INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE board_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fail_id TEXT NOT NULL UNIQUE,
            board TEXT NOT NULL,
            plan_date TEXT NOT NULL,
            period INTEGER NOT NULL,
            sku TEXT NOT NULL,
            code TEXT NOT NULL,
            production_line TEXT,
            work_center TEXT,
            failed_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            undone_at INTEGER,
            disposition TEXT CHECK (disposition IN ('REWORK_PASS', 'SCRAP')),
            disposition_at INTEGER,
            disposition_date TEXT,
            disposition_period INTEGER,
            disposition_by TEXT
        )
    `);

    db.exec("CREATE INDEX idx_board_failures_day ON board_failures (board, plan_date)");
    db.exec("CREATE INDEX idx_board_failures_disp ON board_failures (board, disposition_date)");

    const now = Date.now();
    const add = db.prepare("INSERT INTO failure_codes (code, label, grp, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)");

    CODES.forEach((label, i) => add.run(label.split(" - ")[0], label, label.slice(0, 2), (i + 1) * 10, now, now));

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS board_failures");
    db.exec("DROP TABLE IF EXISTS failure_codes");

}

module.exports = { up, down, CODES };
