//------------------------------------------------------
// Bulk rate import (Admin → Products & rates → Import
// rates, Nov 4 2026). Rows pasted from the capacity planner
// sheet: key (a family prefix or a SKU), a value, and an
// optional effective date. The value is a cycle time in
// seconds per unit (units/hr = 3600 ÷ seconds, the planner
// sheet's way) or units per hour.
//
// A key that is a family prefix (hyphens and case ignored:
// "WPX4", "Z-DMX") sets the family rate; anything else must
// be a SKU on the SKU list (0008) and sets a SKU rate. Every row is
// checked first; nothing is saved unless every row is good.
//------------------------------------------------------

const { familyFor } = require("./hourlyBoard");

const squash = s => String(s || "").toUpperCase().replace(/[-\s]/g, "");
const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));

// "11/4/2026" or "2026-11-04" → "2026-11-04"
function toDate(s) {

    const t = String(s || "").trim();

    if (isDate(t))
        return t;

    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

    if (!m)
        return null;

    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

    return isDate(d) ? d : null;

}

// rows: [{ key, value, date }] (already split) or text (tab / comma separated lines).
function parseText(text) {

    return String(text || "").split(/\r?\n/).map((line, i) => ({ line: i + 1, cells: line.split(/\t|,/).map(c => c.trim()) }))
        .filter(r => r.cells.some(c => c));

}

function checkRows(statements, text, { unit = "seconds", defaultDate }) {

    const families = statements.getProductFamilies.all().filter(f => f.active);
    const byPrefix = new Map(families.map(f => [squash(f.prefix), f]));
    const rows = [];

    for (const { line, cells } of parseText(text)) {

        const [key, rawValue, rawDate] = cells;
        const value = Number(String(rawValue || "").replace(/[^\d.]/g, ""));

        // A header row ("Family, Cycle time ...") is skipped, not an error.
        if (rows.length === 0 && line === 1 && !(value > 0) && rawValue && !/\d/.test(rawValue))
            continue;

        const row = { line, key: key || "", value: rawValue || "" };

        if (!key) { rows.push({ ...row, error: "No family or SKU in the first column." }); continue; }

        if (!(value > 0)) { rows.push({ ...row, error: "The second column must be a number above 0." }); continue; }

        const unitsPerHour = unit === "seconds" ? 3600 / value : value;

        if (unitsPerHour > 10000) { rows.push({ ...row, error: "More than 10,000 units/hr: check the unit (seconds vs units/hr)." }); continue; }

        const date = rawDate ? toDate(rawDate) : defaultDate;

        if (!date) { rows.push({ ...row, error: `"${rawDate}" isn't a date (use 2026-11-04 or 11/4/2026).` }); continue; }

        const family = byPrefix.get(squash(key));

        if (family) {

            rows.push({ ...row, target: "family", familyId: family.id, label: family.prefix, board: family.board, unitsPerHour: Math.round(unitsPerHour * 100) / 100, effectiveDate: date });
            continue;

        }

        const sku = key.toUpperCase();
        const skuFamily = familyFor(sku, families);

        if (!skuFamily) { rows.push({ ...row, error: `${sku} is not a family prefix or a SKU on any board.` }); continue; }

        // A SKU rate only for a listed SKU, so a typo can't save a rate nothing uses.
        const listed = statements.getSku.get(sku);

        if (!listed || !listed.active) { rows.push({ ...row, error: `${sku} is not on the SKU list. Check the spelling, or add it with "Add to SKU list" first.` }); continue; }

        rows.push({ ...row, target: "sku", sku, label: sku, family: skuFamily.prefix, board: skuFamily.board, unitsPerHour: Math.round(unitsPerHour * 100) / 100, effectiveDate: date });

    }

    // The same family or SKU twice with the same date: keep the clash visible.
    const seen = new Map();

    for (const r of rows.filter(x => !x.error)) {

        const k = `${r.target}|${r.label}|${r.effectiveDate}`;

        if (seen.has(k))
            r.error = `Duplicate of line ${seen.get(k)} (same ${r.target === "family" ? "family" : "SKU"} and date).`;
        else
            seen.set(k, r.line);

    }

    return { rows, errors: rows.filter(r => r.error).length, ok: rows.filter(r => !r.error).length };

}

module.exports = { checkRows, parseText, toDate };
