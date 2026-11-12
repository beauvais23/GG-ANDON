const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { sheetToNotes, planSync, sheetDate, createShipReportSync } = require("../services/shipReport");

//------------------------------------------------------
// Ship Report → backlog notes (Director, Nov 12 2026): COMMENTS → Ops
// comment, RECOVERY DATE → Recovery date, SO NOTE → Sales note; columns
// by header; per SO distinct texts joined, latest date wins; only values
// changed in the sheet are written, so page edits and clears stay; blanks
// never clear; only open SOs.
//------------------------------------------------------

const HEAD = ["SO#", "PO#", "CUSTOMER NAME", "ITEM NUMBER", "STATUS", "COMMENTS", "RECOVERY DATE", "SO NOTE"];
const row = (so, comment = "", date = "", note = "") => [so, "PO", "Acme", "ITEM", "LATE", comment, date, note];

test("sheet → one entry per SO: columns by header, distinct texts joined, latest recovery date, unreadable dates warned", () => {

    const r = sheetToNotes([
        HEAD,
        row("52976", "Waiting on XPT boards", "11/18/2026", "Ship via XPO"),
        row("52976", "Waiting on XPT boards", "11/20/2026", "Ship via XPO"),
        row("52976", "Second line short", "", ""),
        row("53603", "", "TBD", "Customer drawing pending"),
        row("", "orphan")
    ]);

    assert.deepEqual(r.sos, [
        { so: "52976", comment: "Waiting on XPT boards · Second line short", recoveryDate: "2026-11-20", soNote: "Ship via XPO" },
        { so: "53603", comment: "", recoveryDate: "", soNote: "Customer drawing pending" }
    ]);
    assert.match(r.warnings[0], /53603: recovery date "TBD"/);
    assert.throws(() => sheetToNotes([["A", "B"], ["1", "2"]]), /header row/);
    assert.equal(sheetDate("2/30/2026"), null);
    assert.equal(sheetDate("11/1/26"), "2026-11-01");

});

test("plan: a field is written only when non-blank and changed since the last read; closed SOs skipped", () => {

    const seen = { "1": { comment: "old", recovery_date: "2026-11-20", so_note: "n" } };
    const plan = planSync([
        { so: "1", comment: "new", recoveryDate: "2026-11-20", soNote: "" },
        { so: "2", comment: "c", recoveryDate: "2026-12-01", soNote: "s" },
        { so: "3", comment: "closed", recoveryDate: "", soNote: "" }
    ], so => seen[so], so => so !== "3");

    assert.deepEqual(plan.map(p => [p.so, p.body]), [["1", { opsComment: "new" }], ["2", { opsComment: "c", recoveryDate: "2026-12-01", salesNote: "s" }]]);

});

const { app } = loadApp();
const { db } = require("../database");
let admin;

test.before(async () => {

    admin = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: "test_admin", password: "test-admin-pw" })).body.token}` };

    const add = db.prepare("INSERT INTO qb_open_so_lines (so, line, customer, item, ordered, shipped, ship_date, hold, unit_price) VALUES (?, '1', 'Acme', 'RESALE', 5, ?, '2026-11-01', 0, 10)");

    add.run("52976", 0);
    add.run("53603", 0);
    add.run("51111", 5);

});

test("sync: writes changed sheet values as 'Ship Report'; page edits and clears survive the next read; a later sheet change wins; errors are logged, not thrown", async () => {

    const notes = so => db.prepare("SELECT recovery_date, ops_comment, sales_note, updated_by FROM backlog_notes WHERE so = ?").get(so);
    let rows = [HEAD, row("52976", "Waiting on XPT boards", "11/18/2026", "Ship via XPO"), row("53603", "", "", "Drawing pending"), row("51111", "Shipped")];
    let fail = null;

    // The real saveNote (same validation and change log as the page).
    const { backlogRoutes } = require("../routes/backlog");
    const router = backlogRoutes({ status: () => ({}) }, db);
    const sync = createShipReportSync({
        db,
        saveNote: router.saveNote,
        fetchRows: async () => { if (fail) throw new Error(fail); return rows; },
        config: () => ({ enabled: true, credentials: { client_email: "sa@example.iam.gserviceaccount.com" } })
    });

    const first = await sync.run("test");

    assert.equal(first.ok, true);
    assert.equal(first.sos, 2, "51111 is shipped: skipped");
    assert.deepEqual(notes("52976"), { recovery_date: "2026-11-18", ops_comment: "Waiting on XPT boards", sales_note: "Ship via XPO", updated_by: "Ship Report" });
    assert.equal(notes("51111"), undefined);

    // Someone clears the sales note on the page; the next read changes nothing.
    router.saveNote("52976", { salesNote: "" }, "Sales");

    assert.equal((await sync.run("test")).changed, 0);
    assert.equal(notes("52976").sales_note, null, "page clear survives");

    // Steve changes the comment in the sheet: only that field is written.
    rows = [HEAD, row("52976", "Boards in coating", "11/18/2026", "Ship via XPO")];

    assert.equal((await sync.run("test")).changed, 1);
    assert.equal(notes("52976").ops_comment, "Boards in coating");
    assert.equal(db.prepare("SELECT changed_by FROM backlog_note_log WHERE so = '52976' AND field = 'ops_comment' ORDER BY id DESC").get().changed_by, "Ship Report", "logged in the SO's history");
    assert.equal(notes("52976").sales_note, null);

    fail = "Ship Report read failed: 403 (share the Ship Report with sa@… as Viewer)";

    const bad = await sync.run("test");

    assert.equal(bad.ok, false);
    assert.equal(sync.status().lastOk, false);
    assert.match(sync.status().lastError, /share the Ship Report/);

});

test("routes: admin pull answers 409 when not set up; the backlog shows the sync status; floor can't pull", async () => {

    delete process.env.SHIP_REPORT_SHEET_ID;

    const floor = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token}` };

    await request(app).post("/admin/backlog/ship-report/pull").set(floor).expect(403);

    const r = await request(app).post("/admin/backlog/ship-report/pull").set(admin).expect(409);

    assert.match(r.body.error, /SHIP_REPORT_SHEET_ID not set/);

});
