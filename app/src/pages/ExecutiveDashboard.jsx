import { useEffect, useState } from "react";

import { Box } from "@mui/material";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine
} from "recharts";

import Header from "../components/Header";
import useClock from "../hooks/useClock";
import { getExecutiveDashboard } from "../services/api";
import { labelSx, tokens } from "../theme/theme";
import { alertLabel } from "../config/alertColors";

//------------------------------------------------------
// Executive Dashboard (E4). KPI strip, then four
// single-series charts: one color each (G&G blue), no
// legend (the title names the series), recessive grid,
// dark tooltip. Times are working minutes (#18); the
// dashed line is the 2-minute acknowledge target.
//------------------------------------------------------

const ACK_TARGET_MIN = 2;
const AXIS = { fill: tokens.muted, fontSize: 12, fontFamily: tokens.body };
const GRID = "#1E242B";

const minutes = seconds => Math.round((Number(seconds) || 0) / 6) / 10;

function Kpi({ label, value, unit, note, noteColor }) {

    return (

        <Box sx={{ bgcolor: tokens.panel, px: 2.25, py: 2, borderRight: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
            <Box sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mt: 0.5 }}>
                <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 36, lineHeight: 1.1 }}>{value}</Box>
                {unit && <Box component="span" sx={{ fontSize: 14, color: tokens.muted }}>{unit}</Box>}
            </Box>
            {note && <Box sx={{ ...labelSx, fontSize: 11, mt: 0.5, color: noteColor }}>{note}</Box>}
        </Box>

    );

}

function ChartPanel({ title, subtitle, children, empty }) {

    return (

        <Box component="section" aria-label={title} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, display: "flex", flexDirection: "column" }}>
            <Box sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 18, letterSpacing: "2px", textTransform: "uppercase" }}>{title}</Box>
                {subtitle && <Box sx={{ fontSize: 13, color: tokens.muted }}>{subtitle}</Box>}
            </Box>
            <Box sx={{ height: 280, p: 1.5 }}>
                {empty
                    ? <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: tokens.muted }}>No data yet</Box>
                    : children}
            </Box>
        </Box>

    );

}

function DarkTooltip({ active, payload, label, unit }) {

    if (!active || !payload?.length) return null;

    return (

        <Box sx={{ bgcolor: tokens.raised, border: `1px solid ${tokens.lineStrong}`, px: 1.5, py: 1, fontSize: 13 }}>
            <Box sx={{ color: tokens.muted }}>{label}</Box>
            <Box sx={{ fontFamily: tokens.mono, color: tokens.text }}>{payload[0].value}{unit ? ` ${unit}` : ""}</Box>
        </Box>

    );

}

export default function ExecutiveDashboard() {

    const clock = useClock();

    const [dashboard, setDashboard] = useState(null);

    useEffect(() => {

        async function load() {

            try {
                setDashboard(await getExecutiveDashboard());
            } catch (err) {
                console.error(err);
            }

        }

        load();

        const timer = setInterval(load, 5000);

        return () => clearInterval(timer);

    }, []);

    const k = dashboard?.kpis || {};
    const ack = minutes(k.avgResponseSeconds);
    const res = minutes(k.avgResolutionSeconds);
    const onTarget = ack <= ACK_TARGET_MIN;

    const pareto = [...(dashboard?.pareto || [])].sort((a, b) => b.total - a.total);
    const monthly = dashboard?.monthlyTrend || [];
    const ackTrend = (dashboard?.responseTrend || []).map(r => ({ month: r.month, value: minutes(r.responseSeconds) }));
    const resTrend = (dashboard?.resolutionTrend || []).map(r => ({ month: r.month, value: minutes(r.resolutionSeconds) }));

    return (

        <Box sx={{ minHeight: "100vh", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box sx={{ maxWidth: 1600, mx: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>

                {!dashboard && <Box sx={{ ...labelSx, fontSize: 16 }}>Loading…</Box>}

                <Box
                    component="section"
                    aria-label="Key numbers"
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", lg: "repeat(6, minmax(0, 1fr))" },
                        borderTop: `1px solid ${tokens.line}`,
                        borderLeft: `1px solid ${tokens.line}`
                    }}
                >
                    <Kpi label="Total alerts" value={k.totalAlerts ?? "–"} />
                    <Kpi label="Open now" value={k.activeAlerts ?? "–"} />
                    <Kpi label="Acknowledged" value={k.acknowledgedAlerts ?? "–"} />
                    <Kpi label="Resolved" value={k.resolvedAlerts ?? "–"} />
                    <Kpi
                        label="Avg acknowledge"
                        value={ack}
                        unit="work min"
                        note={onTarget ? `✓ At or under ${ACK_TARGET_MIN} min target` : `▲ Over ${ACK_TARGET_MIN} min target`}
                        noteColor={onTarget ? "#5CC97A" : "#FF8A80"}
                    />
                    <Kpi label="Avg resolution (MTTR)" value={res} unit="work min" />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2.5 }}>

                    <ChartPanel title="Alerts by type" subtitle="All time, most frequent first" empty={!pareto.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pareto} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis dataKey="type" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} tickFormatter={alertLabel} />
                                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip unit="alerts" />} />
                                <Bar dataKey="total" fill={tokens.blue} radius={[4, 4, 0, 0]} maxBarSize={48} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartPanel>

                    <ChartPanel title="Alerts per month" subtitle="New York months" empty={!monthly.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis dataKey="month" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} />
                                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DarkTooltip unit="alerts" />} />
                                <Bar dataKey="total" fill={tokens.blue} radius={[4, 4, 0, 0]} maxBarSize={48} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartPanel>

                    <ChartPanel title="Avg acknowledge time by month" subtitle={`Working minutes · dashed line = ${ACK_TARGET_MIN} min target`} empty={!ackTrend.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={ackTrend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis dataKey="month" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} />
                                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ stroke: tokens.lineStrong }} content={<DarkTooltip unit="work min" />} />
                                <ReferenceLine y={ACK_TARGET_MIN} stroke={tokens.muted} strokeDasharray="6 4" />
                                <Line type="monotone" dataKey="value" stroke={tokens.blueText} strokeWidth={2} dot={{ r: 4, fill: tokens.blueText, stroke: tokens.panel, strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartPanel>

                    <ChartPanel title="Avg resolution time (MTTR) by month" subtitle="Working minutes" empty={!resTrend.length}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resTrend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis dataKey="month" tick={AXIS} axisLine={{ stroke: tokens.line }} tickLine={false} />
                                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ stroke: tokens.lineStrong }} content={<DarkTooltip unit="work min" />} />
                                <Line type="monotone" dataKey="value" stroke={tokens.blueText} strokeWidth={2} dot={{ r: 4, fill: tokens.blueText, stroke: tokens.panel, strokeWidth: 2 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartPanel>

                </Box>

            </Box>

        </Box>

    );

}
