const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { indexItems, searchItems, whereUsed, editDistanceAtMost } = require("../services/inventorySearch");

//------------------------------------------------------
// Inventory search + where used (Director, Nov 10 2026):
// fuzzy search over part number, descriptions, manufacturer
// P/N and vendor (every word must match; exact > prefix >
// contains > typo > letters in order); where used walks up to
// the top-level assemblies multiplying qty per, adds parallel
// paths, cuts loops, skips inactive assemblies unless asked;
// routes never return costs. CData is faked.
//------------------------------------------------------

const item = (full_name, description, extra = {}) => ({ full_name, description, type: "Inventory", active: 1, on_hand: 0, ...extra });

const ITEMS = [
    item("20-63389-A", "WAGO Inline Connector - 1 pos", { part_number: "WAGO 221-2401", preferred_vendor: "Wolberg Electrical Co., Inc." }),
    item("20-63389-B", "WAGO Inline Connector - 2 pos"),
    item("20-633891", "Spacer"),
    item("30-72027-SHO-C", "GIGA LED Array (with Driver) - HO VARIATION"),
    item("DECA8-SO-48K-480V", "Slimline driverless LED linear, 8 foot", { type: "InventoryAssembly" }),
    item("OLD-CONN", "WAGO Inline Connector obsolete", { active: 0 })
];

const index = indexItems(ITEMS);
const names = r => r.items.map(i => i.full_name);

test("edit distance: one typo within 1, two within 2, more is out", () => {

    assert.equal(editDistanceAtMost("CONNECTER", "CONNECTOR", 1), true);
    assert.equal(editDistanceAtMost("CONECTR", "CONNECTOR", 1), false);
    assert.equal(editDistanceAtMost("CONECTR", "CONNECTOR", 2), true);

});

test("search: exact part number first (hyphens ignored), then prefix, then contains", () => {

    assert.equal(names(searchItems(index, "2063389A"))[0], "20-63389-A");

    const r = searchItems(index, "20-63389");

    assert.deepEqual(names(r).slice(0, 3).sort(), ["20-63389-A", "20-63389-B", "20-633891"]);

});

test("search: description words, a typo, manufacturer P/N and vendor all find the WAGO connector; every word must match", () => {

    assert.ok(names(searchItems(index, "wago")).includes("20-63389-A"));
    assert.ok(names(searchItems(index, "conecter")).includes("20-63389-A"), "one typo");
    assert.deepEqual(names(searchItems(index, "221-2401")), ["20-63389-A"], "manufacturer P/N");
    assert.deepEqual(names(searchItems(index, "wolberg")), ["20-63389-A"], "vendor");
    assert.deepEqual(names(searchItems(index, "wago 2 pos")), ["20-63389-B"], "all words must match");
    assert.equal(searchItems(index, "zzzz").total, 0);
    assert.equal(searchItems(index, "   ").total, 0);

});

test("search: inactive items only when asked", () => {

    assert.ok(!names(searchItems(index, "obsolete")).length);
    assert.deepEqual(names(searchItems(index, "obsolete", { includeInactive: true })), ["OLD-CONN"]);

});

//------------------------------------------------------
// Where used
//
//   X ×2 → A ×3 → B ×1 → TOP1          X in TOP1 = 6
//   X ×1 → C ×4 → TOP2                  X in TOP2 = 4 + 1 (A ×1 → TOP2) × 2 = 6
//   A ×1 → TOP2
//   X ×5 → OLD (inactive) → TOP3        only with inactive
//   X ×1 → L1 → L2 → L1 (loop)          cut, counted
//------------------------------------------------------

const BOM = [
    ["A", "X", 2], ["B", "A", 3], ["TOP1", "B", 1],
    ["C", "X", 1], ["TOP2", "C", 4], ["TOP2", "A", 1],
    ["OLD", "X", 5], ["TOP3", "OLD", 1],
    ["L1", "X", 1], ["L2", "L1", 1], ["L1", "L2", 1]
];

const parentsOf = c => BOM.filter(([, comp]) => comp === c).map(([assembly, , qty]) => ({ assembly, qty }));
const itemOf = n => ({ full_name: n, active: n === "OLD" ? 0 : 1 });

test("where used: top-level assemblies with qty per multiplied along each path and parallel paths added", () => {

    const r = whereUsed("X", parentsOf, itemOf);
    const top = n => r.tops.find(t => t.assembly === n);

    assert.deepEqual(r.direct.map(d => d.assembly).sort(), ["A", "C", "L1"]);
    assert.equal(top("TOP1").qty, 6);
    assert.deepEqual(top("TOP1").paths, [["X", "A", "B", "TOP1"]]);
    assert.equal(top("TOP2").qty, 6, "4 via C + 2 via A");
    assert.equal(top("TOP2").pathCount, 2);
    assert.deepEqual(top("TOP1").via, [{ assembly: "A", qty: 2 }], "via = the direct parent and the item's qty in it");
    assert.deepEqual(top("TOP2").via.map(v => v.assembly).sort(), ["A", "C"]);
    assert.equal(top("TOP3"), undefined, "through an inactive assembly: skipped");
    assert.ok(r.loops >= 1, "the L1 ↔ L2 loop is cut");

});

test("where used: inactive assemblies included when asked; an item nothing uses has no tops", () => {

    const r = whereUsed("X", parentsOf, itemOf, { includeInactive: true });

    assert.equal(r.tops.find(t => t.assembly === "TOP3").qty, 5);
    assert.deepEqual(whereUsed("TOP1", parentsOf, itemOf).tops, []);
    assert.equal(whereUsed("X", parentsOf, itemOf, { maxSteps: 2 }).truncated, true, "runaway walk stops and says so");

});

//------------------------------------------------------
// Routes + the full BOM refresh
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { createQbBom } = require("../services/qbBom");

let floor;

test.before(async () => {

    floor = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token}` };

    const ins = db.prepare(`INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand, on_order, part_number, preferred_vendor, on_sales_order, reorder_point)
        VALUES (?, ?, ?, 'ea', ?, ?, 0, ?, ?, ?, ?)`);

    ins.run("20-63389-A", "Inventory", "WAGO Inline Connector - 1 pos", 1, 0, "WAGO 221-2401", "Wolberg", 0, 100);
    ins.run("DECA8-SO-48K-480V", "InventoryAssembly", "Deca 8 ft", 1, 0, null, null, 2258, null);
    db.prepare("INSERT OR REPLACE INTO qb_bom_all (assembly, line, component, qty, uom) VALUES ('DECA8-SO-48K-480V', 14, '20-63389-A', 4, '')").run();
    db.prepare("INSERT INTO qb_sync_log (kind, started_at, finished_at, ok, rows) VALUES ('items', ?, ?, 1, 2)").run(Date.now(), Date.now());

});

test("routes: search answers with item fields and no costs; detail shows where used with the top's open orders; unknown → 404; login required", async () => {

    await request(app).get("/inventory/search?q=wago").expect(401);

    const s = await request(app).get("/inventory/search?q=wago 221").set(floor).expect(200);

    assert.equal(s.body.items[0].full_name, "20-63389-A");
    assert.equal(s.body.items[0].part_number, "WAGO 221-2401");

    const d = await request(app).get(`/inventory/item/${encodeURIComponent("20-63389-A")}`).set(floor).expect(200);
    const text = JSON.stringify(d.body);

    assert.equal(d.body.item.reorder_point, 100);
    assert.deepEqual(d.body.whereUsed.tops.map(t => [t.assembly, t.qty, t.on_sales_order]), [["DECA8-SO-48K-480V", 4, 2258]]);
    assert.doesNotMatch(text, /cost|price/i, "no costs (Director, Nov 10 2026)");

    await request(app).get("/inventory/item/NOPE-1").set(floor).expect(404);

});

test("refresh: item fields and every BOM line are pulled; a failed BOM pull keeps the last copy", async () => {

    const fake = async sql => {

        if (/OFFSET [1-9]/.test(sql))
            return [];

        if (/Company_Items/.test(sql))
            return [{ FullName: "P-1", Type: "Inventory", Description: "Part one", IsActive: true, QuantityOnHand: 3, PartNumber: "MFR-9", PreferredVendor: "Acme", QuantityOnSalesOrder: 7, ReorderPoint: 2, Class: "Parts" }];

        if (/Company_BOM/.test(sql))
            return [{ Assembly: "ASM-1", LineItemNumber: 1, Component: "P-1", QtyPerAssembly: 2, LineItemUnitOfMeasure: "ea" }];

        return [];

    };

    const qb = createQbBom({ db, query: fake });

    assert.equal(await qb.refreshItems(), 1);
    assert.equal(await qb.refreshAllBoms(), 1);

    const p = qb.itemOf("P-1");

    assert.deepEqual([p.part_number, p.preferred_vendor, p.on_sales_order, p.reorder_point, p.item_class], ["MFR-9", "Acme", 7, 2, "Parts"]);
    assert.deepEqual(qb.parentsOf("P-1"), [{ assembly: "ASM-1", qty: 2 }]);
    assert.equal(searchItems(qb.searchIndex(), "mfr-9").items[0].full_name, "P-1", "index rebuilt after the refresh");

    const broken = createQbBom({ db, query: async () => { throw new Error("CData down"); } });

    await assert.rejects(broken.refreshAllBoms(), /CData down/);
    assert.equal(qb.status().bomAll, 1, "last copy kept");

});
