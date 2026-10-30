import { useCallback, useEffect, useState } from "react";

import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle
} from "@mui/material";

import EditNoteIcon from "@mui/icons-material/EditNote";
import ClearIcon from "@mui/icons-material/Clear";

import ResolveDialog from "./ResolveDialog";

import { ALERT_COLORS, FALLBACK_COLOR, alertLabel } from "../config/alertColors";
import { tokens } from "../theme/theme";

import {
    addAlertNote,
    clearAlertNote,
    clearAllAlertNotes,
    getAlertsNeedingNote
} from "../services/api";

//------------------------------------------------------
// Needs a resolution note (#14b)
//
// A Telegram Resolve can't carry text, and the ANDON
// Telegram is a channel (nobody can reply to the bot),
// so those alerts are saved as "Resolved from Telegram"
// and listed here until someone adds what fixed it.
// Hidden when the list is empty.
//
// Clear / Clear all take an alert off the list without a
// note; it is saved as "Resolved from Telegram; no note
// (cleared by <name>)".
//------------------------------------------------------

const REFRESH_MS = 30000;

function resolvedAt(ms) {

    return new Date(Number(ms)).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York"
    });

}

export default function NeedsNotePanel({ responder }) {

    const [alerts, setAlerts] = useState([]);
    const [editing, setEditing] = useState(null);
    const [confirmAll, setConfirmAll] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {

        try {

            const data = await getAlertsNeedingNote();

            if (Array.isArray(data))
                setAlerts(data);

        } catch (err) {

            console.error("Failed to load alerts needing a note:", err);

        }

    }, []);

    useEffect(() => {

        load();

        const timer = setInterval(load, REFRESH_MS);

        return () => clearInterval(timer);

    }, [load]);

    async function saveNote(id, note) {

        const result = await addAlertNote(id, note, responder || undefined);

        if (result?.success)
            await load();

        return result;

    }

    async function clear(run) {

        setError("");

        try {

            const result = await run();

            if (result?.success === false)
                setError(result.message || "Could not clear.");

        } catch (err) {

            setError(err.message || "Could not clear.");

        }

        await load();

    }

    if (!alerts.length)
        return null;

    return (

        <Box component="section" aria-label="Needs a resolution note" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>

                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "2px", textTransform: "uppercase" }}>
                    Needs a resolution note
                </Box>

                <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 13, px: 1, py: 0.25, color: "#F2C232", bgcolor: "#3D2E06", border: "1px solid #5C4A12" }}>
                    {alerts.length}
                </Box>

                <Box component="span" sx={{ color: tokens.muted, fontSize: 14, flex: 1 }}>
                    Resolved from Telegram, which can't take a note. Add what fixed it.
                </Box>

                <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<ClearIcon />}
                    onClick={() => setConfirmAll(true)}
                    sx={{ height: 36, letterSpacing: "1.5px", color: tokens.muted, borderColor: tokens.lineStrong }}
                >
                    Clear all
                </Button>

            </Box>

            {error && (
                <Box role="alert" sx={{ px: 2.25, py: 1, color: "#FF7B72", borderBottom: `1px solid ${tokens.line}` }}>
                    {error}
                </Box>
            )}

            {alerts.map(alert => {

                const colors = ALERT_COLORS[alert.type] || FALLBACK_COLOR;

                return (

                    <Box
                        key={alert.id}
                        sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px 24px",
                            px: 2.25,
                            py: 2,
                            borderLeft: `6px solid ${colors.edge}`,
                            borderBottom: `1px solid ${tokens.line}`
                        }}
                    >

                        <Box>
                            <Box sx={{ fontWeight: 600 }}>
                                #{alert.id} · {alertLabel(alert.type)} · {alert.production_line} / {alert.work_center}
                            </Box>
                            <Box sx={{ fontSize: 14, color: tokens.muted }}>
                                Resolved {resolvedAt(alert.resolved)}
                                {alert.resolved_by ? ` by ${alert.resolved_by}` : ""}
                            </Box>
                        </Box>

                        <Box sx={{ display: "flex", gap: 1.5, flexShrink: 0 }}>

                            <Button
                                variant="outlined"
                                color="inherit"
                                startIcon={<ClearIcon />}
                                onClick={() => clear(() => clearAlertNote(alert.id, responder || undefined))}
                                aria-label={`Clear alert #${alert.id} without a note`}
                                sx={{ height: 44, fontSize: 16, letterSpacing: "2px", color: tokens.muted, borderColor: tokens.lineStrong }}
                            >
                                Clear
                            </Button>

                            <Button
                                variant="contained"
                                color="warning"
                                startIcon={<EditNoteIcon />}
                                onClick={() => setEditing(alert)}
                                sx={{ height: 44, fontSize: 16, letterSpacing: "2px" }}
                            >
                                Add note
                            </Button>

                        </Box>

                    </Box>

                );

            })}

            <ResolveDialog
                alert={editing}
                responder={editing?.resolved_by}
                onClose={() => setEditing(null)}
                onResolve={saveNote}
                title={`Add note to alert #${editing?.id}`}
                submitLabel="Save note"
                savingLabel="Saving…"
            />

            <Dialog open={confirmAll} onClose={() => setConfirmAll(false)}>

                <DialogTitle>Clear all {alerts.length} without a note?</DialogTitle>

                <DialogContent sx={{ color: tokens.muted }}>
                    They leave this list and keep "no note" as their resolution note. A note can't be added afterward.
                </DialogContent>

                <DialogActions>

                    <Button color="inherit" onClick={() => setConfirmAll(false)}>
                        Keep them
                    </Button>

                    <Button
                        variant="contained"
                        color="warning"
                        onClick={() => {
                            setConfirmAll(false);
                            clear(() => clearAllAlertNotes(responder || undefined));
                        }}
                    >
                        Clear all
                    </Button>

                </DialogActions>

            </Dialog>

        </Box>

    );

}
