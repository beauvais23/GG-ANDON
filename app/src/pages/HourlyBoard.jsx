import { useCallback, useEffect, useState } from "react";

import { Alert, Autocomplete, Box, Button, IconButton, TextField } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import Header from "../components/Header";
import CorrectionDialog from "../components/CorrectionDialog";
import Footer from "../components/Footer";

import useClock from "../hooks/useClock";

import { getBoards, getPlan, getProducts, savePlan } from "../api/hourly";
import { labelSx, tokens } from "../theme/theme";
import { RAG_COLORS } from "../config/ragColors";
import { fpyColor } from "../config/fpyColors";

//------------------------------------------------------
// Hour-by-hour board (H1): plan per hour for one board and
// day, from the day's runs (SKU + qty, single piece flow).
// Plan per hour = ROUNDDOWN(rate × work minutes / 60), with
// the run's last hour trued up to its qty (server side,
// services/hourlyPlan.js). Admins edit the plan; everyone can view.
// H2: Actual per hour from the count station taps, with RAG
// (finished hours vs plan, the current hour vs the plan so far);
// refreshed every 30 s.
//------------------------------------------------------

const BOARD_KEY = "hourlyBoard";

function readBoard() {

    try { return localStorage.getItem(BOARD_KEY) || ""; } catch { return ""; }

}

function rememberBoard(board) {

    try { localStorage.setItem(BOARD_KEY, board); } catch { /* per-browser convenience only */ }

}

function Chip({ active, children, onClick }) {

    return (

        <Button
            size="small"
            variant={active ? "contained" : "outlined"}
            color={active ? "primary" : "inherit"}
            onClick={onClick}
            sx={{ borderColor: tokens.lineStrong, color: active ? undefined : tokens.text, letterSpacing: "1.5px" }}
        >
            {children}
        </Button>

    );

}

function PlanEditor({ board, date, plan, skuOptions, onSaved, onClose }) {

    const [rows, setRows] = useState(() => (plan.runs.length ? plan.runs : [{ sku: "", qty: null }]).map(r => ({ sku: r.sku, qty: r.qty ?? "" })));
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const set = (i, field, value) => setRows(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

    const move = (i, d) => {

        const next = [...rows];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        setRows(next);

    };

    async function save() {

        setSaving(true);
        setError("");

        try {

            const runs = rows.filter(r => r.sku.trim()).map(r => ({ sku: r.sku.trim(), qty: r.qty === "" ? null : Number(r.qty) }));

            onSaved(await savePlan(board, date, runs));

        } catch (err) {

            setError(err.message);

        } finally {

            setSaving(false);

        }

    }

    return (

        <Box component="section" aria-label="Edit plan" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.blue}`, mb: 2.5 }}>

            <Box sx={{ ...labelSx, px: 2.25, py: 1.25, borderBottom: `1px solid ${tokens.line}` }}>
                Edit plan · {board} · {date} · runs in order (single piece flow)
            </Box>

            {rows.map((r, i) => (

                <Box key={i} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>

                    <Box sx={{ fontFamily: tokens.mono, color: tokens.muted, width: 24 }}>{i + 1}</Box>

                    {skuOptions.length ? (

                        // Dropdown of this board's SKUs (Admin → Products & rates), grouped by family;
                        // typing filters it.
                        <Autocomplete
                            size="small"
                            openOnFocus
                            autoHighlight
                            options={skuOptions.some(o => o.sku === r.sku) || !r.sku ? skuOptions : [{ sku: r.sku, prefix: "Not on the SKU list" }, ...skuOptions]}
                            groupBy={skuOptions.some(o => o.sku !== o.prefix) ? o => o.prefix : undefined}
                            getOptionLabel={o => o.sku}
                            isOptionEqualToValue={(o, v) => o.sku === v.sku}
                            value={r.sku ? { sku: r.sku, prefix: "" } : null}
                            onChange={(e, o) => set(i, "sku", o?.sku || "")}
                            sx={{ minWidth: 380 }}
                            slotProps={{ listbox: { sx: { maxHeight: 420 } } }}
                            renderInput={params => <TextField {...params} label="SKU" placeholder="Pick a SKU (type to filter)" slotProps={{ ...params.slotProps, inputLabel: { shrink: true } }} />}
                        />

                    ) : (

                        <TextField size="small" label="SKU" value={r.sku} onChange={e => set(i, "sku", e.target.value.toUpperCase())} sx={{ minWidth: 380 }} slotProps={{ inputLabel: { shrink: true } }} />

                    )}

                    <TextField
                        size="small"
                        label="Qty"
                        type="number"
                        value={r.qty}
                        placeholder={i === rows.length - 1 ? "rest of shift" : ""}
                        onChange={e => set(i, "qty", e.target.value)}
                        sx={{ width: 140 }}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1 } }}
                    />

                    <IconButton size="small" aria-label={`Move run ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><KeyboardArrowUpIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Move run ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><KeyboardArrowDownIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Delete run ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} sx={{ color: tokens.muted }}><DeleteOutlineIcon fontSize="small" /></IconButton>

                </Box>

            ))}

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, py: 1.5 }}>

                <Button startIcon={<AddIcon />} onClick={() => setRows([...rows, { sku: "", qty: "" }])}>Add run</Button>

                <Box sx={{ fontSize: 13, color: tokens.muted, flex: 1 }}>
                    Changing SKUs mid-shift: set the current run's qty to its cumulative plan at the hour you switch (so earlier hours don't change), then add the new run after it. Leave the last run's qty empty to run it to the end of the shift. The SKU list and rates come from Admin → Products &amp; rates.
                </Box>

                <Button color="inherit" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save plan"}</Button>

            </Box>

            {error && <Box sx={{ px: 2.25, pb: 1.5 }}><Alert severity="error">{error}</Alert></Box>}

        </Box>

    );

}

export default function HourlyBoard() {

    const clock = useClock();
    const isAdmin = (() => { try { return localStorage.getItem("userRole") === "admin"; } catch { return false; } })();

    const [boards, setBoards] = useState([]);
    const [board, setBoard] = useState(readBoard);
    const [date, setDate] = useState("");
    const [plan, setPlan] = useState(null);
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState("");
    const [correcting, setCorrecting] = useState(null);   // period index

    useEffect(() => {

        getBoards().then(b => {

            setBoards(b.boards);
            setDate(d => d || b.today);
            setBoard(cur => (b.boards.includes(cur) ? cur : b.boards[0]));

        }).catch(err => setError(err.message));

    }, []);

    const load = useCallback(async () => {

        if (!board || !date)
            return;

        try {

            setPlan(await getPlan(board, date));
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, [board, date]);

    useEffect(() => { load(); }, [load]);

    // Live actuals: refresh every 30 s unless the plan is being edited.
    useEffect(() => {

        if (editing)
            return undefined;

        const id = setInterval(load, 30 * 1000);

        return () => clearInterval(id);

    }, [load, editing]);

    // SKUs listed for this board (Admin → Products & rates), offered in the plan editor.
    const [skuOptions, setSkuOptions] = useState([]);

    useEffect(() => {

        if (!board || !date || !isAdmin)
            return;


        getProducts(board, date).then(p => setSkuOptions(p.skus.map(s => ({ sku: s.sku, prefix: s.prefix })))).catch(() => setSkuOptions([]));

    }, [board, date, isAdmin]);

    let cumulative = 0;
    let cumulativeActual = 0;

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1400, mx: "auto" }}>

                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>

                    {boards.map(b => <Chip key={b} active={b === board} onClick={() => { setBoard(b); rememberBoard(b); setEditing(false); }}>{b}</Chip>)}

                    <Box sx={{ flex: 1 }} />

                    <TextField size="small" type="date" label="Day" value={date} onChange={e => { setDate(e.target.value); setEditing(false); }} slotProps={{ inputLabel: { shrink: true } }} />

                    {isAdmin && !editing && plan && (
                        <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit plan</Button>
                    )}

                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {editing && plan && (
                    <PlanEditor
                        key={`${board}-${date}`}
                        board={board}
                        date={date}
                        plan={plan}
                        skuOptions={skuOptions}
                        onClose={() => setEditing(false)}
                        onSaved={p => { setPlan(p); setEditing(false); }}
                    />
                )}

                {plan && (

                    <Box component="section" aria-label={`${board} plan`} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

                        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 2, px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>

                            <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 26, letterSpacing: "2px", textTransform: "uppercase" }}>{board}</Box>

                            <Box sx={{ ...labelSx }}>Plan {plan.total} · {plan.runs.length} run{plan.runs.length === 1 ? "" : "s"}</Box>

                            <Box sx={{ flex: 1 }} />

                            {plan.saved && (
                                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                                    <Box sx={{ ...labelSx, fontSize: 12 }}>Actual</Box>
                                    <Box sx={{ fontFamily: tokens.mono, fontSize: 22, color: plan.rag ? RAG_COLORS[plan.rag] : "#E6EDF3" }}>{plan.actualTotal}</Box>
                                    <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>/ {plan.planToNow} planned so far</Box>
                                    <Box sx={{ ...labelSx, fontSize: 12, ml: 1.5 }}>FPY</Box>
                                    <Box sx={{ fontFamily: tokens.mono, fontSize: 18, color: fpyColor(plan.quality?.fpy, plan.settings) }}>{plan.quality?.fpy === null || plan.quality?.fpy === undefined ? "—" : `${plan.quality.fpy}%`}</Box>
                                    <Box sx={{ fontFamily: tokens.mono, fontSize: 13, color: tokens.muted }}>
                                        {plan.quality?.fails || 0} fail · {plan.quality?.rework || 0} rework · {plan.quality?.scrap || 0} scrap{plan.quality?.open ? ` · ${plan.quality.open} open` : ""}
                                    </Box>
                                    <Box sx={{ ...labelSx, fontSize: 11, ml: 1.5 }}>Counted at {plan.countStation}</Box>
                                </Box>
                            )}

                        </Box>

                        {!plan.saved && (
                            <Box sx={{ px: 2.25, py: 3, color: tokens.muted, textAlign: "center" }}>
                                No plan for this day yet.{isAdmin ? " Press Edit plan to add runs." : ""}
                            </Box>
                        )}

                        {plan.saved && (

                            <>

                                <Box sx={{ display: "grid", gridTemplateColumns: "120px 70px minmax(180px, 1fr) 60px 90px 230px 90px 70px 70px", ...labelSx, fontSize: 12, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
                                    <span>Hour</span><span>Work min</span><span>SKU · plan</span><span>Plan</span><span>Cum. plan</span><span>Actual</span><span>Cum. actual</span><span>Fails</span><span>FPY</span>
                                </Box>

                                {plan.periods.map((p, i) => {

                                    cumulative += p.total;
                                    cumulativeActual += p.actualTotal;

                                    const skuActuals = Object.entries(p.actual).filter(([, v]) => v > 0);

                                    return (

                                        <Box key={p.label} sx={{ display: "grid", gridTemplateColumns: "120px 70px minmax(180px, 1fr) 60px 90px 230px 90px 70px 70px", alignItems: "center", px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}`, bgcolor: p.status === "now" ? "rgba(35,126,181,0.10)" : undefined, boxShadow: p.status === "now" ? `inset 3px 0 0 ${tokens.blue}` : undefined }}>

                                            <Box sx={{ fontFamily: tokens.mono }}>{p.label}</Box>
                                            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{p.workMinutes}</Box>
                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                                                {Object.entries(p.plan).filter(([, n]) => n > 0).map(([sku, n]) => (
                                                    <Box key={sku} component="span" sx={{ fontFamily: tokens.mono, fontSize: 13, px: 0.75, py: 0.25, border: `1px solid ${tokens.lineStrong}` }}>{sku} · {n}</Box>
                                                ))}
                                            </Box>
                                            <Box sx={{ fontFamily: tokens.mono, fontSize: 22 }}>{p.total}</Box>
                                            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{cumulative}</Box>
                                            <Box>
                                                {p.status === "later" && p.actualTotal === 0
                                                    ? <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>—</Box>
                                                    : (
                                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                            <Box component="span" aria-label={p.rag || "no colour"} sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: p.rag ? RAG_COLORS[p.rag] : tokens.lineStrong }} />
                                                            <Box sx={{ fontFamily: tokens.mono, fontSize: 22, color: p.rag ? RAG_COLORS[p.rag] : "#E6EDF3" }}>{p.actualTotal}</Box>
                                                            {p.status === "now" && <Box sx={{ fontSize: 12, color: tokens.muted }}>now · {p.due} due so far</Box>}
                                                            {isAdmin && <IconButton size="small" aria-label={`Correct the count for ${p.label}`} onClick={() => setCorrecting(i)} sx={{ color: tokens.muted }}><EditIcon sx={{ fontSize: 16 }} /></IconButton>}
                                                        </Box>
                                                    )}
                                                {p.corrected !== 0 && <Box sx={{ fontSize: 11, color: "#F2A33A" }}>incl. {p.corrected > 0 ? "+" : ""}{p.corrected} corrected</Box>}
                                                {skuActuals.length > 1 && skuActuals.map(([k, v]) => (
                                                    <Box key={k} sx={{ fontFamily: tokens.mono, fontSize: 11, color: tokens.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k} · {v}</Box>
                                                ))}
                                            </Box>
                                            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{p.status === "later" ? "" : cumulativeActual}</Box>
                                            <Box title={Object.entries(p.failCodes || {}).map(([c, n]) => `${c} × ${n}`).join(", ")}>
                                                <Box sx={{ fontFamily: tokens.mono, color: p.fails ? "#F85149" : tokens.muted }}>{p.fails || (p.status === "later" ? "" : 0)}</Box>
                                                {(p.rework > 0 || p.scrap > 0) && <Box sx={{ fontSize: 11, color: tokens.muted }}>{p.rework ? `${p.rework} rework` : ""}{p.rework && p.scrap ? " · " : ""}{p.scrap ? `${p.scrap} scrap` : ""}</Box>}
                                            </Box>
                                            <Box sx={{ fontFamily: tokens.mono, color: fpyColor(p.fpy, plan.settings) }}>{p.fpy === null ? "" : `${p.fpy}%`}</Box>

                                        </Box>

                                    );

                                })}

                                {plan.corrections?.length > 0 && (

                                    <Box sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>

                                        <Box sx={{ ...labelSx, mb: 1 }}>Count corrections</Box>

                                        {plan.corrections.map(c => (
                                            <Box key={c.id} sx={{ display: "flex", flexWrap: "wrap", gap: 2, py: 0.25, fontSize: 13 }}>
                                                <Box sx={{ fontFamily: tokens.mono, color: tokens.muted, width: 80 }}>{new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}</Box>
                                                <Box sx={{ fontFamily: tokens.mono, width: 110 }}>{plan.periods[c.period]?.label}</Box>
                                                <Box sx={{ fontFamily: tokens.mono, minWidth: 260 }}>{c.sku}</Box>
                                                <Box sx={{ fontFamily: tokens.mono, width: 50, color: c.delta > 0 ? "#3FB950" : "#F85149" }}>{c.delta > 0 ? `+${c.delta}` : c.delta}</Box>
                                                <Box>{c.reason}</Box>
                                                <Box sx={{ color: tokens.muted }}>by {c.adjusted_by}</Box>
                                            </Box>
                                        ))}

                                    </Box>

                                )}

                                <Box sx={{ px: 2.25, py: 1.5 }}>

                                    <Box sx={{ ...labelSx, mb: 1 }}>Runs</Box>

                                    {plan.runs.map((r, i) => (

                                        <Box key={i} sx={{ display: "flex", flexWrap: "wrap", gap: 2, py: 0.5, fontSize: 14 }}>
                                            <Box sx={{ fontFamily: tokens.mono, width: 24, color: tokens.muted }}>{i + 1}</Box>
                                            <Box sx={{ fontFamily: tokens.mono, minWidth: 260 }}>{r.sku}</Box>
                                            <Box sx={{ color: tokens.muted }}>{r.qty === null ? "rest of shift" : `qty ${r.qty}`} · {r.rate}/hr</Box>
                                            <Box>planned {r.planned}</Box>
                                            {r.carryOver > 0 && <Box sx={{ color: "#FFA040" }}>{r.carryOver} don't fit today</Box>}
                                        </Box>

                                    ))}

                                </Box>

                            </>

                        )}

                    </Box>

                )}

            </Box>

            {correcting !== null && plan && (
                <CorrectionDialog
                    board={board}
                    date={date}
                    index={correcting}
                    period={plan.periods[correcting]}
                    skuOptions={plan.runs.map(r => r.sku)}
                    onClose={() => setCorrecting(null)}
                    onSaved={p => { setPlan(p); setCorrecting(null); }}
                />
            )}

            <Footer />

        </Box>

    );

}
