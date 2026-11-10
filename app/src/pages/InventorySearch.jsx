import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { Alert, Box, Button, CircularProgress, FormControlLabel, InputAdornment, Switch, TextField } from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import AccountTreeIcon from "@mui/icons-material/AccountTreeOutlined";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { getInventoryItem, refreshInventory, searchInventory } from "../api/inventory";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Inventory search + where used (Director, Nov 10 2026). Type a
// word or number: fuzzy match on part number, description,
// manufacturer P/N and vendor (server side). Pick an item for
// its details (no costs) and where used: one table of every
// top-level assembly it ends up in, with qty per assembly and
// "Via" = the direct parent it goes into (Director, Nov 10 2026). ?q= and ?item= keep
// the search and the item in the address (shareable).
//------------------------------------------------------

const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const when = v => {

    const t = typeof v === "number" ? v : Date.parse(v);

    return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—";

};

const TYPE_LABEL = { InventoryAssembly: "Assembly", Inventory: "Part", NonInventory: "Non-inventory", Service: "Service", OtherCharge: "Charge" };

function Tag({ color = tokens.muted, children }) {

    return (
        <Box component="span" sx={{ fontFamily: tokens.display, fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", px: 0.75, py: 0.1, border: `1px solid ${color}`, color, whiteSpace: "nowrap" }}>
            {children}
        </Box>
    );

}

function Fact({ label, children, warn }) {

    return (
        <Box sx={{ minWidth: 0 }}>
            <Box sx={{ ...labelSx, fontSize: 11 }}>{label}</Box>
            <Box sx={{ fontSize: 15, color: warn ? "#F2A33A" : tokens.text, overflowWrap: "anywhere" }}>{children}</Box>
        </Box>
    );

}

const TOP_GRID = "minmax(170px, 1.2fr) minmax(180px, 1.8fr) minmax(150px, 1.1fr) 100px 100px 100px 90px";

function TableHead({ grid, cols }) {

    return (
        <Box sx={{ display: { xs: "none", md: "grid" }, gridTemplateColumns: grid, gap: 1, px: 2.25, py: 0.75, borderBottom: `1px solid ${tokens.lineStrong}` }}>
            {cols.map(c => <Box key={c} sx={{ ...labelSx, fontSize: 11 }}>{c}</Box>)}
        </Box>
    );

}

// Phone: the table head is hidden, so each number carries its label.
function Cell({ label, children, strong }) {

    return (
        <Box sx={{ fontWeight: strong ? 700 : 400 }}>
            <Box component="span" sx={{ display: { xs: "inline", md: "none" }, ...labelSx, fontSize: 11, mr: 1 }}>{label}</Box>
            {children}
        </Box>
    );

}

const rowSx = grid => ({
    display: "grid", gridTemplateColumns: { xs: "1fr", md: grid }, gap: { xs: 0.25, md: 1 }, alignItems: "center",
    px: 2.25, py: 0.8, borderBottom: `1px solid ${tokens.line}`, fontSize: 14
});

function ItemLink({ name, onOpen }) {

    return (
        <Box component="button" type="button" onClick={() => onOpen(name)}
            sx={{ all: "unset", cursor: "pointer", fontFamily: tokens.mono, fontWeight: 700, color: tokens.blueText, overflowWrap: "anywhere", "&:hover": { textDecoration: "underline" } }}>
            {name}
        </Box>
    );

}

// "Direct" when the top uses the item itself; else the sub-assembly
// the item goes into on the way up (and the item's qty in it).
const isDirectVia = (t, v) => v.assembly === t.assembly;
const viaText = t => t.via.map(v => (isDirectVia(t, v) ? "Direct" : `${v.assembly} (${num(v.qty)} per)`)).join("; ");

function Via({ t, onOpen }) {

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {t.via.map(v => (isDirectVia(t, v)
                ? <Box key="direct" sx={{ color: tokens.muted }}>— direct</Box>
                : <Box key={`${v.assembly}-${v.qty}`}><ItemLink name={v.assembly} onOpen={onOpen} /> <Box component="span" sx={{ color: tokens.muted, fontSize: 13 }}>({num(v.qty)} per)</Box></Box>))}
        </Box>
    );

}

function Details({ data, inactive, onInactive, onOpen }) {

    const { item, whereUsed: wu } = data;
    const low = item.reorder_point !== null && item.on_hand !== null && Number(item.on_hand) < Number(item.reorder_point);
    const isAssembly = item.type === "InventoryAssembly";

    const exportTops = () => downloadCsv(`where-used-${item.full_name}.csv`, [
        { label: "Top-level assembly", key: "assembly" },
        { label: "Description", key: "description" },
        { label: "Line", key: "lineGroup" },
        { label: `Qty of ${item.full_name} per assembly`, key: "qty" },
        { label: "On sales orders", key: "on_sales_order" },
        { label: "On hand", key: "on_hand" },
        { label: "Active", value: r => (r.active ? "Yes" : "No") },
        { label: "Via (direct parent)", value: r => viaText(r, item.full_name) },
        { label: "Path", value: r => r.paths.map(p => p.join(" > ")).join(" | ") }
    ], wu.tops);

    return (
        <Box>
            <Box sx={{ px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}`, display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Box sx={{ fontFamily: tokens.mono, fontSize: 22, fontWeight: 700, overflowWrap: "anywhere" }}>{item.full_name}</Box>
                    <Box sx={{ color: tokens.muted, fontSize: 15, mt: 0.25 }}>{item.description || "—"}</Box>
                    <Box sx={{ display: "flex", gap: 0.75, mt: 1 }}>
                        <Tag color={tokens.blueText}>{TYPE_LABEL[item.type] || item.type || "Item"}</Tag>
                        {item.active ? <Tag color={tokens.online}>Active</Tag> : <Tag color="#F85149">Inactive</Tag>}
                        {low && <Tag color="#F2A33A">Below reorder point</Tag>}
                    </Box>
                </Box>
                {isAssembly && (
                    <Button component={RouterLink} to={`/bom?sku=${encodeURIComponent(item.full_name)}`} variant="outlined" startIcon={<AccountTreeIcon />}
                        sx={{ borderColor: tokens.lineStrong, color: tokens.text }}>
                        Open BOM
                    </Button>
                )}
            </Box>

            <Box sx={{ px: 2.25, py: 1.75, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, borderBottom: `1px solid ${tokens.line}` }}>
                <Fact label="On hand" warn={low}>{num(item.on_hand)} {item.uom ? <Box component="span" sx={{ color: tokens.muted, fontSize: 13 }}>{item.uom}</Box> : null}</Fact>
                <Fact label="On order (POs)">{num(item.on_order)}</Fact>
                <Fact label="On sales orders">{num(item.on_sales_order)}</Fact>
                <Fact label="Reorder point">{num(item.reorder_point)}</Fact>
                <Fact label="Manufacturer P/N">{item.part_number || "—"}</Fact>
                <Fact label="Preferred vendor">{item.preferred_vendor || "—"}</Fact>
                <Fact label="Class">{item.item_class || "—"}</Fact>
                <Fact label="Changed in QuickBooks">{when(item.time_modified)}</Fact>
                {item.purchase_description && item.purchase_description !== item.description && (
                    <Box sx={{ gridColumn: "1 / -1" }}><Fact label="Purchase description">{item.purchase_description}</Fact></Box>
                )}
            </Box>

            <Box sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", bgcolor: tokens.raised, borderBottom: `1px solid ${tokens.line}` }}>
                <Box sx={{ ...labelSx, color: tokens.text, fontSize: 15 }}>Where used</Box>
                <Box sx={{ color: tokens.muted, fontSize: 14 }}>
                    {wu.tops.length} finished config{wu.tops.length === 1 ? "" : "s"}
                </Box>
                <Box sx={{ flex: 1 }} />
                <FormControlLabel control={<Switch size="small" checked={inactive} onChange={e => onInactive(e.target.checked)} />} label="Include inactive assemblies" />
                {wu.tops.length > 0 && <Button size="small" startIcon={<DownloadIcon />} onClick={exportTops}>CSV</Button>}
            </Box>

            {wu.truncated && <Alert severity="warning" sx={{ m: 2 }}>This item sits in a very large BOM tree; the list below is cut short.</Alert>}
            {wu.loops > 0 && <Alert severity="info" sx={{ m: 2 }}>A BOM loop (an assembly that contains itself further down) was found and skipped.</Alert>}

            {!wu.direct.length ? (
                <Box sx={{ p: 2.25, color: tokens.muted }}>
                    {isAssembly ? "No assembly uses this item: it is a top-level assembly (a finished config)." : "No assembly uses this item."}
                    {!inactive && " Inactive assemblies are hidden."}
                </Box>
            ) : (
                <>
                    <TableHead grid={TOP_GRID} cols={["Top-level assembly", "Description", "Via (direct parent)", "Line", "Qty per assy", "On SOs", "On hand"]} />
                    {wu.tops.map(t => (
                        <Box key={t.assembly} sx={rowSx(TOP_GRID)}>
                            <Box><ItemLink name={t.assembly} onOpen={onOpen} />{!t.active && <Box component="span" sx={{ ml: 0.75 }}><Tag color="#F85149">Inactive</Tag></Box>}</Box>
                            <Box sx={{ color: tokens.muted, fontSize: 13 }}>
                                {t.description || "—"}
                                {t.paths.some(p => p.length > 3) && (
                                    <Box sx={{ fontFamily: tokens.mono, fontSize: 11, mt: 0.25 }}>
                                        {t.paths.map(p => p.join(" › ")).join("  |  ")}{t.pathCount > t.paths.length ? `  (+${t.pathCount - t.paths.length} more paths)` : ""}
                                    </Box>
                                )}
                            </Box>
                            <Box><Box component="span" sx={{ display: { xs: "inline", md: "none" }, ...labelSx, fontSize: 11, mr: 1 }}>Via</Box><Via t={t} onOpen={onOpen} /></Box>
                            <Cell label="Line">{t.lineGroup || "—"}</Cell>
                            <Cell label="Qty per assy" strong>{num(t.qty)}</Cell>
                            <Cell label="On SOs">{num(t.on_sales_order)}</Cell>
                            <Cell label="On hand">{num(t.on_hand)}</Cell>
                        </Box>
                    ))}
                </>
            )}
        </Box>
    );

}

function InventorySearch() {

    const clock = useClock();
    const [params, setParams] = useSearchParams();
    const isAdmin = (() => { try { return localStorage.getItem("userRole") === "admin"; } catch { return false; } })();

    const [q, setQ] = useState(params.get("q") || "");
    const [inactive, setInactive] = useState(false);
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState("");

    const selected = params.get("item") || "";
    const [detail, setDetail] = useState(null);
    const [detailError, setDetailError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const seq = useRef(0);

    // Search as you type (250 ms after the last key).
    useEffect(() => {

        const term = q.trim();

        if (!term) {

            setResults(null);
            return undefined;

        }

        const n = ++seq.current;
        const t = setTimeout(() => {

            setSearching(true);

            searchInventory(term, inactive)
                .then(r => { if (n === seq.current) { setResults(r); setStatus(r.status); setError(""); } })
                .catch(err => { if (n === seq.current) setError(err.message); })
                .finally(() => { if (n === seq.current) setSearching(false); });

        }, 250);

        return () => clearTimeout(t);

    }, [q, inactive]);

    const loadDetail = useCallback(() => {

        if (!selected) {

            setDetail(null);
            return;

        }

        setDetailError("");

        getInventoryItem(selected, inactive)
            .then(r => { setDetail(r); setStatus(r.status); })
            .catch(err => { setDetail(null); setDetailError(err.message); });

    }, [selected, inactive]);

    useEffect(() => { loadDetail(); }, [loadDetail]);

    const open = name => setParams(p => { const n = new URLSearchParams(p); n.set("item", name); if (q.trim()) n.set("q", q.trim()); return n; });

    const refresh = async () => {

        setRefreshing(true);

        try {

            const r = await refreshInventory();

            setStatus(r.status);
            loadDetail();

        }

        catch (err) { setError(err.message); }

        finally { setRefreshing(false); }

    };

    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, p: { xs: 1.5, md: 2.5 }, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(340px, 420px) 1fr" }, gap: 2, alignItems: "start" }}>

                <Box component="section" aria-label="Search" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>
                    <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.line}` }}>
                        <TextField fullWidth autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Part number, description, vendor…"
                            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>, endAdornment: searching ? <CircularProgress size={18} /> : null } }} />
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1, gap: 1, flexWrap: "wrap" }}>
                            <FormControlLabel control={<Switch size="small" checked={inactive} onChange={e => setInactive(e.target.checked)} />} label="Include inactive" />
                            {results && <Box sx={{ color: tokens.muted, fontSize: 13 }}>{results.total > results.items.length ? `Top ${results.items.length} of ${results.total}` : `${results.total} found`}</Box>}
                        </Box>
                    </Box>

                    {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
                    {status && !status.items && <Alert severity="info" sx={{ m: 2 }}>The QuickBooks item list hasn't loaded yet.{isAdmin ? " Press Refresh." : " An admin can press Refresh."}</Alert>}

                    {!results && !error && (
                        <Box sx={{ p: 2, color: tokens.muted, fontSize: 14 }}>
                            Type a part number (dashes optional), words from the description, a manufacturer part number or a vendor. Small typos are OK.
                        </Box>
                    )}

                    {results && !results.items.length && <Box sx={{ p: 2, color: tokens.muted }}>No match for “{results.q}”.</Box>}

                    <Box sx={{ maxHeight: { lg: "calc(100vh - 280px)" }, overflowY: "auto" }}>
                        {results?.items.map(it => (
                            <Box key={it.full_name} role="button" tabIndex={0} onClick={() => open(it.full_name)} onKeyDown={e => { if (e.key === "Enter") open(it.full_name); }}
                                sx={{ px: 2, py: 1, borderBottom: `1px solid ${tokens.line}`, cursor: "pointer", borderLeft: `4px solid ${it.full_name === selected ? tokens.blue : "transparent"}`,
                                    bgcolor: it.full_name === selected ? tokens.raised : "transparent", "&:hover": { bgcolor: tokens.raised } }}>
                                <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                                    <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, flex: 1, overflowWrap: "anywhere" }}>{it.full_name}</Box>
                                    <Box sx={{ fontSize: 13, color: tokens.muted, whiteSpace: "nowrap" }}>{num(it.on_hand)} on hand</Box>
                                </Box>
                                <Box sx={{ fontSize: 12.5, color: tokens.muted, mt: 0.25, display: "flex", gap: 0.75, alignItems: "center" }}>
                                    <Box sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.description || "—"}</Box>
                                    <Tag>{TYPE_LABEL[it.type] || it.type || "Item"}</Tag>
                                    {!it.active && <Tag color="#F85149">Inactive</Tag>}
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </Box>

                <Box component="section" aria-label="Item details" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, minWidth: 0 }}>
                    {detailError && <Alert severity="error" sx={{ m: 2 }}>{detailError}</Alert>}
                    {!selected && !detailError && <Box sx={{ p: 3, color: tokens.muted }}>Pick an item to see its details and where it is used.</Box>}
                    {selected && !detail && !detailError && <Box sx={{ p: 3 }}><CircularProgress size={22} /></Box>}
                    {detail && <Details data={detail} inactive={inactive} onInactive={setInactive} onOpen={open} />}
                </Box>

            </Box>

            <Box sx={{ px: { xs: 1.5, md: 2.5 }, pb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", color: tokens.muted, fontSize: 12.5 }}>
                <span>QuickBooks items {status?.itemsOk ? `as of ${when(status.itemsOk.finished_at)}` : "not loaded"} · BOM lines {status?.bomAllOk ? `as of ${when(status.bomAllOk.finished_at)} (${num(status.bomAll)})` : "not loaded"} · no costs shown</span>
                {isAdmin && <Button size="small" startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshIcon />} disabled={refreshing} onClick={refresh}>Refresh</Button>}
            </Box>

            <Footer />

        </Box>
    );

}

export default InventorySearch;
