const cdata = require("./cdataClient");
const { explode, MAX_LEVEL } = require("./bomExplode");
const { familyFor } = require("./hourlyBoard");

//------------------------------------------------------
// QuickBooks items + BOMs for the BOM viewer (Nov 5 2026)
//
// Items: the whole QuickBooks item list (about 4,800 rows),
//   refreshed at boot when older than ITEMS_MAX_AGE, checked
//   every 10 min (so about nightly), and by Admin Refresh.
//   Pulled completely before the table is replaced in one
//   transaction: a failed pull keeps the last good list.
// BOMs: fetched when someone opens a SKU, level by level
//   (one CData query per level, batches of BATCH assemblies),
//   kept BOM_TTL; if CData fails, the last fetched copy is
//   shown with its time and the error.
// CData's own copy of QuickBooks refreshes about hourly, so a
//   QuickBooks edit shows here within about 1-2 hours.
// Reusable (MRP bridge next): createQbBom({ db, query }).
//------------------------------------------------------

const BOM_TTL_MS = 60 * 60 * 1000;
const ITEMS_MAX_AGE_MS = 20 * 60 * 60 * 1000;
const CHECK_MS = 10 * 60 * 1000;
const BATCH = 40;

const LINE_GROUPS = ["Team A", "Team B", "SpaceX", "PCB Coating", "Other"];
const SPACEX = ["Gigabay", "Gigabay - Vertical", "Terabay", "Deca"];

const groupOfBoard = board => (SPACEX.includes(board) ? "SpaceX" : board || "Other");

const bool = v => v === true || v === 1 || v === "true" || v === "True";

function createQbBom({ db, query = cdata.query, now = () => Date.now() }) {

    const s = cdata.schema();

    const st = {
        replaceItems: db.prepare("DELETE FROM qb_items"),
        insertItem: db.prepare("INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand, time_modified) VALUES (?, ?, ?, ?, ?, ?, ?)"),
        getItem: db.prepare("SELECT * FROM qb_items WHERE full_name = ?"),
        countItems: db.prepare("SELECT COUNT(*) AS n FROM qb_items"),
        assemblies: db.prepare("SELECT full_name, description FROM qb_items WHERE type = 'InventoryAssembly' AND active = 1 ORDER BY full_name"),
        lines: db.prepare("SELECT line, component, qty, uom FROM qb_bom_lines WHERE assembly = ? ORDER BY line"),
        fetched: db.prepare("SELECT fetched_at FROM qb_bom_fetched WHERE assembly = ?"),
        clearLines: db.prepare("DELETE FROM qb_bom_lines WHERE assembly = ?"),
        insertLine: db.prepare("INSERT OR REPLACE INTO qb_bom_lines (assembly, line, component, qty, uom) VALUES (?, ?, ?, ?, ?)"),
        markFetched: db.prepare("INSERT INTO qb_bom_fetched (assembly, fetched_at) VALUES (?, ?) ON CONFLICT (assembly) DO UPDATE SET fetched_at = excluded.fetched_at"),
        logStart: db.prepare("INSERT INTO qb_sync_log (kind, started_at) VALUES (?, ?)"),
        logEnd: db.prepare("UPDATE qb_sync_log SET finished_at = ?, ok = ?, rows = ?, error = ? WHERE id = ?"),
        lastOk: db.prepare("SELECT * FROM qb_sync_log WHERE kind = ? AND ok = 1 ORDER BY id DESC LIMIT 1"),
        last: db.prepare("SELECT * FROM qb_sync_log WHERE kind = ? ORDER BY id DESC LIMIT 1"),
        prune: db.prepare("DELETE FROM qb_sync_log WHERE id NOT IN (SELECT id FROM qb_sync_log ORDER BY id DESC LIMIT 500)"),
        families: db.prepare("SELECT * FROM product_families"),
        skuBoards: db.prepare("SELECT s.sku, f.board FROM product_skus s JOIN product_families f ON f.id = s.family_id")
    };

    function logged(kind, fn) {

        const id = st.logStart.run(kind, now()).lastInsertRowid;

        return fn().then(
            rows => {

                st.logEnd.run(now(), 1, rows, null, id);
                st.prune.run();
                return rows;

            },
            err => {

                st.logEnd.run(now(), 0, null, String(err.message).slice(0, 500), id);
                st.prune.run();
                throw err;

            }
        );

    }

    let itemsRunning = null;

    function refreshItems() {

        if (itemsRunning)
            return itemsRunning;

        itemsRunning = logged("items", async () => {

            const rows = await cdata.queryAll(
                `SELECT FullName, Type, Description, UnitOfMeasure, IsActive, QuantityOnHand, TimeModified FROM ${s}.[Company_Items] ORDER BY FullName`,
                query
            );

            if (!rows.length)
                throw new Error("QuickBooks returned no items; kept the last list.");

            db.transaction(() => {

                st.replaceItems.run();

                for (const r of rows) {

                    if (!r.FullName)
                        continue;

                    st.insertItem.run(r.FullName, r.Type || null, r.Description || null, r.UnitOfMeasure || null,
                        bool(r.IsActive) ? 1 : 0, r.QuantityOnHand === null || r.QuantityOnHand === undefined ? null : Number(r.QuantityOnHand),
                        r.TimeModified || null);

                }

            })();

            return rows.length;

        }).finally(() => { itemsRunning = null; });

        return itemsRunning;

    }

    // Fetch level-1 lines of these assemblies (stored per assembly;
    // one assembly's lines are replaced together).
    async function fetchLines(assemblies) {

        for (let i = 0; i < assemblies.length; i += BATCH) {

            const batch = assemblies.slice(i, i + BATCH);

            const rows = await query(
                `SELECT Assembly, LineItemNumber, Component, QtyPerAssembly, LineItemUnitOfMeasure FROM ${s}.[Company_BOM] WHERE Assembly IN (${batch.map(cdata.lit).join(", ")})`
            );

            const t = now();

            db.transaction(() => {

                for (const a of batch) {

                    st.clearLines.run(a);
                    st.markFetched.run(a, t);

                }

                rows.forEach((r, n) => {

                    if (!r.Assembly || !r.Component || !batch.includes(r.Assembly))
                        return;

                    const line = Number.isInteger(Number(r.LineItemNumber)) && r.LineItemNumber !== null ? Number(r.LineItemNumber) : 10000 + n;

                    st.insertLine.run(r.Assembly, line, r.Component, r.QtyPerAssembly === null ? null : Number(r.QtyPerAssembly), r.LineItemUnitOfMeasure || null);

                });

            })();

        }

    }

    const itemOf = name => st.getItem.get(name) || null;

    function isFresh(assembly) {

        const f = st.fetched.get(assembly);

        return Boolean(f && now() - f.fetched_at < BOM_TTL_MS);

    }

    async function getBom(sku) {

        if (!st.countItems.get().n)
            await refreshItems();

        const top = itemOf(sku);

        if (!top || top.type !== "InventoryAssembly") {

            const err = new Error(`${sku} is not a QuickBooks assembly.`);
            err.status = 404;
            throw err;

        }

        let error = null;
        const seen = new Set();
        let level = [sku];

        // Level by level: fetch what's stale, then the next level's
        // sub-assemblies. Depth MAX_LEVEL is enough for the explosion.
        for (let depth = 1; depth <= MAX_LEVEL && level.length; depth++) {

            level.forEach(a => seen.add(a));

            const stale = level.filter(a => !isFresh(a));

            if (stale.length && !error) {

                try {

                    await logged("bom", async () => { await fetchLines(stale); return stale.length; });

                }

                catch (err) {

                    error = err.message;

                }

            }

            const next = new Set();

            for (const a of level) {

                for (const l of st.lines.all(a)) {

                    const item = itemOf(l.component);

                    if (item && item.type === "InventoryAssembly" && !seen.has(l.component))
                        next.add(l.component);

                }

            }

            level = [...next];

        }

        if (!st.fetched.get(sku)) {

            const err = new Error(`Could not load the BOM for ${sku} from QuickBooks: ${error}`);
            err.status = 503;
            throw err;

        }

        const used = [];

        const linesOf = a => {

            const f = st.fetched.get(a);

            if (!f)
                return null;

            used.push(f.fetched_at);
            return st.lines.all(a);

        };

        const result = explode(sku, linesOf, itemOf);

        return {
            sku,
            description: top.description,
            uom: top.uom,
            lineGroup: lineGroupOf(sku),
            ...result,
            asOf: Math.min(...used),
            stale: used.some(t => now() - t >= BOM_TTL_MS),
            error,
            itemsAsOf: (st.lastOk.get("items") || {}).finished_at || null
        };

    }

    function lineGroupOf(sku) {

        const listed = st.skuBoards.all().find(r => r.sku === sku);

        if (listed)
            return groupOfBoard(listed.board);

        const family = familyFor(sku, st.families.all());

        return family ? groupOfBoard(family.board) : "Other";

    }

    function assemblies() {

        const listed = new Map(st.skuBoards.all().map(r => [r.sku, r.board]));
        const families = st.families.all();

        return st.assemblies.all().map(a => {

            const board = listed.get(a.full_name) || (familyFor(a.full_name, families) || {}).board;

            return { sku: a.full_name, description: a.description, lineGroup: groupOfBoard(board) };

        });

    }

    function status() {

        return {
            configured: cdata.configured(),
            items: st.countItems.get().n,
            itemsOk: st.lastOk.get("items") || null,
            itemsLast: st.last.get("items") || null,
            bomLast: st.last.get("bom") || null
        };

    }

    // Refresh the item list at boot if it's old, then check every 10 min.
    function start() {

        if (!cdata.configured()) {

            console.warn("QuickBooks BOM viewer: CDATA_USER / CDATA_PAT not set; item refresh off.");
            return null;

        }

        const tick = () => {

            const ok = st.lastOk.get("items");

            if (ok && now() - ok.finished_at < ITEMS_MAX_AGE_MS)
                return;

            refreshItems().then(
                n => console.log(`QuickBooks items refreshed: ${n}`),
                err => console.error(`QuickBooks item refresh failed: ${err.message}`)
            );

        };

        tick();

        const timer = setInterval(tick, CHECK_MS);

        timer.unref();

        console.log("QuickBooks BOM viewer: items refreshed when older than 20 h (checked every 10 min); BOMs fetched on open, kept 1 h");

        return timer;

    }

    return { refreshItems, getBom, assemblies, status, start, lineGroupOf };

}

module.exports = { createQbBom, LINE_GROUPS, BOM_TTL_MS, groupOfBoard };
