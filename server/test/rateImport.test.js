//------------------------------------------------------
// Bulk rate import: paste from the capacity planner sheet
// (family or SKU, cycle seconds or units/hr, optional date);
// check every row, save all or nothing.
//------------------------------------------------------

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

const { statements } = require("../database");
const { toDate } = require("../services/rateImport");

let admin;
let floor;

const imp = body => request(app).post("/admin/hourly/rates/import").set(admin).send({ unit: "seconds", effectiveDate: "2026-11-04", ...body });

before(async () => {

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

});

test("dates: ISO or US short", () => {

    assert.equal(toDate("2026-11-04"), "2026-11-04");
    assert.equal(toDate("11/4/2026"), "2026-11-04");
    assert.equal(toDate("11/4/26"), "2026-11-04");
    assert.equal(toDate("13/40/2026"), null);
    assert.equal(toDate("soon"), null);

});

test("check: cycle seconds → units/hr, family vs SKU, header skipped, tabs or commas, nothing saved", async () => {

    const text = "Family\tCycle time (s)\nDMXP8\t185\nfbl4, 84\nz-dmx\t120\nFPX4-HO-50K-3P-THRU\t160\t11/10/2026";

    const r = await imp({ text });

    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.errors, 0);
    assert.equal(r.body.ok, 4);
    assert.equal(r.body.saved, 0);

    const [dmxp, fbl, zdmx, thru] = r.body.rows;

    assert.deepEqual([dmxp.target, dmxp.label, dmxp.board, dmxp.unitsPerHour, dmxp.effectiveDate], ["family", "DMXP8", "Team A", 19.46, "2026-11-04"]);
    assert.deepEqual([fbl.label, fbl.unitsPerHour], ["FBL4", 42.86]);
    assert.equal(zdmx.label, "Z-DMX");
    assert.deepEqual([thru.target, thru.sku, thru.family, thru.unitsPerHour, thru.effectiveDate], ["sku", "FPX4-HO-50K-3P-THRU", "FPX4", 22.5, "2026-11-10"]);

    assert.equal(statements.getSkuRates.all().length, 0, "check only");

});

test("errors: unknown key, accessory, bad number, bad date, duplicate; save refused and nothing written", async () => {

    const text = "WPX4\t17\nRRX8\t115\nWPX-JMP-4\t30\nGPX4\tfast\nVPX2\t60\tsoon\nWPX4\t20\nFPX2-3P-DIALITE\t118";

    const r = await imp({ text, unit: "perHour", save: true });

    assert.equal(r.status, 400);
    assert.match(r.body.message, /6 rows have a problem\. Nothing was saved/);

    const err = Object.fromEntries(r.body.rows.map(x => [x.line, x.error || ""]));

    assert.equal(err[1], "");
    assert.match(err[2], /not a family prefix or a SKU/);
    assert.match(err[3], /not a family prefix or a SKU/);
    assert.match(err[4], /number above 0/);
    assert.match(err[5], /isn't a date/);
    assert.match(err[6], /Duplicate of line 1/);
    assert.match(err[7], /not on the SKU list/, "a typo SKU can't get a rate");

    const wpx4 = statements.getProductFamilies.all().find(f => f.prefix === "WPX4");

    assert.equal(statements.getFamilyRateOn.get(wpx4.id, "2026-12-31"), undefined);

});

test("save: all rows written in one go; the board uses them; floor refused; bad unit refused", async () => {

    const r = await imp({ text: "WPX4\t17\nWPX4-RED\t12\nGIGA\t360", unit: "perHour", save: false });

    assert.equal(r.body.ok, 3);

    // GIGA at 360 units/hr is allowed (≤ 10,000); now save with seconds instead.
    const s = await imp({ text: "WPX4\t211.76\nWPX4-RED\t300\nGIGA\t360", save: true });

    assert.equal(s.status, 201, s.text);
    assert.equal(s.body.saved, 3);

    const res = await request(app).get("/hourly/resolve?sku=WPX4-RED&date=2026-11-05").set(floor);

    assert.equal(res.body.rate.unitsPerHour, 12);
    assert.equal(res.body.rate.source, "sku");

    const blu = await request(app).get("/hourly/resolve?sku=WPX4-BLU&date=2026-11-05").set(floor);

    assert.equal(blu.body.rate.unitsPerHour, 17);

    assert.equal((await request(app).post("/admin/hourly/rates/import").set(floor).send({ text: "WPX4\t17", unit: "perHour" })).status, 403);
    assert.equal((await imp({ text: "WPX4\t17", unit: "minutes" })).status, 400);
    assert.equal((await imp({ text: "" })).status, 400);

});
