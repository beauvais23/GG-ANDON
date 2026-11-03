//------------------------------------------------------
// Hour-by-hour board, H2: actuals and RAG
//
// Actual = good units through the count station (Final
// Test; PCB Coating: Production), one tap per unit. A tap
// counts in the hour period of its New York clock time
// (before 6:00 → first period, after 4:30 → last).
//
// RAG per period (thresholds in hourly_settings, admin):
//   finished hours: actual vs the hour's plan
//   the current hour: actual vs the plan pro-rated by the
//     work minutes gone so far (so 5 min into an hour isn't red)
//   later hours and hours with no plan: no colour.
//
// H3 (0011): a reworked unit that passes adds 1 to Actual in
// the hour it passed (Director, option A). FPY per hour and
// for the day = first-pass good / (first-pass good + first-
// pass fails); first-pass good = taps + corrections, so
// reworked passes are not in it.
//------------------------------------------------------

const { PERIODS } = require("./hourlyPlan");
const { WORK_WINDOWS } = require("./workingTime");
const { dateNY, minuteOfDayNY } = require("./nyTime");

// Where each board's units are counted.
const DEFAULT_COUNT_STATION = "Final Test";
const COUNT_STATIONS = { "PCB Coating": "Production" };

const countStationFor = board => COUNT_STATIONS[board] || DEFAULT_COUNT_STATION;

// PCB Test work center (0012): PASS / FAIL per PCB for PCB FPY.
const PCB_STATION = "PCB Test";

function periodAt(ms) {

    const m = minuteOfDayNY(ms);

    if (m < PERIODS[0].start)
        return 0;

    const i = PERIODS.findIndex(p => m >= p.start && m < p.end);

    return i === -1 ? PERIODS.length - 1 : i;

}

function workMinutesBetween(from, to) {

    return WORK_WINDOWS.reduce((sum, [w0, w1]) => sum + Math.max(0, Math.min(to, w1) - Math.max(from, w0)), 0);

}

function ragFor(actual, plan, settings) {

    if (!(plan > 0))
        return null;

    const pct = (actual / plan) * 100;

    if (pct >= settings.green_pct - 1e-9)
        return "green";

    if (pct >= settings.amber_pct - 1e-9)
        return "amber";

    return "red";

}

// Adds actual, status ("done" | "now" | "later"), planToNow and
// rag to each period of a plan (from planFor).
const fpyOf = (good, fails) => (good + fails > 0 ? Math.round((good / (good + fails)) * 1000) / 10 : null);

// quality: { fails: [{ period, code, n }], dispositions: [{ period, disposition, sku, n }], open: n }
function withActuals(plan, rows, settings, now = Date.now(), quality = { fails: [], dispositions: [], open: 0 }) {

    const today = dateNY(now);
    const minute = minuteOfDayNY(now);

    let actualTotal = 0;
    let planToNow = 0;
    let goodTotal = 0;
    let failTotal = 0;
    let reworkTotal = 0;
    let scrapTotal = 0;

    const periods = plan.periods.map((p, i) => {

        const actual = {};
        let total = 0;
        let corrected = 0;

        for (const r of rows)
            if (r.period === i) {

                if (r.n)
                    actual[r.sku] = r.n;

                total += r.n;
                corrected += r.adjusted || 0;

            }

        const firstPassGood = total;
        const fails = quality.fails.filter(f => f.period === i).reduce((a, f) => a + f.n, 0);
        const failCodes = Object.fromEntries(quality.fails.filter(f => f.period === i).map(f => [f.code, f.n]));
        let rework = 0;
        let scrap = 0;

        for (const d of quality.dispositions)
            if (d.period === i) {

                if (d.disposition === "REWORK_PASS") {

                    actual[d.sku] = (actual[d.sku] || 0) + d.n;
                    rework += d.n;

                } else {

                    scrap += d.n;

                }

            }

        total += rework;

        let status = "later";

        if (plan.date < today || (plan.date === today && minute >= p.end))
            status = "done";
        else if (plan.date === today && minute >= p.start)
            status = "now";

        let due = 0;

        if (status === "done")
            due = p.total;
        else if (status === "now")
            due = p.workMinutes > 0 ? (p.total * workMinutesBetween(p.start, minute)) / p.workMinutes : 0;

        actualTotal += total;
        planToNow += due;

        const rag = status === "later" ? null : ragFor(total, due, settings);

        goodTotal += firstPassGood;
        failTotal += fails;
        reworkTotal += rework;
        scrapTotal += scrap;

        return { ...p, actual, actualTotal: total, corrected, firstPassGood, fails, failCodes, rework, scrap, fpy: fpyOf(firstPassGood, fails), status, due: Math.round(due * 10) / 10, rag };

    });

    return {
        ...plan,
        periods,
        actualTotal,
        planToNow: Math.floor(planToNow + 1e-9),
        rag: ragFor(actualTotal, planToNow, settings),
        quality: { firstPassGood: goodTotal, fails: failTotal, rework: reworkTotal, scrap: scrapTotal, open: quality.open, fpy: fpyOf(goodTotal, failTotal) },
        settings,
        countStation: countStationFor(plan.board)
    };

}

module.exports = { countStationFor, fpyOf, periodAt, ragFor, withActuals, workMinutesBetween, PCB_STATION };
