const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { buildBacklog, recoveryStatus } = require("../services/backlog");

//------------------------------------------------------
// Backlog & delivery risk (Director, Nov 10 2026): stock and POs
// allocated in promise-date order through the BOM; RAG = RED late
// or short with no PO by the promise date, AMBER relies on a late
// PO or due within 5 days still waiting on a PO, GREEN covered,
// GREY hold / Loeb-Walmart blanket / unscheduled (take no stock);
// S&H and Returns & Warranty left out; notes per SO survive
// refreshes, need a name, are logged and can be cleared.
//------------------------------------------------------

const TODAY = "2026-11-10";

const items = new Map([
    ["KIT", { full_name: "KIT", type: "InventoryAssembly", description: "Kit", on_hand: 2 }],
    ["SUB", { full_name: "SUB", type: "InventoryAssembly", description: "Sub-assembly", on_hand: 0 }],
    ["P1", { full_name: "P1", type: "Inventory", description: "Board", on_hand: 10 }],
    ["P2", { full_name: "P2", type: "Inventory", description: "Screw", on_hand: 1000 }],
    ["RESALE", { full_name: "RESALE", type: "Inventory", description: "Bought-in part", on_hand: 0 }],
    ["SVC", { full_name: "SVC", type: "Service", description: "Labor", on_hand: 0 }]
]);

// KIT = 1 SUB + 4 P2; SUB = 2 P1.
const BOM = { KIT: [{ component: "SUB", qty: 1 }, { component: "P2", qty: 4 }], SUB: [{ component: "P1", qty: 2 }] };
const childrenOf = a => BOM[a] || [];

let n = 0;
const so = (soNo, item, open, date, extra = {}) => ({ so: soNo, line: String(++n), customer: "Acme", item, ordered: open, shipped: 0, ship_date: date, hold: 0, unit_price: 10, ...extra });

const run = (soLines, poLines = [], notes) => buildBacklog({ soLines, poLines, items, childrenOf, today: TODAY, notes });
const find = (r, s) => r.sos.find(x => x.so === s);

test("allocation runs in promise-date order through sub-assemblies: the earlier order takes the stock", () => {

    // Listed later but due first: SO-B gets the 2 finished kits and board stock.
    const r = run([
        so("SO-A", "KIT", 5, "2026-12-15"),
        so("SO-B", "KIT", 5, "2026-12-01")
    ]);

    // SO-B: 2 kits on hand, 3 built → 3 SUB → 6 P1 (10 on hand → 4 left).
    // SO-A: 5 built → 10 P1 needed, 4 left → short 6, no PO → RED.
    assert.equal(find(r, "SO-B").rag, "GREEN");
    assert.equal(find(r, "SO-B").lines[0].fromStock, 2);
    assert.equal(find(r, "SO-A").rag, "RED");
    assert.equal(find(r, "SO-A").status, "SHORT");
    assert.deepEqual(find(r, "SO-A").shortParts.map(p => [p.part, p.short]), [["P1", 6]]);
    assert.match(find(r, "SO-A").reasons.join(" "), /Short P1 × 6 \(no PO\)/);
    assert.deepEqual(r.sos.map(s => s.so), ["SO-B", "SO-A"], "sorted by promise date");

});

test("RAG: late = RED with recovery status; PO after the promise date = RED; PO in time = GREEN; due within 5 days on a PO = AMBER; late PO = AMBER; PO 30+ days late isn't supply", () => {

    const po = (item, rem, eta, num = "PO1") => ({ po: num, item, ordered: rem, received: 0, expected_date: eta });

    const late = run([so("L", "SVC", 1, "2026-11-01")], [], new Map());

    assert.equal(find(late, "L").rag, "RED");
    assert.equal(find(late, "L").status, "LATE");
    assert.equal(find(late, "L").recoveryStatus, "NEEDS DATE");
    assert.match(find(late, "L").reasons[0], /Late 9 days/);

    const after = find(run([so("X", "RESALE", 5, "2026-11-20")], [po("RESALE", 5, "2026-11-25")]), "X");

    assert.equal(after.rag, "RED", "PO arrives after the promise date");
    assert.match(after.reasons[0], /RESALE: waiting on PO PO1 due 11\/25\/26/);
    assert.equal(find(run([so("X", "RESALE", 5, "2026-11-30")], [po("RESALE", 5, "2026-11-20")]), "X").rag, "GREEN", "PO in time, more than 5 days out");

    const soon = find(run([so("X", "RESALE", 5, "2026-11-14")], [po("RESALE", 5, "2026-11-12")]), "X");

    assert.equal(soon.rag, "AMBER");
    assert.match(soon.reasons[0], /Due in 4 days, waiting on a PO/);

    const latePo = find(run([so("X", "RESALE", 5, "2026-12-30")], [po("RESALE", 5, "2026-11-01")]), "X");

    assert.equal(latePo.rag, "AMBER");
    assert.match(latePo.reasons[0], /late PO/);

    assert.equal(find(run([so("X", "RESALE", 5, "2026-12-30")], [po("RESALE", 5, "2026-09-01")]), "X").rag, "RED", "a PO 70 days late isn't counted");

});

test("HOLD, Loeb / Walmart blanket and unscheduled orders are GREY and take no stock; S&H and Returns & Warranty are left out; partial shipments count only the open qty", () => {

    const r = run([
        so("HOLD", "KIT", 2, "2026-11-11", { hold: 1 }),
        so("LOEB", "KIT", 2, "2026-11-11", { customer: "Loeb Electric", project: "Walmart" }),
        so("UNSCH", "KIT", 2, "2027-12-31"),
        so("REAL", "KIT", 4, "2026-12-01", { ordered: 10, shipped: 8 }),
        so("REAL", "S&H - Freight", 1, "2026-12-01"),
        so("RW", "KIT", 1, "2026-12-01", { customer: "Returns & Warranty" })
    ]);

    assert.deepEqual(["HOLD", "LOEB", "UNSCH"].map(s => [find(r, s).rag, find(r, s).status]), [["GREY", "HOLD"], ["GREY", "BLANKET"], ["GREY", "UNSCHEDULED"]]);
    assert.equal(find(r, "REAL").openQty, 2, "10 ordered − 8 shipped; S&H line left out");
    assert.equal(find(r, "REAL").lines[0].fromStock, 2, "the grey orders didn't take the 2 kits");
    assert.equal(find(r, "RW"), undefined);

});

test("recovery status: none → NEEDS DATE, passed → MISSED, future → ON PLAN; shortage summary covers late and at-risk orders; $ = open qty × price", () => {

    assert.equal(recoveryStatus(null, TODAY), "NEEDS DATE");
    assert.equal(recoveryStatus({ recovery_date: "2026-11-05" }, TODAY), "MISSED");
    assert.equal(recoveryStatus({ recovery_date: "2026-11-20" }, TODAY), "ON PLAN");

    const r = run([so("LATE1", "RESALE", 3, "2026-11-01"), so("FUT", "RESALE", 2, "2026-12-30")]);

    assert.deepEqual(r.shortages.map(s => [s.part, s.short, s.sos.sort()]), [["RESALE", 5, ["FUT", "LATE1"]]], "late orders' shortages are in the summary too");
    assert.equal(find(r, "LATE1").openValue, 30);
    assert.equal(r.totals.late.count, 1);

});

//------------------------------------------------------
// Routes
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");

let floor;
let admin;

test.before(async () => {

    const login = async (u, p) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: u, password: p })).body.token}` });

    floor = await login("test_floor", "test-floor-pw");
    admin = await login("test_admin", "test-admin-pw");

    const now = Date.now();

    for (const kind of ["items", "so", "po"])
        db.prepare("INSERT INTO qb_sync_log (kind, started_at, finished_at, ok, rows) VALUES (?, ?, ?, 1, 1)").run(kind, now, now);

    db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, active, on_hand) VALUES ('RESALE', 'Inventory', 'Bought-in part', 1, 0)").run();
    db.prepare(`INSERT INTO qb_open_so_lines (so, line, customer, item, ordered, shipped, ship_date, hold, unit_price, sales_rep, industry, project)
        VALUES ('52680', '1', 'Vacuum Technologies', 'RESALE', 5, 0, '2026-10-28', 0, 100, 'GG-DI', 'Car Wash', 'Site 9')`).run();

});

test("routes: GET /backlog answers with the SO, channel and rep; notes need a name, validate dates, persist across reads, are logged, and can be cleared", async () => {

    await request(app).get("/backlog").expect(401);

    const first = await request(app).get("/backlog").set(floor).expect(200);
    const row = first.body.sos.find(s => s.so === "52680");

    assert.equal(row.industry, "Car Wash");
    assert.equal(row.rep, "GG-DI");
    assert.equal(row.openValue, 500);
    assert.equal(row.recoveryStatus, "NEEDS DATE");

    await request(app).put("/backlog/notes/52680").set(floor).send({ recoveryDate: "2026-11-20" }).expect(400);
    await request(app).put("/backlog/notes/52680").set(floor).send({ by: "Steve", recoveryDate: "11/31/2026" }).expect(400);

    const saved = await request(app).put("/backlog/notes/52680").set(floor)
        .send({ by: "Steve", recoveryDate: "11/20/2026", materialClearDate: "2026-11-15", opsComment: "Boards at ECT", salesNote: "Customer OK until 11/25" }).expect(200);

    assert.equal(saved.body.note.recovery_date, "2026-11-20", "M/D/YYYY accepted and stored ISO");
    assert.equal(saved.body.changed, 4);

    const again = (await request(app).get("/backlog").set(floor).expect(200)).body.sos.find(s => s.so === "52680");

    assert.equal(again.note.sales_note, "Customer OK until 11/25", "kept across reads (refreshes)");
    assert.equal(again.note.updated_by, "Steve");
    assert.equal(again.recoveryStatus, "ON PLAN");

    const hist = await request(app).get("/backlog/notes/52680/history").set(floor).expect(200);

    assert.equal(hist.body.history.length, 4);

    await request(app).delete("/backlog/notes/52680").set(floor).send({ by: "Bill" }).expect(200);

    assert.equal((await request(app).get("/backlog").set(floor)).body.sos.find(s => s.so === "52680").note, null);
    assert.equal((await request(app).get("/backlog/notes/52680/history").set(floor)).body.history.length, 8, "the clear is logged too");

});

test("import (admin): SO / recovery date / comment rows, all or none; floor login refused", async () => {

    const text = "SO#\tRECOVERY DATE\tCOMMENTS\n52976\t11/18/2026\tWaiting on XPT boards\n52679\t\tIn final test";

    await request(app).post("/admin/backlog/notes/import").set(floor).send({ by: "x", text }).expect(403);
    await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text: "52976\t13/45/2026\tx" }).expect(400);

    const r = await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text }).expect(200);

    assert.equal(r.body.saved, 2);

    const notes = db.prepare("SELECT so, recovery_date, ops_comment FROM backlog_notes WHERE so IN ('52976', '52679') ORDER BY so").all();

    assert.deepEqual(notes.map(x => [x.so, x.recovery_date, x.ops_comment]), [["52679", null, "In final test"], ["52976", "2026-11-18", "Waiting on XPT boards"]]);

});
