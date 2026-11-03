//------------------------------------------------------
// Hour-by-hour board, H1: which family (and board) a SKU
// belongs to, which rate applies on a date, and saving a
// board's plan with the rates snapshotted.
//------------------------------------------------------

const { planDay } = require("./hourlyPlan");

// Board order on screen.
const BOARDS = ["Team A", "Team B", "Gigabay", "Gigabay - Vertical", "Terabay", "Deca", "Coating"];

const squash = s => String(s || "").toUpperCase().replace(/-/g, "");

// Family of a SKU: the active family whose prefix the SKU starts
// with, hyphens ignored (FBL-4-HL-CW → FBL4), longest prefix
// first (GIGA8-VERT before GIGA). Control items are never on a
// board (Ship Report: Control Box).
function familyFor(sku, families) {

    const s = squash(sku);

    if (!s || s.includes("CNTL"))
        return null;

    let best = null;

    for (const f of families) {

        if (!f.active)
            continue;

        const p = squash(f.prefix);

        if (s.startsWith(p) && (!best || p.length > squash(best.prefix).length))
            best = f;

    }

    return best;

}

// Rate on a date (YYYY-MM-DD): the SKU's own newest rate effective
// on or before the date, else its family's.
function rateFor(statements, sku, family, date) {

    const own = statements.getSkuRateOn.get(String(sku).toUpperCase(), date);

    if (own)
        return { id: own.id, unitsPerHour: own.units_per_hour, source: "sku", effectiveDate: own.effective_date };

    const fam = family ? statements.getFamilyRateOn.get(family.id, date) : null;

    if (fam)
        return { id: fam.id, unitsPerHour: fam.units_per_hour, source: "family", effectiveDate: fam.effective_date };

    return null;

}

// Validate and price a list of runs for a board and date.
// Returns { runs } or { error }.
function priceRuns(statements, board, date, runs) {

    const families = statements.getProductFamilies.all();
    const priced = [];

    for (const [i, run] of runs.entries()) {

        const sku = String(run?.sku || "").trim().toUpperCase();
        const qty = run?.qty === null || run?.qty === undefined || run?.qty === "" ? null : Number(run.qty);

        if (!sku)
            return { error: `Run ${i + 1}: SKU is required.` };

        if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > 100000))
            return { error: `Run ${i + 1} (${sku}): qty must be a whole number from 1 to 100000, or empty for the rest of the shift.` };

        if (qty === null && i !== runs.length - 1)
            return { error: `Run ${i + 1} (${sku}): only the last run can run to the end of the shift (empty qty).` };

        const family = familyFor(sku, families);

        if (!family)
            return { error: `Run ${i + 1}: ${sku} doesn't match any product family, so it isn't on a board.` };

        if (family.board !== board)
            return { error: `Run ${i + 1}: ${sku} is a ${family.prefix} SKU, which is on the ${family.board} board, not ${board}.` };

        const rate = rateFor(statements, sku, family, date);

        if (!rate)
            return { error: `Run ${i + 1}: no rate for ${sku} (family ${family.prefix}) on ${date}. Set one in Admin → Products & rates.` };

        priced.push({ sku, qty, family, rate: rate.unitsPerHour, rateSource: rate.source });

    }

    return { runs: priced };

}

function planFor(statements, board, date) {

    const plan = statements.getPlan.get(board, date);
    const runs = plan ? statements.getPlanRuns.all(plan.id) : [];
    const result = planDay(runs.map(r => ({ sku: r.sku, rate: r.rate, qty: r.qty })));

    return {
        board,
        date,
        saved: Boolean(plan),
        updatedAt: plan?.updated_at || null,
        runs: runs.map((r, i) => ({ ...r, ...result.runs[i] })),
        periods: result.periods,
        total: result.total
    };

}

module.exports = { BOARDS, familyFor, rateFor, priceRuns, planFor };
