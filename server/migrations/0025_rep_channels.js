//------------------------------------------------------
// 0025 Rep → sales channel (Director, Nov 11 2026)
//
// The backlog page's channel comes only from the rep (QuickBooks
// SalesRep), per the "Assigned Rep to Sales Channel" sheet
// (Operations). rep_channels holds that key; seeded below from the
// sheet as of Nov 11 2026; an admin re-pastes it on the Backlog page
// when the sheet changes. Values as in the sheet: Car Wash,
// Industrial - Rep, Industrial - Direct, Industrial - Transit.
//
// Reversible: down drops the table.
//------------------------------------------------------

const SEED = [
    ["AGS", "Industrial - Rep"], ["ALE", "Industrial - Rep"], ["BAS", "Industrial - Rep"], ["BMI", "Industrial - Rep"],
    ["CONV", "Industrial - Rep"], ["COR4", "Industrial - Rep"], ["FRM", "Industrial - Rep"], ["DMA", "Industrial - Rep"],
    ["ELP", "Industrial - Rep"], ["ESL", "Industrial - Rep"], ["Z-FR", "Industrial - Rep"], ["GCD", "Industrial - Rep"],
    ["GG-CW", "Car Wash"], ["GG-DI", "Industrial - Direct"], ["GG-TR", "Industrial - Transit"], ["HM", "Industrial - Rep"],
    ["ILL", "Industrial - Rep"], ["ISM", "Industrial - Rep"], ["ITG", "Industrial - Rep"], ["ITS", "Industrial - Rep"],
    ["KK", "Industrial - Rep"], ["KMS", "Industrial - Rep"], ["LA", "Industrial - Rep"], ["LDA", "Industrial - Rep"],
    ["LS", "Industrial - Rep"], ["LSAL", "Industrial - Rep"], ["MAC", "Industrial - Rep"], ["MZ", "Industrial - Rep"],
    ["N1", "Car Wash"], ["OTH", "Industrial - Rep"], ["USNW", "Industrial - Rep"], ["SE", "Industrial - Transit"],
    ["SMPL", "Car Wash"], ["Z-UCI", "Industrial - Rep"], ["VIL", "Industrial - Rep"], ["WML", "Industrial - Rep"],
    ["Z-AMA", "Industrial - Rep"], ["Z-LNG", "Industrial - Rep"], ["Z-LSP", "Industrial - Rep"], ["Z-BMC", "Industrial - Rep"],
    ["FLC", "Industrial - Rep"], ["OL", "Industrial - Rep"], ["QLG", "Industrial - Rep"], ["Z-VLC", "Industrial - Rep"],
    ["MOX", "Industrial - Rep"], ["ICG", "Car Wash"], ["GEN", "Industrial - Rep"], ["Z-ASI", "Industrial - Rep"],
    ["LUP", "Industrial - Rep"], ["GSL", "Industrial - Rep"], ["APEX", "Industrial - Rep"], ["Z-NEX", "Industrial - Rep"]
];

function up(db) {

    db.exec(`
        CREATE TABLE rep_channels (
            rep TEXT PRIMARY KEY,
            channel TEXT NOT NULL,
            updated_by TEXT,
            updated_at INTEGER
        )
    `);

    const add = db.prepare("INSERT INTO rep_channels (rep, channel, updated_by, updated_at) VALUES (?, ?, 'seed (sheet, Nov 11 2026)', ?)");
    const now = Date.now();

    for (const [rep, channel] of SEED)
        add.run(rep, channel, now);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS rep_channels");

}

module.exports = { up, down, SEED };
