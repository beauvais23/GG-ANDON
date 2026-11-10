import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, IconButton, MenuItem, TextField } from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import CloseIcon from "@mui/icons-material/Close";
import UploadIcon from "@mui/icons-material/FileUploadOutlined";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { clearBacklogNote, getBacklog, getBacklogHistory, importBacklogNotes, saveBacklogNote } from "../api/backlog";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Backlog & delivery risk (Director, Nov 10 2026). Every open
// sales order by promise date, RAG from date + material (stock
// and POs allocated in promise-date order), and notes kept per
// SO across refreshes: recovery date, material clear date, ops
// comment, sales note, last updated by / when. Any login edits
// with a typed name (remembered per browser).
//------------------------------------------------------

const RAG = {
    RED: { color: "#F85149", label: "Late / short" },
    AMBER: { color: "#F2A33A", label: "At risk" },
    GREEN: { color: "#3FB950", label: "Covered" },
    GREY: { color: "#8B96A3", label: "Hold / blanket / unscheduled" }
};

const VIEWS = [
    { key: "risk", label: "Late & at risk", test: s => s.rag === "RED" || s.rag === "AMBER" },
    { key: "late", label: "Late", test: s => s.status === "LATE" },
    { key: "all", label: "All dated", test: s => s.kind === "DATED" },
    { key: "grey", label: "Hold / blanket / unscheduled", test: s => s.rag === "GREY" },
    { key: "every", label: "Everything", test: () => true }
];

const LINES = ["All", "Team A", "Team B", "SpaceX", "PCB Coating", "Other"];

const money = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const md = d => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}` : "—");
const when = ms => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

const storedName = () => { try { return localStorage.getItem("backlogBy") || ""; } catch { return ""; } };
const rememberName = n => { try { localStorage.setItem("backlogBy", n); } catch { /* private window */ } };

function Dot({ rag }) {

    return <Box component="span" title={RAG[rag]?.label} sx={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", bgcolor: RAG[rag]?.color || tokens.muted, flexShrink: 0 }} />;

}

function Chip({ active, children, onClick }) {

    return (
        <Button size="small" variant={active ? "contained" : "outlined"} color={active ? "primary" : "inherit"} onClick={onClick}
            sx={{ borderColor: tokens.lineStrong, color: active ? undefined : tokens.text, letterSpacing: "1px", whiteSpace: "nowrap" }}>
            {children}
        </Button>
    );

}

function Tile({ label, value, sub, color }) {

    return (
        <Box sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, borderTop: `3px solid ${color || tokens.lineStrong}`, px: 2, py: 1.25, minWidth: 0 }}>
            <Box sx={{ ...labelSx, fontSize: 11 }}>{label}</Box>
            <Box sx={{ fontFamily: tokens.display, fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{value}</Box>
            {sub && <Box sx={{ color: tokens.muted, fontSize: 13 }}>{sub}</Box>}
        </Box>
    );

}

const RECOVERY_COLOR = { "NEEDS DATE": "#F85149", MISSED: "#F85149", "ON PLAN": "#3FB950" };

const GRID = "18px 78px minmax(160px, 1.5fr) 92px 92px 70px 78px 70px 96px minmax(200px, 2fr) 110px minmax(160px, 1.6fr)";

function OrderRow({ s, onOpen }) {

    const n = s.note;

    return (
        <Box role="button" tabIndex={0} onClick={() => onOpen(s.so)} onKeyDown={e => { if (e.key === "Enter") onOpen(s.so); }}
            sx={{ display: "grid", gridTemplateColumns: { xs: "18px 1fr", lg: GRID }, gap: 1, alignItems: "center", px: 2, py: 0.9, borderBottom: `1px solid ${tokens.line}`, fontSize: 14, cursor: "pointer", "&:hover": { bgcolor: tokens.raised } }}>
            <Dot rag={s.rag} />
            <Box sx={{ fontFamily: tokens.mono, fontWeight: 700 }}>{s.so}</Box>
            <Box sx={{ minWidth: 0 }}>
                <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.customer}</Box>
                {s.project && <Box sx={{ color: tokens.muted, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.project}</Box>}
            </Box>
            <Box sx={{ display: { xs: "none", lg: "block" } }}>{s.lineGroup}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, color: tokens.muted }}>{s.industry || "—"}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, color: tokens.muted, fontFamily: tokens.mono, fontSize: 12.5 }}>{s.rep || "—"}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" } }}>{md(s.promise)}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, color: s.daysTo < 0 && s.rag !== "GREY" ? "#F85149" : s.rag === "GREY" ? tokens.muted : tokens.text }}>{s.daysTo === null ? "—" : s.daysTo < 0 ? `${-s.daysTo} late` : `${s.daysTo} d`}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, textAlign: "right" }}>{money(s.openValue)}</Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, fontSize: 13 }}>
                <Box component="span" sx={{ fontWeight: 700, color: RAG[s.rag]?.color }}>{s.status}</Box>
                {s.reasons.length > 0 && <Box component="span" sx={{ color: tokens.muted }}> · {s.reasons.join(" · ")}</Box>}
            </Box>
            <Box sx={{ display: { xs: "none", lg: "block" } }}>
                {n?.recovery_date ? md(n.recovery_date) : "—"}
                {s.recoveryStatus && <Box sx={{ fontSize: 11, fontWeight: 700, color: RECOVERY_COLOR[s.recoveryStatus] }}>{s.recoveryStatus}</Box>}
            </Box>
            <Box sx={{ display: { xs: "none", lg: "block" }, fontSize: 12.5, color: tokens.muted, minWidth: 0 }}>
                {n?.ops_comment && <Box sx={{ color: tokens.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.ops_comment}</Box>}
                {n?.sales_note && <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Sales: {n.sales_note}</Box>}
                {n?.updated_at && <Box sx={{ fontSize: 11 }}>{n.updated_by} · {when(n.updated_at)}</Box>}
            </Box>
            <Box sx={{ display: { xs: "block", lg: "none" }, gridColumn: "2", fontSize: 13, color: tokens.muted }}>
                {md(s.promise)} · {money(s.openValue)} · <Box component="span" sx={{ color: RAG[s.rag]?.color, fontWeight: 700 }}>{s.status}</Box>
                {s.recoveryStatus ? ` · ${s.recoveryStatus}` : ""}
            </Box>
        </Box>
    );

}

const FIELD_LABEL = { recovery_date: "Recovery date", material_clear_date: "Material clear date", ops_comment: "Ops comment", sales_note: "Sales note" };

function Detail({ s, onClose, onSaved }) {

    const n = s.note || {};
    const [by, setBy] = useState(storedName());
    const [form, setForm] = useState({ recoveryDate: n.recovery_date || "", materialClearDate: n.material_clear_date || "", opsComment: n.ops_comment || "", salesNote: n.sales_note || "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [history, setHistory] = useState([]);

    useEffect(() => { getBacklogHistory(s.so).then(r => setHistory(r.history)).catch(() => setHistory([])); }, [s.so]);

    const act = async fn => {

        if (!by.trim()) { setError("Type your name first."); return; }

        setBusy(true);
        setError("");

        try { rememberName(by.trim()); await fn(); onSaved(); }

        catch (err) { setError(err.message); }

        finally { setBusy(false); }

    };

    const set = k => e => setForm({ ...form, [k]: e.target.value });

    return (
        <Box sx={{ width: { xs: "100vw", md: 640 }, bgcolor: tokens.panel, minHeight: "100%" }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${tokens.line}`, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                <Dot rag={s.rag} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontFamily: tokens.mono, fontSize: 20, fontWeight: 700 }}>SO {s.so}</Box>
                    <Box>{s.customer}{s.project ? ` · ${s.project}` : ""}</Box>
                    <Box sx={{ color: tokens.muted, fontSize: 13 }}>{s.lineGroup} · {s.industry || "no channel"} · {s.rep || "no rep"} · promise {md(s.promise)} · {money(s.openValue)} open</Box>
                    <Box sx={{ mt: 0.75, fontSize: 13.5 }}><b style={{ color: RAG[s.rag]?.color }}>{s.status}</b>{s.reasons.length ? ` · ${s.reasons.join(" · ")}` : ""}</Box>
                </Box>
                <IconButton aria-label="Close" onClick={onClose} sx={{ color: tokens.muted }}><CloseIcon /></IconButton>
            </Box>

            <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${tokens.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                <TextField label="Recovery date" type="date" size="small" value={form.recoveryDate} onChange={set("recoveryDate")} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Material clear date" type="date" size="small" value={form.materialClearDate} onChange={set("materialClearDate")} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="Ops comment" size="small" multiline minRows={2} value={form.opsComment} onChange={set("opsComment")} sx={{ gridColumn: "1 / -1" }} slotProps={{ htmlInput: { maxLength: 1000 } }} />
                <TextField label="Sales note (customer view)" size="small" multiline minRows={2} value={form.salesNote} onChange={set("salesNote")} sx={{ gridColumn: "1 / -1" }}
                    placeholder="e.g. Stocking order, customer OK until 12/1 · Holding installation, need ASAP" slotProps={{ htmlInput: { maxLength: 1000 } }} />
                <TextField label="Your name" size="small" value={by} onChange={e => setBy(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
                <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", alignItems: "center" }}>
                    <Button color="inherit" disabled={busy || !s.note} onClick={() => act(() => clearBacklogNote(s.so, by.trim()))}>Clear all</Button>
                    <Button variant="contained" disabled={busy} onClick={() => act(() => saveBacklogNote(s.so, { ...form, by: by.trim() }))}>Save</Button>
                </Box>
                {error && <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>{error}</Alert>}
                {s.note?.updated_at && <Box sx={{ gridColumn: "1 / -1", color: tokens.muted, fontSize: 12.5 }}>Last updated by {s.note.updated_by}, {when(s.note.updated_at)}. Kept on every refresh until cleared.</Box>}
            </Box>

            <Box sx={{ px: 2.5, pt: 1.5, ...labelSx, fontSize: 12 }}>Open lines</Box>
            {s.lines.map(l => (
                <Box key={`${l.line}-${l.item}`} sx={{ px: 2.5, py: 0.9, borderBottom: `1px solid ${tokens.line}`, fontSize: 13.5 }}>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, flex: 1 }}>{l.item}</Box>
                        <Box>{num(l.open)} open · {money(l.open * l.price)}</Box>
                    </Box>
                    <Box sx={{ color: tokens.muted, fontSize: 12.5 }}>{l.description || "—"} · ship {md(l.date)}{l.fromStock ? ` · ${num(l.fromStock)} from stock` : ""}{l.poEta ? ` · PO ETA ${md(l.poEta)}${l.latePo ? " (late PO)" : ""}` : ""}</Box>
                    {l.shortParts.map(p => (
                        <Box key={p.part} sx={{ color: "#F85149", fontSize: 12.5 }}>
                            {p.short > 0 ? `Short ${p.part} × ${num(p.short)}` : `${p.part}: waiting on PO ${p.po} due ${md(p.poEta)}`}
                            {p.short > 0 ? (p.nextPo ? ` · next PO ${p.nextPo.po}${p.nextPo.eta ? ` (${md(p.nextPo.eta)})` : ""}` : " · no PO") : ""}
                        </Box>
                    ))}
                </Box>
            ))}

            {history.length > 0 && (
                <>
                    <Box sx={{ px: 2.5, pt: 2, ...labelSx, fontSize: 12 }}>Change history</Box>
                    {history.slice(0, 30).map((h, i) => (
                        <Box key={i} sx={{ px: 2.5, py: 0.5, fontSize: 12.5, color: tokens.muted }}>
                            {when(h.changed_at)} · <b style={{ color: tokens.text }}>{h.changed_by}</b> · {FIELD_LABEL[h.field] || h.field}: {h.old_value || "—"} → {h.new_value || "—"}
                        </Box>
                    ))}
                </>
            )}
        </Box>
    );

}

function ImportDialog({ open, onClose, onDone }) {

    const [text, setText] = useState("");
    const [by, setBy] = useState(storedName());
    const [msg, setMsg] = useState(null);

    const run = async () => {

        setMsg(null);

        try {

            const r = await importBacklogNotes(text, by.trim());

            setMsg({ ok: true, text: `${r.saved} of ${r.rows} rows saved.` });
            onDone();

        }

        catch (err) { setMsg({ ok: false, text: [err.message, ...(err.data?.errors || []).slice(0, 8)].join(" · ") }); }

    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Import notes</DialogTitle>
            <DialogContent>
                <Box sx={{ color: tokens.muted, fontSize: 13.5, mb: 1 }}>Paste rows: SO# <i>tab</i> recovery date <i>tab</i> comment (e.g. from the Ship Report). A header row is skipped; blanks never overwrite. All rows or none.</Box>
                <TextField multiline minRows={8} fullWidth value={text} onChange={e => setText(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: tokens.mono, fontSize: 13 } } }} />
                <TextField label="Your name" size="small" value={by} onChange={e => setBy(e.target.value)} sx={{ mt: 1.5 }} />
                {msg && <Alert severity={msg.ok ? "success" : "error"} sx={{ mt: 1.5 }}>{msg.text}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button variant="contained" disabled={!text.trim() || !by.trim()} onClick={run}>Import</Button>
            </DialogActions>
        </Dialog>
    );

}

function Backlog() {

    const clock = useClock();
    const isAdmin = (() => { try { return localStorage.getItem("userRole") === "admin"; } catch { return false; } })();

    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState("risk");
    const [line, setLine] = useState("All");
    const [channel, setChannel] = useState("All");
    const [rep, setRep] = useState("All");
    const [q, setQ] = useState("");
    const [tab, setTab] = useState("orders");
    const [open, setOpen] = useState(null);
    const [importing, setImporting] = useState(false);

    const load = useCallback(async refresh => {

        setLoading(true);

        try { setData(await getBacklog(refresh)); setError(""); }

        catch (err) { setError(err.message); }

        finally { setLoading(false); }

    }, []);

    useEffect(() => { load(false); }, [load]);

    const channels = useMemo(() => ["All", ...new Set((data?.sos || []).map(s => s.industry).filter(Boolean))], [data]);
    const reps = useMemo(() => ["All", ...[...new Set((data?.sos || []).map(s => s.rep).filter(Boolean))].sort()], [data]);

    const rows = useMemo(() => {

        if (!data)
            return [];

        const v = VIEWS.find(x => x.key === view);
        const term = q.trim().toLowerCase();

        return data.sos.filter(s => v.test(s)
            && (line === "All" || s.lineGroup === line)
            && (channel === "All" || s.industry === channel)
            && (rep === "All" || s.rep === rep)
            && (!term || [s.so, s.customer, s.project, ...s.lines.map(l => l.item)].some(x => String(x || "").toLowerCase().includes(term))));

    }, [data, view, line, channel, rep, q]);

    const current = data?.sos.find(s => s.so === open) || null;
    const t = data?.totals;
    const pct = t && t.scheduledValue ? Math.round(((t.red.value + t.amber.value) / t.scheduledValue) * 1000) / 10 : 0;

    const exportCsv = () => downloadCsv(`backlog-${data.today}.csv`, [
        { label: "RAG", key: "rag" }, { label: "Status", key: "status" }, { label: "SO#", key: "so" }, { label: "Customer", key: "customer" }, { label: "Project", key: "project" },
        { label: "Line", key: "lineGroup" }, { label: "Channel", key: "industry" }, { label: "Rep", key: "rep" }, { label: "Promise date", key: "promise" },
        { label: "Days to promise", key: "daysTo" }, { label: "Open $", key: "openValue" }, { label: "Reason", value: r => r.reasons.join("; ") },
        { label: "Recovery date", value: r => r.note?.recovery_date || "" }, { label: "Recovery status", key: "recoveryStatus" },
        { label: "Material clear date", value: r => r.note?.material_clear_date || "" }, { label: "Ops comment", value: r => r.note?.ops_comment || "" },
        { label: "Sales note", value: r => r.note?.sales_note || "" }, { label: "Last updated by", value: r => r.note?.updated_by || "" },
        { label: "Last updated", value: r => (r.note?.updated_at ? new Date(r.note.updated_at).toISOString().slice(0, 16).replace("T", " ") : "") }
    ], rows);

    const exportShort = () => downloadCsv(`shortages-${data.today}.csv`, [
        { label: "Part", key: "part" }, { label: "Description", key: "description" }, { label: "Short", key: "short" }, { label: "On hand", key: "onHand" },
        { label: "On order", key: "onOrder" }, { label: "Next PO", value: r => r.nextPo?.po || "" }, { label: "PO ETA", value: r => r.nextPo?.eta || "" },
        { label: "SOs affected", value: r => r.sos.join(" ") }
    ], data.shortages);

    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, p: { xs: 1.5, md: 2.5 }, minWidth: 0 }}>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {data?.error && <Alert severity="warning" sx={{ mb: 2 }}>QuickBooks read failed; showing the last good data. {data.error}</Alert>}
                {!data && !error && <CircularProgress />}

                {data && (
                    <>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1.5, mb: 2 }}>
                            <Tile label="Late" value={t.late.count} sub={`${money(t.late.value)} · ${t.needsDate} need a date · ${t.missed} missed`} color={RAG.RED.color} />
                            <Tile label="Late or short (red)" value={t.red.count} sub={money(t.red.value)} color={RAG.RED.color} />
                            <Tile label="At risk (amber)" value={t.amber.count} sub={money(t.amber.value)} color={RAG.AMBER.color} />
                            <Tile label="Covered" value={t.green.count} sub={money(t.green.value)} color={RAG.GREEN.color} />
                            <Tile label="Red + amber share" value={`${pct}%`} sub={`of ${money(t.scheduledValue)} scheduled`} />
                        </Box>

                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
                            <Chip active={tab === "orders"} onClick={() => setTab("orders")}>Orders</Chip>
                            <Chip active={tab === "short"} onClick={() => setTab("short")}>Shortages ({data.shortages.length})</Chip>
                            <Box sx={{ flex: 1 }} />
                            <Box sx={{ color: tokens.muted, fontSize: 12.5 }}>QuickBooks orders as of {when(data.asOf.orders)} · today {md(data.today)} · amber = due within {data.amberDays} days</Box>
                            <Button size="small" startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />} disabled={loading} onClick={() => load(true)}>Refresh</Button>
                            {isAdmin && <Button size="small" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>Import notes</Button>}
                        </Box>

                        {tab === "orders" && (
                            <Box component="section" aria-label="Orders" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>
                                <Box sx={{ p: 1.5, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${tokens.line}` }}>
                                    {VIEWS.map(v => <Chip key={v.key} active={view === v.key} onClick={() => setView(v.key)}>{v.label}</Chip>)}
                                    <Box sx={{ width: 12 }} />
                                    {LINES.map(l => <Chip key={l} active={line === l} onClick={() => setLine(l)}>{l}</Chip>)}
                                </Box>
                                <Box sx={{ p: 1.5, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${tokens.line}` }}>
                                    <TextField select size="small" label="Channel" value={channel} onChange={e => setChannel(e.target.value)} sx={{ minWidth: 150 }}>
                                        {channels.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                    </TextField>
                                    <TextField select size="small" label="Rep" value={rep} onChange={e => setRep(e.target.value)} sx={{ minWidth: 150 }}>
                                        {reps.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                    </TextField>
                                    <TextField size="small" placeholder="Search SO, customer, project, item" value={q} onChange={e => setQ(e.target.value)} sx={{ minWidth: 260, flex: 1 }} />
                                    <Box sx={{ color: tokens.muted, fontSize: 13 }}>{rows.length} orders · {money(rows.reduce((s, r) => s + r.openValue, 0))}</Box>
                                    <Button size="small" startIcon={<DownloadIcon />} onClick={exportCsv}>CSV</Button>
                                </Box>

                                <Box sx={{ display: { xs: "none", lg: "grid" }, gridTemplateColumns: GRID, gap: 1, px: 2, py: 0.75, borderBottom: `1px solid ${tokens.lineStrong}` }}>
                                    {["", "SO#", "Customer / project", "Line", "Channel", "Rep", "Promise", "Days", "Open $", "Status · reason", "Recovery", "Notes · updated"].map(h => (
                                        <Box key={h} sx={{ ...labelSx, fontSize: 11, textAlign: h === "Open $" ? "right" : "left" }}>{h}</Box>
                                    ))}
                                </Box>

                                {rows.map(s => <OrderRow key={s.so} s={s} onOpen={setOpen} />)}
                                {!rows.length && <Box sx={{ p: 2.5, color: tokens.muted }}>No orders in this view.</Box>}
                            </Box>
                        )}

                        {tab === "short" && (
                            <Box component="section" aria-label="Shortages" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>
                                <Box sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${tokens.line}` }}>
                                    <Box sx={{ color: tokens.muted, fontSize: 13.5, flex: 1 }}>Parts short for late and at-risk orders, after stock and open POs are allocated in promise-date order.</Box>
                                    <Button size="small" startIcon={<DownloadIcon />} onClick={exportShort}>CSV</Button>
                                </Box>
                                {data.shortages.map(p => (
                                    <Box key={p.part} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "180px minmax(200px, 2fr) 90px 90px 90px minmax(150px, 1fr) minmax(160px, 1.5fr)" }, gap: 1, px: 2, py: 0.9, borderBottom: `1px solid ${tokens.line}`, fontSize: 14, alignItems: "center" }}>
                                        <Box sx={{ fontFamily: tokens.mono, fontWeight: 700 }}>{p.part}</Box>
                                        <Box sx={{ color: tokens.muted, fontSize: 13 }}>{p.description || "—"}</Box>
                                        <Box sx={{ color: p.short > 0 ? "#F85149" : "#F2A33A", fontWeight: 700 }}>{p.short > 0 ? `${num(p.short)} short` : "waiting on PO"}</Box>
                                        <Box>{num(p.onHand)} on hand</Box>
                                        <Box>{num(p.onOrder)} on order</Box>
                                        <Box>{p.nextPo ? `PO ${p.nextPo.po}${p.nextPo.eta ? ` · ${md(p.nextPo.eta)}` : ""}` : <span style={{ color: "#F85149" }}>no PO</span>}</Box>
                                        <Box sx={{ fontSize: 13, color: tokens.muted }}>{p.sos.length} SO{p.sos.length === 1 ? "" : "s"}: {p.sos.join(", ")}</Box>
                                    </Box>
                                ))}
                                {!data.shortages.length && <Box sx={{ p: 2.5, color: tokens.muted }}>No shortages.</Box>}
                            </Box>
                        )}
                    </>
                )}

            </Box>

            <Drawer anchor="right" open={Boolean(current)} onClose={() => setOpen(null)}>
                {current && <Detail key={current.so + (current.note?.updated_at || "")} s={current} onClose={() => setOpen(null)} onSaved={() => load(false)} />}
            </Drawer>

            <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={() => load(false)} />

            <Footer />

        </Box>
    );

}

export default Backlog;
