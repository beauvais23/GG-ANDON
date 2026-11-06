//------------------------------------------------------
// Material check (MRP bridge, Nov 6 2026)
//
// Open sales-order lines × BOM explosion → what each part is
// needed for, against on hand + open POs.
//
// 1. Demand: open SO lines (qty ordered − shipped > 0; no blank
//    item, no S&H), ExpectedShipDate on or before the window end
//    (past due always in; no date = in, flagged). Orders whose
//    OpportunityId is HOLD are left out unless includeHolds.
// 2. Netting by low-level code (standard MRP): every item is
//    netted once, after all its parents. An assembly's on hand
//    covers demand first; only the rest (to build) explodes into
//    its components (qty per × to build). Negative on hand = 0.
// 3. Purchased parts: short = need − on hand − on order
//    (QuickBooks QuantityOnOrder; open PO lines give dates and are
//    flagged when they don't add up to it).
//    "Needs POs" = need − on hand. Next PO = earliest open PO
//    line with qty left; "PO late" when that date is after the
//    earliest ship date of the orders that use the part.
// 4. Orders using a part: the SO lines whose (netted) explosion
//    reaches it. Approximate pegging: the part is listed under
//    every order that drives demand through it.
// Loops (A → B → A) are reported and not expanded; an assembly
// whose BOM could not be loaded is treated as a part, reported.
//------------------------------------------------------

const MAX_DEPTH = 12;
const HOLD = /<Name>\s*OpportunityId\s*<\/Name>\s*<Value>\s*HOLD\s*<\/Value>/i;

const r4 = n => Math.round(n * 1e4) / 1e4;
const isHold = customFields => HOLD.test(customFields || "");

function demandLines(soLines, { horizonEnd, includeHolds = false }) {

    const out = [];
    let held = 0;
    let later = 0;

    for (const l of soLines) {

        const item = String(l.item || "").trim();

        if (!item || /^S&H/i.test(item))
            continue;

        const qty = r4((Number(l.ordered) || 0) - (Number(l.shipped) || 0));

        if (qty <= 0)
            continue;

        if (l.ship_date && horizonEnd && l.ship_date > horizonEnd) {

            later++;
            continue;

        }

        // Held lines in the window are counted whether or not included.
        if (l.hold) {

            held++;

            if (!includeHolds)
                continue;

        }

        out.push({ so: l.so, item, qty, date: l.ship_date || null, customer: l.customer || null, hold: Boolean(l.hold) });

    }

    return { lines: out, held, later };

}

// items: Map name → { type, description, uom, on_hand, on_order }
// linesOf(assembly) → [{ component, qty }] | null (not loaded)
// poLines: [{ po, vendor, item, ordered, received, expected_date }]
function computeMrp({ soLines, items, linesOf, poLines = [], today, horizonEnd, includeHolds = false }) {

    const { lines: demand, held, later } = demandLines(soLines, { horizonEnd, includeHolds });
    const warnings = [];
    const isAssembly = name => (items.get(name) || {}).type === "InventoryAssembly";

    // Low-level codes (deepest level each item appears at).
    const llc = new Map();
    const loops = new Set();
    const noBom = new Set();

    function walk(item, depth, path) {

        if ((llc.get(item) ?? -1) >= depth)
            return;

        llc.set(item, depth);

        if (!isAssembly(item))
            return;

        const children = linesOf(item);

        if (!children) {

            noBom.add(item);
            return;

        }

        for (const c of children) {

            if (path.has(c.component) || depth + 1 > MAX_DEPTH) {

                loops.add(`${item} → ${c.component}`);
                continue;

            }

            walk(c.component, depth + 1, new Set([...path, c.component]));

        }

    }

    for (const d of demand)
        walk(d.item, 0, new Set([d.item]));

    // Gross demand and the orders behind it.
    const gross = new Map();
    const drivers = new Map();

    const addDriver = (item, d) => {

        const m = drivers.get(item) || new Map();

        m.set(`${d.so}|${d.item}|${d.date}`, d);
        drivers.set(item, m);

    };

    for (const d of demand) {

        gross.set(d.item, r4((gross.get(d.item) || 0) + d.qty));
        addDriver(d.item, d);

    }

    const order = [...llc.keys()].sort((a, b) => llc.get(a) - llc.get(b) || a.localeCompare(b));
    const parts = [];
    const builds = [];

    const openPos = new Map();

    for (const p of poLines) {

        const left = r4((Number(p.ordered) || 0) - (Number(p.received) || 0));

        if (!p.item || left <= 0)
            continue;

        const list = openPos.get(p.item) || [];

        list.push({ po: p.po, vendor: p.vendor || null, qty: left, date: p.expected_date || null });
        openPos.set(p.item, list);

    }

    for (const list of openPos.values())
        list.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));

    for (const name of order) {

        const need = gross.get(name) || 0;

        if (need <= 0)
            continue;

        const item = items.get(name) || null;
        const onHand = item ? Number(item.on_hand) || 0 : 0;
        const orders = [...(drivers.get(name) || new Map()).values()].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
        const neededBy = (orders.find(o => o.date) || {}).date || null;
        const children = isAssembly(name) && !noBom.has(name) ? linesOf(name) : null;

        if (children && children.length) {

            const toBuild = r4(Math.max(0, need - Math.max(0, onHand)));

            builds.push({ item: name, description: item?.description || null, need, onHand, toBuild, neededBy, orders });

            if (toBuild > 0) {

                for (const c of children) {

                    if (loops.has(`${name} → ${c.component}`))
                        continue;

                    gross.set(c.component, r4((gross.get(c.component) || 0) + toBuild * (Number(c.qty) || 0)));

                    for (const o of orders)
                        addDriver(c.component, o);

                }

            }

            continue;

        }

        // On PO = QuickBooks QuantityOnOrder (authoritative). The open PO
        // line view can include lines closed in QuickBooks without being
        // received, so its sum is only used when on order is unknown;
        // a difference is flagged (poMismatch) for Procurement.
        const pos = openPos.get(name) || [];
        const lineSum = r4(pos.reduce((s, p) => s + p.qty, 0));
        const known = item && item.on_order !== null && item.on_order !== undefined;
        const poQty = known ? r4(Math.max(0, Number(item.on_order) || 0)) : lineSum;
        const available = Math.max(0, onHand) + poQty;
        const nextPo = pos[0] || null;
        const needsPos = r4(Math.max(0, need - Math.max(0, onHand)));

        parts.push({
            item: name,
            description: item?.description || null,
            uom: item?.uom || null,
            type: item?.type || "Not in QuickBooks",
            need,
            onHand,
            onPo: poQty,
            poLineSum: lineSum,
            poMismatch: Boolean(known && Math.abs(lineSum - poQty) > 0.0001),
            short: r4(Math.max(0, need - available)),
            needsPos,
            nextPo,
            pos,
            neededBy,
            poLate: Boolean(needsPos > 0 && nextPo && nextPo.date && neededBy && nextPo.date > neededBy),
            pastDue: Boolean(neededBy && today && neededBy < today),
            unknown: !item,
            orders
        });

    }

    parts.sort((a, b) => b.short - a.short || String(a.neededBy || "9999").localeCompare(String(b.neededBy || "9999")) || a.item.localeCompare(b.item));
    builds.sort((a, b) => b.toBuild - a.toBuild || a.item.localeCompare(b.item));

    for (const l of loops)
        warnings.push(`Loop in BOM, not expanded: ${l}`);

    for (const a of noBom)
        warnings.push(`BOM not loaded for ${a}; counted as a part`);

    const mismatched = parts.filter(p => p.poMismatch).length;

    if (mismatched)
        warnings.push(`${mismatched} part${mismatched === 1 ? "" : "s"}: open PO lines don't add up to QuickBooks on order (lines closed in QuickBooks without receiving?). On PO uses QuickBooks on order; marked * in the table`);

    return {
        demand: { lines: demand.length, orders: new Set(demand.map(d => d.so)).size, held, later, noDate: demand.filter(d => !d.date).length },
        parts,
        builds,
        warnings
    };

}

module.exports = { computeMrp, demandLines, isHold, MAX_DEPTH };
