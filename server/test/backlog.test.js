const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { buildBacklog, recoveryStatus, channelOf } = require("../services/backlog");

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

    const sx = run([so("SX", "KIT", 1, "2026-12-01", { hold: 1, customer: "SpaceX - Texas" })]);

    assert.equal(find(sx, "SX").kind, "DATED", "SpaceX HOLDs count as orders (Director, Nov 10 2026)");
    assert.equal(find(sx, "SX").rag, "GREEN");

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

test("channel (Director, Nov 11 2026): WMT part → Walmart, SpaceX customer → SpaceX, else the rep key (Car Wash / Industrial); unknown rep → Unassigned; PCB Coating is never a line here", () => {

    const key = new Map([["GG-CW", "Car Wash"], ["GG-DI", "Industrial - Direct"], ["ALE", "Industrial - Rep"]]);
    const ch = (lines) => channelOf(lines.map(l => ({ customer: "Acme", ...l })), key);

    assert.deepEqual(ch([{ item: "VPX4-40K-277V-WMT", rep: "GG-DI" }]), { channel: "Walmart", channelDetail: null });
    assert.equal(ch([{ item: "TERA1", customer: "SpaceX - Texas", rep: "GG-DI" }]).channel, "SpaceX");
    assert.deepEqual(ch([{ item: "VAC6", rep: "gg-cw" }]), { channel: "Car Wash", channelDetail: "Car Wash" }, "rep match ignores case");
    assert.deepEqual(ch([{ item: "GPX4", rep: "ALE" }]), { channel: "Industrial", channelDetail: "Industrial - Rep" });
    assert.equal(ch([{ item: "GPX4", rep: "NEW1" }]).channel, "Unassigned");

    const r = buildBacklog({
        soLines: [so("C1", "RESALE", 1, "2026-12-30", { sales_rep: "GG-CW" }), so("P1", "RESALE", 1, "2026-12-30")],
        poLines: [], items, childrenOf, today: TODAY, repChannels: key,
        lineGroupOf: () => "PCB Coating"
    });

    assert.equal(r.sos.find(x => x.so === "C1").channel, "Car Wash");
    assert.equal(r.sos.find(x => x.so === "P1").lineGroup, "Other", "PCB Coating isn't a line on this page");

    const loeb = buildBacklog({
        soLines: [so("L1", "VPX4-40K-277V-WMT", 1, "2026-12-30", { customer: "Loeb Electric" }), so("L2", "RESALE", 1, "2026-12-30", { customer: "Loeb Electric", project: "Plant 4" })],
        poLines: [], items, childrenOf, today: TODAY
    });

    assert.equal(loeb.sos.find(x => x.so === "L1").kind, "BLANKET", "a WMT part on a Loeb order is a Walmart blanket even without the project");
    assert.equal(loeb.sos.find(x => x.so === "L2").kind, "DATED", "other Loeb orders are normal orders");

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
    assert.equal(row.channel, "Industrial", "GG-DI → Industrial - Direct (seeded rep key)");
    assert.equal(row.channelDetail, "Industrial - Direct");
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

test("import (admin): three columns or a whole sheet with headers; only open SOs; unreadable date skipped with a warning; floor refused", async () => {

    const add = db.prepare("INSERT INTO qb_open_so_lines (so, line, customer, item, ordered, shipped, ship_date, hold, unit_price) VALUES (?, '1', 'Acme', 'RESALE', 5, ?, '2026-11-01', 0, 10)");

    add.run("52976", 0);
    add.run("52679", 0);
    add.run("51111", 5); // fully shipped: not open

    const text = "SO#\tRECOVERY DATE\tCOMMENTS\n52976\t11/18/2026\tWaiting on XPT boards\n52679\t\tIn final test";

    await request(app).post("/admin/backlog/notes/import").set(floor).send({ by: "x", text }).expect(403);

    const r = await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text }).expect(200);

    assert.equal(r.body.saved, 2);

    const notes = () => db.prepare("SELECT so, recovery_date, ops_comment FROM backlog_notes WHERE so IN ('52976', '52679', '51111', '99999') ORDER BY so").all().map(x => [x.so, x.recovery_date, x.ops_comment]);

    assert.deepEqual(notes(), [["52679", null, "In final test"], ["52976", "2026-11-18", "Waiting on XPT boards"]]);

    // A whole sheet: title rows, extra columns, columns found by header.
    const sheet = [
        "G&G SHIP REPORT\t\t\t\t\t",
        "\t\t\t\t\t",
        "CUSTOMER\tSO #\tSHIP DATE\tQTY\tRECOVERY DATE\tNOTES",
        "Acme\t52976\t11/1/2026\t5\t11/20/2026\tBoards in coating",
        "Acme\t51111\t11/1/2026\t5\t11/20/2026\tShipped already",
        "Acme\t99999\t11/1/2026\t5\t\tNot in QuickBooks",
        "Acme\t52679\t11/1/2026\t5\tTBD\tWaiting on customer",
        "Acme\t52680\t11/1/2026\t5\t\t"
    ].join("\n");

    const w = await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text: sheet }).expect(200);

    assert.equal(w.body.columns, "by header");
    assert.equal(w.body.notOpen, 2);
    assert.equal(w.body.saved, 2);
    assert.match(w.body.warnings[0], /52679: date "TBD" not read/);
    assert.deepEqual(notes(), [["52679", null, "Waiting on customer"], ["52976", "2026-11-20", "Boards in coating"]]);

    await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text: "SO\tSHIP DATE\n52976\t1/1/2026" }).expect(400);

});

test("a paste over 2 MB gets a JSON 413, not an HTML page; up to 2 MB is accepted", async () => {

    const big = await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text: "x".repeat(2.1 * 1024 * 1024) }).expect(413);

    assert.match(big.body.message, /Too much pasted/);

    await request(app).post("/admin/backlog/notes/import").set(admin).send({ by: "Bill", text: `SO\tRECOVERY DATE\tCOMMENTS\n${"\t\t\n".repeat(200000)}` }).expect(200);

});

test("rep key (admin): paste replaces the whole key, header skipped, bad rows refuse all; floor can read, not write", async () => {

    await request(app).put("/admin/backlog/rep-channels").set(floor).send({ by: "x", text: "A\tCar Wash" }).expect(403);
    await request(app).put("/admin/backlog/rep-channels").set(admin).send({ by: "Bill", text: "Rep\tChannel\nGG-DI\tSomething else" }).expect(400);

    const ok = await request(app).put("/admin/backlog/rep-channels").set(admin).send({ by: "Bill", text: "Rep\tChannel\nGG-DI\tCar Wash\nALE\tIndustrial - Rep" }).expect(200);

    assert.equal(ok.body.reps, 2);

    const list = await request(app).get("/backlog/rep-channels").set(floor).expect(200);

    assert.deepEqual(list.body.reps.map(r => [r.rep, r.channel]), [["ALE", "Industrial - Rep"], ["GG-DI", "Car Wash"]]);

    const row = (await request(app).get("/backlog").set(floor)).body.sos.find(s => s.so === "52680");

    assert.equal(row.channel, "Car Wash", "the new key is used at once");

});

test("lines (Nov 12 2026): accessory-only orders take the Line key (WPX- → Team B, PLL-/FBL- → Team A); a line set on the SO wins and is logged; admin replaces the key, bad rows refuse all", async () => {

    const add = db.prepare(`INSERT INTO qb_open_so_lines (so, line, customer, item, ordered, shipped, ship_date, hold, unit_price)
        VALUES (?, ?, 'Acme Wash', ?, 2, 0, '2026-11-20', 0, 10)`);

    add.run("60001", "1", "WPX-LDR-25");
    add.run("60001", "2", "WPX-CAP");
    add.run("60002", "1", "PLL-4-HL-CW");
    add.run("60002", "2", "FBL-CBL-20");
    add.run("60003", "1", "20-71013-A");

    const line = async so => (await request(app).get("/backlog").set(floor).expect(200)).body.sos.find(s => s.so === so);

    assert.equal((await line("60001")).lineGroup, "Team B");
    assert.equal((await line("60002")).lineGroup, "Team A");
    assert.equal((await line("60003")).lineGroup, "Other", "loose parts match no prefix");

    await request(app).put("/backlog/notes/60003").set(floor).send({ by: "Bill", lineOverride: "Team Z" }).expect(400);
    await request(app).put("/backlog/notes/60003").set(floor).send({ by: "Bill", lineOverride: "Team B" }).expect(200);

    const set = await line("60003");

    assert.equal(set.lineGroup, "Team B");
    assert.equal(set.lineAuto, "Other");
    assert.equal(set.lineOverride, "Team B");
    assert.ok((await request(app).get("/backlog/notes/60003/history").set(floor)).body.history.some(h => h.field === "line_override" && h.new_value === "Team B"));

    await request(app).put("/backlog/notes/60003").set(floor).send({ by: "Bill", lineOverride: "" }).expect(200);
    assert.equal((await line("60003")).lineGroup, "Other", "blank = back to automatic");

    await request(app).put("/admin/backlog/line-key").set(floor).send({ by: "x", text: "WPX-\tTeam A" }).expect(403);
    await request(app).put("/admin/backlog/line-key").set(admin).send({ by: "Bill", text: "Prefix\tLine\nWPX-\tTeam Q" }).expect(400);
    await request(app).put("/admin/backlog/line-key").set(admin).send({ by: "Bill", text: "Prefix\tLine\nWPX-\tTeam A\n20-\tTeam B" }).expect(200);

    assert.equal((await line("60001")).lineGroup, "Team A", "the new key applies at once");
    assert.equal((await line("60003")).lineGroup, "Team B");
    assert.equal((await line("60002")).lineGroup, "Other", "PLL- and FBL- are no longer in the key");

});
