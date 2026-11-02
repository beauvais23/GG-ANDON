//------------------------------------------------------
// Hour-by-hour plan math (locked decision): per period
// ROUNDDOWN(rate × work minutes / 60), remainder true-up on
// the final period of each run, no changeover deduction.
//------------------------------------------------------

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { PERIODS, SHIFT_MINUTES, planDay } = require("../services/hourlyPlan");

const totals = r => r.periods.map(p => p.total);

test("the shift's periods match the plant model: 55 60 60 45 60 30 60 60 45 60 20 = 555", () => {

    assert.deepEqual(PERIODS.map(p => p.workMinutes), [55, 60, 60, 45, 60, 30, 60, 60, 45, 60, 20]);
    assert.equal(SHIFT_MINUTES, 555);
    assert.equal(PERIODS[0].label, "6:00–7:00");
    assert.equal(PERIODS[10].label, "4:00–4:30");

});

test("single SKU, full shift, no qty target, 17/hr totals 154 (the Excel check)", () => {

    const r = planDay([{ sku: "A", rate: 17, qty: null }]);

    assert.deepEqual(totals(r), [15, 17, 17, 12, 17, 8, 17, 17, 12, 17, 5]);
    assert.equal(r.total, 154);

});

test("a run with a qty: true-up on its final period, then the next run takes the rest of that period", () => {

    // 20 @ 17/hr = 70.59 work min: 55 in 6-7 (15), 15.59 in 7-8 (true-up 5).
    // B @ 10/hr gets 44.41 min of 7-8 → floor(7.40) = 7, then 60 min → 10 ...
    const r = planDay([{ sku: "A", rate: 17, qty: 20 }, { sku: "B", rate: 10, qty: null }]);

    assert.deepEqual(r.periods[0].plan, { A: 15 });
    assert.deepEqual(r.periods[1].plan, { A: 5, B: 7 });
    assert.equal(r.periods[2].plan.B, 10);
    assert.equal(r.runs[0].planned, 20);
    assert.equal(r.runs[0].carryOver, 0);

});

test("each run sums exactly to its qty, across breaks and lunch", () => {

    const runs = [
        { sku: "A", rate: 13, qty: 37 },
        { sku: "B", rate: 22, qty: 51 },
        { sku: "C", rate: 7, qty: 9 },
        { sku: "D", rate: 17, qty: 40 }
    ];

    const r = planDay(runs);

    for (const run of r.runs)
        assert.equal(run.planned, run.qty, run.sku);

    assert.equal(r.total, 37 + 51 + 9 + 40);

});

test("a run that doesn't fit in the shift plans what fits and reports the carry-over", () => {

    // 200 @ 17/hr needs 705.9 work min; the shift has 555 → plans 154, carries 46.
    const r = planDay([{ sku: "A", rate: 17, qty: 200 }]);

    assert.equal(r.runs[0].planned, 154);
    assert.equal(r.runs[0].carryOver, 46);

});

test("runs after the shift is full plan nothing", () => {

    const r = planDay([{ sku: "A", rate: 17, qty: null }, { sku: "B", rate: 10, qty: 5 }]);

    assert.equal(r.runs[1].planned, 0);
    assert.equal(r.runs[1].carryOver, 5);
    assert.equal(r.runs[1].startPeriod, null);

});

test("a run without a rate is refused", () => {

    assert.throws(() => planDay([{ sku: "A", rate: 0, qty: 5 }]), /no rate/);

});
