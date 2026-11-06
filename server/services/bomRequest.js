//------------------------------------------------------
// BOM change requests: validation and numbering (Nov 6 2026)
//
// Changes apply to the opened config's level-1 lines only
// (QuickBooks stores one level per assembly):
//   CHANGE_QTY  a line on the BOM, new qty > 0 and different
//   DELETE      a line on the BOM
//   ADD         an active QuickBooks part (Inventory,
//               Inventory Assembly or Non-inventory) not
//               already on the BOM and not the config itself,
//               qty > 0
// One change per component. Checked against the BOM as read
// from QuickBooks when the request is sent (the snapshot).
//------------------------------------------------------

const REASONS = ["Cost Reduction", "Supplier Change", "Obsolescence", "Quality/NCM", "Design Change", "Correction"];
const ACTIONS = ["CHANGE_QTY", "DELETE", "ADD"];
const ADDABLE = ["Inventory", "InventoryAssembly", "NonInventory"];
const MAX_LINES = 50;
const MAX_QTY = 100000;

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function qtyOf(v) {

    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;

    return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= MAX_QTY ? Math.round(n * 1e6) / 1e6 : null;

}

// levelOne: the config's level-1 rows ({ line, component, qty, uom, description }).
function validateRequest(body, { sku, levelOne, itemOf }) {

    const errors = [];
    const b = body || {};

    const reason = REASONS.includes(b.reason) ? b.reason : null;
    const requestedBy = text(b.requestedBy, 60);
    const reference = text(b.reference, 60) || null;
    const note = text(b.note, 500) || null;

    if (!reason)
        errors.push(`Pick a reason: ${REASONS.join(", ")}.`);

    if (!requestedBy)
        errors.push("Enter your name.");

    const raw = Array.isArray(b.lines) ? b.lines : [];

    if (!raw.length)
        errors.push("Mark at least one change.");

    if (raw.length > MAX_LINES)
        errors.push(`At most ${MAX_LINES} changes per request.`);

    const byLine = new Map(levelOne.map(r => [r.line, r]));
    const onBom = new Set(levelOne.map(r => r.component));
    const seen = new Set();
    const lines = [];

    raw.slice(0, MAX_LINES).forEach((l, i) => {

        const n = i + 1;
        const action = ACTIONS.includes(l && l.action) ? l.action : null;
        const component = text(l && l.component, 100);

        if (!action) {

            errors.push(`Change ${n}: unknown action.`);
            return;

        }

        if (!component) {

            errors.push(`Change ${n}: no component.`);
            return;

        }

        if (seen.has(component)) {

            errors.push(`Change ${n}: ${component} is already in this request (one change per component).`);
            return;

        }

        seen.add(component);

        if (action === "ADD") {

            const item = itemOf(component);
            const qty = qtyOf(l.newQty);

            if (!item)
                errors.push(`Change ${n}: ${component} is not a QuickBooks item.`);
            else if (!item.active)
                errors.push(`Change ${n}: ${component} is inactive in QuickBooks.`);
            else if (!ADDABLE.includes(item.type))
                errors.push(`Change ${n}: ${component} is a ${item.type} item; only parts can be added.`);
            else if (component === sku)
                errors.push(`Change ${n}: a config can't contain itself.`);
            else if (onBom.has(component))
                errors.push(`Change ${n}: ${component} is already on the BOM; change its qty instead.`);
            else if (qty === null)
                errors.push(`Change ${n}: qty for ${component} must be a number above 0.`);
            else
                lines.push({ action, line: null, component, description: item.description || null, oldQty: null, newQty: qty, uom: item.uom || null });

            return;

        }

        const row = byLine.get(Number(l.line));

        if (!row || row.component !== component) {

            errors.push(`Change ${n}: ${component} is not on line ${l.line} of the BOM (it may have changed in QuickBooks; reload).`);
            return;

        }

        if (action === "DELETE") {

            lines.push({ action, line: row.line, component, description: row.description || null, oldQty: row.qty, newQty: null, uom: row.uom || null });
            return;

        }

        const qty = qtyOf(l.newQty);

        if (qty === null)
            errors.push(`Change ${n}: new qty for ${component} must be a number above 0 (use Delete to remove it).`);
        else if (qty === row.qty)
            errors.push(`Change ${n}: new qty for ${component} is the same as now (${row.qty}).`);
        else
            lines.push({ action, line: row.line, component, description: row.description || null, oldQty: row.qty, newQty: qty, uom: row.uom || null });

    });

    return { errors, request: { reason, requestedBy, reference, note }, lines };

}

// BOM-2026-001; after 999 the number just grows (BOM-2026-1000).
const codeFor = (year, seq) => `BOM-${year}-${String(seq).padStart(3, "0")}`;

// Change summary for Chat, CSV and the list: "line 7 20-76278-A qty 8 → 6".
function describeLine(l) {

    if (l.action === "ADD")
        return `ADD ${l.component} qty ${l.new_qty ?? l.newQty}`;

    if (l.action === "DELETE")
        return `DELETE line ${l.line} ${l.component} (was qty ${l.old_qty ?? l.oldQty})`;

    return `CHANGE QTY line ${l.line} ${l.component} ${l.old_qty ?? l.oldQty} → ${l.new_qty ?? l.newQty}`;

}

module.exports = { REASONS, ACTIONS, ADDABLE, MAX_LINES, validateRequest, codeFor, describeLine };
