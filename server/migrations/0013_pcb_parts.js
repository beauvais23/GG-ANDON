//------------------------------------------------------
// 0013 PCB part numbers at PCB Test (Nov 4 2026)
//
// board_pcb_parts: the PCBs tested at each line's PCB Test
// work center (Director: "PCB part numbers should be added at
// PCB test"). Seeded from the QuickBooks bills of materials
// (Nov 4 2026): the 30- components (PCBs / LED arrays) of each
// SpaceX family's assemblies; 20- components are hardware.
// The PCB Test strip shows these part numbers instead of the
// plan's finished SKUs; PCB taps and fails must use one.
// Editable in Admin → Products & rates.
//
// Reversible: down drops the table.
//------------------------------------------------------

const PARTS = [
    ["Gigabay", "30-72027-000-C", "GIGA LED Array (with Driver)"],
    ["Gigabay", "30-72027-SO-C", "GIGA LED Array (with Driver) - SO variation"],
    ["Gigabay", "30-72027-LO-C", "GIGA LED Array (with Driver) - LO variation"],
    ["Gigabay", "30-72027-4FT-C", "GIGA LED Array (with Driver) - 4FT variation"],
    ["Gigabay", "30-72027-4SO-C", "GIGA LED Array (with Driver) - 4FT-SO variation"],
    ["Gigabay", "30-67338-000-C", "GIGA LED Array (LED Array only)"],
    ["Gigabay - Vertical", "30-42068-A", "PCBA - 37mm x 1200mm - 480V Tri-Phase, 6 Layer FR4"],
    ["Terabay", "30-35936-48K-B", "TERA LED Array - 3 Phase 480V, MCPCB"],
    ["Deca", "30-72027-SHO-C", "GIGA LED Array (with Driver) - HO variation"],
    ["Deca", "30-67338-000-C", "GIGA LED Array (LED Array only)"]
];

function up(db) {

    db.exec(`
        CREATE TABLE board_pcb_parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board TEXT NOT NULL,
            part TEXT NOT NULL,
            description TEXT,
            sort INTEGER NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE (board, part)
        )
    `);

    const now = Date.now();
    const add = db.prepare("INSERT INTO board_pcb_parts (board, part, description, sort, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)");

    PARTS.forEach(([board, part, description], i) => add.run(board, part, description, (i + 1) * 10, now, now));

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS board_pcb_parts");

}

module.exports = { up, down, PARTS };
