//------------------------------------------------------
// Hour-by-hour plan math (locked decision, CLAUDE.md)
//
// A line's day is a sequence of runs (SKU + qty), one lane,
// single piece flow. Each hour period's plan per SKU is
//   ROUNDDOWN(rate × that SKU's work minutes in the period / 60)
// (matches the Excel sheet). The final period of each run
// plans "run qty − already planned" (remainder true-up).
// A run with no qty runs to the end of the shift.
// No changeover deduction ("Changeover" is a variance code).
//
// Work minutes come from the same windows as MTTA/MTTR
// (services/workingTime.js): a full shift is 555 min, and a
// single SKU at 17/hr with no qty target totals 154.
//------------------------------------------------------

const { WORK_WINDOWS } = require("./workingTime");

// Hour periods of the standard shift (minutes after midnight).
const PERIOD_BOUNDS = [
    [360, 420], [420, 480], [480, 540], [540, 600], [600, 660], [660, 720],
    [720, 780], [780, 840], [840, 900], [900, 960], [960, 990]
];

const EPS = 1e-9;

function overlap(a0, a1, b0, b1) {

    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

}

function label(minutes) {

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const h12 = ((h + 11) % 12) + 1;

    return `${h12}:${String(m).padStart(2, "0")}`;

}

const PERIODS = PERIOD_BOUNDS.map(([start, end]) => ({
    start,
    end,
    label: `${label(start)}–${label(end)}`,
    workMinutes: WORK_WINDOWS.reduce((sum, [w0, w1]) => sum + overlap(start, end, w0, w1), 0)
}));

const SHIFT_MINUTES = PERIODS.reduce((s, p) => s + p.workMinutes, 0);

// runs: [{ sku, rate (units/hr, > 0), qty (whole units, or null = to end of shift) }]
// Returns { periods: [{ label, workMinutes, plan: {sku: n}, total }], runs: [{ sku, qty, planned, carryOver, startPeriod, endPeriod }], total }
function planDay(runs, periods = PERIODS) {

    const out = periods.map(p => ({ label: p.label, start: p.start, end: p.end, workMinutes: p.workMinutes, plan: {}, total: 0 }));

    let pi = 0;            // current period
    let usedInPeriod = 0;  // work minutes already taken in it

    const runResults = [];

    for (const run of runs) {

        const rate = Number(run.rate);

        if (!(rate > 0))
            throw new Error(`Run for ${run.sku} has no rate.`);

        const qty = run.qty === null || run.qty === undefined ? null : Math.floor(Number(run.qty));
        let need = qty === null ? Infinity : (qty * 60) / rate;   // work minutes this run needs
        let planned = 0;
        let startPeriod = null;
        let endPeriod = null;

        while (need > EPS && pi < out.length) {

            const free = out[pi].workMinutes - usedInPeriod;

            if (free <= EPS) { pi += 1; usedInPeriod = 0; continue; }

            const take = Math.min(free, need);
            const finishesHere = qty !== null && need - take <= EPS;

            let n = finishesHere ? qty - planned : Math.floor((rate * take) / 60 + EPS);

            if (n < 0) n = 0;

            out[pi].plan[run.sku] = (out[pi].plan[run.sku] || 0) + n;
            out[pi].total += n;
            planned += n;

            if (startPeriod === null) startPeriod = pi;
            endPeriod = pi;

            need -= take;
            usedInPeriod += take;

            if (usedInPeriod >= out[pi].workMinutes - EPS) { pi += 1; usedInPeriod = 0; }

        }

        runResults.push({
            sku: run.sku,
            rate,
            qty,
            planned,
            carryOver: qty === null ? 0 : Math.max(0, qty - planned),
            startPeriod,
            endPeriod
        });

    }

    return { periods: out, runs: runResults, total: out.reduce((s, p) => s + p.total, 0) };

}

module.exports = { PERIODS, SHIFT_MINUTES, planDay };
