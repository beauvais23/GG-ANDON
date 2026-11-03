//------------------------------------------------------
// Hour-by-hour board, H2: taps (one per good unit), undo,
// offline re-sends, actual per hour and RAG.
// Times are New York; Thu Nov 5 2026 is EST (UTC-5).
//------------------------------------------------------

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});

const { statements } = require("../database");
const { periodAt, ragFor, workMinutesBetween } = require("../services/hourlyActual");

const thu = (h, m, s = 0) => Date.parse(`2026-11-05T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}Z`);

let admin;
let floor;
let n = 0;

const tap = (body, at) => request(app).post("/hourly/taps").set(floor).send({ tapId: `tap-${String(++n).padStart(6, "0")}`, board: "Team B", sku: "WPX4-RED", tappedAt: at, ...body });
const day = (board, date) => request(app).get(`/hourly/plan/${encodeURIComponent(board)}/${date}`).set(floor);

const login = async (username, password) =>
    ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

// The clock is frozen for the whole file; log in again after moving it
// (tokens last 12 h).
async function at(ms) {

    mock.timers.setTime(ms);
    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

}

before(async () => {

    mock.timers.enable({ apis: ["Date"], now: thu(5, 0) });
    await at(thu(5, 0));

    const wpx4 = statements.getProductFamilies.all().find(f => f.prefix === "WPX4");

    await request(app).post("/admin/hourly/rates").set(admin).send({ familyId: wpx4.id, unitsPerHour: 17, effectiveDate: "2026-11-01" });
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-05").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: null }] });

});

after(() => mock.timers.reset());

test("period of a tap: New York clock hour; before 6:00 → first, after 4:30 → last; EDT and EST", () => {

    assert.equal(periodAt(thu(5, 50)), 0);
    assert.equal(periodAt(thu(6, 0)), 0);
    assert.equal(periodAt(thu(9, 10)), 3);           // during break 1, still the 9-10 hour
    assert.equal(periodAt(thu(16, 29, 59)), 10);
    assert.equal(periodAt(thu(17, 15)), 10);
    assert.equal(periodAt(Date.parse("2026-10-29T14:30:00Z")), 4);  // Thu Oct 29 EDT: 10:30 AM
    assert.equal(periodAt(Date.parse("2026-11-02T15:30:00Z")), 4);  // Mon Nov 2 EST: 10:30 AM

});

test("RAG: green at or above 100%, amber 90-99%, red below; no plan → none", () => {

    const s = { green_pct: 100, amber_pct: 90 };

    assert.equal(ragFor(17, 17, s), "green");
    assert.equal(ragFor(16, 17, s), "amber");     // 94%
    assert.equal(ragFor(15, 17, s), "red");       // 88%
    assert.equal(ragFor(9, 10, s), "amber");      // exactly 90%
    assert.equal(ragFor(3, 0, s), null);
    assert.equal(workMinutesBetween(540, 600), 45);   // 9-10 has break 1

});

test("taps: counted in their hour; a re-sent tapId is stored once; SKU must be on the board", async () => {

    await at(thu(7, 30));

    const first = await tap({ tapId: "resend-0001" }, thu(7, 20));

    assert.equal(first.status, 201);
    assert.equal(first.body.tap.period, 1);
    assert.equal(first.body.tap.plan_date, "2026-11-05");

    const again = await tap({ tapId: "resend-0001" }, thu(7, 21));

    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);

    // Offline tap made at 6:40, sent at 7:30: counts in 6:00-7:00.
    assert.equal((await tap({}, thu(6, 40))).body.tap.period, 0);

    // Future or day-old tablet time → server time.
    assert.equal((await tap({}, thu(9, 0))).body.tap.period, 1);

    for (const bad of [{ sku: "TRX4-50K-120V" }, { sku: "WPX-JMP-4" }, { board: "Nope" }, { tapId: "x" }])
        assert.equal((await tap(bad, thu(7, 25))).status, 400, JSON.stringify(bad));

    const d = (await day("Team B", "2026-11-05")).body;

    assert.equal(d.periods[0].actualTotal, 1);
    assert.equal(d.periods[1].actualTotal, 2);
    assert.deepEqual(d.periods[1].actual, { "WPX4-RED": 2 });
    assert.equal(d.countStation, "Final Test");

});

test("undo within 30 s takes a tap back (once); later is refused", async () => {

    await at(thu(8, 0));

    const t = (await tap({ tapId: "undo-0001" }, thu(8, 0))).body.tap;
    const before = (await day("Team B", "2026-11-05")).body.periods[2].actualTotal;

    mock.timers.tick(20 * 1000);

    assert.equal((await request(app).post(`/hourly/taps/${t.tap_id}/undo`).set(floor)).status, 200);
    assert.equal((await request(app).post(`/hourly/taps/${t.tap_id}/undo`).set(floor)).body.alreadyUndone, true);
    assert.equal((await day("Team B", "2026-11-05")).body.periods[2].actualTotal, before - 1);

    const late = (await tap({ tapId: "undo-0002" }, thu(8, 0, 20))).body.tap;

    mock.timers.tick(60 * 1000);

    assert.equal((await request(app).post(`/hourly/taps/${late.tap_id}/undo`).set(floor)).status, 409);
    assert.equal((await request(app).post("/hourly/taps/nope-0000/undo").set(floor)).status, 404);

});

test("board RAG: finished hours vs full plan, the current hour pro-rated by work minutes, later hours blank", async () => {

    // Fresh board/day: Team B, Mon Nov 9.
    await at(Date.parse("2026-11-09T10:00:00Z"));
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-09").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: null }] });

    const mon = (h, m) => Date.parse(`2026-11-09T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

    await at(mon(7, 30));

    for (let i = 0; i < 15; i++) await tap({}, mon(6, 10));   // 6-7 plan 15 → green
    for (let i = 0; i < 7; i++) await tap({}, mon(7, 10));    // 7-8, 30 min in: due 8.5 → 82% red

    let d = (await day("Team B", "2026-11-09")).body;

    assert.deepEqual(d.periods.slice(0, 3).map(p => [p.status, p.rag]), [["done", "green"], ["now", "red"], ["later", null]]);
    assert.equal(d.periods[1].due, 8.5);
    assert.equal(d.planToNow, 23);
    assert.equal(d.actualTotal, 22);
    assert.equal(d.rag, "amber");

    await tap({}, mon(7, 20));                                 // 8 of 8.5 → 94% amber

    assert.equal((await day("Team B", "2026-11-09")).body.periods[1].rag, "amber");

    // Admin changes the thresholds: amber from 95% → that hour turns red.
    assert.equal((await request(app).put("/admin/hourly/settings").set(admin).send({ greenPct: 100, amberPct: 95 })).status, 200);

    d = (await day("Team B", "2026-11-09")).body;

    assert.equal(d.periods[1].rag, "red");

    for (const bad of [{ greenPct: 90, amberPct: 95 }, { greenPct: 0, amberPct: 0 }, {}])
        assert.equal((await request(app).put("/admin/hourly/settings").set(admin).send(bad)).status, 400);

    assert.equal((await request(app).put("/admin/hourly/settings").set(floor).send({ greenPct: 100, amberPct: 90 })).status, 403);
    await request(app).put("/admin/hourly/settings").set(admin).send({ greenPct: 100, amberPct: 90 });

    // A past day: every hour is done.
    await at(mon(18, 0) + 24 * 60 * 60 * 1000);

    assert.ok((await day("Team B", "2026-11-09")).body.periods.every(p => p.status === "done"));

});

test("PCB Coating counts at Production; boards list carries each board's count station", async () => {

    const b = (await request(app).get("/hourly/boards").set(floor)).body;

    assert.equal(b.countStations["PCB Coating"], "Production");
    assert.equal(b.countStations["Team A"], "Final Test");

});

test("corrections (0010): set an hour right with a reason and a name; adds to taps; never below 0; admin only; kept as a trail", async () => {

    await at(thu(15, 0));

    const fix = body => request(app).post("/admin/hourly/corrections").set(admin)
        .send({ board: "Team B", date: "2026-11-05", period: 1, sku: "WPX4-RED", reason: "Missed taps", by: "Lead One", ...body });

    const hour = async () => (await day("Team B", "2026-11-05")).body.periods[1];
    const start = (await hour()).actualTotal;

    const up = await fix({ delta: 3 });

    assert.equal(up.status, 201, up.text);
    assert.equal(up.body.periods[1].actualTotal, start + 3);
    assert.equal(up.body.periods[1].corrected, 3);

    // Wrong SKU: one down, another up (a WPX4 SKU not tapped before).
    await fix({ delta: -1, reason: "Wrong SKU" });
    await fix({ delta: 1, sku: "WPX4-BLU", reason: "Wrong SKU" });

    const h = await hour();

    assert.equal(h.actualTotal, start + 3);
    assert.equal(h.actual["WPX4-BLU"], 1);
    assert.equal(h.corrected, 3);

    // Can't go below 0; bad input refused; floor login refused.
    assert.match((await fix({ delta: -2, sku: "WPX4-BLU" })).body.message, /below 0/);

    for (const bad of [{ delta: 0 }, { delta: 1.5 }, { delta: 1, reason: "" }, { delta: 1, by: "" }, { delta: 1, period: 11 }, { delta: 1, sku: "TRX4-50K-120V" }, { delta: 1, date: "11/5/26" }])
        assert.equal((await fix(bad)).status, 400, JSON.stringify(bad));

    assert.equal((await request(app).post("/admin/hourly/corrections").set(floor).send({ board: "Team B", date: "2026-11-05", period: 1, sku: "WPX4-RED", delta: 1, reason: "x x x", by: "Someone" })).status, 403);

    const trail = (await day("Team B", "2026-11-05")).body.corrections;

    assert.equal(trail.length, 3);
    assert.deepEqual(trail.map(c => c.delta).sort(), [-1, 1, 3]);
    assert.ok(trail.every(c => c.adjusted_by === "Lead One" && c.reason));

});

test("H3: FAIL with a code, stored once; undo in 30 s; rework pass adds 1 to Actual in the hour it passed; scrap doesn't; FPY excludes reworked passes", async () => {

    // Fresh day: Team B, Thu Nov 12 (EST).
    const d12 = (h, m) => Date.parse(`2026-11-12T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

    await at(d12(7, 0));
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-12").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: null }] });

    let k = 0;
    const fail = (body, when) => request(app).post("/hourly/failures").set(floor).send({ failId: `fail-${String(++k).padStart(6, "0")}`, board: "Team B", sku: "WPX4-RED", code: "FA 060", failedAt: when, ...body });
    const dispose = (id, disposition) => request(app).post(`/hourly/failures/${id}/disposition`).set(floor).send({ disposition });
    const board = async () => (await day("Team B", "2026-11-12")).body;

    // 6:00-7:00: 9 good, 1 fail.
    for (let i = 0; i < 9; i++) await tap({}, d12(6, 10));

    const f1 = await fail({ failId: "fail-once-0001" }, d12(6, 30));

    assert.equal(f1.status, 201);
    assert.equal(f1.body.failure.period, 0);
    assert.equal((await fail({ failId: "fail-once-0001" }, d12(6, 31))).body.duplicate, true);

    // Bad code, SKU on another board.
    assert.equal((await fail({ code: "ZZ 999" }, d12(6, 40))).status, 400);
    assert.equal((await fail({ sku: "TRX4-50K-120V" }, d12(6, 40))).status, 400);

    // A second fail, undone at once.
    const f2 = (await fail({ code: "BA 100" }, d12(6, 59))).body.failure;

    assert.equal((await request(app).post(`/hourly/failures/${f2.fail_id}/undo`).set(floor)).status, 200);

    let b = await board();

    assert.equal(b.periods[0].firstPassGood, 9);
    assert.equal(b.periods[0].fails, 1);
    assert.equal(b.periods[0].fpy, 90);
    assert.deepEqual(b.periods[0].failCodes, { "FA 060": 1 });
    assert.equal(b.quality.open, 1);

    // Reworked and passed at 7:20: +1 Actual in 7:00-8:00, FPY of 6:00-7:00 unchanged.
    await at(d12(7, 20));

    assert.equal((await dispose("fail-once-0001", "REWORK_PASS")).status, 200);
    assert.equal((await dispose("fail-once-0001", "SCRAP")).status, 409);

    b = await board();

    assert.equal(b.periods[1].actualTotal, 1);
    assert.equal(b.periods[1].rework, 1);
    assert.equal(b.periods[1].firstPassGood, 0);
    assert.equal(b.periods[0].fpy, 90);
    assert.equal(b.quality.open, 0);

    // Scrap: counted as scrap, no Actual.
    const f3 = (await fail({ code: "FA 040" }, d12(7, 25))).body.failure;

    await dispose(f3.fail_id, "SCRAP");

    b = await board();

    assert.equal(b.periods[1].actualTotal, 1);
    assert.equal(b.periods[1].scrap, 1);
    assert.equal(b.periods[1].fails, 1);
    assert.deepEqual(b.quality, { firstPassGood: 9, fails: 2, rework: 1, scrap: 1, open: 0, fpy: 81.8 });

    // A dispositioned fail can't be undone; codes list hides inactive codes.
    assert.equal((await request(app).post(`/hourly/failures/${f3.fail_id}/undo`).set(floor)).status, 409);

    const codes = (await request(app).get("/hourly/failure-codes").set(floor)).body.codes;

    assert.equal(codes.length, 57);
    assert.equal(codes[0].code, "FA 010");

});

test("H3 admin: add a failure code the form's way, turn one off; floor refused", async () => {

    await at(thu(15, 0));

    const add = label => request(app).post("/admin/failure-codes").set(admin).send({ label });

    assert.equal((await add("EC 990 - Test code")).status, 201);
    assert.equal((await add("EC 990 - Again")).status, 409);
    assert.equal((await add("no code here")).status, 400);

    const all = (await request(app).get("/admin/failure-codes").set(admin)).body.codes;
    const ec = all.find(c => c.code === "EC 990");

    assert.equal(ec.label, "EC 990 - TEST CODE");
    assert.equal((await request(app).put(`/admin/failure-codes/${ec.id}`).set(admin).send({ active: false })).status, 200);
    assert.ok(!(await request(app).get("/hourly/failure-codes").set(floor)).body.codes.some(c => c.code === "EC 990"));
    assert.equal((await request(app).post("/admin/failure-codes").set(floor).send({ label: "EC 061 - X X X" })).status, 403);

});

test("PCB Test (0012): PASS / FAIL give PCB FPY and never touch Actual, FPY or open count-station failures", async () => {

    const d13 = (h, m) => Date.parse(`2026-11-13T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

    await at(d13(9, 0));
    await request(app).put("/admin/hourly/plan/Team%20B/2026-11-13").set(admin).send({ runs: [{ sku: "WPX4-RED", qty: null }] });

    for (let i = 0; i < 8; i++) await tap({ station: "PCB" }, d13(8, 10));
    await tap({}, d13(8, 20));

    let k = 0;
    const fail = body => request(app).post("/hourly/failures").set(floor).send({ failId: `pcbf-${String(++k).padStart(6, "0")}`, board: "Team B", sku: "WPX4-RED", code: "BA 100", failedAt: d13(8, 30), ...body });

    assert.equal((await fail({ station: "PCB" })).status, 201);
    assert.equal((await fail({ station: "PCB", code: "BA 050" })).status, 201);

    const b = (await day("Team B", "2026-11-13")).body;

    assert.equal(b.periods[2].actualTotal, 1, "PCB passes are not Actual");
    assert.equal(b.periods[2].fails, 0, "PCB fails are not count-station fails");
    assert.equal(b.quality.open, 0);
    assert.equal(b.pcb.pass, 8);
    assert.equal(b.pcb.fail, 2);
    assert.equal(b.pcb.fpy, 80);
    assert.equal(b.pcb.open, 2);

    assert.equal((await request(app).get("/hourly/failures/open/Team%20B?station=PCB").set(floor)).body.failures.length, 2);
    assert.equal((await request(app).get("/hourly/failures/open/Team%20B").set(floor)).body.failures.length, 0);

});

test("FPY colours: 99 / 97 by default, editable with the board colours; bad values refused", async () => {

    await at(thu(15, 0));

    const s = (await request(app).get("/hourly/settings").set(floor)).body;

    assert.equal(s.fpy_green_pct, 99);
    assert.equal(s.fpy_amber_pct, 97);

    const put = body => request(app).put("/admin/hourly/settings").set(admin).send({ greenPct: 100, amberPct: 90, ...body });

    assert.equal((await put({ fpyGreenPct: 98, fpyAmberPct: 95 })).body.fpy_green_pct, 98);
    assert.equal((await put({ fpyGreenPct: 95, fpyAmberPct: 96 })).status, 400);
    await put({ fpyGreenPct: 99, fpyAmberPct: 97 });

});
