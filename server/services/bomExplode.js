//------------------------------------------------------
// BOM explosion (Nov 5 2026)
//
// Turns level-1 BOM lines (QuickBooks stores one level per
// assembly) into an indented multi-level BOM:
//   level 1 = the opened SKU's own lines, a sub-assembly's
//   lines follow it at level + 1, up to MAX_LEVEL.
//   extQty = qty per × the parent row's extQty.
// Circular reference guard: a component already on the path
// from the top (A → B → A) is shown, flagged `cycle`, and not
// expanded again. A sub-assembly at MAX_LEVEL that has lines
// of its own is flagged `truncated`.
//
// Pure: linesOf(assembly) returns that assembly's lines
// ([{ line, component, qty, uom }], [] = none) or null when
// not loaded; itemOf(name) returns the QuickBooks item or null.
//------------------------------------------------------

const MAX_LEVEL = 5;

const round = n => Math.round(n * 1e6) / 1e6;

function explode(root, linesOf, itemOf, maxLevel = MAX_LEVEL) {

    const rows = [];
    let cycles = 0;
    let truncated = 0;
    let missing = 0;

    function walk(assembly, level, parentExt, path) {

        const lines = [...(linesOf(assembly) || [])].sort((a, b) => a.line - b.line);

        for (const l of lines) {

            const item = itemOf(l.component);
            const qty = Number(l.qty) || 0;
            const extQty = round(qty * parentExt);
            const isAssembly = Boolean(item && item.type === "InventoryAssembly");
            const row = {
                level,
                line: l.line,
                parent: assembly,
                component: l.component,
                description: item ? item.description : null,
                qty,
                extQty,
                uom: l.uom || (item ? item.uom : null) || "",
                onHand: item ? item.on_hand : null,
                isAssembly,
                active: item ? Boolean(item.active) : false,
                unknown: !item
            };

            rows.push(row);

            if (!isAssembly)
                continue;

            if (path.includes(l.component)) {

                row.cycle = true;
                cycles++;
                continue;

            }

            const children = linesOf(l.component);

            if (children === null || children === undefined) {

                row.notLoaded = true;
                missing++;
                continue;

            }

            if (level >= maxLevel) {

                if (children.length) {

                    row.truncated = true;
                    truncated++;

                }

                continue;

            }

            walk(l.component, level + 1, extQty, [...path, l.component]);

        }

    }

    walk(root, 1, 1, [root]);

    return { rows, cycles, truncated, missing };

}

module.exports = { explode, MAX_LEVEL };
