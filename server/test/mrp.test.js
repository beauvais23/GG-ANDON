const test = require("node:test");
const assert = require("node:assert/strict");

const { computeMrp, isHold } = require("../services/mrp");

//------------------------------------------------------
// Material check (MRP bridge): demand window, holds, netting by
// low-level code (finished goods and sub-assemblies on hand
// first), shared parts, shortfall vs on hand + open POs, PO late,
// loop guard.
//------------------------------------------------------

const item = (type, on_hand = 0, on_order = 0) => ({ type, description: "d", uom: "ea", on_hand, on_order });

function setup(bom, items) {

    const map = new Map(Object.entries(items));

    return {
        items: map,
        linesOf: a => (bom[a] ? bom[a].map(([component, qty]) => ({ component, qty })) : (map.get(a)?.type === "InventoryAssembly" ? [] : null))
    };

}

const base = { today: "2026-11-06", horizonEnd: "2027-01-01" };

test("finished goods on hand are netted before exploding: 10 ordered, 4 on the shelf → 6 built → 12 of the part", () => {

    const { items, linesOf } = setup({ FG: [["P1", 2]] }, { FG: item("InventoryAssembly", 4), P1: item("Inventory", 5, 3) });

    const r = computeMrp({ ...base, items, linesOf, soLines: [{ so: "SO1", item: "FG", ordered: 10, shipped: 0, ship_date: "2026-11-20" }] });

    assert.deepEqual(r.builds.map(b => [b.item, b.need, b.onHand, b.toBuild]), [["FG", 10, 4, 6]]);

    const p1 = r.parts[0];

    assert.deepEqual([p1.item, p1.need, p1.onHand, p1.onPo, p1.short, p1.needsPos], ["P1", 12, 5, 3, 4, 7]);
    assert.equal(p1.neededBy, "2026-11-20");
    assert.deepEqual(p1.orders.map(o => o.so), ["SO1"]);

});

test("sub-assembly on hand is netted; a part used at two levels is netted once with all its demand (low-level code)", () => {

    // FG → SUB ×1 + SCREW ×4 ; SUB → SCREW ×2 + PCB ×1
    const { items, linesOf } = setup(
        { FG: [["SUB", 1], ["SCREW", 4]], SUB: [["SCREW", 2], ["PCB", 1]] },
        { FG: item("InventoryAssembly", 0), SUB: item("InventoryAssembly", 3), SCREW: item("Inventory", 10), PCB: item("Inventory", 0) }
    );

    const r = computeMrp({ ...base, items, linesOf, soLines: [{ so: "SO1", item: "FG", ordered: 5, shipped: 0, ship_date: "2026-11-10" }] });

    const by = Object.fromEntries(r.parts.map(p => [p.item, p]));

    // SUB: need 5, 3 on hand → build 2. SCREW: 5×4 + 2×2 = 24. PCB: 2.
    assert.deepEqual(r.builds.find(b => b.item === "SUB").toBuild, 2);
    assert.equal(by.SCREW.need, 24);
    assert.equal(by.SCREW.short, 14);
    assert.equal(by.PCB.need, 2);
    assert.equal(by.PCB.short, 2);

});

test("demand window: shipped lines, S&H, blank items and lines after the window are out; past due and no-date lines are in; HOLD orders out unless included", () => {

    const { items, linesOf } = setup({}, { P: item("Inventory", 0) });
    const soLines = [
        { so: "A", item: "P", ordered: 5, shipped: 5, ship_date: "2026-11-10" },
        { so: "B", item: "S&H Freight", ordered: 1, shipped: 0, ship_date: "2026-11-10" },
        { so: "C", item: "", ordered: 3, shipped: 0, ship_date: "2026-11-10" },
        { so: "D", item: "P", ordered: 7, shipped: 0, ship_date: "2027-03-01" },
        { so: "E", item: "P", ordered: 2, shipped: 0, ship_date: "2026-10-01" },
        { so: "F", item: "P", ordered: 1, shipped: null, ship_date: null },
        { so: "G", item: "P", ordered: 9, shipped: 0, ship_date: "2026-11-15", hold: true }
    ];

    const r = computeMrp({ ...base, items, linesOf, soLines });

    assert.equal(r.parts[0].need, 3);
    assert.deepEqual(r.demand, { lines: 2, orders: 2, held: 1, later: 1, noDate: 1 });
    assert.equal(r.parts[0].pastDue, true);

    const withHolds = computeMrp({ ...base, items, linesOf, soLines, includeHolds: true });

    assert.equal(withHolds.parts[0].need, 12);
    assert.equal(withHolds.demand.held, 1, "held lines in the window are counted when included too");

    assert.equal(isHold("<CustomField><Name>OpportunityId</Name><Value>HOLD</Value></CustomField>"), true);
    assert.equal(isHold("<CustomField><Name>OpportunityId</Name><Value>006Ab</Value></CustomField>"), false);

});

test("open POs: short counts PO qty left; next PO is the earliest; PO late when it lands after the first ship date", () => {

    const { items, linesOf } = setup({}, { P: item("Inventory", 2, 13) });
    const poLines = [
        { po: "PO2", vendor: "V", item: "P", ordered: 10, received: 0, expected_date: "2026-12-15" },
        { po: "PO1", vendor: "V", item: "P", ordered: 5, received: 2, expected_date: "2026-12-01" },
        { po: "PO0", vendor: "V", item: "P", ordered: 4, received: 4, expected_date: "2026-11-08" }
    ];

    const r = computeMrp({ ...base, items, linesOf, poLines, soLines: [{ so: "S", item: "P", ordered: 20, shipped: 0, ship_date: "2026-11-20" }] });
    const p = r.parts[0];

    assert.equal(p.onPo, 13, "received PO lines don't count");
    assert.equal(p.poMismatch, false);
    assert.equal(p.short, 5);
    assert.equal(p.nextPo.po, "PO1");
    assert.equal(p.poLate, true);

});

test("On PO is QuickBooks on order; open PO lines that don't add up to it (closed without receiving) are flagged, not counted", () => {

    const { items, linesOf } = setup({}, { P: item("Inventory", 0, 0) });
    const poLines = [{ po: "OLD", vendor: "V", item: "P", ordered: 5000, received: 0, expected_date: "2026-11-03" }];

    const r = computeMrp({ ...base, items, linesOf, poLines, soLines: [{ so: "S", item: "P", ordered: 100, shipped: 0, ship_date: "2026-11-20" }] });

    assert.deepEqual([r.parts[0].onPo, r.parts[0].poLineSum, r.parts[0].poMismatch, r.parts[0].short], [0, 5000, true, 100]);
    assert.match(r.warnings.join(" "), /1 part: open PO lines don't add up to QuickBooks on order/);

});

test("loop guard: A → B → A is reported once and not expanded; an assembly with no loaded BOM is counted as a part and reported", () => {

    const { items, linesOf } = setup({ A: [["B", 1]], B: [["A", 1], ["P", 2]] }, { A: item("InventoryAssembly"), B: item("InventoryAssembly"), P: item("Inventory") });

    const r = computeMrp({ ...base, items, linesOf, soLines: [{ so: "S", item: "A", ordered: 1, shipped: 0, ship_date: "2026-11-10" }] });

    assert.ok(r.warnings.some(w => /Loop in BOM, not expanded: B → A/.test(w)));
    assert.equal(r.parts.find(p => p.item === "P").need, 2);

    const missing = computeMrp({ ...base, items: new Map([["X", item("InventoryAssembly", 0)]]), linesOf: () => null, soLines: [{ so: "S", item: "X", ordered: 3, shipped: 0, ship_date: "2026-11-10" }] });

    assert.equal(missing.parts[0].item, "X");
    assert.match(missing.warnings[0], /BOM not loaded for X/);

});

//------------------------------------------------------
// Data layer (fake CData) and route
//------------------------------------------------------

const request = require("supertest");
const { loadApp } = require("./helpers");

const { app } = loadApp();
const { db } = require("../database");
const { createQbBom } = require("../services/qbBom");

function fakeCdata() {

    const calls = [];

    const query = async sql => {

        calls.push(sql);

        if (/OFFSET [1-9]/.test(sql))
            return [];

        if (sql.includes("[Company_Items]"))
            return [
                { FullName: "KIT-1", Type: "InventoryAssembly", Description: "Kit", UnitOfMeasure: "", IsActive: true, QuantityOnHand: 1, QuantityOnOrder: 0 },
                { FullName: "20-1", Type: "Inventory", Description: "Screw", UnitOfMeasure: "ea", IsActive: true, QuantityOnHand: 3, QuantityOnOrder: 10 }
            ];

        if (sql.includes("[Company_OpenOrderLines]"))
            return [
                { ReferenceNumber: "SO-1", ItemLineNumber: 1, CustomerName: "C", ItemName: "KIT-1", QtyOrdered: 5, QtyShipped: 0, ExpectedShipDate: "2026-11-20T00:00:00", CustomFields: "" },
                { ReferenceNumber: "SO-2", ItemLineNumber: 1, CustomerName: "C", ItemName: "KIT-1", QtyOrdered: 9, QtyShipped: null, ExpectedShipDate: "2026-11-21", CustomFields: "<CustomField><Name>OpportunityId</Name><Value>HOLD</Value></CustomField>" }
            ];

        if (sql.includes("[Company_OpenPOLines]"))
            return [{ ReferenceNumber: "PO-7", ItemLineNumber: 1, VendorName: "V", ItemName: "20-1", QtyOrdered: 10, QtyReceived: 0, ExpectedDate: "2026-12-01" }];

        if (sql.includes("[Company_BOM]"))
            return [{ Assembly: "KIT-1", LineItemNumber: 1, Component: "20-1", QtyPerAssembly: 2, LineItemUnitOfMeasure: "" }];

        return [];

    };

    return { query, calls };

}

test("data layer: one pull of items (with on order), open SO lines (HOLD parsed, dates as YYYY-MM-DD), open PO lines and the BOMs of everything on order; reused within the hour", async () => {

    let clock = Date.parse("2026-11-06T15:00:00Z");
    const cd = fakeCdata();
    const qb = createQbBom({ db, query: cd.query, now: () => clock });

    const input = await qb.mrpInputs();

    assert.equal(input.error, null);
    assert.equal(input.items.get("20-1").on_order, 10);
    assert.deepEqual(input.soLines.map(l => [l.so, l.ship_date, l.hold]), [["SO-1", "2026-11-20", 0], ["SO-2", "2026-11-21", 1]]);
    assert.equal(input.poLines[0].expected_date, "2026-12-01");
    assert.deepEqual(input.linesOf("KIT-1").map(l => [l.component, l.qty]), [["20-1", 2]]);

    const r = computeMrp({ ...input, today: "2026-11-06", horizonEnd: "2027-01-01" });
    const screw = r.parts.find(p => p.item === "20-1");

    // SO-2 is on hold: need 5 KIT, 1 on hand → 4 built → 8 screws; 3 on hand + 10 on PO → not short.
    assert.deepEqual([screw.need, screw.short, screw.needsPos, screw.nextPo.po], [8, 0, 5, "PO-7"]);

    const before = cd.calls.length;

    clock += 30 * 60 * 1000;
    await qb.mrpInputs();

    assert.equal(cd.calls.length, before, "within the hour nothing is re-read");

});

test("route: /mrp needs a login; window, line group and holds apply; demand summary and parts come back", async () => {

    await request(app).get("/mrp").expect(401);

    const floor = (await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token;

    // The test above left fresh items, orders and BOMs in the cache.
    const r = await request(app).get("/mrp?weeks=4&holds=1").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.equal(r.body.window.weeks, 4);
    assert.equal(r.body.window.includeHolds, true);
    assert.ok(r.body.asOf.orders);
    assert.equal(r.body.demand.orders + r.body.demand.later >= 1, true);
    assert.ok(Array.isArray(r.body.parts));

    const other = await request(app).get("/mrp?group=SpaceX").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.equal(other.body.window.group, "SpaceX");
    assert.equal(other.body.demand.lines, 0, "KIT-1 is not a SpaceX config");

});
