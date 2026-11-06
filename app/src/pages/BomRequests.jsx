import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import CheckIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CancelIcon from "@mui/icons-material/HighlightOff";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { closeRequest, getRequest, listRequests } from "../api/bom";
import { CHANGE_COLORS, CHANGE_LABELS } from "../components/bom/changeColors";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// BOM requests (Nov 6 2026): every BOM change alert sent from
// /bom. Filter by status, dates, text (config, requester,
// component, code); open one for the before/after BOM; the
// person who edits QuickBooks presses DONE (or anyone CANCELS
// with a reason), which replies in the card's Chat thread.
// ?code= opens one (the Chat card's OPEN REQUEST button).
//------------------------------------------------------

const STATUSES = ["OPEN", "DONE", "CANCELLED", "ALL"];
const STATUS_COLORS = { OPEN: "#5AB0E6", DONE: "#3FB950", CANCELLED: "#8B96A3" };
const NAME_KEY = "bomRequestedBy";

const ny = (ms = Date.now()) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const when = ms => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—");
const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const remembered = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };

function lineText(l) {

    if (l.action === "ADD")
        return `ADD ${l.component} qty ${num(l.new_qty)}`;

    if (l.action === "DELETE")
        return `DELETE line ${l.line} ${l.component} (was ${num(l.old_qty)})`;

    return `CHANGE QTY line ${l.line} ${l.component} ${num(l.old_qty)} → ${num(l.new_qty)}`;

}

function Chip({ active, children, onClick }) {

    return (
        <Button size="small" variant={active ? "contained" : "outlined"} color={active ? "primary" : "inherit"} onClick={onClick}
            sx={{ borderColor: tokens.lineStrong, color: active ? undefined : tokens.text, letterSpacing: "1.5px" }}>
            {children}
        </Button>
    );

}

const Status = ({ s }) => <Box component="span" sx={{ color: STATUS_COLORS[s], fontWeight: 700, fontFamily: tokens.display, letterSpacing: "1px" }}>{s}</Box>;

const LIST_GRID = "130px 120px minmax(180px, 1.2fr) 90px minmax(240px, 2fr) 130px 120px 100px";

// Before / after: the BOM as it was when sent, with each change
// shown on its line; added components at the end.
function Diff({ request }) {

    const byLine = new Map(request.lines.filter(l => l.line !== null).map(l => [l.line, l]));
    const adds = request.lines.filter(l => l.action === "ADD");
    const grid = "60px minmax(160px, 1fr) minmax(200px, 2fr) 90px 90px 110px";

    const row = (key, color, cells) => (
        <Box key={key} sx={{ display: "grid", gridTemplateColumns: grid, gap: 1, alignItems: "center", px: 2, py: 0.6, fontSize: 14, borderBottom: `1px solid ${tokens.line}`, borderLeft: `4px solid ${color || "transparent"}`, bgcolor: color ? `${color}1F` : "transparent" }}>
            {cells}
        </Box>
    );

    return (
        <Box sx={{ overflowX: "auto", border: `1px solid ${tokens.line}` }}>
            <Box sx={{ minWidth: 760 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: grid, gap: 1, ...labelSx, fontSize: 11, px: 2, py: 1, borderBottom: `1px solid ${tokens.line}`, borderLeft: "4px solid transparent" }}>
                    <span>Line #</span><span>Component</span><span>Description</span><span>Before</span><span>After</span><span>Change</span>
                </Box>
                {request.snapshot.map(s => {

                    const c = byLine.get(s.line);
                    const color = c ? CHANGE_COLORS[c.action] : null;
                    const struck = c?.action === "DELETE" ? { textDecoration: "line-through", color: tokens.muted } : {};
                    const after = !c ? num(s.qty) : c.action === "DELETE" ? "—" : num(c.new_qty);

                    return row(s.line, color, <>
                        <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{s.line >= 10000 ? "—" : s.line}</Box>
                        <Box sx={{ fontFamily: tokens.mono, ...struck }}>{s.component}</Box>
                        <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...struck }} title={s.description || ""}>{s.description || "—"}</Box>
                        <Box sx={{ fontFamily: tokens.mono }}>{num(s.qty)}</Box>
                        <Box sx={{ fontFamily: tokens.mono, fontWeight: c ? 700 : 400, color: color || tokens.text }}>{after}</Box>
                        <Box sx={{ color, fontWeight: 700, fontSize: 12 }}>{c ? CHANGE_LABELS[c.action].toUpperCase() : ""}</Box>
                    </>);

                })}
                {adds.map(a => row(`add-${a.component}`, CHANGE_COLORS.ADD, <>
                    <Box sx={{ color: CHANGE_COLORS.ADD, fontWeight: 700, fontSize: 12 }}>NEW</Box>
                    <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, color: CHANGE_COLORS.ADD }}>{a.component}</Box>
                    <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.description || ""}>{a.description || "—"}</Box>
                    <Box sx={{ fontFamily: tokens.mono }}>—</Box>
                    <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, color: CHANGE_COLORS.ADD }}>{num(a.new_qty)}</Box>
                    <Box sx={{ color: CHANGE_COLORS.ADD, fontWeight: 700, fontSize: 12 }}>ADD</Box>
                </>))}
            </Box>
        </Box>
    );

}

function CloseDialog({ kind, request, onClose, onDone }) {

    const [by, setBy] = useState(remembered);
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const done = kind === "done";

    async function save() {

        setBusy(true);
        setError("");

        try {

            const r = await closeRequest(request.code, kind, { by, note });

            try { localStorage.setItem(NAME_KEY, by.trim()); } catch { /* private window */ }

            onDone(r.request);

        } catch (err) {

            setError(err.message);

        } finally {

            setBusy(false);

        }

    }

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{done ? `Mark ${request.code} done` : `Cancel ${request.code}`}</DialogTitle>
            <DialogContent>
                <Box sx={{ color: tokens.muted, fontSize: 14, mb: 2 }}>
                    {done ? "Only after the BOM is edited in QuickBooks. A reply goes to the request's thread in the BOM alert space." : "The request is no longer needed (or was sent by mistake). A reply goes to its Chat thread."}
                </Box>
                <TextField fullWidth size="small" label="Your name" value={by} onChange={e => setBy(e.target.value)} sx={{ mb: 2 }} slotProps={{ htmlInput: { maxLength: 60 } }} />
                <TextField fullWidth size="small" label={done ? "Note (optional)" : "Why cancel?"} value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>Back</Button>
                <Button variant="contained" color={done ? "success" : "error"} disabled={busy || !by.trim() || (!done && !note.trim())} onClick={save}>
                    {done ? "Done in QuickBooks" : "Cancel request"}
                </Button>
            </DialogActions>
        </Dialog>
    );

}

function Detail({ code, onChanged }) {

    const [request, setRequest] = useState(null);
    const [error, setError] = useState("");
    const [closing, setClosing] = useState(null);

    const load = useCallback(() => getRequest(code).then(r => { setRequest(r.request); setError(""); }, err => setError(err.message)), [code]);

    useEffect(() => { load(); }, [load]);

    if (error)
        return <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>;

    if (!request)
        return null;

    const facts = [
        ["Sent", `${when(request.requested_at)} by ${request.requested_by}`],
        ["Reason", request.reason],
        ["NCM / ECO", request.reference || "—"],
        ["Note", request.note || "—"],
        ["BOM read from QuickBooks", when(request.bom_as_of)],
        ["Chat", request.chat_sent_at ? `Posted ${when(request.chat_sent_at)}` : request.chat_error || "Sending…"],
        ...(request.status !== "OPEN" ? [[request.status === "DONE" ? "Done" : "Cancelled", `${when(request.closed_at)} by ${request.closed_by}${request.close_note ? `: ${request.close_note}` : ""}`]] : [])
    ];

    return (
        <Box component="section" aria-label={`Request ${request.code}`} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.lineStrong}`, mb: 2.5 }}>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                <Box>
                    <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 22, letterSpacing: "1.5px" }}>{request.code} · <Status s={request.status} /></Box>
                    <Box sx={{ fontSize: 14 }}>
                        <Box component={RouterLink} to={`/bom?sku=${encodeURIComponent(request.sku)}`} sx={{ color: tokens.blueText, fontFamily: tokens.mono }}>{request.sku}</Box>
                        <Box component="span" sx={{ color: tokens.muted }}> · {request.sku_description || "—"} · {request.line_group || "Other"}</Box>
                    </Box>
                </Box>
                <Box sx={{ flex: 1 }} />
                {request.status === "OPEN" && <>
                    <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => setClosing("done")}>Done in QuickBooks</Button>
                    <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => setClosing("cancel")} sx={{ borderColor: tokens.lineStrong }}>Cancel request</Button>
                </>}
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5, px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                {facts.map(([k, v]) => (
                    <Box key={k}>
                        <Box sx={{ ...labelSx, fontSize: 11 }}>{k}</Box>
                        <Box sx={{ fontSize: 14, color: k === "Chat" && !request.chat_sent_at ? "#F2A33A" : tokens.text }}>{v}</Box>
                    </Box>
                ))}
            </Box>

            <Box sx={{ px: 2.25, py: 1.5 }}>
                <Box sx={{ ...labelSx, fontSize: 12, mb: 1 }}>BOM before → after ({request.lines.length} change{request.lines.length === 1 ? "" : "s"})</Box>
                <Diff request={request} />
            </Box>

            {closing && <CloseDialog kind={closing} request={request} onClose={() => setClosing(null)} onDone={() => { setClosing(null); load(); onChanged(); }} />}

        </Box>
    );

}

export default function BomRequests() {

    const clock = useClock();
    const [params, setParams] = useSearchParams();
    const code = params.get("code") || "";

    const [status, setStatus] = useState(code ? "ALL" : "OPEN");
    const [from, setFrom] = useState(code ? "" : ny(Date.now() - 90 * 86400000));
    const [to, setTo] = useState("");
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {

        try {

            setData(await listRequests({ status: status === "ALL" ? "" : status, from, to }));
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, [status, from, to]);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => {

        const t = q.trim().toLowerCase();

        if (!data)
            return [];

        return t ? data.requests.filter(r => [r.code, r.sku, r.sku_description, r.requested_by, r.reason, r.reference, r.line_group, ...r.lines.map(l => l.component)].some(v => String(v || "").toLowerCase().includes(t))) : data.requests;

    }, [data, q]);

    function csv() {

        const out = rows.flatMap(r => r.lines.map(l => ({ ...r, l })));

        downloadCsv(`BOM_requests_${ny()}.csv`, [
            { label: "Request", key: "code" },
            { label: "Sent", value: r => when(r.requested_at) },
            { label: "Config", key: "sku" },
            { label: "Line group", key: "line_group" },
            { label: "Action", value: r => r.l.action },
            { label: "BOM line #", value: r => r.l.line ?? "" },
            { label: "Component", value: r => r.l.component },
            { label: "Description", value: r => r.l.description },
            { label: "Old qty", value: r => r.l.old_qty ?? "" },
            { label: "New qty", value: r => r.l.new_qty ?? "" },
            { label: "Reason", key: "reason" },
            { label: "NCM / ECO", key: "reference" },
            { label: "Requested by", key: "requested_by" },
            { label: "Status", key: "status" },
            { label: "Closed by", key: "closed_by" },
            { label: "Closed", value: r => (r.closed_at ? when(r.closed_at) : "") },
            { label: "Close note", key: "close_note" }
        ], out);

    }

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1400, mx: "auto" }}>

                {code && <Detail key={code} code={code} onChanged={load} />}

                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>
                    {STATUSES.map(s => <Chip key={s} active={s === status} onClick={() => setStatus(s)}>{s}</Chip>)}
                    <Box sx={{ flex: 1 }} />
                    <TextField size="small" type="date" label="From" value={from} onChange={e => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField size="small" type="date" label="To" value={to} onChange={e => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField size="small" label="Search (config, part, name, code)" value={q} onChange={e => setQ(e.target.value)} sx={{ width: 280 }} />
                    <Button size="small" startIcon={<DownloadIcon />} onClick={csv} disabled={!rows.length}>CSV</Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Box component="section" aria-label="BOM requests" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>
                    <Box sx={{ overflowX: "auto" }}>
                        <Box sx={{ minWidth: 1150 }}>
                            <Box sx={{ display: "grid", gridTemplateColumns: LIST_GRID, gap: 1, ...labelSx, fontSize: 11, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
                                <span>Request</span><span>Sent</span><span>Config</span><span>Line</span><span>Changes</span><span>Reason</span><span>Requested by</span><span>Status</span>
                            </Box>
                            {data && rows.length === 0 && <Box sx={{ px: 2.25, py: 2, color: tokens.muted }}>No BOM requests here. Send one from PAGES → BOM viewer → Request a change.</Box>}
                            {rows.map(r => (
                                <Box key={r.code} role="button" tabIndex={0} onClick={() => setParams({ code: r.code })} onKeyDown={e => { if (e.key === "Enter") setParams({ code: r.code }); }}
                                    sx={{ display: "grid", gridTemplateColumns: LIST_GRID, gap: 1, alignItems: "center", px: 2.25, py: 0.9, borderBottom: `1px solid ${tokens.line}`, fontSize: 14, cursor: "pointer", bgcolor: r.code === code ? tokens.raised : "transparent", "&:hover": { bgcolor: tokens.raised } }}>
                                    <Box sx={{ fontFamily: tokens.mono }}>{r.code}</Box>
                                    <Box sx={{ color: tokens.muted }}>{when(r.requested_at)}</Box>
                                    <Box sx={{ fontFamily: tokens.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.sku_description || ""}>{r.sku}</Box>
                                    <Box sx={{ color: tokens.muted }}>{r.line_group || "Other"}</Box>
                                    <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.lines.map(lineText).join("\n")}>
                                        {r.lines.map(l => <Box key={l.id} component="span" sx={{ color: CHANGE_COLORS[l.action], mr: 1.5, fontFamily: tokens.mono, fontSize: 13 }}>{l.action === "ADD" ? "+" : l.action === "DELETE" ? "−" : "Δ"} {l.component}</Box>)}
                                    </Box>
                                    <Box>{r.reason}</Box>
                                    <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.requested_by}</Box>
                                    <Box><Status s={r.status} />{!r.chat_sent_at && <Box component="span" title={r.chat_error || "Chat not sent yet"} sx={{ ml: 0.75, color: "#F2A33A" }}>!</Box>}</Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>

            </Box>

            <Footer />

        </Box>

    );

}
