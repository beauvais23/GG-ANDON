import { useCallback, useEffect, useState } from "react";

import {
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Typography
} from "@mui/material";

import EditNoteIcon from "@mui/icons-material/EditNote";

import ResolveDialog from "./ResolveDialog";

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

        <Paper
            elevation={2}
            sx={{ mt: 3, p: 3, borderRadius: 4 }}
        >

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>

                <Typography variant="h6" sx={{ fontWeight: 700 }}>

                    Needs a resolution note

                </Typography>

                <Chip label={alerts.length} color="warning" size="small" />

            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>

                Resolved from Telegram, which can't take a note. Add what fixed it.

            </Typography>

            <Stack spacing={1}>

                {alerts.map(alert => (

                    <Box
                        key={alert.id}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 2,
                            px: 2,
                            py: 1.25,
                            borderRadius: 2,
                            bgcolor: "action.hover"
                        }}
                    >

                        <Box>

                            <Typography sx={{ fontWeight: 600 }}>

                                #{alert.id} · {alert.type} · {alert.production_line} / {alert.work_center}

                            </Typography>

                            <Typography variant="body2" color="text.secondary">

                                Resolved {resolvedAt(alert.resolved)}
                                {alert.resolved_by ? ` by ${alert.resolved_by}` : ""}

                            </Typography>

                        </Box>

                        <Button
                            variant="contained"
                            color="warning"
                            startIcon={<EditNoteIcon />}
                            onClick={() => setEditing(alert)}
                            sx={{ flexShrink: 0 }}
                        >

                            Add note

                        </Button>

                    </Box>

                ))}

            </Stack>

            <ResolveDialog
                alert={editing}
                responder={editing?.resolved_by}
                onClose={() => setEditing(null)}
                onResolve={saveNote}
                title={`Add note to alert #${editing?.id}`}
                submitLabel="Save note"
                savingLabel="Saving…"
            />

        </Paper>

    );

}
