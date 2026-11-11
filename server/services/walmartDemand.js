//------------------------------------------------------
// Walmart demand grid (Director, Nov 11 2026). Pure.
//
// Krystal's "G&G INVENTORY DEMAND MM.DD.YYYY.xlsx" (Walmart's demand
// planner via Loeb) is pasted as a grid (copy from Excel, tab
// separated). Layout as of the 11.09.2026 file:
//   row "EID | Description | SKU # | MATERIAL QUANTITIES & ...
//        | LOEB NOTES | CURRENT NOTES"
//   a row of month dates (first = "IMMEDIATE NEED", then "DUE TO
//   LOEB"); each month bucket = qty column + CURRENT COMMITMENT qty
//   + commitment date; the last bucket may have no date (= next month)
//   then one row per Loeb EID.
// Rules:
//   - SKU from the SKU # column, else from the description after
//     "G&G "; the file's -WMTVT names are the QuickBooks -WMT items.
//   - Months must increase; one that goes backwards gets a year added
//     (the 11.09 file says 1/1/2026 for January 2027: Director).
//   - Due date = the commitment date when given, else the 1st of the
//     month (Director, Nov 11 2026: "Immediate need" is due now).
//------------------------------------------------------

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

const pad = n => String(n).padStart(2, "0");
const year4 = y => (String(y).length === 2 ? 2000 + Number(y) : Number(y));

// Accepts 11-01-26, 11/1/2026, 2026-11-01, Nov-26, November 2026, 11/2026.
function parseDate(v) {

    const s = String(v ?? "").trim();
    let m;

    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))
        return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

    if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)))
        return `${year4(m[3])}-${pad(m[1])}-${pad(m[2])}`;

    if ((m = s.match(/^(\d{1,2})[/-](\d{4})$/)))
        return `${m[2]}-${pad(m[1])}-01`;

    if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2}|\d{4})$/)) && MONTHS[m[1].toUpperCase()])
        return `${year4(m[2])}-${pad(MONTHS[m[1].toUpperCase()])}-01`;

    return null;

}

const monthOf = d => `${d.slice(0, 7)}-01`;

function addMonths(month, n) {

    const [y, mo] = month.split("-").map(Number);
    const t = y * 12 + (mo - 1) + n;

    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}-01`;

}

const num = v => {

    const s = String(v ?? "").replace(/,/g, "").trim();

    return s === "" || Number.isNaN(Number(s)) ? null : Number(s);

};

// QuickBooks item for a demand row: SKU column, else the description.
function skuCandidates(skuCell, description) {

    const raw = String(skuCell || "").trim() || (String(description || "").match(/G&G\s+(?:INDUSTRIAL\s+)?([A-Z0-9][A-Z0-9-]*[A-Z0-9])/i) || [])[1] || "";
    const up = raw.toUpperCase();

    if (!up)
        return [];

    const out = [up];

    if (/WMTVT$/.test(up))
        out.push(up.replace(/WMTVT$/, "WMT"));
    else if (!/WMT$/.test(up))
        out.push(`${up}-WMT`);

    return [...new Set(out)];

}

function parseDemandGrid(text, { itemExists = () => true } = {}) {

    const rows = String(text || "").split(/\r?\n/).map(l => l.split("\t"));
    const errors = [];

    const headerAt = rows.findIndex(r => /^\s*EID\s*$/i.test(r[0] || ""));

    if (headerAt < 0)
        return { releases: [], unmatched: [], months: [], errors: ["Can't find the header row (first cell \"EID\"). Copy from the EID header down to the last SKU row."] };

    const header = rows[headerAt].map(c => c.trim().toUpperCase());
    const skuCol = header.findIndex(c => c.startsWith("SKU"));
    const notesCols = header.map((c, i) => (/NOTES/.test(c) ? i : -1)).filter(i => i >= 0);

    // Month row: the first row after the header with a date in it.
    let monthRowAt = -1;

    for (let i = headerAt + 1; i < Math.min(rows.length, headerAt + 5); i++)
        if (rows[i].some(c => parseDate(c))) { monthRowAt = i; break; }

    if (monthRowAt < 0)
        return { releases: [], unmatched: [], months: [], errors: ["Can't find the row of month dates under the header."] };

    const mr = rows[monthRowAt];
    const firstDateCol = mr.findIndex(c => parseDate(c));

    // Buckets every 3 columns from the first date: qty, commit qty, commit date.
    const buckets = [];
    let prev = null;

    for (let c = firstDateCol; c < mr.length; c += 3) {

        const isQtyCol = parseDate(mr[c]) || /QUANTITY/i.test(mr[c + 1] || "");

        if (!isQtyCol)
            break;

        let month = parseDate(mr[c]) ? monthOf(parseDate(mr[c])) : prev ? addMonths(prev, 1) : null;

        if (!month)
            break;

        while (prev && month <= prev)
            month = `${Number(month.slice(0, 4)) + 1}${month.slice(4)}`;

        buckets.push({ col: c, month, label: buckets.length === 0 ? "Immediate need" : null });
        prev = month;

    }

    if (!buckets.length)
        errors.push("No month columns found.");

    const releases = [];
    const unmatched = [];

    for (let i = monthRowAt + 1; i < rows.length; i++) {

        const r = rows[i];
        const eid = String(r[0] || "").trim();
        const description = String(r[1] || "").trim();

        if (!eid && !description)
            continue;

        const qtys = buckets.map(b => ({ b, qty: num(r[b.col]) || 0, commitQty: num(r[b.col + 1]), commitDate: parseDate(r[b.col + 2]) }));

        if (!qtys.some(q => q.qty > 0))
            continue;

        const cands = skuCandidates(skuCol >= 0 ? r[skuCol] : "", description);
        const sku = cands.find(itemExists) || null;
        const notes = notesCols.map(c => String(r[c] || "").trim()).filter(Boolean).join(" · ") || null;

        if (!sku) {

            unmatched.push({ eid, description, tried: cands, qty: qtys.reduce((a, q) => a + q.qty, 0) });
            continue;

        }

        for (const q of qtys)
            if (q.qty > 0)
                releases.push({
                    eid, description, sku,
                    month: q.b.month,
                    immediate: q.b.label === "Immediate need",
                    qty: q.qty,
                    commitQty: q.commitQty,
                    commitDate: q.commitDate,
                    due: q.commitDate || q.b.month,
                    notes
                });

    }

    return { releases, unmatched, months: buckets.map(b => b.month), errors };

}

module.exports = { parseDemandGrid, parseDate, skuCandidates };
