import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, TextField } from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { getCustomerHistory, getHistoryCustomers, getItemHistory, refreshSkuHistory } from "../api/skuHistory";
import { searchInventory } from "../api/inventory";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// SKU History (Director, Nov 13 2026). Like the Walmart SKU Invoice
// History sheet: pick a customer → invoiced units per item per month,
// Total, Avg / month (months with units), 6-mo avg (last 6 complete
// months). Pick a part or SKU → the same by customer, plus units used
// inside shipped assemblies (today's BOMs) and the Estimated Annual
// Usage (6-mo avg × 12). ?customer= / ?item= / ?months= in the address.
//------------------------------------------------------

const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 }));
const cell = v => (v ? num(v) : "-");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = m => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const when = v => {

    const t = typeof v === "number" ? v : Date.parse(v);

    return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—";

};

const STAT_COLS = [
    { label: "Total", key: "total" },
    { label: "Avg / mo", key: "avgActive" },
    { label: "6-mo avg", key: "avg6" }
];

const thSx = { ...labelSx, fontSize: 11, letterSpacing: "1.2px", px: 1, py: 0.75, textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${tokens.lineStrong}`, bgcolor: tokens.panel };
const tdSx = { px: 1, py: 0.6, textAlign: "right", fontFamily: tokens.mono, fontSize: 13, whiteSpace: "nowrap", borderBottom: `1px solid ${tokens.line}` };
const stickySx = { position: "sticky", left: 0, zIndex: 1, bgcolor: tokens.panel, textAlign: "left", borderRight: `1px solid ${tokens.line}` };

// Rows × months with Total / Avg / 6-mo avg; the current month is partial.
function MonthTable({ months, rows, nameLabel, name, extra = [], totals, onOpen }) {

    const last = months.length - 1;

    return (
        <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
                <thead>
                    <tr>
                        <Box component="th" sx={{ ...thSx, ...stickySx, zIndex: 2 }}>{nameLabel}</Box>
                        {extra.map(c => <Box component="th" key={c.label} sx={thSx}>{c.label}</Box>)}
                        {months.map((m, i) => <Box component="th" key={m} sx={{ ...thSx, color: i === last ? "#F2A33A" : tokens.muted }} title={i === last ? "This month so far" : undefined}>{monthLabel(m)}{i === last ? "*" : ""}</Box>)}
                        {STAT_COLS.map(c => <Box component="th" key={c.key} sx={{ ...thSx, color: tokens.text, borderLeft: c.key === "total" ? `1px solid ${tokens.lineStrong}` : undefined }}>{c.label}</Box>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <Box component="tr" key={name(r)} sx={{ "&:hover td": { bgcolor: tokens.raised } }}>
                            <Box component="td" sx={{ ...tdSx, ...stickySx, maxWidth: { xs: 150, md: 300 }, whiteSpace: { xs: "normal", md: "nowrap" }, overflowWrap: "anywhere" }}>
                                {onOpen
                                    ? <Box component="button" type="button" onClick={() => onOpen(name(r))} sx={{ all: "unset", cursor: "pointer", fontWeight: 700, color: tokens.blueText, "&:hover": { textDecoration: "underline" } }}>{name(r)}</Box>
                                    : <Box component="span" sx={{ fontWeight: 700 }}>{name(r)}</Box>}
                                {r.description && <Box sx={{ fontFamily: tokens.body, fontSize: 11.5, color: tokens.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{r.description}</Box>}
                            </Box>
                            {extra.map(c => <Box component="td" key={c.label} sx={tdSx}>{num(r[c.key])}</Box>)}
                            {r.months.map((v, i) => <Box component="td" key={months[i]} sx={{ ...tdSx, color: v ? tokens.text : tokens.muted }}>{cell(v)}</Box>)}
                            {STAT_COLS.map(c => <Box component="td" key={c.key} sx={{ ...tdSx, fontWeight: 700, borderLeft: c.key === "total" ? `1px solid ${tokens.lineStrong}` : undefined }}>{num(r[c.key])}</Box>)}
                        </Box>
                    ))}
                    {totals && (
                        <tr>
                            <Box component="td" sx={{ ...tdSx, ...stickySx, fontFamily: tokens.display, fontWeight: 700, letterSpacing: "1.5px", borderTop: `1px solid ${tokens.lineStrong}` }}>TOTAL</Box>
                            {extra.map(c => <Box component="td" key={c.label} sx={{ ...tdSx, borderTop: `1px solid ${tokens.lineStrong}` }} />)}
                            {totals.months.map((v, i) => <Box component="td" key={months[i]} sx={{ ...tdSx, fontWeight: 700, borderTop: `1px solid ${tokens.lineStrong}` }}>{cell(v)}</Box>)}
                            {STAT_COLS.map(c => <Box component="td" key={c.key} sx={{ ...tdSx, fontWeight: 700, borderTop: `1px solid ${tokens.lineStrong}`, borderLeft: c.key === "total" ? `1px solid ${tokens.lineStrong}` : undefined }}>{num(totals[c.key])}</Box>)}
                        </tr>
                    )}
                </tbody>
            </Box>
        </Box>
    );

}

function Tile({ label, value, sub, accent }) {

    return (
        <Box sx={{ bgcolor: tokens.raised, border: `1px solid ${tokens.line}`, borderTop: `3px solid ${accent || tokens.line}`, px: 1.75, py: 1.25, minWidth: 0 }}>
            <Box sx={{ ...labelSx, fontSize: 11 }}>{label}</Box>
            <Box sx={{ fontFamily: tokens.display, fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{value}</Box>
            {sub && <Box sx={{ fontSize: 12, color: tokens.muted }}>{sub}</Box>}
        </Box>
    );

}

function Section({ title, note, onCsv, children }) {

    return (
        <Box sx={{ borderTop: `1px solid ${tokens.line}` }}>
            <Box sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Box sx={{ ...labelSx, color: tokens.text, flex: 1 }}>{title}{note && <Box component="span" sx={{ ml: 1.5, textTransform: "none", letterSpacing: 0, fontFamily: tokens.body, fontSize: 12.5, color: tokens.muted }}>{note}</Box>}</Box>
                {onCsv && <Button size="small" startIcon={<DownloadIcon />} onClick={onCsv}>CSV</Button>}
            </Box>
            {children}
        </Box>
    );

}

const monthCols = months => months.map((m, i) => ({ label: m, value: r => r.months[i] }));
const statCols = [{ label: "Total", key: "total" }, { label: "Avg per month (active months)", key: "avgActive" }, { label: "6-mo avg", key: "avg6" }, { label: "EAU (6-mo avg x 12)", key: "eau" }];

function CustomerView({ data, onOpenItem }) {

    const csv = () => downloadCsv(`sku-history-${data.customer}.csv`, [
        { label: "Item", key: "item" }, { label: "Description", key: "description" }, ...monthCols(data.months), ...statCols
    ], [...data.items, { item: "TOTAL", ...data.totals }]);

    return (
        <Box>
            <Box sx={{ px: 2.25, py: 1.75, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.25 }}>
                <Tile label="Items invoiced" value={data.items.length} />
                <Tile label="Units, last 12 complete mo" value={num(data.totals.last12)} />
                <Tile label="6-mo avg / month" value={num(data.totals.avg6)} accent={tokens.blue} />
                <Tile label="Annualized (6-mo avg × 12)" value={num(data.totals.eau)} />
            </Box>
            <Section title={`Invoiced units by month · ${data.customer}`} note="Click an item for its history across all customers." onCsv={csv}>
                <MonthTable months={data.months} rows={data.items} nameLabel="Item" name={r => r.item} totals={data.totals} onOpen={onOpenItem} />
            </Section>
        </Box>
    );

}

function ItemView({ data, onOpenItem, onOpenCustomer }) {

    const csv = () => {

        const rows = [
            ...data.customers.map(r => ({ ...r, kind: "Shipped as this item", name: r.customer })),
            ...data.assemblies.map(r => ({ ...r, kind: "Used in shipped assembly", name: r.assembly })),
            { ...data.total, kind: "TOTAL", name: data.item }
        ];

        downloadCsv(`sku-history-${data.item}.csv`, [
            { label: "Source", key: "kind" }, { label: "Customer / assembly", key: "name" }, { label: "Qty per assembly", key: "qtyPer" },
            { label: "Assemblies shipped", key: "shipped" }, ...monthCols(data.months), ...statCols
        ], rows);

    };

    const t = data.total;

    return (
        <Box>
            <Box sx={{ px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>
                <Box sx={{ fontFamily: tokens.mono, fontSize: 22, fontWeight: 700, overflowWrap: "anywhere" }}>{data.item}</Box>
                <Box sx={{ color: tokens.muted, fontSize: 14 }}>{data.description || "—"}</Box>
            </Box>
            <Box sx={{ px: 2.25, py: 1.75, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1.25 }}>
                <Tile label="Estimated annual usage" value={num(t.eau)} sub="6-mo avg × 12" accent={tokens.blue} />
                <Tile label="6-mo avg / month" value={num(t.avg6)} sub="last 6 complete months" />
                <Tile label="Last 12 complete mo" value={num(t.last12)} />
                <Tile label="On hand" value={num(data.onHand)} />
                <Tile label="On order (POs)" value={num(data.onOrder)} />
            </Box>

            {data.truncated && <Alert severity="warning" sx={{ mx: 2.25, mb: 1.5 }}>Where-used walk stopped at 20,000 steps; assembly usage may be incomplete.</Alert>}

            <Box sx={{ display: "flex", justifyContent: "flex-end", px: 2.25, pb: 1 }}>
                <Button size="small" startIcon={<DownloadIcon />} onClick={csv}>CSV (all tables)</Button>
            </Box>

            <Section title="Total usage" note="Shipped as this item + used inside shipped assemblies">
                <MonthTable months={data.months} nameLabel="Usage" name={r => r.label}
                    rows={[{ label: "Shipped as this item", ...data.direct }, { label: "In shipped assemblies", ...data.viaAssemblies }]} totals={t} />
            </Section>

            <Section title="Shipped as this item, by customer" note={data.customers.length ? null : "Not invoiced on its own in this window."}>
                {data.customers.length > 0 && <MonthTable months={data.months} rows={data.customers} nameLabel="Customer" name={r => r.customer} totals={data.direct} onOpen={onOpenCustomer} />}
            </Section>

            <Section title="Used in shipped assemblies" note={data.assemblies.length ? "Assemblies invoiced × qty per (today's BOMs, all levels)." : "No shipped assembly uses it in this window."}>
                {data.assemblies.length > 0 && (
                    <MonthTable months={data.months} rows={data.assemblies} nameLabel="Assembly" name={r => r.assembly} totals={data.viaAssemblies} onOpen={onOpenItem}
                        extra={[{ label: "Qty per", key: "qtyPer" }, { label: "Assy shipped", key: "shipped" }]} />
                )}
            </Section>
        </Box>
    );

}

export default function SkuHistory() {

    const clock = useClock();
    const [params, setParams] = useSearchParams();
    const isAdmin = localStorage.getItem("userRole") === "admin";

    const customer = params.get("customer") || "";
    const item = params.get("item") || "";
    const mode = item ? "item" : (params.get("mode") === "item" ? "item" : "customer");
    const months = params.get("months") === "24" ? 24 : 13;

    const [customers, setCustomers] = useState(null);
    const [meta, setMeta] = useState(null);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [itemInput, setItemInput] = useState("");
    const [itemOptions, setItemOptions] = useState([]);
    const searchSeq = useRef(0);

    const setParam = useCallback(next => {

        const p = new URLSearchParams();
        const merged = { mode, customer, item, months: String(months), ...next };

        if (merged.mode === "item") {

            p.set("mode", "item");
            if (merged.item) p.set("item", merged.item);

        } else if (merged.customer) p.set("customer", merged.customer);

        if (merged.months === "24") p.set("months", "24");
        setParams(p);

    }, [mode, customer, item, months, setParams]);

    const loadCustomers = useCallback(() => getHistoryCustomers()
        .then(r => { setCustomers(r.customers); setMeta({ asOf: r.asOf, rows: r.rows, error: r.error }); })
        .catch(e => setError(e.message)), []);

    useEffect(() => { loadCustomers(); }, [loadCustomers]);

    const target = mode === "item" ? item : customer;

    useEffect(() => {

        if (!target) { setData(null); return undefined; }

        let live = true;

        setLoading(true);
        setError("");
        (mode === "item" ? getItemHistory(target, months) : getCustomerHistory(target, months))
            .then(r => { if (live) setData({ ...r, mode }); })
            .catch(e => { if (live) { setData(null); setError(e.message); } })
            .finally(() => { if (live) setLoading(false); });

        return () => { live = false; };

    }, [mode, target, months]);

    // Item box: QuickBooks item search (same as Inventory search).
    useEffect(() => {

        const text = itemInput.trim();

        if (text.length < 2) { setItemOptions([]); return undefined; }

        const seq = ++searchSeq.current;
        const t = setTimeout(() => {

            searchInventory(text, true).then(r => { if (seq === searchSeq.current) setItemOptions(r.items); }).catch(() => {});

        }, 250);

        return () => clearTimeout(t);

    }, [itemInput]);

    const refresh = async () => {

        setRefreshing(true);

        try { await refreshSkuHistory(); await loadCustomers(); setParam({}); }

        catch (e) { setError(e.message); }

        finally { setRefreshing(false); }

    };

    const openItem = name => setParam({ mode: "item", item: name });
    const openCustomer = name => setParam({ mode: "customer", customer: name, item: "" });
    const selectedCustomer = customers?.find(c => c.customer === customer) || null;

    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, p: { xs: 1.5, md: 2.5 }, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>

                <Box component="section" aria-label="Pick" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, p: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Chip label="By customer" color={mode === "customer" ? "primary" : "default"} variant={mode === "customer" ? "filled" : "outlined"} onClick={() => setParam({ mode: "customer", item: "" })} />
                        <Chip label="By part / SKU" color={mode === "item" ? "primary" : "default"} variant={mode === "item" ? "filled" : "outlined"} onClick={() => setParam({ mode: "item" })} />
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 260, maxWidth: 560 }}>
                        {mode === "customer"
                            ? (
                                <Autocomplete options={customers || []} loading={!customers} value={selectedCustomer}
                                    getOptionLabel={o => o.customer} isOptionEqualToValue={(a, b) => a.customer === b.customer}
                                    onChange={(e, v) => setParam({ customer: v?.customer || "" })}
                                    renderOption={(props, o) => {

                                        const { key, ...rest } = props;

                                        return (
                                            <Box component="li" key={key} {...rest} sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
                                                <span>{o.customer}</span>
                                                <Box component="span" sx={{ color: tokens.muted, fontSize: 12.5, whiteSpace: "nowrap" }}>{num(o.units)} units · {o.items} items</Box>
                                            </Box>
                                        );

                                    }}
                                    renderInput={p => <TextField {...p} placeholder="Pick a customer…" />} />
                            )
                            : (
                                <Autocomplete options={itemOptions} filterOptions={x => x} value={item ? { full_name: item } : null}
                                    getOptionLabel={o => o.full_name} isOptionEqualToValue={(a, b) => a.full_name === b.full_name}
                                    inputValue={itemInput} onInputChange={(e, v) => setItemInput(v)}
                                    onChange={(e, v) => setParam({ item: v?.full_name || "" })}
                                    noOptionsText={itemInput.trim().length < 2 ? "Type a part number or words from the description" : "No match"}
                                    renderOption={(props, o) => {

                                        const { key, ...rest } = props;

                                        return (
                                            <Box component="li" key={key} {...rest} sx={{ display: "block !important" }}>
                                                <Box sx={{ fontFamily: tokens.mono, fontWeight: 700 }}>{o.full_name}</Box>
                                                <Box sx={{ fontSize: 12, color: tokens.muted }}>{o.description || "—"}</Box>
                                            </Box>
                                        );

                                    }}
                                    renderInput={p => <TextField {...p} placeholder="Part number or SKU…" />} />
                            )}
                    </Box>

                    <Box sx={{ display: "flex", gap: 1 }}>
                        {[13, 24].map(n => <Chip key={n} label={`${n} months`} variant={months === n ? "filled" : "outlined"} color={months === n ? "primary" : "default"} onClick={() => setParam({ months: String(n) })} />)}
                    </Box>
                </Box>

                <Box component="section" aria-label="History" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, minWidth: 0 }}>
                    {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
                    {meta && !meta.asOf && <Alert severity="info" sx={{ m: 2 }}>Invoice history hasn't loaded yet.{isAdmin ? " Press Refresh." : " An admin can press Refresh."}</Alert>}
                    {!target && !error && <Box sx={{ p: 3, color: tokens.muted }}>{mode === "customer" ? "Pick a customer to see invoiced units by month." : "Pick a part number or SKU to see its usage by month and its Estimated Annual Usage."}</Box>}
                    {loading && <Box sx={{ p: 3 }}><CircularProgress size={22} /></Box>}
                    {!loading && data?.mode === "customer" && <CustomerView data={data} onOpenItem={openItem} />}
                    {!loading && data?.mode === "item" && <ItemView data={data} onOpenItem={openItem} onOpenCustomer={openCustomer} />}
                </Box>

            </Box>

            <Box sx={{ px: { xs: 1.5, md: 2.5 }, pb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", color: tokens.muted, fontSize: 12.5 }}>
                <span>
                    QuickBooks invoices {meta?.asOf ? `as of ${when(meta.asOf)} (${num(meta.rows)} customer-item-months, last 24 months)` : "not loaded"}
                    {" · "}* = this month so far · Avg / mo = total ÷ months with units · 6-mo avg = last 6 complete months (zeros count) · EAU = 6-mo avg × 12 · units only, no prices
                </span>
                {meta?.error && <Box component="span" sx={{ color: "#F85149" }}>Last refresh failed: {meta.error}</Box>}
                {isAdmin && <Button size="small" startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshIcon />} disabled={refreshing} onClick={refresh}>Refresh</Button>}
            </Box>

            <Footer />

        </Box>
    );

}
