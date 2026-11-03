//------------------------------------------------------
// H4 report: totals match the board, attainment, FPY,
// top failure codes, PCB Test, demonstrated rates.
// Week of Mon Nov 9 2026 (EST).
//------------------------------------------------------

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});

const { statements } = require("../database");

const ny = (date, h, m = 0) => Date.parse(`${date}T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

let admin;
let floor;
let n = 0;

const login = async (username, password) =>
    ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

async function at(ms) {

    mock.timers.setTime(ms);
    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

}

const tap = (date, h, body = {}) => request(app).post("/hourly/taps").set(floor).send({ tapId: `r-${String(++n).padStart(7, "0")}`, board: "Team B", sku: "WPX4-RED", tappedAt: ny(date, h, 10), ...body });
const fail = (date, h, code, body = {}) => request(app).post("/hourly/failures").set(floor).send({ failId: `rf-${String(++n).padStart(7, "0")}`, board: "Team B", sku: "WPX4-RED", code, failedAt: ny(date, h, 20), ...body });

before(async () => {

    mock.timers.enable({ apis: ["Date"], now: ny("2026-11-09", 17) });
    await at(ny("2026-11-09", 17));

    const wpx4 = statements.getProductFamilies.all().find(f => f.prefix === "WPX4");

    await request(app).post("/admin/hourly/rates").set(admin).send({ familyId: wpx4.id, unitsPerHour: 10, effectiveDate: "2026-11-01" });

    // Mon: plan 20 (2 hours of qty), 18 good + 2 fails (FA 060, BA 100).
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-09").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: 20 }] });
    for (let i = 0; i < 9; i++) await tap("2026-11-09", 6);
    for (let i = 0; i < 9; i++) await tap("2026-11-09", 7);
    await fail("2026-11-09", 6, "FA 060");
    await fail("2026-11-09", 7, "BA 100");

    // Tue: plan 10, 10 good, 1 fail FA 060; PCB Test 5 pass 1 fail.
    await at(ny("2026-11-10", 17));
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-10").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: 10 }] });
    for (let i = 0; i < 10; i++) await tap("2026-11-10", 6);
    await fail("2026-11-10", 6, "FA 060");
    for (let i = 0; i < 5; i++) await tap("2026-11-10", 6, { station: "PCB" });
    await fail("2026-11-10", 6, "BA 050", { station: "PCB" });

    await at(ny("2026-11-13", 9));

});

after(() => mock.timers.reset());

test("week report: totals, by board, by day, top codes, PCB, rates", async () => {

    const r = await request(app).get("/reports/hourly?from=2026-11-09&to=2026-11-15").set(floor);

    assert.equal(r.status, 200, r.text);

    const t = r.body.total;

    assert.equal(t.plan, 30);
    assert.equal(t.actual, 28);
    assert.equal(t.attainment, 93.3);
    assert.equal(t.rag, "amber");
    assert.equal(t.fails, 3);
    assert.equal(t.fpy, 90.3);       // 28 / 31
    assert.equal(t.pcbPass, 5);
    assert.equal(t.pcbFpy, 83.3);

    assert.deepEqual(r.body.days.map(d => [d.date, d.plan, d.actual]), [["2026-11-09", 20, 18], ["2026-11-10", 10, 10]]);
    assert.deepEqual(r.body.boards.map(b => b.board), ["Team B"]);

    assert.deepEqual(r.body.topCodes.map(c => [c.code, c.n, c.pct]), [["FA 060", 2, 66.7], ["BA 100", 1, 33.3]]);
    assert.equal(r.body.topCodes[0].label, "FA 060 - FUNCTIONAL TEST FAILURE");

    assert.deepEqual(r.body.pcb.bySku.map(x => [x.sku, x.pass, x.fail, x.fpy]), [["WPX4-RED", 5, 1, 83.3]]);
    assert.deepEqual(r.body.pcb.topCodes.map(c => c.code), ["BA 050"]);

    // WPX4: 28 good over the 6-7 (55 min) and 7-8 (60 min) hours Mon + 6-7 Tue (55) = 170 min → 9.9/hr.
    const wpx4 = r.body.rates.find(x => x.family === "WPX4");

    assert.equal(wpx4.units, 28);
    assert.equal(wpx4.workMinutes, 170);
    assert.equal(wpx4.perHour, 9.9);

});

test("one day and bad ranges", async () => {

    const d = await request(app).get("/reports/hourly?from=2026-11-10").set(floor);

    assert.equal(d.body.total.plan, 10);
    assert.equal((await request(app).get("/reports/hourly?from=2026-11-10&to=2026-11-01").set(floor)).status, 400);
    assert.equal((await request(app).get("/reports/hourly?from=2026-01-01&to=2026-11-01").set(floor)).status, 400);

});
