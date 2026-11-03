//------------------------------------------------------
// H4 report (Nov 3 2026): one day or a range.
//
// Each board-day comes from the same boardDay() the /board
// page uses, so the numbers match it: plan (past days: the
// day's plan; today: plan so far), actual (taps + corrections
// + rework passes), FPY, rework, scrap. Then:
//   - top failure codes (count station) with % of fails
//   - PCB Test (PASS / FAIL) by board and SKU, PCB FPY
//   - demonstrated units/hour per family: good units at the
//     count station ÷ the work minutes of the hours that
//     family had taps in (approximate when an hour mixes
//     families; meant to replace guessed rates).
//------------------------------------------------------

const { PERIODS } = require("./hourlyPlan");
const { familyFor } = require("./hourlyBoard");
const { fpyOf, ragFor } = require("./hourlyActual");

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

function blank() {

    return { plan: 0, actual: 0, firstPassGood: 0, fails: 0, rework: 0, scrap: 0, pcbPass: 0, pcbFail: 0 };

}

function add(into, d) {

    for (const k of Object.keys(into))
        into[k] += d[k] || 0;

}

function finish(t, settings) {

    return {
        ...t,
        attainment: pct(t.actual, t.plan),
        rag: ragFor(t.actual, t.plan, settings),
        fpy: fpyOf(t.firstPassGood, t.fails),
        pcbFpy: fpyOf(t.pcbPass, t.pcbFail)
    };

}

function buildReport(statements, from, to, boardDay, settings) {

    const taps = statements.reportTaps.all(from, to);
    const fails = statements.reportFailures.all(from, to);
    const disps = statements.reportDispositions.all(from, to);
    const plans = statements.reportPlans.all(from, to);
    const codes = Object.fromEntries(statements.getFailureCodes.all().map(c => [c.code, c.label]));
    const families = statements.getProductFamilies.all();

    // Every board-day with a plan or any activity.
    const keys = new Set([
        ...plans.map(p => `${p.board}|${p.plan_date}`),
        ...taps.map(t => `${t.board}|${t.plan_date}`),
        ...fails.map(f => `${f.board}|${f.plan_date}`),
        ...disps.map(d => `${d.board}|${d.plan_date}`)
    ]);

    const byBoard = {};
    const byDay = {};
    const total = blank();

    for (const key of [...keys].sort()) {

        const [board, date] = key.split("|");
        const d = boardDay(board, date);
        const row = {
            plan: d.planToNow,
            actual: d.actualTotal,
            firstPassGood: d.quality.firstPassGood,
            fails: d.quality.fails,
            rework: d.quality.rework,
            scrap: d.quality.scrap,
            pcbPass: d.pcb.pass,
            pcbFail: d.pcb.fail
        };

        add(byBoard[board] ||= blank(), row);
        add(byDay[date] ||= blank(), row);
        add(total, row);

    }

    const open = Object.fromEntries(statements.openFailureCounts.all().filter(r => r.station === "FINAL").map(r => [r.board, r.n]));

    // Top failure codes at the count station.
    const finalFails = fails.filter(f => f.station === "FINAL");
    const failCount = finalFails.reduce((a, f) => a + f.n, 0);
    const codeMap = {};

    for (const f of finalFails) {

        const c = (codeMap[f.code] ||= { code: f.code, label: codes[f.code] || f.code, n: 0, boards: {} });

        c.n += f.n;
        c.boards[f.board] = (c.boards[f.board] || 0) + f.n;

    }

    const topCodes = Object.values(codeMap).sort((a, b) => b.n - a.n).map(c => ({ ...c, pct: pct(c.n, failCount) }));

    // PCB Test.
    const pcbBySku = {};
    const pcbCodes = {};

    for (const t of taps.filter(x => x.station === "PCB"))
        ((pcbBySku[`${t.board}|${t.sku}`] ||= { board: t.board, sku: t.sku, pass: 0, fail: 0 }).pass += t.n);

    for (const f of fails.filter(x => x.station === "PCB")) {

        (pcbBySku[`${f.board}|${f.sku}`] ||= { board: f.board, sku: f.sku, pass: 0, fail: 0 }).fail += f.n;
        (pcbCodes[f.code] ||= { code: f.code, label: codes[f.code] || f.code, n: 0 }).n += f.n;

    }

    const pcbFailTotal = Object.values(pcbCodes).reduce((a, c) => a + c.n, 0);

    // Demonstrated rate per family (count station taps).
    const rate = {};

    for (const t of taps.filter(x => x.station === "FINAL")) {

        const fam = familyFor(t.sku, families);

        if (!fam)
            continue;

        const r = (rate[fam.id] ||= { board: fam.board, family: fam.prefix, units: 0, hours: new Set() });

        r.units += t.n;
        r.hours.add(`${t.plan_date}|${t.period}`);

    }

    const rates = Object.values(rate).map(r => {

        const minutes = [...r.hours].reduce((a, h) => a + PERIODS[Number(h.split("|")[1])].workMinutes, 0);

        return { board: r.board, family: r.family, units: r.units, workMinutes: minutes, perHour: minutes > 0 ? Math.round((r.units / minutes) * 600) / 10 : null };

    }).sort((a, b) => a.board.localeCompare(b.board) || a.family.localeCompare(b.family));

    return {
        from,
        to,
        settings,
        total: finish(total, settings),
        boards: Object.entries(byBoard).map(([board, t]) => ({ board, ...finish(t, settings), open: open[board] || 0 })),
        days: Object.entries(byDay).sort().map(([date, t]) => ({ date, ...finish(t, settings) })),
        topCodes,
        pcb: {
            pass: total.pcbPass,
            fail: total.pcbFail,
            fpy: fpyOf(total.pcbPass, total.pcbFail),
            bySku: Object.values(pcbBySku).map(x => ({ ...x, fpy: fpyOf(x.pass, x.fail) })).sort((a, b) => b.fail - a.fail),
            topCodes: Object.values(pcbCodes).sort((a, b) => b.n - a.n).map(c => ({ ...c, pct: pct(c.n, pcbFailTotal) }))
        },
        rates
    };

}

module.exports = { buildReport };
