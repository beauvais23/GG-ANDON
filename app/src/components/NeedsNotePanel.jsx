import { useCallback, useEffect, useState } from "react";

import {
    Box,
    Button
} from "@mui/material";

import EditNoteIcon from "@mui/icons-material/EditNote";

import ResolveDialog from "./ResolveDialog";

import { ALERT_COLORS, FALLBACK_COLOR } from "../config/alertColors";
import { tokens } from "../theme/theme";

import {
    addAlertNote,
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

                <Box component="span" sx={{ color: tokens.muted, fontSize: 14 }}>
                    Resolved from Telegram, which can't take a note. Add what fixed it.
                </Box>

            </Box>

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
                                #{alert.id} · {alert.type} · {alert.production_line} / {alert.work_center}
                            </Box>
                            <Box sx={{ fontSize: 14, color: tokens.muted }}>
                                Resolved {resolvedAt(alert.resolved)}
                                {alert.resolved_by ? ` by ${alert.resolved_by}` : ""}
                            </Box>
                        </Box>

                        <Button
                            variant="contained"
                            color="warning"
                            startIcon={<EditNoteIcon />}
                            onClick={() => setEditing(alert)}
                            sx={{ flexShrink: 0, height: 44, fontSize: 16, letterSpacing: "2px" }}
                        >
                            Add note
                        </Button>

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

        </Box>

    );

}
