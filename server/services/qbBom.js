const cdata = require("./cdataClient");
const { explode, MAX_LEVEL } = require("./bomExplode");
const { familyFor } = require("./hourlyBoard");
const { isHold } = require("./mrp");

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
const MRP_TTL_MS = 60 * 60 * 1000;
const MRP_DEPTH = 12;

const LINE_GROUPS = ["Team A", "Team B", "SpaceX", "PCB Coating", "Other"];
const SPACEX = ["Gigabay", "Gigabay - Vertical", "Terabay", "Deca"];

const groupOfBoard = board => (SPACEX.includes(board) ? "SpaceX" : board || "Other");

const bool = v => v === true || v === 1 || v === "true" || v === "True";
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
const day = v => (v ? String(v).slice(0, 10) : null);

// <CustomField><Name>Industry</Name><Value>Car Wash</Value></CustomField>
function customField(xml, name) {

    const m = String(xml || "").match(new RegExp(`<Name>${name}</Name>\\s*<Value>([^<]*)</Value>`, "i"));

    return m ? m[1].replace(/&amp;/g, "&").trim() || null : null;

}

function createQbBom({ db, query = cdata.query, now = () => Date.now() }) {

    const s = cdata.schema();

    const st = {
        replaceItems: db.prepare("DELETE FROM qb_items"),
        insertItem: db.prepare(`INSERT OR REPLACE INTO qb_items (full_name, type, description, uom, active, on_hand, time_modified, on_order,
            part_number, purchase_description, preferred_vendor, on_sales_order, reorder_point, item_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
        replaceBomAll: db.prepare("DELETE FROM qb_bom_all"),
        insertBomAll: db.prepare("INSERT OR REPLACE INTO qb_bom_all (assembly, line, component, qty, uom) VALUES (?, ?, ?, ?, ?)"),
        countBomAll: db.prepare("SELECT COUNT(*) AS n FROM qb_bom_all"),
        parents: db.prepare("SELECT assembly, qty FROM qb_bom_all WHERE component = ? ORDER BY assembly, line"),
        allItems: db.prepare("SELECT * FROM qb_items"),
        clearSo: db.prepare("DELETE FROM qb_open_so_lines"),
        insertSo: db.prepare(`INSERT INTO qb_open_so_lines (so, line, customer, item, ordered, shipped, ship_date, hold, unit_price, sales_rep, industry, project)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
        childrenAll: db.prepare("SELECT component, qty FROM qb_bom_all WHERE assembly = ? ORDER BY line"),
        allSo: db.prepare("SELECT * FROM qb_open_so_lines"),
        clearPo: db.prepare("DELETE FROM qb_open_po_lines"),
        insertPo: db.prepare("INSERT INTO qb_open_po_lines (po, line, vendor, item, ordered, received, expected_date) VALUES (?, ?, ?, ?, ?, ?, ?)"),
        allPo: db.prepare("SELECT * FROM qb_open_po_lines"),
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
                `SELECT FullName, Type, Description, UnitOfMeasure, IsActive, QuantityOnHand, TimeModified, QuantityOnOrder, PartNumber, PurchaseDescription, PreferredVendor, QuantityOnSalesOrder, ReorderPoint, Class FROM ${s}.[Company_Items] ORDER BY FullName`,
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
                        r.TimeModified || null, num(r.QuantityOnOrder),
                        r.PartNumber || null, r.PurchaseDescription || null, r.PreferredVendor || null,
                        num(r.QuantityOnSalesOrder), num(r.ReorderPoint), r.Class || null);

                }

            })();

            itemsVersion++;

            return rows.length;

        }).finally(() => { itemsRunning = null; });

        return itemsRunning;

    }

    //--------------------------------------------------
    // Every BOM line (Company_BOM, ~30,000 rows) for where used
    // (Nov 10 2026): pulled whole, replaced in one transaction;
    // a failed pull keeps the last good copy.
    //--------------------------------------------------

    let bomAllRunning = null;

    function refreshAllBoms() {

        if (bomAllRunning)
            return bomAllRunning;

        bomAllRunning = logged("bom_all", async () => {

            const rows = await cdata.queryAll(
                `SELECT Assembly, LineItemNumber, Component, QtyPerAssembly, LineItemUnitOfMeasure FROM ${s}.[Company_BOM] ORDER BY Assembly, LineItemNumber`,
                query
            );

            if (!rows.length)
                throw new Error("QuickBooks returned no BOM lines; kept the last copy.");

            db.transaction(() => {

                st.replaceBomAll.run();

                for (const r of rows)
                    if (r.Assembly && r.Component)
                        st.insertBomAll.run(r.Assembly, Number(r.LineItemNumber) || 0, r.Component, num(r.QtyPerAssembly), r.LineItemUnitOfMeasure || null);

            })();

            return rows.length;

        }).finally(() => { bomAllRunning = null; });

        return bomAllRunning;

    }

    // Search index, rebuilt only after the item list changes.
    let itemsVersion = 0;
    let indexed = { version: -1, index: [] };

    function searchIndex() {

        if (indexed.version !== itemsVersion || !indexed.index.length)
            indexed = { version: itemsVersion, index: require("./inventorySearch").indexItems(st.allItems.all()) };

        return indexed.index;

    }

    const parentsOf = component => st.parents.all(component);

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

    // Fetch the BOM lines of these assemblies and their sub-assemblies
    // (one CData query per level, batches of BATCH, only what is older
    // than BOM_TTL). Returns the first error, or null. Used by the BOM
    // viewer (one SKU) and the Material check (every SKU on order).
    async function loadTrees(roots, depthLimit = MAX_LEVEL) {

        let error = null;
        const seen = new Set();
        let level = [...new Set(roots)];

        for (let depth = 1; depth <= depthLimit && level.length; depth++) {

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

        return error;

    }

    // Open sales-order and purchase-order lines, replaced as a whole
    // after a complete pull (a failed pull keeps the last good lines).
    let ordersRunning = null;

    function refreshOrders() {

        if (ordersRunning)
            return ordersRunning;

        ordersRunning = (async () => {

            const so = await logged("so", async () => {

                const rows = await cdata.queryAll(
                    `SELECT ReferenceNumber, ItemLineNumber, CustomerName, ItemName, QtyOrdered, QtyShipped, ExpectedShipDate, CustomFields, UnitPrice, SalesRep FROM ${s}.[Company_OpenOrderLines] ORDER BY ReferenceNumber, ItemLineNumber`,
                    query
                );

                db.transaction(() => {

                    st.clearSo.run();

                    for (const r of rows)
                        st.insertSo.run(r.ReferenceNumber || null, r.ItemLineNumber == null ? null : String(r.ItemLineNumber), r.CustomerName || null, r.ItemName || null,
                            num(r.QtyOrdered), num(r.QtyShipped), day(r.ExpectedShipDate), isHold(r.CustomFields) ? 1 : 0,
                            num(r.UnitPrice), r.SalesRep || null, customField(r.CustomFields, "Industry"), customField(r.CustomFields, "ProjectName"));

                })();

                return rows.length;

            });

            const po = await logged("po", async () => {

                const rows = await cdata.queryAll(
                    `SELECT ReferenceNumber, ItemLineNumber, VendorName, ItemName, QtyOrdered, QtyReceived, ExpectedDate FROM ${s}.[Company_OpenPOLines] ORDER BY ReferenceNumber, ItemLineNumber`,
                    query
                );

                db.transaction(() => {

                    st.clearPo.run();

                    for (const r of rows)
                        st.insertPo.run(r.ReferenceNumber || null, r.ItemLineNumber == null ? null : String(r.ItemLineNumber), r.VendorName || null, r.ItemName || null,
                            num(r.QtyOrdered), num(r.QtyReceived), day(r.ExpectedDate));

                })();

                return rows.length;

            });

            return { so, po };

        })().finally(() => { ordersRunning = null; });

        return ordersRunning;

    }

    // Everything the Material check needs, from the cache. Refreshes
    // items + open orders when older than MRP_TTL_MS (or when forced),
    // then the BOMs of every assembly on order. A failed refresh keeps
    // the last good data and is returned as `error`.
    async function mrpInputs({ force = false } = {}) {

        let error = null;
        const lastSo = st.lastOk.get("so");
        const lastItems = st.lastOk.get("items");

        if (force || !lastSo || now() - lastSo.finished_at > MRP_TTL_MS || !lastItems || now() - lastItems.finished_at > MRP_TTL_MS) {

            try {

                await refreshItems();
                await refreshOrders();

            }

            catch (err) {

                error = err.message;

            }

        }

        const soLines = st.allSo.all();
        const items = new Map(st.allItems.all().map(i => [i.full_name, i]));
        const roots = [...new Set(soLines.map(l => l.item).filter(n => n && (items.get(n) || {}).type === "InventoryAssembly"))];
        const bomError = await loadTrees(roots, MRP_DEPTH);

        const linesOf = a => (st.fetched.get(a) ? st.lines.all(a) : null);

        return {
            soLines,
            poLines: st.allPo.all(),
            items,
            linesOf,
            error: error || bomError,
            asOf: {
                items: (st.lastOk.get("items") || {}).finished_at || null,
                orders: (st.lastOk.get("so") || {}).finished_at || null,
                pos: (st.lastOk.get("po") || {}).finished_at || null
            }
        };

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

        const error = await loadTrees([sku], MAX_LEVEL);

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
            bomLast: st.last.get("bom") || null,
            bomAll: st.countBomAll.get().n,
            bomAllOk: st.lastOk.get("bom_all") || null,
            bomAllLast: st.last.get("bom_all") || null
        };

    }

    // One #mos-system warning per New York day (Slack S3).
    let warnedOn = null;

    function warnSystem(text) {

        const day = new Date(now()).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

        if (warnedOn === day)
            return;

        warnedOn = day;

        require("./slack").postSystemToSlack(text).catch(err => console.error("✗ Slack system warning:", err.message));

    }

    // Refresh the item list at boot if it's old, then check every 10 min.
    function start() {

        if (!cdata.configured()) {

            console.warn("QuickBooks BOM viewer: CDATA_USER / CDATA_PAT not set; item refresh off.");
            return null;

        }

        const stale = kind => {

            const ok = st.lastOk.get(kind);

            return !ok || now() - ok.finished_at >= ITEMS_MAX_AGE_MS;

        };

        const tick = () => {

            if (stale("items"))
                refreshItems().then(
                    n => console.log(`QuickBooks items refreshed: ${n}`),
                    err => {

                        console.error(`QuickBooks item refresh failed: ${err.message}`);
                        warnSystem(`⚠️ ManufacturingOS could not read QuickBooks (item list): ${String(err.message).slice(0, 300)}. BOM viewer, Inventory search and Material check show the last good data. Check the CData connection.`);

                    }
                );

            if (stale("bom_all"))
                refreshAllBoms().then(
                    n => console.log(`QuickBooks BOM lines refreshed (where used): ${n}`),
                    err => {

                        console.error(`QuickBooks BOM refresh failed: ${err.message}`);
                        warnSystem(`⚠️ ManufacturingOS could not read QuickBooks (BOM lines for where used): ${String(err.message).slice(0, 300)}. Inventory search shows the last good copy.`);

                    }
                );

        };

        tick();

        const timer = setInterval(tick, CHECK_MS);

        timer.unref();

        console.log("QuickBooks BOM viewer: items and all BOM lines (where used) refreshed when older than 20 h (checked every 10 min); BOMs fetched on open, kept 1 h");

        return timer;

    }

    //--------------------------------------------------
    // Backlog & delivery risk (Nov 10 2026): items + open SO / PO
    // lines re-read when older than 1 h (Refresh forces it), BOMs
    // from qb_bom_all (every assembly, nightly) so no per-SKU
    // CData calls.
    //--------------------------------------------------

    async function backlogInputs({ force = false } = {}) {

        let error = null;
        const lastSo = st.lastOk.get("so");
        const lastItems = st.lastOk.get("items");

        if (force || !lastSo || now() - lastSo.finished_at > MRP_TTL_MS || !lastItems || now() - lastItems.finished_at > MRP_TTL_MS) {

            try {

                await refreshItems();
                await refreshOrders();

            }

            catch (err) {

                error = err.message;

            }

        }

        return {
            soLines: st.allSo.all(),
            poLines: st.allPo.all(),
            items: new Map(st.allItems.all().map(i => [i.full_name, i])),
            childrenOf: a => st.childrenAll.all(a),
            error,
            asOf: {
                items: (st.lastOk.get("items") || {}).finished_at || null,
                orders: (st.lastOk.get("so") || {}).finished_at || null,
                pos: (st.lastOk.get("po") || {}).finished_at || null,
                boms: (st.lastOk.get("bom_all") || {}).finished_at || null
            }
        };

    }

    return { backlogInputs, refreshItems, refreshAllBoms, searchIndex, itemOf, parentsOf, refreshOrders, loadTrees, mrpInputs, getBom, assemblies, status, start, lineGroupOf, warnSystem };

}

module.exports = { customField, createQbBom, LINE_GROUPS, BOM_TTL_MS, MRP_TTL_MS, groupOfBoard };
