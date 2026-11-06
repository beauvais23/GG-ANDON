import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { Alert, Box, Button, FormControlLabel, Switch, TextField } from "@mui/material";

import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { getMrp } from "../api/mrp";
import { RAG_COLORS } from "../config/ragColors";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Material check (MRP bridge, Nov 6 2026): open sales orders
// due within N weeks (past due always in) × BOM explosion,
// netted level by level (finished goods and sub-assemblies on
// hand first) → each part's need vs on hand + open POs.
// Views: Short (default), Needs POs, All parts, Assemblies to
// build. Click a row for the orders that use it and its open
// POs. QuickBooks is read through CData (re-read when older
// than 1 h, or Refresh). Read only.
//------------------------------------------------------

const ALL = "All";
const VIEWS = [["short", "Short"], ["needsPos", "Needs POs"], ["parts", "All parts"], ["builds", "Assemblies to build"]];
const WEEKS_KEY = "mrpWeeks";

const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 }));
const when = ms => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const md = d => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" }) : "—");
const storedWeeks = () => { try { return Number(localStorage.getItem(WEEKS_KEY)) || 8; } catch { return 8; } };

function Chip({ active, children, onClick }) {

    return (
        <Button size="small" variant={active ? "contained" : "outlined"} color={active ? "primary" : "inherit"} onClick={onClick}
            sx={{ borderColor: tokens.lineStrong, color: active ? undefined : tokens.text, letterSpacing: "1.5px" }}>
            {children}
        </Button>
    );

}

function Tile({ label, value, note, color }) {

    return (
        <Box sx={{ bgcolor: tokens.panel, px: 2.25, py: 1.5, borderRight: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
            <Box sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
            <Box sx={{ fontFamily: tokens.mono, fontSize: 30, lineHeight: 1.15, mt: 0.5, color: color || tokens.text }}>{value}</Box>
            {note && <Box sx={{ fontSize: 12, color: tokens.muted, mt: 0.5 }}>{note}</Box>}
        </Box>
    );

}

const PART_GRID = "minmax(150px, 1.1fr) minmax(200px, 2fr) 80px 80px 80px 80px minmax(170px, 1.3fr) 90px 70px";
const BUILD_GRID = "minmax(170px, 1.3fr) minmax(220px, 2.2fr) 90px 90px 90px 100px 80px";

function Detail({ row }) {

    return (
        <Box sx={{ px: 3, py: 1.5, bgcolor: tokens.raised, borderBottom: `1px solid ${tokens.line}`, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" }, gap: 2, fontSize: 13 }}>
            <Box>
                <Box sx={{ ...labelSx, fontSize: 11, mb: 0.5 }}>Orders using it{row.orderCount > row.orders.length ? ` (first ${row.orders.length} of ${row.orderCount})` : ""}</Box>
                {row.orders.map(o => (
                    <Box key={`${o.so}-${o.item}-${o.date}`} sx={{ fontFamily: tokens.mono }}>
                        {md(o.date)} · SO {o.so} · {o.item} × {num(o.qty)}{o.customer ? <Box component="span" sx={{ fontFamily: tokens.body, color: tokens.muted }}> · {o.customer}</Box> : null}{o.hold ? " · HOLD" : ""}
                    </Box>
                ))}
            </Box>
            {row.pos && (
                <Box>
                    <Box sx={{ ...labelSx, fontSize: 11, mb: 0.5 }}>Open PO lines</Box>
                    {row.poMismatch && <Box sx={{ color: RAG_COLORS.amber, mb: 0.5 }}>These lines add up to {num(row.poLineSum)}, but QuickBooks shows {num(row.onPo)} on order. Some may be closed in QuickBooks without being received.</Box>}
                    {row.pos.length === 0 && <Box sx={{ color: tokens.muted }}>None</Box>}
                    {row.pos.map(p => (
                        <Box key={`${p.po}-${p.date}-${p.qty}`} sx={{ fontFamily: tokens.mono }}>
                            {md(p.date)} · PO {p.po} · {num(p.qty)}{p.vendor ? <Box component="span" sx={{ fontFamily: tokens.body, color: tokens.muted }}> · {p.vendor}</Box> : null}
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );

}

export default function MaterialCheck() {

    const clock = useClock();

    const [weeks, setWeeks] = useState(storedWeeks);
    const [weeksText, setWeeksText] = useState(String(storedWeeks()));
    const [group, setGroup] = useState(ALL);
    const [holds, setHolds] = useState(false);
    const [view, setView] = useState("short");
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [open, setOpen] = useState(null);

    const load = useCallback(async (refresh = false) => {

        setLoading(true);

        try {

            setData(await getMrp({ weeks, group, holds, refresh }));
            setError("");

        } catch (err) {

            setError(err.message);

        } finally {

            setLoading(false);

        }

    }, [weeks, group, holds]);

    useEffect(() => { load(false); }, [load]);

    function applyWeeks() {

        const w = Math.min(52, Math.max(1, Math.round(Number(weeksText) || 8)));

        setWeeksText(String(w));
        setWeeks(w);

        try { localStorage.setItem(WEEKS_KEY, String(w)); } catch { /* private window */ }

    }

    const t = q.trim().toLowerCase();
    const match = r => !t || [r.item, r.description, ...(r.orders || []).map(o => `${o.so} ${o.item} ${o.customer || ""}`), ...(r.pos || []).map(p => `${p.po} ${p.vendor || ""}`)].some(v => String(v || "").toLowerCase().includes(t));

    const rows = useMemo(() => {

        if (!data)
            return [];

        if (view === "builds")
            return data.builds.filter(b => b.toBuild > 0).filter(match);

        const parts = view === "short" ? data.parts.filter(p => p.short > 0) : view === "needsPos" ? data.parts.filter(p => p.needsPos > 0) : data.parts;

        return parts.filter(match);

    }, [data, view, t]); // eslint-disable-line react-hooks/exhaustive-deps

    const counts = data ? {
        short: data.parts.filter(p => p.short > 0).length,
        needsPos: data.parts.filter(p => p.needsPos > 0).length,
        late: data.parts.filter(p => p.poLate).length,
        builds: data.builds.filter(b => b.toBuild > 0).length
    } : null;

    function csv() {

        const name = `Material_check_${data.window.today}_${group.replace(/\s/g, "")}_${weeks}wk_${view}.csv`;

        if (view === "builds")
            return downloadCsv(name, [
                { label: "Assembly", key: "item" }, { label: "Description", key: "description" }, { label: "Need", key: "need" },
                { label: "On hand", key: "onHand" }, { label: "To build", key: "toBuild" }, { label: "Needed by", key: "neededBy" },
                { label: "Orders", value: r => r.orders.map(o => `${o.so} ${o.item} x${o.qty} ${o.date || ""}`).join("; ") }
            ], rows);

        downloadCsv(name, [
            { label: "Part", key: "item" }, { label: "Description", key: "description" }, { label: "Type", key: "type" }, { label: "UoM", key: "uom" },
            { label: "Need", key: "need" }, { label: "On hand", key: "onHand" }, { label: "On open POs", key: "onPo" }, { label: "Short", key: "short" },
            { label: "Needs POs", key: "needsPos" }, { label: "Needed by", key: "neededBy" },
            { label: "Next PO", value: r => r.nextPo?.po || "" }, { label: "Next PO date", value: r => r.nextPo?.date || "" }, { label: "Next PO vendor", value: r => r.nextPo?.vendor || "" },
            { label: "PO late", value: r => (r.poLate ? "Yes" : "") },
            { label: "Orders", value: r => r.orders.map(o => `${o.so} ${o.item} x${o.qty} ${o.date || ""}`).join("; ") }
        ], rows);

    }

    const red = RAG_COLORS.red;
    const amber = RAG_COLORS.amber;

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1500, mx: "auto" }}>

                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1.5 }}>
                    {[ALL, ...(data?.lineGroups || ["Team A", "Team B", "SpaceX", "PCB Coating", "Other"])].map(g => <Chip key={g} active={g === group} onClick={() => setGroup(g)}>{g}</Chip>)}
                    <Box sx={{ flex: 1 }} />
                    <TextField size="small" label="Weeks ahead" value={weeksText} onChange={e => setWeeksText(e.target.value)} onBlur={applyWeeks} onKeyDown={e => { if (e.key === "Enter") applyWeeks(); }} sx={{ width: 120 }} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
                    <FormControlLabel control={<Switch checked={holds} onChange={e => setHolds(e.target.checked)} />} label="Include orders on HOLD" />
                    <Button variant="outlined" color="inherit" startIcon={<RefreshIcon />} disabled={loading} onClick={() => load(true)} sx={{ borderColor: tokens.lineStrong }}>
                        {loading ? "Reading QuickBooks…" : "Refresh"}
                    </Button>
                </Box>

                <Box sx={{ fontSize: 13, color: tokens.muted, mb: 2 }}>
                    Open orders due by {data ? md(data.window.horizonEnd) : "—"} (past due included){group !== ALL ? `, ${group} configs only (shared parts show this line's demand only)` : ""}.
                    {" "}QuickBooks read: items {when(data?.asOf.items)} · open orders {when(data?.asOf.orders)} · open POs {when(data?.asOf.pos)}.
                    {data?.throttled && " Refresh is limited to once every 5 minutes; showing the last read."}
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {data?.error && <Alert severity="warning" sx={{ mb: 2 }}>QuickBooks could not be read just now; showing the last good data. ({data.error})</Alert>}
                {!data && loading && <Box sx={{ color: tokens.muted, mb: 2 }}>Reading open orders, POs and BOMs from QuickBooks… (up to about 30 seconds the first time)</Box>}

                {data && (
                    <>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }, border: `1px solid ${tokens.line}`, borderRight: 0, borderBottom: 0, mb: 2 }}>
                            <Tile label="Order lines in window" value={data.demand.lines.toLocaleString()} note={`${data.demand.orders} orders · ${data.demand.later} later · ${data.demand.held} on hold${holds ? " (included)" : " (left out)"}`} />
                            <Tile label="Parts short" value={counts.short} color={counts.short ? red : RAG_COLORS.green} note="need > on hand + open POs" />
                            <Tile label="Parts needing POs" value={counts.needsPos} note="need > on hand" />
                            <Tile label="POs late" value={counts.late} color={counts.late ? amber : undefined} note="next PO after the first ship date" />
                            <Tile label="Assemblies to build" value={counts.builds} note="after finished goods on hand" />
                        </Box>

                        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 1.5 }}>
                            {VIEWS.map(([k, label]) => <Chip key={k} active={view === k} onClick={() => { setView(k); setOpen(null); }}>{label}{counts ? ` · ${k === "parts" ? data.parts.length : counts[k]}` : ""}</Chip>)}
                            <Box sx={{ flex: 1 }} />
                            <TextField size="small" label="Search (part, SO, customer, PO, vendor)" value={q} onChange={e => setQ(e.target.value)} sx={{ width: 320 }} />
                            <Button size="small" startIcon={<DownloadIcon />} onClick={csv} disabled={!rows.length}>CSV</Button>
                        </Box>

                        <Box component="section" aria-label="Material check" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, mb: 2 }}>
                            <Box sx={{ overflowX: "auto" }}>
                                <Box sx={{ minWidth: 1200 }}>

                                    {view === "builds" ? (
                                        <Box sx={{ display: "grid", gridTemplateColumns: BUILD_GRID, gap: 1, ...labelSx, fontSize: 11, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
                                            <span>Assembly</span><span>Description</span><span>Need</span><span>On hand</span><span>To build</span><span>Needed by</span><span>Orders</span>
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: "grid", gridTemplateColumns: PART_GRID, gap: 1, ...labelSx, fontSize: 11, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
                                            <span>Part</span><span>Description</span><span>Need</span><span>On hand</span><span>On PO</span><span>Short</span><span>Next PO</span><span>Needed by</span><span>Orders</span>
                                        </Box>
                                    )}

                                    {rows.length === 0 && <Box sx={{ px: 2.25, py: 2, color: tokens.muted }}>{view === "short" ? "No part is short for this window." : "Nothing here."}</Box>}

                                    {rows.map(r => (
                                        <Fragment key={r.item}>
                                            <Box role="button" tabIndex={0} onClick={() => setOpen(open === r.item ? null : r.item)} onKeyDown={e => { if (e.key === "Enter") setOpen(open === r.item ? null : r.item); }}
                                                sx={{ display: "grid", gridTemplateColumns: view === "builds" ? BUILD_GRID : PART_GRID, gap: 1, alignItems: "center", px: 2.25, py: 0.8, borderBottom: `1px solid ${tokens.line}`, fontSize: 14, cursor: "pointer", bgcolor: open === r.item ? tokens.raised : "transparent", "&:hover": { bgcolor: tokens.raised } }}>
                                                <Box sx={{ fontFamily: tokens.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {view === "builds" ? <Box component={RouterLink} to={`/bom?sku=${encodeURIComponent(r.item)}`} onClick={e => e.stopPropagation()} sx={{ color: tokens.blueText }}>{r.item}</Box> : r.item}
                                                </Box>
                                                <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: r.description ? tokens.text : tokens.muted }} title={r.description || ""}>
                                                    {r.unknown ? "Not in QuickBooks" : r.description || "—"}
                                                </Box>
                                                <Box sx={{ fontFamily: tokens.mono }}>{num(r.need)}</Box>
                                                <Box sx={{ fontFamily: tokens.mono }}>{num(r.onHand)}</Box>
                                                {view === "builds" ? (
                                                    <>
                                                        <Box sx={{ fontFamily: tokens.mono, fontWeight: 700 }}>{num(r.toBuild)}</Box>
                                                        <Box sx={{ color: r.neededBy && data.window.today > r.neededBy ? red : tokens.text }}>{md(r.neededBy)}</Box>
                                                        <Box sx={{ fontFamily: tokens.mono }}>{r.orderCount}</Box>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Box sx={{ fontFamily: tokens.mono }} title={r.poMismatch ? `QuickBooks on order ${num(r.onPo)}; open PO lines add up to ${num(r.poLineSum)}` : ""}>
                                                            {num(r.onPo)}{r.poMismatch && <Box component="span" sx={{ color: amber }}>*</Box>}
                                                        </Box>
                                                        <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, color: r.short > 0 ? red : tokens.muted }}>{r.short > 0 ? num(r.short) : "—"}</Box>
                                                        <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: r.poLate ? amber : tokens.text }} title={r.nextPo ? `PO ${r.nextPo.po} · ${num(r.nextPo.qty)} · ${r.nextPo.vendor || ""}` : ""}>
                                                            {r.nextPo ? `${md(r.nextPo.date)} · ${num(r.nextPo.qty)} · PO ${r.nextPo.po}` : "—"}{r.poLate ? " (late)" : ""}
                                                        </Box>
                                                        <Box sx={{ color: r.pastDue ? red : tokens.text }}>{md(r.neededBy)}</Box>
                                                        <Box sx={{ fontFamily: tokens.mono }}>{r.orderCount}</Box>
                                                    </>
                                                )}
                                            </Box>
                                            {open === r.item && <Detail row={r} />}
                                        </Fragment>
                                    ))}

                                </Box>
                            </Box>
                        </Box>

                        {data.warnings.length > 0 && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                {data.warnings.slice(0, 10).map(w => <div key={w}>{w}</div>)}
                                {data.warnings.length > 10 && <div>… and {data.warnings.length - 10} more</div>}
                            </Alert>
                        )}

                        <Box sx={{ fontSize: 12, color: tokens.muted }}>
                            Need = open order qty (ordered − shipped) exploded through the BOMs; finished goods and sub-assemblies on hand are used first. Short = need − on hand − on order (QuickBooks on order; * = open PO lines don't add up to it). Needed by = earliest ship date of the orders using the part. Orders using a part are listed, not split by quantity.
                        </Box>
                    </>
                )}

            </Box>

            <Footer />

        </Box>

    );

}
