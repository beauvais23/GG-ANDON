//------------------------------------------------------
// Backlog & delivery risk (Director, Nov 10 2026). Pure.
//
// Every open sales-order line (ordered − shipped > 0; no blank
// item, no S&H, no Returns & Warranty) grouped by SO, sorted by
// promise date (QuickBooks Expected Ship Date).
//
// Material: stock is allocated to lines in promise-date order
// (same method as the weekly Overdue & At-Risk sheet): finished
// goods on hand first, then the BOM explodes (sub-assemblies on
// hand first, depth 12, loops cut) and components take on-hand
// stock, then open POs in ETA order. POs more than 30 days past
// their ETA are not counted as supply. HOLD, Loeb / Walmart
// blanket and unscheduled orders take no stock.
//
// RAG per SO (Director, Nov 10 2026: amber window 5 days):
//   RED    late (promise date before today), or short with no PO
//          arriving by the promise date
//   AMBER  relies on a PO that is already late, or due within 5
//          days and still waiting on a PO
//   GREEN  covered
//   GREY   HOLD (not SpaceX: Director, Nov 10 2026), BLANKET (Loeb / Walmart)
//          or UNSCHEDULED (no date / 12/31/2027 placeholder)
//
// Walmart releases (Director, Nov 11 2026): the pasted demand
// schedule (walmart_releases) adds one row per release month
// ("WMT 11/26") with its own RAG; its lines are allocated stock like
// any dated order. Price, customer and rep come from the open Loeb
// blanket lines of the same SKU. A release that takes a SKU past the
// open blanket balance gets a reason ("needs a new Loeb PO").
//------------------------------------------------------

const AMBER_DAYS = 5;
const STALE_PO_DAYS = 30;
const PLACEHOLDER = "2027-12-31";
const MAX_DEPTH = 12;

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const r2 = n => Math.round(n * 100) / 100;
const r4 = n => Math.round(n * 1e4) / 1e4;
const md = d => (d && d !== "9999" ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}` : "no date");

const isShipping = item => /^S&H/i.test(item);
const isReturns = customer => /returns\s*&\s*warranty/i.test(customer || "");
// Loeb's only blanket orders are Walmart's (Director, Nov 11 2026): project
// Walmart, or a WMT part number. Other Loeb orders are normal orders.
const isBlanket = l => /loeb/i.test(l.customer || "") && (/walmart/i.test(l.project || "") || /WMT/i.test(l.item || ""));

// SpaceX marks scheduled orders HOLD in QuickBooks; the Director counts
// them as real orders (Nov 10 2026). Other customers' HOLDs stay grey.
const countsDespiteHold = l => /spacex/i.test(l.customer || "");

function recoveryStatus(note, today) {

    if (!note || !note.recovery_date)
        return "NEEDS DATE";

    return note.recovery_date < today ? "MISSED" : "ON PLAN";

}

//------------------------------------------------------
// Sales channel (Director, Nov 11 2026): one per SO, in this order:
//   Walmart   any line's part number contains WMT
//   SpaceX    customer contains SpaceX
//   Car Wash / Industrial   from the rep (QuickBooks SalesRep) via the
//             "Assigned Rep to Sales Channel" key (rep_channels);
//             channelDetail keeps the key's value (e.g. Industrial - Direct)
//   Unassigned   rep missing from the key
//------------------------------------------------------

function channelOf(lines, repChannels) {

    if (lines.some(l => /WMT/i.test(l.item)))
        return { channel: "Walmart", channelDetail: null };

    if (lines.some(l => /spacex/i.test(l.customer || "")))
        return { channel: "SpaceX", channelDetail: null };

    const rep = lines.find(l => l.rep)?.rep || null;
    const raw = rep ? repChannels.get(rep.trim().toUpperCase()) : null;

    if (raw && /^car\s*wash/i.test(raw))
        return { channel: "Car Wash", channelDetail: raw };

    if (raw && /^industrial/i.test(raw))
        return { channel: "Industrial", channelDetail: raw };

    return { channel: "Unassigned", channelDetail: raw || (rep ? `${rep} not in the rep key` : "no rep") };

}

function buildBacklog({ soLines, poLines, items, childrenOf, today, notes = new Map(), lineGroupOf = () => null, repChannels = new Map(), releases = [], amberDays = AMBER_DAYS }) {

    //--------------------------------------------------
    // 1. Open lines
    //--------------------------------------------------

    const lines = [];

    for (const l of soLines) {

        const item = String(l.item || "").trim();
        const open = r4((Number(l.ordered) || 0) - (Number(l.shipped) || 0));

        if (!item || isShipping(item) || isReturns(l.customer) || open <= 0)
            continue;

        const it = items.get(item);
        const date = l.ship_date || null;
        const kind = l.hold && !countsDespiteHold(l) ? "HOLD" : isBlanket(l) ? "BLANKET" : !date || date >= PLACEHOLDER ? "UNSCHEDULED" : "DATED";

        lines.push({
            so: String(l.so), line: l.line, customer: l.customer, project: l.project || null, industry: l.industry || null, rep: l.sales_rep || null,
            item, description: it?.description || null, type: it?.type || null, open, price: Number(l.unit_price) || 0, date, kind,
            fromStock: 0, fromPo: 0, short: 0, poEta: null, latePo: false, shortParts: []
        });

    }

    //--------------------------------------------------
    // 1b. Walmart release rows (one SO per release month)
    //--------------------------------------------------

    const blanketBySku = new Map();

    for (const l of lines.filter(x => x.kind === "BLANKET")) {

        const e = blanketBySku.get(l.item) || { open: 0, price: l.price, customer: l.customer, rep: l.rep, sos: new Set() };

        e.open = r4(e.open + l.open);
        e.sos.add(l.so);
        blanketBySku.set(l.item, e);

    }

    const anyBlanket = [...blanketBySku.values()][0] || null;
    const releaseUse = new Map();
    const overBlanket = new Map();

    for (const r of releases.filter(x => x && x.sku && x.due && x.month).sort((a, b) => a.due.localeCompare(b.due) || a.sku.localeCompare(b.sku))) {

        const qty = Number(r.qty) || 0;

        if (!r.sku || qty <= 0 || !r.due)
            continue;

        const so = `WMT ${Number(r.month.slice(5, 7))}/${r.month.slice(2, 4)}`;
        const b = blanketBySku.get(r.sku);
        const it = items.get(r.sku);
        const used = r4((releaseUse.get(r.sku) || 0) + qty);

        releaseUse.set(r.sku, used);

        if (used > (b?.open || 0)) {

            const list = overBlanket.get(so) || [];

            list.push({ sku: r.sku, over: r4(Math.min(qty, used - (b?.open || 0))) });
            overBlanket.set(so, list);

        }

        lines.push({
            so, line: r.eid ? `EID ${r.eid}` : null, customer: b?.customer || anyBlanket?.customer || "Loeb Electric", project: "Walmart release", industry: null, rep: b?.rep || anyBlanket?.rep || null,
            item: r.sku, description: it?.description || r.description || null, type: it?.type || null, open: qty, price: b?.price || 0, date: r.due, kind: "DATED",
            release: { month: r.month, immediate: Boolean(r.immediate), commitQty: r.commitQty ?? null, commitDate: r.commitDate || null, notes: r.notes || null, blanketSos: b ? [...b.sos] : [] },
            fromStock: 0, fromPo: 0, short: 0, poEta: null, latePo: false, shortParts: []
        });

    }

    //--------------------------------------------------
    // 2. Supply: on hand + usable open POs (ETA order)
    //--------------------------------------------------

    const onHand = new Map();
    const stock = name => {

        if (!onHand.has(name))
            onHand.set(name, Math.max(0, Number(items.get(name)?.on_hand) || 0));

        return onHand.get(name);

    };

    const pos = new Map();

    for (const p of poLines) {

        const rem = (Number(p.ordered) || 0) - (Number(p.received) || 0);

        if (!p.item || rem <= 0)
            continue;

        if (p.expected_date && daysBetween(p.expected_date, today) > STALE_PO_DAYS)
            continue;

        if (!pos.has(p.item))
            pos.set(p.item, []);

        pos.get(p.item).push({ po: p.po, eta: p.expected_date || null, rem, vendor: p.vendor || null });

    }

    for (const list of pos.values())
        list.sort((a, b) => String(a.eta || "9999").localeCompare(String(b.eta || "9999")));

    // Take qty of a purchased part: stock, then POs. Records on the line.
    function takePart(line, part, qty) {

        const fromStock = Math.min(stock(part), qty);

        onHand.set(part, stock(part) - fromStock);
        qty = r4(qty - fromStock);

        let usedEta = null;
        let usedPo = null;
        let late = false;

        for (const p of pos.get(part) || []) {

            if (qty <= 0)
                break;

            if (p.rem <= 0)
                continue;

            const take = Math.min(p.rem, qty);

            p.rem = r4(p.rem - take);
            qty = r4(qty - take);

            if (!usedEta || (p.eta || "9999") > usedEta) {

                usedEta = p.eta || "9999";
                usedPo = p.po;

            }

            if (p.eta && p.eta < today)
                late = true;

            line.usedPos.add(p.po);

        }

        const nextPo = (pos.get(part) || []).find(p => p.eta) || null;
        const viaPo = usedEta !== null;
        const afterPromise = viaPo && line.date && usedEta > line.date;

        if (viaPo) {

            line.needsPo = true;
            line.latePo = line.latePo || late;

            if (!line.poEta || usedEta > line.poEta)
                line.poEta = usedEta;

        }

        if (qty > 0 || afterPromise)
            line.shortParts.push({ part, short: r4(qty), poEta: viaPo ? usedEta : null, po: viaPo ? usedPo : null, nextPo: nextPo ? { po: nextPo.po, eta: nextPo.eta } : null, afterPromise: Boolean(afterPromise) });

        return { fromStock, short: qty };

    }

    // Build qty of an assembly: its own stock first, then children.
    function build(line, name, qty, path) {

        const kids = childrenOf(name) || [];

        if (!kids.length || path.length > MAX_DEPTH)
            return takePart(line, name, qty);

        const fromStock = Math.min(stock(name), qty);

        onHand.set(name, stock(name) - fromStock);

        const toBuild = r4(qty - fromStock);

        if (toBuild > 0)
            for (const k of kids)
                if (!path.includes(k.component))
                    build(line, k.component, r4(toBuild * (Number(k.qty) || 0)), [...path, k.component]);

        return { fromStock, short: 0 };

    }

    const dated = lines.filter(l => l.kind === "DATED").sort((a, b) => a.date.localeCompare(b.date) || a.so.localeCompare(b.so));

    for (const l of dated) {

        l.usedPos = new Set();

        const material = l.type === "Inventory" || l.type === "InventoryAssembly";

        if (!material)
            continue;

        const fg = Math.min(stock(l.item), l.open);

        onHand.set(l.item, stock(l.item) - fg);
        l.fromStock = fg;

        const rest = r4(l.open - fg);

        if (rest > 0) {

            if (l.type === "InventoryAssembly")
                build(l, l.item, rest, [l.item]);
            else
                takePart(l, l.item, rest);

        }

    }

    //--------------------------------------------------
    // 3. Per SO: RAG, reason, $
    //--------------------------------------------------

    const bySo = new Map();

    for (const l of lines) {

        if (!bySo.has(l.so))
            bySo.set(l.so, []);

        bySo.get(l.so).push(l);

    }

    const sos = [];

    for (const [so, ls] of bySo) {

        const first = ls[0];
        const dates = ls.map(l => l.date).filter(Boolean).filter(d => d < PLACEHOLDER).sort();
        const promise = dates[0] || null;
        const kinds = new Set(ls.map(l => l.kind));
        const kind = kinds.has("HOLD") ? "HOLD" : kinds.has("BLANKET") ? "BLANKET" : kinds.has("DATED") ? "DATED" : "UNSCHEDULED";
        const openValue = r2(ls.reduce((s, l) => s + l.open * l.price, 0));
        const note = notes.get(so) || null;

        const shortParts = ls.flatMap(l => l.shortParts.map(p => ({ ...p, line: l.line, item: l.item })));
        const hardShort = shortParts.filter(p => p.short > 0 || p.afterPromise);
        const latePo = ls.some(l => l.latePo);
        const needsPo = ls.some(l => l.needsPo);
        const daysTo = promise ? daysBetween(today, promise) : null;

        let rag = "GREY";
        let status = kind;
        const reasons = [];

        if (kind === "DATED") {

            if (daysTo < 0) {

                rag = "RED";
                status = "LATE";
                reasons.push(`Late ${-daysTo} day${daysTo === -1 ? "" : "s"}`);

            }

            if (hardShort.length) {

                rag = "RED";
                status = status === "LATE" ? "LATE" : "SHORT";

            }

            else if (rag !== "RED" && latePo) {

                rag = "AMBER";
                status = "AT RISK";
                reasons.push("Relies on a late PO");

            }

            else if (rag !== "RED" && needsPo && daysTo <= amberDays) {

                rag = "AMBER";
                status = "AT RISK";
                reasons.push(`Due in ${daysTo} day${daysTo === 1 ? "" : "s"}, waiting on a PO`);

            }

            else if (rag !== "RED") {

                rag = "GREEN";
                status = "COVERED";

            }

            for (const p of hardShort.slice(0, 3))
                reasons.push(p.short > 0
                    ? `Short ${p.part} × ${p.short}${p.nextPo ? ` (next PO ${p.nextPo.po} due ${md(p.nextPo.eta)})` : " (no PO)"}`
                    : `${p.part}: waiting on PO ${p.po} due ${md(p.poEta)}`);

            if (hardShort.length > 3)
                reasons.push(`+${hardShort.length - 3} more short parts`);

            for (const o of overBlanket.get(so) || [])
                reasons.push(`${o.sku}: ${o.over} more than the open Loeb blanket (needs a new Loeb PO)`);

        }

        // PCB Coating isn't a product line here: coated boards feed all
        // three lines (Director, Nov 11 2026).
        const groups = ls.map(l => lineGroupOf(l.item)).filter(g => g && g !== "Other" && g !== "PCB Coating");
        const { channel, channelDetail } = channelOf(ls, repChannels);

        sos.push({
            so,
            release: Boolean(first.release),
            customer: first.customer,
            project: first.project,
            industry: first.industry,
            channel,
            channelDetail,
            rep: first.rep,
            lineGroup: groups[0] || "Other",
            promise,
            daysTo,
            kind,
            rag,
            status,
            reasons,
            openValue,
            openQty: r4(ls.reduce((s, l) => s + l.open, 0)),
            recoveryStatus: status === "LATE" ? recoveryStatus(note, today) : null,
            note,
            lines: ls.map(l => ({ line: l.line, release: l.release || null, item: l.item, description: l.description, open: l.open, price: l.price, date: l.date, fromStock: l.fromStock, poEta: l.poEta, latePo: l.latePo, shortParts: l.shortParts })),
            shortParts: hardShort
        });

    }

    const order = { RED: 0, AMBER: 1, GREEN: 2, GREY: 3 };

    sos.sort((a, b) => String(a.promise || "9999").localeCompare(String(b.promise || "9999")) || a.so.localeCompare(b.so));

    //--------------------------------------------------
    // 4. Shortage summary (late + at risk) and totals
    //--------------------------------------------------

    const shortMap = new Map();

    for (const s of sos) {

        if (s.rag !== "RED" && s.rag !== "AMBER")
            continue;

        for (const p of s.shortParts) {

            const e = shortMap.get(p.part) || { part: p.part, description: items.get(p.part)?.description || null, short: 0, sos: new Set(), nextPo: p.nextPo, onHand: Number(items.get(p.part)?.on_hand) || 0, onOrder: Number(items.get(p.part)?.on_order) || 0 };

            e.short = r4(e.short + p.short);
            e.sos.add(s.so);
            shortMap.set(p.part, e);

        }

    }

    const shortages = [...shortMap.values()]
        .map(e => ({ ...e, sos: [...e.sos], noPo: !e.nextPo }))
        .sort((a, b) => b.sos.length - a.sos.length || b.short - a.short);

    const sum = rag => {

        const xs = sos.filter(s => s.rag === rag);

        return { count: xs.length, value: r2(xs.reduce((t, s) => t + s.openValue, 0)) };

    };

    const scheduled = sos.filter(s => s.kind === "DATED");

    const totals = {
        red: sum("RED"),
        amber: sum("AMBER"),
        green: sum("GREEN"),
        grey: sum("GREY"),
        late: { count: sos.filter(s => s.status === "LATE").length, value: r2(sos.filter(s => s.status === "LATE").reduce((t, s) => t + s.openValue, 0)) },
        needsDate: sos.filter(s => s.recoveryStatus === "NEEDS DATE").length,
        missed: sos.filter(s => s.recoveryStatus === "MISSED").length,
        scheduledValue: r2(scheduled.reduce((t, s) => t + s.openValue, 0)),
        all: { count: sos.length, value: r2(sos.reduce((t, s) => t + s.openValue, 0)) }
    };

    return { today, amberDays, sos, shortages, totals, ragOrder: order };

}

module.exports = { channelOf, buildBacklog, recoveryStatus, isBlanket, AMBER_DAYS, STALE_PO_DAYS, PLACEHOLDER };
