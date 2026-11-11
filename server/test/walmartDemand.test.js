const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseDemandGrid, parseDate, skuCandidates } = require("../services/walmartDemand");

//------------------------------------------------------
// Walmart demand grid (Director, Nov 11 2026): pasted from Krystal's
// "G&G INVENTORY DEMAND" file. Due = commitment date, else the 1st
// of the month; months that go backwards get a year added (the
// 11.09.2026 file says 1/1/2026 for January 2027); -WMTVT = -WMT.
//------------------------------------------------------

const GRID = fs.readFileSync(path.join(__dirname, "fixtures", "walmart_demand_11-09-2026.tsv"), "utf8");
const WMT = n => /-WMT$/.test(n);

test("the real 11.09.2026 grid: 5 releases, Jan 2027 rolled forward, WMTVT → WMT, due 1st of the month", () => {

    const r = parseDemandGrid(GRID, { itemExists: WMT });

    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.unmatched, []);
    assert.deepEqual(r.months, ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    assert.deepEqual(r.releases.map(x => [x.sku, x.month, x.qty, x.due, x.immediate]), [
        ["VPX4-40K-120V-WMT", "2026-12-01", 50, "2026-12-01", false],
        ["VPX4-40K-277V-WMT", "2026-11-01", 86, "2026-11-01", true],
        ["VPX4-40K-277V-WMT", "2026-12-01", 80, "2026-12-01", false],
        ["VPX8-40K-277V-WMT", "2026-12-01", 3, "2026-12-01", false],
        ["VPX8-40K-120V-WMT", "2026-11-01", 1, "2026-11-01", true]
    ]);
    assert.equal(r.releases.reduce((a, x) => a + x.qty, 0), 220);

});

test("unknown SKU → unmatched with what was tried; commitment date wins over the 1st; no header → error", () => {

    const r = parseDemandGrid(GRID, { itemExists: n => n === "VPX4-40K-277V-WMT" });

    assert.equal(r.releases.length, 2);
    assert.equal(r.unmatched.length, 3);
    assert.ok(r.unmatched[0].tried.some(t => t.endsWith("-WMT")));

    const grid = "EID\tDescription\tSKU #\tQTY\tCOMMIT\tDATE\n\t\t\t11-01-26\t\t\n1\tx\tABC-WMT\t10\t10\t11-20-26";
    const c = parseDemandGrid(grid, { itemExists: () => true });

    assert.equal(c.releases[0].due, "2026-11-20");
    assert.equal(c.releases[0].sku, "ABC-WMT", "SKU column wins over the description");

    assert.match(parseDemandGrid("hello\tworld").errors[0], /header/);

});

test("parseDate and skuCandidates", () => {

    assert.equal(parseDate("11-01-26"), "2026-11-01");
    assert.equal(parseDate("1/1/2027"), "2027-01-01");
    assert.equal(parseDate("Dec-26"), "2026-12-01");
    assert.equal(parseDate("nope"), null);
    assert.deepEqual(skuCandidates("", "G&G VPX4-40K-277V-WMTVT 4ft"), ["VPX4-40K-277V-WMTVT", "VPX4-40K-277V-WMT"]);
    assert.deepEqual(skuCandidates("VPX8-40K", ""), ["VPX8-40K", "VPX8-40K-WMT"]);

});
