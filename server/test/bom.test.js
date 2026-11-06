const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { explode } = require("../services/bomExplode");

//------------------------------------------------------
// BOM viewer: explosion (multi-level, circular reference,
// 5-level cap), the CData-backed cache (one query per level,
// 1 h reuse, last good copy when CData fails), routes.
// CData is faked; no test touches the network.
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { createQbBom } = require("../services/qbBom");

const item = (full_name, type = "Inventory", extra = {}) => ({ full_name, type, description: `${full_name} desc`, uom: "ea", active: 1, on_hand: 10, ...extra });

function fixture(bom, items) {

    const byName = new Map(items.map(i => [i.full_name, i]));

    return {
        linesOf: a => (bom[a] ? bom[a].map(([component, qty], i) => ({ line: i + 1, component, qty })) : (byName.get(a) && byName.get(a).type === "InventoryAssembly" ? [] : null)),
        itemOf: n => byName.get(n) || null
    };

}

test("explosion: 3 levels, extended qty multiplies down the tree, rows in line order under their parent", () => {

    const { linesOf, itemOf } = fixture(
        { A: [["B", 2], ["P1", 3]], B: [["C", 4], ["P2", 1]], C: [["P3", 5]] },
        [item("A", "InventoryAssembly"), item("B", "InventoryAssembly"), item("C", "InventoryAssembly"), item("P1"), item("P2"), item("P3")]
    );

    const { rows, cycles, truncated } = explode("A", linesOf, itemOf);

    assert.deepEqual(rows.map(r => [r.level, r.component, r.qty, r.extQty, r.isAssembly]), [
        [1, "B", 2, 2, true],
        [2, "C", 4, 8, true],
        [3, "P3", 5, 40, false],
        [2, "P2", 1, 2, false],
        [1, "P1", 3, 3, false]
    ]);
    assert.equal(cycles, 0);
    assert.equal(truncated, 0);
    assert.equal(rows[0].description, "B desc");

});

test("explosion: circular reference (A → B → A) is shown once, flagged, and not expanded again", () => {

    const { linesOf, itemOf } = fixture(
        { A: [["B", 1]], B: [["A", 1], ["P1", 2]] },
        [item("A", "InventoryAssembly"), item("B", "InventoryAssembly"), item("P1")]
    );

    const { rows, cycles } = explode("A", linesOf, itemOf);

    assert.deepEqual(rows.map(r => [r.level, r.component, Boolean(r.cycle)]), [[1, "B", false], [2, "A", true], [2, "P1", false]]);
    assert.equal(cycles, 1);

});

test("explosion: stops at 5 levels and flags the sub-assembly that has more below; unknown components are flagged", () => {

    const bom = {};
    const items = [];

    for (let i = 0; i < 7; i++) {

        bom[`L${i}`] = [[`L${i + 1}`, 1]];
        items.push(item(`L${i}`, "InventoryAssembly"));

    }

    bom.L7 = [["GHOST", 1]];
    items.push(item("L7", "InventoryAssembly"));

    const { linesOf, itemOf } = fixture(bom, items);
    const { rows, truncated } = explode("L0", linesOf, itemOf);

    assert.deepEqual(rows.map(r => r.level), [1, 2, 3, 4, 5]);
    assert.equal(rows[4].component, "L5");
    assert.equal(rows[4].truncated, true);
    assert.equal(truncated, 1);

    const ghost = explode("L7", linesOf, itemOf).rows[0];

    assert.equal(ghost.unknown, true);
    assert.equal(ghost.active, false);

});

//------------------------------------------------------
// Cache + fake CData
//------------------------------------------------------

const ITEMS = [
    ["TOP-1", "InventoryAssembly"], ["SUB-1", "InventoryAssembly"], ["SUB-2", "InventoryAssembly"],
    ["20-111-A", "Inventory"], ["20-222-A", "Inventory"], ["30-333-A", "Inventory"], ["OLD-9", "Inventory", false],
    ["DMXP4-RGBW", "InventoryAssembly"]
];

const BOM = [
    ["TOP-1", 1, "SUB-1", 2], ["TOP-1", 2, "20-111-A", 4],
    ["SUB-1", 1, "SUB-2", 1], ["SUB-1", 2, "20-222-A", 3],
    ["SUB-2", 1, "30-333-A", 0.5]
];

function fakeCdata() {

    const calls = [];
    let fail = false;

    const query = async sql => {

        calls.push(sql);

        if (fail)
            throw new Error("CData query failed (HTTP 503): down");

        if (sql.includes("[Company_Items]")) {

            const offset = Number((sql.match(/OFFSET (\d+)/) || [])[1] || 0);

            return offset ? [] : ITEMS.map(([FullName, Type, active = true]) => ({ FullName, Type, Description: `${FullName} desc`, UnitOfMeasure: "ea", IsActive: active, QuantityOnHand: 7, TimeModified: "2026-11-04T21:00:00Z" }));

        }

        const wanted = [...sql.matchAll(/'([^']+)'/g)].map(m => m[1]);

        return BOM.filter(b => wanted.includes(b[0])).map(([Assembly, LineItemNumber, Component, QtyPerAssembly]) => ({ Assembly, LineItemNumber, Component, QtyPerAssembly, LineItemUnitOfMeasure: "" }));

    };

    return { query, calls, setFail: v => { fail = v; } };

}

test("cache: opening a SKU pulls the items, then one BOM query per level; reopening within 1 h asks CData nothing", async () => {

    let clock = 1_000_000;
    const cd = fakeCdata();
    const qb = createQbBom({ db, query: cd.query, now: () => clock });

    const bom = await qb.getBom("TOP-1");

    assert.deepEqual(bom.rows.map(r => [r.level, r.component, r.extQty]), [[1, "SUB-1", 2], [2, "SUB-2", 2], [3, "30-333-A", 1], [2, "20-222-A", 6], [1, "20-111-A", 4]]);
    assert.equal(cd.calls.filter(c => c.includes("[Company_Items]")).length, 1);
    assert.equal(cd.calls.filter(c => c.includes("[Company_BOM]")).length, 3);
    assert.equal(bom.stale, false);
    assert.equal(bom.error, null);
    assert.equal(bom.asOf, clock);

    const before = cd.calls.length;

    clock += 30 * 60 * 1000;
    await qb.getBom("TOP-1");

    assert.equal(cd.calls.length, before);

});

test("cache: after 1 h with CData down, the last good copy is shown, marked stale, with the error", async () => {

    let clock = 5_000_000;
    const cd = fakeCdata();
    const qb = createQbBom({ db, query: cd.query, now: () => clock });

    await qb.getBom("TOP-1");

    clock += 61 * 60 * 1000;
    cd.setFail(true);

    const bom = await qb.getBom("TOP-1");

    assert.equal(bom.rows.length, 5);
    assert.equal(bom.stale, true);
    assert.match(bom.error, /HTTP 503/);
    assert.equal(qb.status().bomLast.ok, 0);

});

test("cache: a failed item refresh keeps the last good list; a non-assembly SKU is refused (404)", async () => {

    const cd = fakeCdata();
    const qb = createQbBom({ db, query: cd.query });

    await qb.refreshItems();

    const count = qb.status().items;

    cd.setFail(true);

    await assert.rejects(qb.refreshItems(), /HTTP 503/);
    assert.equal(qb.status().items, count);
    assert.equal(qb.status().itemsLast.ok, 0);
    assert.equal(qb.status().itemsOk.ok, 1);

    cd.setFail(false);

    await assert.rejects(qb.getBom("20-111-A"), err => err.status === 404);

    // Assembly list: active assemblies only, with a line group from the SKU list.
    const list = qb.assemblies();

    assert.deepEqual(list.map(a => a.sku), ["DMXP4-RGBW", "SUB-1", "SUB-2", "TOP-1"]);
    assert.equal(list.find(a => a.sku === "DMXP4-RGBW").lineGroup, "Team A");
    assert.equal(list.find(a => a.sku === "TOP-1").lineGroup, "Other");

});

test("routes: login required; refresh is admin only; without CData set up the refresh says so (503)", async () => {

    await request(app).get("/bom/sku/TOP-1").expect(401);

    const login = async (username, password) => (await request(app).post("/auth/login").send({ username, password })).body.token;
    const floor = await login("test_floor", "test-floor-pw");
    const admin = await login("test_admin", "test-admin-pw");

    await request(app).post("/admin/bom/refresh").set("Authorization", `Bearer ${floor}`).expect(403);

    const r = await request(app).post("/admin/bom/refresh").set("Authorization", `Bearer ${admin}`).expect(503);

    assert.match(r.body.message, /CDATA_USER \/ CDATA_PAT/);

    const list = await request(app).get("/bom/assemblies").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.equal(list.body.status.configured, false);
    assert.ok(list.body.lineGroups.includes("SpaceX"));

});

test("CData replies: rows by column name; an error body, an HTML page or an unknown shape gives CData's reason, not a blank", () => {

    const { rowsOf, errorText } = require("../services/cdataClient");

    assert.deepEqual(rowsOf({ results: [{ schema: [{ columnName: "FullName" }, { columnLabel: "n" }], rows: [["A", 1]] }] }), [{ FullName: "A", n: 1 }]);

    assert.throws(() => rowsOf({ error: { code: "x", message: "Catalog 'Company' not found" } }), /no result set: Catalog 'Company' not found/);
    assert.throws(() => rowsOf({ results: [{ error: { message: "Table not found" } }] }), /Table not found/);
    assert.throws(() => rowsOf("<html><body><h1>Sign in</h1></body></html>"), /no result set: Sign in/);
    assert.throws(() => rowsOf({ data: [], count: 0 }), /reply had data, count/);

    assert.equal(errorText({ message: "Unauthorized" }), "Unauthorized");

});
