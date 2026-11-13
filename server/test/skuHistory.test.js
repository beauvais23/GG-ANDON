const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");
const { monthList, rowStats, customerView, itemView, ancestorsOf } = require("../services/skuHistory");

//------------------------------------------------------
// SKU History (Director, Nov 13 2026): same math as the "G&G Walmart
// (WMT) SKU Invoice History" sheet. Avg / month = total ÷ months with
// units; 6-mo avg = last 6 complete months ÷ 6; EAU = 6-mo avg × 12.
//------------------------------------------------------

const TODAY = "2026-11-13";
const MONTHS = monthList(TODAY, 13);

test("the sheet's VPX4-40K-277V-WMT row: total 2,052, avg/month 257 (8 active months), 6-mo avg 287 (May–Oct), current month partial and left out of the 6-mo avg", () => {

    const values = [0, 0, 0, 0, 130, 1, 0, 256, 283, 777, 275, 130, 200];
    const s = rowStats(new Map(MONTHS.map((m, i) => [m, values[i]])), MONTHS, TODAY);

    assert.equal(MONTHS[0], "2025-11");
    assert.equal(MONTHS[12], "2026-11");
    assert.equal(s.total, 2052);
    assert.equal(Math.round(s.avgActive), 257);
    assert.equal(Math.round(s.avg6), 287);
    assert.equal(s.eau, Math.round((1721 / 6) * 12));
    assert.equal(s.last12, 1852, "Nov 25 – Oct 26, no partial November 2026");

});

test("customer view: one row per item, sorted by total; totals row; items with nothing in the window dropped", () => {

    const rows = [
        { item: "A", month: "2026-10", qty: 10 }, { item: "A", month: "2026-09", qty: 5 },
        { item: "B", month: "2026-11", qty: 3 },
        { item: "OLD", month: "2024-01", qty: 99 }
    ];
    const v = customerView({ rows, months: MONTHS, today: TODAY, describe: i => `desc ${i}` });

    assert.deepEqual(v.items.map(r => [r.item, r.total]), [["A", 15], ["B", 3]]);
    assert.equal(v.items[0].description, "desc A");
    assert.equal(v.totals.total, 18);
    assert.equal(v.items[0].avg6, 2.5);

});

test("item view: direct invoices by customer + usage through shipped assemblies on every BOM path (multiplied, added, loops cut)", () => {

    // PCB is in SUB ×2; SUB is in KIT ×1; KIT also holds PCB ×1 directly; LOOP ↔ PCB cycle.
    const parents = { PCB: [{ assembly: "SUB", qty: 2 }, { assembly: "KIT", qty: 1 }, { assembly: "LOOP", qty: 1 }], SUB: [{ assembly: "KIT", qty: 1 }], LOOP: [{ assembly: "PCB", qty: 1 }] };
    const parentsOf = n => parents[n] || [];

    assert.deepEqual(Object.fromEntries(ancestorsOf("PCB", parentsOf).per), { SUB: 2, KIT: 3, LOOP: 1 });

    const inv = {
        PCB: [{ customer: "Spares Co", month: "2026-10", qty: 4 }],
        KIT: [{ customer: "Acme", month: "2026-10", qty: 10 }, { customer: "Acme", month: "2026-06", qty: 2 }],
        SUB: [{ customer: "Acme", month: "2026-09", qty: 1 }]
    };
    const v = itemView({ item: "PCB", rowsOfItem: n => inv[n] || [], parentsOf, months: MONTHS, today: TODAY });

    assert.deepEqual(v.customers.map(r => [r.customer, r.total]), [["Spares Co", 4]]);
    assert.deepEqual(v.assemblies.map(r => [r.assembly, r.qtyPer, r.shipped, r.total]), [["KIT", 3, 12, 36], ["SUB", 2, 1, 2]]);
    assert.equal(v.total.total, 42, "4 direct + 36 via KIT + 2 via SUB");
    assert.equal(v.total.avg6, 7, "May–Oct: 4 + 30 + 6 + 2 = 42 ÷ 6");
    assert.equal(v.total.eau, 84);

});

test("group view: SpaceX = GIGA/TERA/DECA + digit (no CNTL panels), Walmart = WMT anywhere; items and customers across all customers", () => {

    const { groupView } = require("../services/skuHistory");
    const rows = [
        { customer: "SpaceX", item: "GIGA8-TRI-48K-480V", month: "2026-09", qty: 10 },
        { customer: "SpaceX", item: "GIGA8-VERT-48K-DIM-480V", month: "2026-10", qty: 4 },
        { customer: "Other", item: "TERA1-48K-480V", month: "2026-10", qty: 2 },
        { customer: "SpaceX", item: "DECA8-SO-48K-480V", month: "2026-08", qty: 6 },
        { customer: "SpaceX", item: "GIGA-CNTL-NLIGHT-PANEL", month: "2026-10", qty: 1 },
        { customer: "SpaceX", item: "GIGABYTE-CABLE", month: "2026-10", qty: 9 },
        { customer: "Loeb Electric", item: "VPX4-40K-277V-WMT", month: "2026-10", qty: 100 },
        { customer: "Walmart", item: "WPX-WMT-LDR", month: "2026-09", qty: 7 },
        { customer: "Loeb Electric", item: "VPX4-40K-277V", month: "2026-10", qty: 50 }
    ];
    const sx = groupView({ group: "spacex", rows, months: MONTHS, today: TODAY });

    assert.deepEqual(sx.items.map(r => r.item).sort(), ["DECA8-SO-48K-480V", "GIGA8-TRI-48K-480V", "GIGA8-VERT-48K-DIM-480V", "TERA1-48K-480V"]);
    assert.equal(sx.totals.total, 22);
    assert.deepEqual(sx.customers.map(r => [r.customer, r.total]), [["SpaceX", 20], ["Other", 2]]);

    const w = groupView({ group: "walmart", rows, months: MONTHS, today: TODAY });

    assert.deepEqual(w.items.map(r => [r.item, r.total]), [["VPX4-40K-277V-WMT", 100], ["WPX-WMT-LDR", 7]]);
    assert.deepEqual(w.customers.map(r => r.customer), ["Loeb Electric", "Walmart"]);
    assert.equal(groupView({ group: "nope", rows, months: MONTHS, today: TODAY }), null);

});

const { app } = loadApp();
const { db } = require("../database");
let floor;
let admin;

test.before(async () => {

    const login = async (u, p) => ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username: u, password: p })).body.token}` });

    floor = await login("test_floor", "test-floor-pw");
    admin = await login("test_admin", "test-admin-pw");

    const add = db.prepare("INSERT INTO qb_invoice_months (customer, item, month, qty) VALUES (?, ?, ?, ?)");
    const m = monthList(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }), 3);

    add.run("Loeb Electric", "VPX4-WMT", m[0], 100);
    add.run("Loeb Electric", "VPX4-WMT", m[1], 50);
    add.run("Acme Wash", "VPX4-WMT", m[1], 5);

    db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, active, on_hand) VALUES ('VPX4-WMT', 'InventoryAssembly', 'VPX 4ft', 1, 12)").run();

});

test("routes: customer list, customer and item views (any login), 13 or 24 months, 404 for unknown; admin-only refresh", async () => {

    await request(app).get("/sku-history/customers").expect(401);

    const list = await request(app).get("/sku-history/customers").set(floor).expect(200);

    assert.deepEqual(list.body.customers.map(c => [c.customer, c.units]), [["Acme Wash", 5], ["Loeb Electric", 150]]);

    const c = await request(app).get("/sku-history/customer").query({ name: "Loeb Electric", months: 24 }).set(floor).expect(200);

    assert.equal(c.body.months.length, 24);
    assert.equal(c.body.items[0].item, "VPX4-WMT");
    assert.equal(c.body.items[0].description, "VPX 4ft");
    assert.equal(c.body.totals.total, 150);

    const i = await request(app).get("/sku-history/item").query({ name: "VPX4-WMT" }).set(floor).expect(200);

    assert.equal(i.body.months.length, 13);
    assert.deepEqual(i.body.customers.map(r => [r.customer, r.total]), [["Loeb Electric", 150], ["Acme Wash", 5]]);
    assert.equal(i.body.onHand, 12);

    await request(app).get("/sku-history/customer").query({ name: "Nobody" }).set(floor).expect(404);
    await request(app).get("/sku-history/item").query({ name: "NOPE-123" }).set(floor).expect(404);
    await request(app).post("/admin/sku-history/refresh").set(floor).expect(403);

    const g = await request(app).get("/sku-history/group").query({ name: "walmart" }).set(floor).expect(200);

    assert.equal(g.body.totals.total, 155);
    assert.deepEqual(g.body.customers.map(r => r.customer), ["Loeb Electric", "Acme Wash"]);
    await request(app).get("/sku-history/group").query({ name: "spacex" }).set(floor).expect(200);
    await request(app).get("/sku-history/group").query({ name: "x" }).set(floor).expect(400);

});

test("refresh: QuickBooks sums by month; rows replace the table whole, Returns & Warranty and zero rows dropped; an empty answer keeps the last copy", async () => {

    const { createQbBom } = require("../services/qbBom");
    const sql = [];
    let answer = [
        { CustomerName: "Acme", ItemName: "X", y: 2026, m: 3, q: 7 },
        { CustomerName: "Returns & Warranty", ItemName: "X", y: 2026, m: 3, q: 2 },
        { CustomerName: "Acme", ItemName: "Y", y: 2026, m: 4, q: 0 }
    ];
    const qb = createQbBom({ db, query: async q => { sql.push(q); return /OFFSET 0$/.test(q) ? answer : []; } });

    assert.equal(await qb.refreshInvoices(), 3);
    assert.match(sql[0], /SUM\(QtyShipped\)[\s\S]*GROUP BY CustomerName, ItemName, YEAR\(InvoiceDate\), MONTH\(InvoiceDate\)[\s\S]*LIMIT 1000 OFFSET 0/);
    assert.deepEqual(db.prepare("SELECT customer, item, month, qty FROM qb_invoice_months").all(), [{ customer: "Acme", item: "X", month: "2026-03", qty: 7 }]);

    answer = [];
    await assert.rejects(qb.refreshInvoices(), /kept the last copy/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM qb_invoice_months").get().n, 1);

});
