//------------------------------------------------------
// 0022 RRX on the Team A board (Director, Nov 10 2026)
//
// RRX (radiation-resistant low-profile linear) is built on
// Team A and is in the Team A capacity planner (RRX 8' = 115 s),
// but had no family, so its SKUs were on no board. Adds the
// RRX4 and RRX8 families to Team A and lists the 16 active RRX
// luminaire SKUs in QuickBooks on Nov 10 2026. Accessories
// (RRX-JMP-…, RRX-LDR-…) match no family and stay off the board.
// Rates are entered in Admin (Import rates), not here.
//
// Reversible: down removes the SKUs, their rates and the two
// families. A family already used in a saved plan is turned off
// instead of deleted, so the plan's history keeps its family.
//------------------------------------------------------

const BOARD = "Team A";

const SKUS = {
    RRX4: [
        "RRX4-40K-120V-3P", "RRX4-40K-120V-3P-THRU", "RRX4-40K-277V-3P", "RRX4-40K-277V-3P-THRU",
        "RRX4-50K-120V-3P", "RRX4-50K-120V-3P-THRU", "RRX4-50K-277V-3P", "RRX4-50K-277V-3P-THRU"
    ],
    RRX8: [
        "RRX8-40K-120V-3P", "RRX8-40K-120V-3P-THRU", "RRX8-40K-277V-3P", "RRX8-40K-277V-3P-THRU",
        "RRX8-50K-120V-3P", "RRX8-50K-120V-3P-THRU", "RRX8-50K-277V-3P", "RRX8-50K-277V-3P-THRU"
    ]
};

function up(db) {

    const now = Date.now();
    const addFamily = db.prepare("INSERT OR IGNORE INTO product_families (board, prefix, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)");
    const family = db.prepare("SELECT id FROM product_families WHERE prefix = ?");
    const addSku = db.prepare("INSERT OR IGNORE INTO product_skus (family_id, sku, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)");

    for (const [prefix, skus] of Object.entries(SKUS)) {

        addFamily.run(BOARD, prefix, now, now);

        const f = family.get(prefix);

        for (const sku of skus)
            addSku.run(f.id, sku, now, now);

    }

}

function down(db) {

    for (const [prefix, skus] of Object.entries(SKUS)) {

        const f = db.prepare("SELECT id FROM product_families WHERE prefix = ?").get(prefix);

        if (!f)
            continue;

        const used = db.prepare("SELECT COUNT(*) AS n FROM plan_runs WHERE family_id = ?").get(f.id).n > 0;

        if (used) {

            db.prepare("UPDATE product_families SET active = 0 WHERE id = ?").run(f.id);
            db.prepare("UPDATE product_skus SET active = 0 WHERE family_id = ?").run(f.id);
            continue;

        }

        const marks = skus.map(() => "?").join(", ");

        db.prepare(`DELETE FROM rates WHERE family_id = ? OR sku IN (${marks})`).run(f.id, ...skus);
        db.prepare("DELETE FROM product_skus WHERE family_id = ?").run(f.id);
        db.prepare("DELETE FROM product_families WHERE id = ?").run(f.id);

    }

}

module.exports = { up, down };
