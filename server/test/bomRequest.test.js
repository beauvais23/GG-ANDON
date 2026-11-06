const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");
const { validateRequest, codeFor, describeLine } = require("../services/bomRequest");

//------------------------------------------------------
// BOM change requests: validation (invalid Add, Delete or
// Change of a line not on the BOM, one change per component),
// numbering BOM-YYYY-NNN, Google Chat card + Done reply in the
// card's thread, and staging never using the production space.
// CData and Google Chat are faked.
//------------------------------------------------------

const ITEMS = {
    "TOP-1": { full_name: "TOP-1", type: "InventoryAssembly", description: "Top config", uom: "", active: 1 },
    "20-111-A": { full_name: "20-111-A", type: "Inventory", description: "Screw", uom: "ea", active: 1 },
    "20-222-A": { full_name: "20-222-A", type: "Inventory", description: "Plate", uom: "ea", active: 1 },
    "20-999-A": { full_name: "20-999-A", type: "Inventory", description: "New gasket", uom: "ea", active: 1 },
    "OLD-9": { full_name: "OLD-9", type: "Inventory", description: "Old part", uom: "ea", active: 0 },
    "LABOR": { full_name: "LABOR", type: "Service", description: "Labor", uom: "", active: 1 }
};

const LEVEL_ONE = [
    { line: 1, component: "20-111-A", qty: 4, uom: "ea", description: "Screw" },
    { line: 2, component: "20-222-A", qty: 2, uom: "ea", description: "Plate" }
];

const ctx = { sku: "TOP-1", levelOne: LEVEL_ONE, itemOf: n => ITEMS[n] || null };
const base = { reason: "Correction", requestedBy: "Tester" };

test("validation: a good request with all three actions comes back normalised (old qty from the BOM)", () => {

    const { errors, lines, request: r } = validateRequest({ ...base, reference: " NCM-41 ", lines: [
        { action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: "6" },
        { action: "DELETE", line: 2, component: "20-222-A" },
        { action: "ADD", component: "20-999-A", newQty: 1 }
    ] }, ctx);

    assert.deepEqual(errors, []);
    assert.equal(r.reference, "NCM-41");
    assert.deepEqual(lines.map(l => [l.action, l.line, l.component, l.oldQty, l.newQty]), [
        ["CHANGE_QTY", 1, "20-111-A", 4, 6],
        ["DELETE", 2, "20-222-A", 2, null],
        ["ADD", null, "20-999-A", null, 1]
    ]);
    assert.equal(describeLine({ action: "CHANGE_QTY", line: 1, component: "20-111-A", old_qty: 4, new_qty: 6 }), "CHANGE QTY line 1 20-111-A 4 → 6");

});

test("validation: invalid Add is refused (unknown, inactive, service item, already on the BOM, the config itself, qty 0)", () => {

    const add = (component, newQty = 1) => validateRequest({ ...base, lines: [{ action: "ADD", component, newQty }] }, ctx).errors[0];

    assert.match(add("NOPE-1"), /not a QuickBooks item/);
    assert.match(add("OLD-9"), /inactive/);
    assert.match(add("LABOR"), /Service item; only parts/);
    assert.match(add("20-111-A"), /already on the BOM; change its qty/);
    assert.match(add("TOP-1"), /can't contain itself/);
    assert.match(add("20-999-A", 0), /above 0/);
    assert.match(add("20-999-A", "abc"), /above 0/);

});

test("validation: Delete / Change of a component not on that line, same or zero qty, duplicates, no reason or name", () => {

    const one = l => validateRequest({ ...base, lines: [l] }, ctx).errors[0];

    assert.match(one({ action: "DELETE", line: 1, component: "20-222-A" }), /not on line 1/);
    assert.match(one({ action: "DELETE", line: 9, component: "20-111-A" }), /not on line 9/);
    assert.match(one({ action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 4 }), /same as now \(4\)/);
    assert.match(one({ action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 0 }), /use Delete/);

    const dup = validateRequest({ ...base, lines: [{ action: "DELETE", line: 1, component: "20-111-A" }, { action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 3 }] }, ctx);

    assert.match(dup.errors[0], /one change per component/);

    const empty = validateRequest({ lines: [] }, ctx).errors;

    assert.equal(empty.length, 3);
    assert.equal(codeFor(2026, 7), "BOM-2026-007");
    assert.equal(codeFor(2026, 1000), "BOM-2026-1000");

});

//------------------------------------------------------
// Routes
//------------------------------------------------------

const { app } = loadApp();
const { db } = require("../database");
const { dateNY } = require("../services/nyTime");

const posts = [];
axios.post = async (url, body) => { posts.push({ url, body }); return { status: 200 }; };

const waitFor = async (fn, ms = 2000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 10));
};

function seed() {

    const ins = db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand) VALUES (?, ?, ?, ?, ?, 0)");

    Object.values(ITEMS).forEach(i => ins.run(i.full_name, i.type, i.description, i.uom, i.active));

    db.prepare("INSERT INTO qb_sync_log (kind, started_at, finished_at, ok, rows) VALUES ('items', ?, ?, 1, 6)").run(Date.now(), Date.now());
    db.prepare("INSERT OR REPLACE INTO qb_bom_lines (assembly, line, component, qty, uom) VALUES ('TOP-1', 1, '20-111-A', 4, 'ea'), ('TOP-1', 2, '20-222-A', 2, 'ea')").run();
    db.prepare("INSERT OR REPLACE INTO qb_bom_fetched (assembly, fetched_at) VALUES ('TOP-1', ?)").run(Date.now());

}

test("routes: send → BOM-YYYY-001 with lines and the BOM snapshot, card to the test space in its own thread; Done → reply in that thread; then 409", async () => {

    seed();

    process.env.GOOGLE_CHAT_BOM_WEBHOOK_STAGING = "https://chat.example.test/v1/spaces/T/messages?key=k&token=t";
    process.env.GOOGLE_CHAT_BOM_WEBHOOK = "https://chat.example.test/PRODUCTION";

    const floor = (await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token;
    const auth = r => r.set("Authorization", `Bearer ${floor}`);

    const bad = await auth(request(app).post("/bom/requests")).send({ sku: "TOP-1", ...base, lines: [{ action: "ADD", component: "OLD-9", newQty: 1 }] }).expect(400);

    assert.match(bad.body.errors[0], /inactive/);

    const sent = await auth(request(app).post("/bom/requests")).send({ sku: "TOP-1", ...base, reference: "ECO-12", lines: [
        { action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 6 },
        { action: "ADD", component: "20-999-A", newQty: 2 }
    ] }).expect(201);

    const year = dateNY(Date.now()).slice(0, 4);
    const code = `BOM-${year}-001`;

    assert.equal(sent.body.request.code, code);
    assert.equal(sent.body.request.lines.length, 2);

    await waitFor(() => posts.length === 1);

    assert.equal(posts.length, 1);
    assert.ok(posts[0].url.startsWith("https://chat.example.test/v1/spaces/T/messages?"), "staging space, never the production variable");
    assert.equal(new URL(posts[0].url).searchParams.get("threadKey"), code);
    assert.match(JSON.stringify(posts[0].body), /20-111-A.*4 → 6/);
    assert.match(JSON.stringify(posts[0].body), new RegExp(`/bom/requests\\?code=${code}`));

    const detail = await auth(request(app).get(`/bom/requests/${code}`)).expect(200);

    assert.deepEqual(detail.body.request.snapshot.map(s => [s.line, s.component, s.qty]), [[1, "20-111-A", 4], [2, "20-222-A", 2]]);
    await waitFor(() => db.prepare("SELECT chat_sent_at FROM bom_requests WHERE code = ?").get(code).chat_sent_at);
    assert.ok(db.prepare("SELECT chat_sent_at FROM bom_requests WHERE code = ?").get(code).chat_sent_at);

    const second = await auth(request(app).post("/bom/requests")).send({ sku: "TOP-1", ...base, lines: [{ action: "DELETE", line: 2, component: "20-222-A" }] }).expect(201);

    assert.equal(second.body.request.code, `BOM-${year}-002`);

    await auth(request(app).post(`/bom/requests/${code}/done`)).send({}).expect(400);
    await auth(request(app).post(`/bom/requests/${code}/done`)).send({ by: "QB Editor", note: "Edited in QB" }).expect(200);
    await auth(request(app).post(`/bom/requests/${code}/cancel`)).send({ by: "Someone", note: "late" }).expect(409);
    await auth(request(app).post(`/bom/requests/BOM-${year}-002/cancel`)).send({ by: "Tester" }).expect(400);

    await waitFor(() => posts.length === 3);

    const done = posts.find(p => /DONE/.test(p.body.text || "") && !p.body.cardsV2);

    assert.equal(new URL(done.url).searchParams.get("threadKey"), code, "Done reply goes in the card's thread");
    assert.match(done.body.text, /DONE in QuickBooks by QB Editor: Edited in QB/);

    const open = await auth(request(app).get("/bom/requests?status=OPEN")).expect(200);

    assert.deepEqual(open.body.requests.map(r => r.code), [`BOM-${year}-002`]);

});

test("routes: outside production with no staging space nothing is posted, even with the production webhook set; the reason is saved", async () => {

    delete process.env.GOOGLE_CHAT_BOM_WEBHOOK_STAGING;
    process.env.GOOGLE_CHAT_BOM_WEBHOOK = "https://chat.example.test/PRODUCTION";
    posts.length = 0;
    db.prepare("UPDATE bom_requests SET status = 'CANCELLED' WHERE status = 'OPEN'").run(); // no duplicate guard here

    const floor = (await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token;

    const r = await request(app).post("/bom/requests").set("Authorization", `Bearer ${floor}`)
        .send({ sku: "TOP-1", ...base, lines: [{ action: "CHANGE_QTY", line: 2, component: "20-222-A", newQty: 3 }] }).expect(201);

    await waitFor(() => db.prepare("SELECT chat_error FROM bom_requests WHERE code = ?").get(r.body.request.code).chat_error);

    assert.equal(posts.length, 0);
    assert.match(db.prepare("SELECT chat_error FROM bom_requests WHERE code = ?").get(r.body.request.code).chat_error, /not production and no staging BOM space/);

    const items = await request(app).get("/bom/items?q=20-9").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.deepEqual(items.body.items.map(i => i.full_name), ["20-999-A"]);

    const none = await request(app).get("/bom/items?q=LAB").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.equal(none.body.items.length, 0, "service items can't be added");

    delete process.env.GOOGLE_CHAT_BOM_WEBHOOK;

});

test("duplicate guard: a component already in an open request for the config → 409 with the request; confirmDuplicate sends it; other components and closed requests don't count; list filters by config", async () => {

    seed();
    delete process.env.GOOGLE_CHAT_BOM_WEBHOOK_STAGING;

    const floor = (await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" })).body.token;
    const send = body => request(app).post("/bom/requests").set("Authorization", `Bearer ${floor}`).send({ sku: "TOP-1", ...base, ...body });

    db.prepare("UPDATE bom_requests SET status = 'CANCELLED' WHERE status = 'OPEN'").run();

    const first = await send({ lines: [{ action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 5 }] }).expect(201);

    const dup = await send({ lines: [{ action: "DELETE", line: 1, component: "20-111-A" }, { action: "ADD", component: "20-999-A", newQty: 1 }] }).expect(409);

    assert.equal(dup.body.duplicates.length, 1);
    assert.equal(dup.body.duplicates[0].code, first.body.request.code);
    assert.equal(dup.body.duplicates[0].component, "20-111-A");
    assert.match(dup.body.message, new RegExp(`Already in open request ${first.body.request.code}: 20-111-A`));

    await send({ lines: [{ action: "DELETE", line: 2, component: "20-222-A" }] }).expect(201);

    const confirmed = await send({ confirmDuplicate: true, lines: [{ action: "DELETE", line: 1, component: "20-111-A" }] }).expect(201);

    await request(app).post(`/bom/requests/${first.body.request.code}/cancel`).set("Authorization", `Bearer ${floor}`).send({ by: "Tester", note: "dup" }).expect(200);
    await request(app).post(`/bom/requests/${confirmed.body.request.code}/cancel`).set("Authorization", `Bearer ${floor}`).send({ by: "Tester", note: "dup" }).expect(200);

    await send({ lines: [{ action: "CHANGE_QTY", line: 1, component: "20-111-A", newQty: 7 }] }).expect(201);

    const open = await request(app).get("/bom/requests?status=OPEN&sku=TOP-1").set("Authorization", `Bearer ${floor}`).expect(200);
    const none = await request(app).get("/bom/requests?sku=OTHER-SKU").set("Authorization", `Bearer ${floor}`).expect(200);

    assert.equal(open.body.requests.length, 2);
    assert.ok(open.body.requests.every(r => r.sku === "TOP-1" && r.status === "OPEN"));
    assert.equal(none.body.requests.length, 0);

});
