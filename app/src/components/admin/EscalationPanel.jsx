import { useCallback, useEffect, useState } from "react";

import {
    Alert,
    Box,
    Button,
    IconButton,
    MenuItem,
    Switch,
    TextField,
    Tooltip
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import { AdminPanel, AdminRow, EmptyRow, Tag } from "./adminUi";

import {
    addEscalationRule,
    deleteEscalationRule,
    getEscalation,
    getEscalationLog,
    setPersonRole,
    updateEscalationRule
} from "../../api/escalation";
import { alertLabel } from "../../config/alertColors";
import { labelSx, tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Escalation (SHADOW MODE, Nov 2 2026)
//
// 1. People: each responder's routing role (Production
//    Leads also get a line group).
// 2. Rules: who is notified at the start, after N working
//    minutes unacknowledged, or N working minutes after the
//    acknowledge while still open.
// 3. Shadow log: who WOULD have been notified. Nothing is
//    sent until the Director confirms the thresholds.
//------------------------------------------------------

const STEP_TEXT = {
    START: "At start",
    UNACK: "Not acknowledged after",
    OPEN_ACK: "Acknowledged, still open after"
};

const typeText = type => (type === "*" ? "All types" : alertLabel(type));

function when(ms) {

    return new Date(Number(ms)).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York"
    });

}

function stepText(step, minutes) {

    return step === "START" ? STEP_TEXT.START : `${STEP_TEXT[step]} ${minutes} min`;

}

function Section({ title, children }) {

    return (

        <Box sx={{ borderTop: `1px solid ${tokens.line}` }}>
            <Box sx={{ ...labelSx, px: 2.25, py: 1.25, bgcolor: tokens.ground }}>{title}</Box>
            {children}
        </Box>

    );

}

export default function EscalationPanel() {

    const [data, setData] = useState(null);
    const [log, setLog] = useState(null);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState({ alertType: "*", step: "UNACK", minutes: 5, role: "Production Manager" });

    const load = useCallback(async () => {

        try {

            const [matrix, shadow] = await Promise.all([getEscalation(), getEscalationLog(14)]);

            setData(matrix);
            setLog(shadow);
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, []);

    useEffect(() => { load(); }, [load]);

    async function act(run) {

        try {

            await run();
            await load();

        } catch (err) {

            setError(err.message);

        }

    }

    if (!data)
        return <AdminPanel title="Escalation">{error ? <Box sx={{ p: 2.25 }}><Alert severity="error">{error}</Alert></Box> : <EmptyRow>Loading…</EmptyRow>}</AdminPanel>;

    const people = data.team.filter(p => p.active);
    const summary = new Map((log?.summary || []).map(s => [s.rule_id, s]));

    return (

        <AdminPanel title="Escalation" meta="Who would be notified, and when (working minutes only)">

            <Box sx={{ px: 2.25, py: 1.5 }}>
                <Alert severity="warning" variant="outlined">
                    <b>SHADOW MODE.</b> The matrix logs who <i>would</i> be notified and <b>sends nothing</b>. It goes live only after you confirm the thresholds from this data.
                </Alert>
                {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            </Box>

            <Section title="People and roles">

                {people.length === 0 && <EmptyRow>No active responders. Add them on the Responders tab.</EmptyRow>}

                {people.map(p => (

                    <AdminRow key={p.id} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "minmax(200px, 1fr) 260px 200px" } }}>

                        <Box>
                            <Box sx={{ fontWeight: 600 }}>{p.name}</Box>
                            <Box sx={{ fontSize: 13, color: tokens.muted }}>{p.department}</Box>
                        </Box>

                        <TextField
                            select
                            size="small"
                            label="Role"
                            value={p.role || ""}
                            onChange={e => act(() => setPersonRole(p.id, e.target.value || null, p.line_group))}
                            slotProps={{ inputLabel: { shrink: true } }}
                        >
                            <MenuItem value=""><i>No role</i></MenuItem>
                            {data.roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                        </TextField>

                        {p.role === "Production Lead" ? (

                            <TextField
                                select
                                size="small"
                                label="Line group"
                                value={p.line_group || ""}
                                onChange={e => act(() => setPersonRole(p.id, p.role, e.target.value || null))}
                                slotProps={{ inputLabel: { shrink: true } }}
                            >
                                <MenuItem value=""><i>All line groups</i></MenuItem>
                                {data.lineGroups.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                            </TextField>

                        ) : <Box />}

                    </AdminRow>

                ))}

            </Section>

            <Section title="Rules">

                {data.rules.map(rule => {

                    const s = summary.get(rule.id);
                    const holders = people.filter(p => p.role === rule.role).length;

                    return (

                        <AdminRow key={rule.id} inactive={!rule.active} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "130px 300px minmax(200px, 1fr) 170px 110px" } }}>

                            <Box><Tag>{typeText(rule.alert_type)}</Tag></Box>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>

                                <span>{STEP_TEXT[rule.step]}</span>

                                {rule.step !== "START" && (
                                    <TextField
                                        size="small"
                                        type="number"
                                        defaultValue={rule.minutes}
                                        onBlur={e => Number(e.target.value) !== rule.minutes && act(() => updateEscalationRule(rule.id, { minutes: Number(e.target.value) }))}
                                        slotProps={{ htmlInput: { min: 0, max: 480, "aria-label": `Minutes for ${rule.role}` } }}
                                        sx={{ width: 84 }}
                                    />
                                )}

                                {rule.step !== "START" && <span>min</span>}

                            </Box>

                            <Box>
                                <Box sx={{ fontWeight: 600 }}>{rule.role}</Box>
                                {holders === 0 && <Box sx={{ fontSize: 13, color: "#FFA040" }}>Nobody has this role yet</Box>}
                            </Box>

                            <Box sx={{ fontFamily: tokens.mono, fontSize: 13, color: tokens.muted }}>
                                {s ? `${s.fired} in 14 days` : "0 in 14 days"}
                            </Box>

                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>

                                <Tooltip title={rule.active ? "On" : "Off"}>
                                    <Switch
                                        size="small"
                                        checked={Boolean(rule.active)}
                                        onChange={e => act(() => updateEscalationRule(rule.id, { active: e.target.checked }))}
                                        slotProps={{ input: { "aria-label": `Rule ${rule.id} on` } }}
                                    />
                                </Tooltip>

                                <Tooltip title="Delete rule">
                                    <IconButton size="small" aria-label={`Delete rule ${rule.id}`} onClick={() => act(() => deleteEscalationRule(rule.id))} sx={{ color: tokens.muted }}>
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>

                            </Box>

                        </AdminRow>

                    );

                })}

                <AdminRow sx={{ bgcolor: tokens.ground }}>

                    <TextField select size="small" label="Type" value={draft.alertType} onChange={e => setDraft({ ...draft, alertType: e.target.value })} sx={{ minWidth: 150 }}>
                        {data.alertTypes.map(t => <MenuItem key={t} value={t}>{typeText(t)}</MenuItem>)}
                    </TextField>

                    <TextField select size="small" label="When" value={draft.step} onChange={e => setDraft({ ...draft, step: e.target.value })} sx={{ minWidth: 250 }}>
                        {data.steps.map(s => <MenuItem key={s} value={s}>{STEP_TEXT[s]}</MenuItem>)}
                    </TextField>

                    {draft.step !== "START" && (
                        <TextField size="small" type="number" label="Minutes" value={draft.minutes} onChange={e => setDraft({ ...draft, minutes: e.target.value })} sx={{ width: 100 }} slotProps={{ htmlInput: { min: 0, max: 480 } }} />
                    )}

                    <TextField select size="small" label="Notify" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} sx={{ minWidth: 220 }}>
                        {data.roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </TextField>

                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => act(() => addEscalationRule({ ...draft, minutes: Number(draft.minutes) }))}>
                        Add rule
                    </Button>

                </AdminRow>

            </Section>

            <Section title={`Shadow log · last ${log?.days || 14} days · nothing was sent`}>

                {(!log || log.events.length === 0) && <EmptyRow>No escalations would have fired yet.</EmptyRow>}

                {log?.events.map(e => (

                    <AdminRow key={e.id} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "200px 230px 280px minmax(200px, 1fr)" } }}>

                        <Box sx={{ fontFamily: tokens.mono, fontSize: 13 }}>{when(e.fired_at)}</Box>

                        <Box>#{e.alert_id} · {alertLabel(e.alert_type)} · {e.production_line}</Box>

                        <Box sx={{ color: tokens.muted }}>{stepText(e.step, e.minutes)}</Box>

                        <Box>
                            <b>{e.role}</b>
                            {": "}
                            {e.recipients.length
                                ? e.recipients.join(", ")
                                : <Box component="span" sx={{ color: "#FFA040" }}>nobody has this role</Box>}
                        </Box>

                    </AdminRow>

                ))}

            </Section>

        </AdminPanel>

    );

}
