import { useCallback, useEffect, useState } from "react";

import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";

import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from "recharts";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { getReport } from "../api/hourly";
import { RAG_COLORS } from "../config/ragColors";
import { fpyColor, fpyRag } from "../config/fpyColors";
import { downloadCsv } from "../utils/csv";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Reports (H4, Nov 3 2026): one day or one week (Mon-Sun),
// from the hour-by-hour data. Plan vs actual and FPY (target
// 99%) in tiles, by line and by day; top failure codes; PCB
// Test; demonstrated units/hour per family (to replace
// guessed rates). Every table exports to CSV. Numbers match
// the /board page (same server math).
// Charts: Actual = blue, Plan = orange (validated pair, dark
// panel); one axis each; FPY has its own chart.
//------------------------------------------------------

const ACTUAL = "#3987e5";
const PLAN = "#d95926";
const AXIS = { fill: tokens.muted, fontSize: 12, fontFamily: tokens.body };
const GRID = "#1E242B";

const ny = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function weekOf(date) {

    const d = new Date(`${date}T12:00:00Z`);
    const monday = new Date(d);

    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));

    const sunday = new Date(monday);

    sunday.setUTCDate(monday.getUTCDate() + 6);

    return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];

}

const short = date => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });
const pctText = v => (v === null || v === undefined ? "—" : `${v}%`);
const PLAN_WORDS = { green: "On plan", amber: "Close", red: "Behind" };
const FPY_WORDS = { green: "At target", amber: "Below target", red: "Well below target" };

function Tile({ label, value, note, color }) {

    return (
        <Box sx={{ bgcolor: tokens.panel, px: 2.25, py: 1.75, borderRight: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
            <Box sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
            <Box sx={{ fontFamily: tokens.mono, fontSize: 34, lineHeight: 1.15, mt: 0.5 }}>{value}</Box>
            {note && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: 12, color: tokens.muted }}>
                    {color && <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />}
                    {note}
                </Box>
            )}
        </Box>
    );

}

function Section({ title, meta, onCsv, children }) {

    return (
        <Box component="section" aria-label={title} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, mb: 2.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "1.5px", textTransform: "uppercase" }}>{title}</Box>
                {meta && <Box sx={{ fontSize: 13, color: tokens.muted }}>{meta}</Box>}
                <Box sx={{ flex: 1 }} />
                {onCsv && <Button size="small" startIcon={<DownloadIcon />} onClick={onCsv}>CSV</Button>}
            </Box>
            {children}
        </Box>
    );

}

function Table({ columns, rows, empty = "No data for this period.", minWidth = 640 }) {

    const grid = columns.map(c => c.width || "1fr").join(" ");

    return (
        <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ minWidth }}>
                <Box sx={{ display: "grid", gridTemplateColumns: grid, gap: 1, ...labelSx, fontSize: 11, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
                    {columns.map(c => <span key={c.label}>{c.label}</span>)}
                </Box>
                {rows.length === 0 && <Box sx={{ px: 2.25, py: 2, color: tokens.muted }}>{empty}</Box>}
                {rows.map((r, i) => (
                    <Box key={i} sx={{ display: "grid", gridTemplateColumns: grid, gap: 1, alignItems: "center", px: 2.25, py: 0.9, borderBottom: `1px solid ${tokens.line}`, fontSize: 14 }}>
                        {columns.map(c => <Box key={c.label} sx={{ fontFamily: c.mono ? tokens.mono : undefined, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.render ? c.render(r) : r[c.key]}</Box>)}
                    </Box>
                ))}
            </Box>
        </Box>
    );

}

const dot = color => <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", bgcolor: color, mr: 1, verticalAlign: "middle" }} />;

function DarkTooltip({ active, payload, label, suffix = "" }) {

    if (!active || !payload?.length)
        return null;

    return (
        <Box sx={{ bgcolor: "#0B0D10", border: `1px solid ${tokens.lineStrong}`, px: 1.5, py: 1, fontSize: 13 }}>
            <Box sx={{ ...labelSx, fontSize: 11, mb: 0.5 }}>{label}</Box>
            {payload.map(p => <Box key={p.dataKey}><Box component="span" sx={{ color: tokens.muted }}>{p.name}: </Box><Box component="span" sx={{ fontFamily: tokens.mono }}>{p.value ?? "—"}{suffix}</Box></Box>)}
        </Box>
    );

}

export default function Reports() {

    const clock = useClock();

    const [mode, setMode] = useState("week");
    const [date, setDate] = useState(ny);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const [from, to] = mode === "week" ? weekOf(date) : [date, date];

    const load = useCallback(async () => {

        try {

            setData(await getReport(from, to));
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    const s = data?.settings || {};
    const t = data?.total;
    const open = data ? data.boards.reduce((a, b) => a + b.open, 0) : 0;
    const name = `${from}${from === to ? "" : `_to_${to}`}`;

    const lineCols = [
        { label: "Line", key: "board", width: "1.4fr" },
        { label: "Plan", key: "plan", mono: true },
        { label: "Actual", key: "actual", mono: true },
        { label: "Attainment", width: "1.2fr", render: r => <>{dot(r.rag ? RAG_COLORS[r.rag] : tokens.lineStrong)}{pctText(r.attainment)}</>, value: r => r.attainment },
        { label: "FPY", render: r => <Box component="span" sx={{ color: fpyColor(r.fpy, s) }}>{pctText(r.fpy)}</Box>, value: r => r.fpy, mono: true },
        { label: "Fails", key: "fails", mono: true },
        { label: "Rework", key: "rework", mono: true },
        { label: "Scrap", key: "scrap", mono: true },
        { label: "Open", key: "open", mono: true }
    ];

    const codeMax = data?.topCodes[0]?.n || 1;
    const codeCols = [
        { label: "Code", key: "code", width: "90px", mono: true },
        { label: "Description", width: "2.4fr", render: r => r.label.split(" - ").slice(1).join(" - "), value: r => r.label },
        { label: "Count", width: "2fr", render: r => <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Box sx={{ height: 10, width: `${(r.n / codeMax) * 100}%`, maxWidth: "75%", bgcolor: ACTUAL, borderRadius: "0 4px 4px 0" }} /><Box component="span" sx={{ fontFamily: tokens.mono }}>{r.n}</Box></Box>, value: r => r.n },
        { label: "% of fails", key: "pct", mono: true },
        { label: "Lines", width: "1.6fr", render: r => Object.entries(r.boards).map(([b, n]) => `${b} ${n}`).join(" · "), value: r => Object.entries(r.boards).map(([b, n]) => `${b} ${n}`).join("; ") }
    ];

    const pcbCols = [
        { label: "Line", key: "board" },
        { label: "SKU", key: "sku", width: "2fr", mono: true },
        { label: "Pass", key: "pass", mono: true },
        { label: "Fail", key: "fail", mono: true },
        { label: "PCB FPY", render: r => <Box component="span" sx={{ color: fpyColor(r.fpy, s) }}>{pctText(r.fpy)}</Box>, value: r => r.fpy, mono: true }
    ];

    const rateCols = [
        { label: "Line", key: "board" },
        { label: "Family", key: "family", mono: true },
        { label: "Good units", key: "units", mono: true },
        { label: "Work minutes", key: "workMinutes", mono: true },
        { label: "Units / hour", key: "perHour", mono: true }
    ];

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1400, mx: "auto" }}>

                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
                    <ToggleButtonGroup exclusive size="small" value={mode} onChange={(e, v) => v && setMode(v)}>
                        <ToggleButton value="day">Day</ToggleButton>
                        <ToggleButton value="week">Week</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField size="small" type="date" label={mode === "week" ? "Any day in the week" : "Day"} value={date} onChange={e => e.target.value && setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                    <Box sx={{ ...labelSx }}>{from === to ? short(from) : `${short(from)} – ${short(to)}`}</Box>
                    <Box sx={{ flex: 1 }} />
                    <Box sx={{ fontSize: 13, color: tokens.muted }}>FPY target {s.fpy_green_pct ?? 99}% · plan green ≥ {s.green_pct ?? 100}%</Box>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {t && (

                    <>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(8, 1fr)" }, borderLeft: `1px solid ${tokens.line}`, borderTop: `1px solid ${tokens.line}`, mb: 2.5 }}>
                            <Tile label="Plan" value={t.plan} note={from <= ny() && ny() <= to ? "today: so far" : null} />
                            <Tile label="Actual" value={t.actual} />
                            <Tile label="Attainment" value={pctText(t.attainment)} color={t.rag ? RAG_COLORS[t.rag] : null} note={t.rag ? PLAN_WORDS[t.rag] : "no plan"} />
                            <Tile label="FPY" value={pctText(t.fpy)} color={fpyColor(t.fpy, s)} note={fpyRag(t.fpy, s) ? FPY_WORDS[fpyRag(t.fpy, s)] : "no data"} />
                            <Tile label="Fails" value={t.fails} />
                            <Tile label="Rework passed" value={t.rework} />
                            <Tile label="Scrap" value={t.scrap} />
                            <Tile label="PCB FPY" value={pctText(t.pcbFpy)} color={fpyColor(t.pcbFpy, s)} note={`${t.pcbPass} pass · ${t.pcbFail} fail`} />
                        </Box>

                        <Section title="By line" meta={`${open} open failure${open === 1 ? "" : "s"} now`} onCsv={() => downloadCsv(`by-line_${name}.csv`, lineCols.map(c => ({ ...c, key: c.key })), data.boards)}>
                            <Table columns={lineCols} rows={data.boards} />
                        </Section>

                        {mode === "week" && (

                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5 }}>

                                <Section title="Plan vs actual by day" onCsv={() => downloadCsv(`by-day_${name}.csv`, [{ label: "Date", key: "date" }, { label: "Plan", key: "plan" }, { label: "Actual", key: "actual" }, { label: "Attainment %", key: "attainment" }, { label: "FPY %", key: "fpy" }, { label: "Fails", key: "fails" }, { label: "Scrap", key: "scrap" }], data.days)}>
                                    <Box sx={{ height: 260, px: 1, py: 1.5 }}>
                                        {data.days.length ? (
                                            <ResponsiveContainer>
                                                <BarChart data={data.days.map(d => ({ ...d, day: short(d.date) }))} barGap={2}>
                                                    <CartesianGrid stroke={GRID} vertical={false} />
                                                    <XAxis dataKey="day" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} />
                                                    <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} />
                                                    <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                                                    <Legend wrapperStyle={{ fontSize: 12, color: tokens.muted }} />
                                                    <Bar dataKey="actual" name="Actual" fill={ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                    <Bar dataKey="plan" name="Plan" fill={PLAN} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <Box sx={{ color: tokens.muted, p: 2 }}>No production this week.</Box>}
                                    </Box>
                                </Section>

                                <Section title="FPY by day" meta={`target ${s.fpy_green_pct ?? 99}%`}>
                                    <Box sx={{ height: 260, px: 1, py: 1.5 }}>
                                        {data.days.length ? (
                                            <ResponsiveContainer>
                                                <LineChart data={data.days.map(d => ({ ...d, day: short(d.date) }))}>
                                                    <CartesianGrid stroke={GRID} vertical={false} />
                                                    <XAxis dataKey="day" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} />
                                                    <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} domain={[dataMin => Math.max(0, Math.floor(Math.min(dataMin, 95) - 2)), 100]} unit="%" />
                                                    <Tooltip content={<DarkTooltip suffix="%" />} />
                                                    <ReferenceLine y={s.fpy_green_pct ?? 99} stroke={tokens.muted} strokeDasharray="4 4" label={{ value: `Target ${s.fpy_green_pct ?? 99}%`, fill: tokens.muted, fontSize: 11, position: "insideTopLeft" }} />
                                                    <Line dataKey="fpy" name="FPY" stroke={ACTUAL} strokeWidth={2} dot={{ r: 4, fill: ACTUAL, stroke: tokens.panel, strokeWidth: 2 }} connectNulls />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : <Box sx={{ color: tokens.muted, p: 2 }}>No production this week.</Box>}
                                    </Box>
                                </Section>

                            </Box>

                        )}

                        <Section title="Top failure codes" meta="count station (Final Test)" onCsv={() => downloadCsv(`failure-codes_${name}.csv`, codeCols, data.topCodes)}>
                            <Table columns={codeCols} rows={data.topCodes} empty="No failures in this period." />
                        </Section>

                        <Section title="PCB failures" meta={`PCB Test · ${data.pcb.pass} pass · ${data.pcb.fail} fail · PCB FPY ${pctText(data.pcb.fpy)}`} onCsv={() => downloadCsv(`pcb_${name}.csv`, pcbCols, data.pcb.bySku)}>
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" } }}>
                                <Table columns={pcbCols} rows={data.pcb.bySku} empty="No PCB Test results in this period." minWidth={520} />
                                <Table columns={[{ label: "PCB fail code", key: "code", mono: true }, { label: "Description", width: "2fr", render: r => r.label.split(" - ").slice(1).join(" - ") }, { label: "Count", key: "n", mono: true }, { label: "%", key: "pct", mono: true }]} rows={data.pcb.topCodes} empty="No PCB failures." minWidth={420} />
                            </Box>
                        </Section>

                        <Section title="Demonstrated rates" meta="good units ÷ work minutes of the hours the family ran (approximate when an hour mixes families)" onCsv={() => downloadCsv(`rates_${name}.csv`, rateCols, data.rates)}>
                            <Table columns={rateCols} rows={data.rates} empty="No counted units in this period." />
                        </Section>

                    </>

                )}

            </Box>

            <Footer />

        </Box>

    );

}
