//------------------------------------------------------
// SKU History (Director, Nov 13 2026). Pure.
//
// Same layout and math as the Director's "G&G Walmart (WMT) SKU
// Invoice History" sheet: invoiced units (G&G invoices at shipment)
// per month, the current month partial.
//   Total        units in the months shown
//   Avg / month  total ÷ months that had units (as in the sheet)
//   6-mo avg     last 6 COMPLETE months ÷ 6 (zeros count)
//   EAU          estimated annual usage = 6-mo avg × 12
//   Last 12 mo   units in the last 12 complete months
// Item view: units invoiced as the item itself (by customer) plus
// units used in shipped assemblies (by assembly): assembly units ×
// how many of the item one assembly holds through today's BOMs (all
// levels, parallel paths added, loops cut). Invoices stand in for
// builds (no build records in this QuickBooks feed); BOMs are today's.
//------------------------------------------------------

const MAX_STEPS = 20000;

const r1 = n => Math.round(n * 10) / 10;

// The `count` months ending with the month of `today` (YYYY-MM-DD).
function monthList(today, count) {

    const [y, m] = today.split("-").map(Number);
    const out = [];

    for (let i = count - 1; i >= 0; i--) {

        const k = y * 12 + (m - 1) - i;

        out.push(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`);

    }

    return out;

}

// Stats of one row from a month → qty map.
function rowStats(byMonth, months, today) {

    const current = today.slice(0, 7);
    const complete = monthList(today, 13).filter(m => m !== current);  // last 12 complete
    const shown = months.map(m => byMonth.get(m) || 0);
    const total = shown.reduce((a, b) => a + b, 0);
    const active = shown.filter(q => q).length;
    const last6 = complete.slice(-6).reduce((a, m) => a + (byMonth.get(m) || 0), 0);
    const last12 = complete.reduce((a, m) => a + (byMonth.get(m) || 0), 0);
    const avg6 = last6 / 6;

    return { months: shown, total: r1(total), avgActive: active ? r1(total / active) : 0, avg6: r1(avg6), eau: Math.round(avg6 * 12), last12: r1(last12) };

}

function sumMaps(maps) {

    const out = new Map();

    for (const m of maps)
        for (const [k, v] of m)
            out.set(k, (out.get(k) || 0) + v);

    return out;

}

// Customer view: one row per item invoiced to the customer.
function customerView({ rows, months, today, describe = () => null }) {

    const byItem = new Map();

    for (const r of rows) {

        if (!byItem.has(r.item))
            byItem.set(r.item, new Map());

        const m = byItem.get(r.item);

        m.set(r.month, (m.get(r.month) || 0) + r.qty);

    }

    const items = [...byItem].map(([item, m]) => ({ item, description: describe(item), ...rowStats(m, months, today) }))
        .filter(r => r.total || r.last12)
        .sort((a, b) => b.total - a.total || a.item.localeCompare(b.item));

    return { months, items, totals: rowStats(sumMaps([...byItem.values()]), months, today) };

}

// How many of `item` one unit of each ancestor assembly holds, through
// every BOM path (multiplied along a path, paths added, loops cut).
function ancestorsOf(item, parentsOf) {

    const per = new Map();
    let steps = 0;
    let truncated = false;

    (function walk(node, factor, path) {

        for (const p of parentsOf(node) || []) {

            if (++steps > MAX_STEPS) { truncated = true; return; }

            if (path.includes(p.assembly) || !(Number(p.qty) > 0))
                continue;

            const f = factor * Number(p.qty);

            per.set(p.assembly, (per.get(p.assembly) || 0) + f);
            walk(p.assembly, f, [...path, p.assembly]);

        }

    })(item, 1, [item]);

    return { per, truncated };

}

// Item view: direct invoices by customer + usage in shipped assemblies.
function itemView({ item, rowsOfItem, parentsOf, months, today, describe = () => null }) {

    const direct = rowsOfItem(item);
    const byCustomer = new Map();

    for (const r of direct) {

        if (!byCustomer.has(r.customer))
            byCustomer.set(r.customer, new Map());

        const m = byCustomer.get(r.customer);

        m.set(r.month, (m.get(r.month) || 0) + r.qty);

    }

    const customers = [...byCustomer].map(([customer, m]) => ({ customer, ...rowStats(m, months, today) }))
        .filter(r => r.total || r.last12)
        .sort((a, b) => b.total - a.total || a.customer.localeCompare(b.customer));

    const { per, truncated } = ancestorsOf(item, parentsOf);
    const viaMaps = [];
    const assemblies = [];

    for (const [assembly, qtyPer] of per) {

        const shipped = new Map();

        for (const r of rowsOfItem(assembly))
            shipped.set(r.month, (shipped.get(r.month) || 0) + r.qty);

        if (!shipped.size)
            continue;

        const used = new Map([...shipped].map(([m, q]) => [m, q * qtyPer]));
        const stats = rowStats(used, months, today);

        if (!stats.total && !stats.last12)
            continue;

        viaMaps.push(used);
        assemblies.push({ assembly, description: describe(assembly), qtyPer: Math.round(qtyPer * 1e4) / 1e4, shipped: rowStats(shipped, months, today).total, ...stats });

    }

    assemblies.sort((a, b) => b.total - a.total || a.assembly.localeCompare(b.assembly));

    const directMap = sumMaps([...byCustomer.values()]);
    const viaMap = sumMaps(viaMaps);

    return {
        item,
        description: describe(item),
        months,
        customers,
        assemblies,
        truncated,
        direct: rowStats(directMap, months, today),
        viaAssemblies: rowStats(viaMap, months, today),
        total: rowStats(sumMaps([directMap, viaMap]), months, today)
    };

}

// Product groups (Director, Nov 13 2026): one page per group, every
// customer. SpaceX lights = GIGA / TERA / DECA fixture SKUs (prefix then
// a digit, as on the hour-by-hour board, so GIGA-CNTL-… panels are out);
// Walmart = any part number containing WMT (as on the Backlog page).
const GROUPS = {
    spacex: { label: "SpaceX lights (GIGA, TERA, DECA)", match: item => /^(GIGA|TERA|DECA)\d/i.test(item) && !/CNTL/i.test(item) },
    walmart: { label: "Walmart (WMT)", match: item => /WMT/i.test(item) }
};

// Group view: items in the group across all customers, plus the same
// units by customer.
function groupView({ group, rows, months, today, describe = () => null }) {

    const g = GROUPS[group];

    if (!g)
        return null;

    const mine = rows.filter(r => g.match(r.item));
    const byItem = customerView({ rows: mine, months, today, describe });
    const byCustomer = customerView({ rows: mine.map(r => ({ item: r.customer, month: r.month, qty: r.qty })), months, today });

    return {
        group, label: g.label, months,
        items: byItem.items, totals: byItem.totals,
        customers: byCustomer.items.map(({ item, description, ...rest }) => ({ customer: item, ...rest }))
    };

}

module.exports = { monthList, rowStats, customerView, itemView, ancestorsOf, groupView, GROUPS };
