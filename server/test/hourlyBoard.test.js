//------------------------------------------------------
// Hour-by-hour board, H1: SKU → family/board by the Ship
// Report prefixes, rate resolution (SKU over family,
// effective dates), plans saved with rate snapshots.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});

const { statements } = require("../database");
const { familyFor } = require("../services/hourlyBoard");

let admin;
let floor;

const fam = prefix => statements.getProductFamilies.all().find(f => f.prefix === prefix);

const setRate = body => request(app).post("/admin/hourly/rates").set(admin).send(body);
const savePlan = (board, date, runs) => request(app).put(`/admin/hourly/plan/${encodeURIComponent(board)}/${date}`).set(admin).send({ runs });

before(async () => {

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

});

test("SKU → family by Ship Report prefix: hyphens ignored, longest prefix wins, accessories and CNTL on no board", () => {

    const all = statements.getProductFamilies.all();
    const board = sku => familyFor(sku, all)?.board || null;

    assert.equal(board("WPX4-RED"), "Team B");
    assert.equal(board("DMXP8-RGBW-4CH"), "Team A");
    assert.equal(board("FBL-4-HL-CW"), "Team A");
    assert.equal(board("Z-DMX8-RGBW"), "Team A");
    assert.equal(board("GIGA8-TRI-HO-48K-LR-EH-480V"), "Gigabay");
    assert.equal(board("GIGA8-VERT-48K-480V"), "Gigabay - Vertical");
    assert.equal(board("TERA2-1D1U-48K-480V"), "Terabay");
    assert.equal(board("DECA8-SO-48K-480V"), "Deca");
    assert.equal(board("30-72027-000-C"), "Coating");
    assert.equal(board("30-62072-41S-A"), "Coating");

    for (const none of ["WPX-JMP-4", "MNT-G1-NM-2015", "DMX-LDR-100-6P", "CDC-NM-503", "Z-DMX-CNTL-CW-1-16-MUSIC", "CNTL-GIGA-DIM", "20-51917-B", "30-72027-SHO-C", "30-52089-000-D"])
        assert.equal(board(none), null, none);

});

test("rates: a SKU rate overrides its family; the newest rate effective on the date applies; future rates don't", async () => {

    const wpx4 = fam("WPX4");

    assert.equal((await setRate({ familyId: wpx4.id, unitsPerHour: 17, effectiveDate: "2026-11-01" })).status, 201);
    await setRate({ familyId: wpx4.id, unitsPerHour: 20, effectiveDate: "2026-12-01" });
    await setRate({ sku: "wpx4-red", unitsPerHour: 12, effectiveDate: "2026-11-01" });

    const r = async (sku, date) => (await request(app).get(`/hourly/resolve?sku=${sku}&date=${date}`).set(floor)).body.rate;

    assert.equal((await r("WPX4-BLU", "2026-11-15")).unitsPerHour, 17);
    assert.equal((await r("WPX4-BLU", "2026-12-02")).unitsPerHour, 20);
    assert.equal((await r("WPX4-RED", "2026-11-15")).unitsPerHour, 12);
    assert.equal((await r("WPX4-BLU", "2026-10-31")), null);

    // Bad input, and the floor login can't set rates.
    for (const body of [{ familyId: wpx4.id, unitsPerHour: 0 }, { familyId: wpx4.id, sku: "WPX4-RED", unitsPerHour: 5 }, { sku: "WPX-JMP-4", unitsPerHour: 5 }, { familyId: wpx4.id, unitsPerHour: 5, effectiveDate: "11/1/26" }])
        assert.equal((await setRate(body)).status, 400, JSON.stringify(body));

    assert.equal((await request(app).post("/admin/hourly/rates").set(floor).send({ familyId: wpx4.id, unitsPerHour: 5 })).status, 403);

});

test("a saved plan: single SKU, full shift, 17/hr = 154; runs keep the rate used when saved", async () => {

    const res = await savePlan("Team B", "2026-11-05", [{ sku: "WPX4-BLU", qty: null }]);

    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.total, 154);
    assert.deepEqual(res.body.periods.map(p => p.total), [15, 17, 17, 12, 17, 8, 17, 17, 12, 17, 5]);

    // A new family rate from Nov 1 doesn't change the saved plan.
    await setRate({ familyId: fam("WPX4").id, unitsPerHour: 30, effectiveDate: "2026-11-02" });

    const again = await request(app).get("/hourly/plan/Team%20B/2026-11-05").set(floor);

    assert.equal(again.body.total, 154);
    assert.equal(again.body.runs[0].rate, 17);

});

test("plan with runs: qty totals exactly, true-up, carry-over when it doesn't fit; saving replaces the plan", async () => {

    await setRate({ familyId: fam("DMXP8").id, unitsPerHour: 10, effectiveDate: "2026-01-01" });
    await setRate({ familyId: fam("TRX4").id, unitsPerHour: 8, effectiveDate: "2026-01-01" });

    const res = await savePlan("Team A", "2026-11-05", [{ sku: "DMXP8-RGBW", qty: 25 }, { sku: "TRX4-50K-120V", qty: 100 }]);

    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.runs[0].planned, 25);
    assert.equal(res.body.runs[1].carryOver > 0, true);

    const replaced = await savePlan("Team A", "2026-11-05", [{ sku: "TRX4-50K-120V", qty: 20 }]);

    assert.equal(replaced.body.runs.length, 1);
    assert.equal(replaced.body.total, 20);

});

test("plans refuse: SKU on another board, SKU on no board, no rate, bad qty, open-ended run not last; floor can't save", async () => {

    const bad = async (board, runs) => (await savePlan(board, "2026-11-05", runs)).body.message;

    assert.match(await bad("Team A", [{ sku: "WPX4-BLU", qty: 5 }]), /Team B board/);
    assert.match(await bad("Team B", [{ sku: "WPX-JMP-4", qty: 5 }]), /doesn't match any product family/);
    assert.match(await bad("Deca", [{ sku: "DECA8-SO-48K-480V", qty: 5 }]), /no rate/);
    assert.match(await bad("Team B", [{ sku: "WPX4-BLU", qty: 2.5 }]), /whole number/);
    assert.match(await bad("Team B", [{ sku: "WPX4-BLU", qty: null }, { sku: "WPX4-RED", qty: 5 }]), /only the last run/);

    assert.equal((await request(app).put("/admin/hourly/plan/Team%20B/2026-11-05").set(floor).send({ runs: [] })).status, 403);

});

test("boards list (Ship Report order) and an unsaved day shows an empty plan", async () => {

    const b = await request(app).get("/hourly/boards").set(floor);

    assert.deepEqual(b.body.boards, ["Team A", "Team B", "Gigabay", "Gigabay - Vertical", "Terabay", "Deca", "Coating"]);
    assert.equal(b.body.periods.length, 11);

    const empty = await request(app).get("/hourly/plan/Deca/2026-11-09").set(floor);

    assert.equal(empty.body.saved, false);
    assert.equal(empty.body.total, 0);

});

test("SKU list (0008): 19 SpaceX SKUs under their families, family rate unless the SKU has its own; add, re-add, remove; floor can't edit", async () => {

    const list = async board => (await request(app).get(`/hourly/products?board=${encodeURIComponent(board)}&date=2026-11-10`).set(floor)).body.skus;

    const giga = await list("Gigabay");

    assert.equal(giga.length, 12);
    assert.ok(giga.every(s => s.prefix === "GIGA"));
    assert.deepEqual((await list("Gigabay - Vertical")).map(s => s.sku), ["GIGA8-VERT-48K-480V"]);
    assert.equal((await list("Terabay")).length, 5);
    assert.deepEqual((await list("Deca")).map(s => s.sku), ["DECA8-SO-48K-480V"]);
    assert.deepEqual(await list("Team A"), []);

    await setRate({ familyId: fam("TERA").id, unitsPerHour: 6, effectiveDate: "2026-11-01" });
    await setRate({ sku: "TERA4-2D2U-48K-480V", unitsPerHour: 3, effectiveDate: "2026-11-01" });

    const tera = Object.fromEntries((await list("Terabay")).map(s => [s.sku, s.rate]));

    assert.equal(tera["TERA1-48K-480V"].unitsPerHour, 6);
    assert.equal(tera["TERA1-48K-480V"].source, "family");
    assert.equal(tera["TERA4-2D2U-48K-480V"].unitsPerHour, 3);
    assert.equal(tera["TERA4-2D2U-48K-480V"].source, "sku");

    const add = sku => request(app).post("/admin/hourly/skus").set(admin).send({ sku });

    const added = await add("tera1-48k-480v-em");

    assert.equal(added.status, 201);
    assert.equal(added.body.family.board, "Terabay");
    assert.equal((await add("TERA1-48K-480V-EM")).status, 409);
    assert.equal((await add("WPX-JMP-4")).status, 400);
    assert.equal((await add("")).status, 400);

    const row = (await list("Terabay")).find(s => s.sku === "TERA1-48K-480V-EM");

    assert.equal((await request(app).delete(`/admin/hourly/skus/${row.id}`).set(admin)).status, 200);
    assert.ok(!(await list("Terabay")).some(s => s.sku === "TERA1-48K-480V-EM"));
    assert.equal((await request(app).delete(`/admin/hourly/skus/${row.id}`).set(admin)).status, 404);
    assert.equal((await add("TERA1-48K-480V-EM")).status, 201, "re-listing a removed SKU works");

    assert.equal((await request(app).post("/admin/hourly/skus").set(floor).send({ sku: "DECA8-X" })).status, 403);

});
