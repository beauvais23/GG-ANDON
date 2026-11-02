import { useCallback, useEffect, useState } from "react";

import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField
} from "@mui/material";

import BlockIcon from "@mui/icons-material/Block";

import { AdminPanel, AdminRow, EmptyRow } from "./adminUi";

import { getLoggedNearMisses, voidNearMiss } from "../../api/nearMisses";
import { tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Near misses (Nov 2 2026)
//
// Near misses logged from the tablets. VOID removes one
// pressed by mistake or as a test after the tablet's
// 10-minute Undo: it becomes CANCELLED with "Voided by
// Admin: <reason>", drops out of the near-miss counts,
// and stays in history.
//------------------------------------------------------

const MAX_REASON = 500;

function loggedAt(ms) {

    return new Date(Number(ms)).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York"
    });

}

export default function NearMissesPanel() {

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [voiding, setVoiding] = useState(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {

        try {

            setItems(await getLoggedNearMisses());
            setLoadError("");

        } catch (err) {

            setLoadError(err.message);

        } finally {

            setLoading(false);

        }

    }, []);

    useEffect(() => { load(); }, [load]);

    function open(item) {

        setVoiding(item);
        setReason("");
        setError("");
        setSaving(false);

    }

    async function submit(event) {

        event.preventDefault();

        const clean = reason.trim();

        if (!clean) {
            setError("Say why this near miss is voided (for example: Test press).");
            return;
        }

        setSaving(true);
        setError("");

        try {

            const result = await voidNearMiss(voiding.id, clean);

            if (result?.success === false) {
                setError(result.message || "Could not void it.");
                setSaving(false);
                return;
            }

            setVoiding(null);
            await load();

        } catch (err) {

            setError(err.message || "Could not void it.");
            setSaving(false);

        }

    }

    return (

        <AdminPanel
            title="Near misses"
            meta="Logged from the tablets. Void one pressed by mistake or as a test."
        >

            {loadError && <Box sx={{ p: 2.25 }}><Alert severity="error">{loadError}</Alert></Box>}

            {loading && <EmptyRow>Loading near misses…</EmptyRow>}

            {!loading && !loadError && items.length === 0 && <EmptyRow>No near misses logged.</EmptyRow>}

            {items.map(item => (

                <AdminRow key={item.id} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "90px 220px minmax(200px, 1fr) 120px" } }}>

                    <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>#{item.id}</Box>

                    <Box sx={{ fontFamily: tokens.mono, fontSize: 14 }}>{loggedAt(item.requested)}</Box>

                    <Box sx={{ fontWeight: 600 }}>{item.production_line} / {item.work_center}</Box>

                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<BlockIcon />}
                            aria-label={`Void near miss #${item.id}`}
                            onClick={() => open(item)}
                        >
                            Void
                        </Button>
                    </Box>

                </AdminRow>

            ))}

            <Dialog open={Boolean(voiding)} onClose={() => !saving && setVoiding(null)} fullWidth maxWidth="sm">

                <Box component="form" onSubmit={submit}>

                    <DialogTitle>Void near miss #{voiding?.id}?</DialogTitle>

                    <DialogContent>

                        <Box sx={{ color: tokens.muted, mb: 2 }}>
                            {voiding && `${voiding.production_line} / ${voiding.work_center} · ${loggedAt(voiding.requested)}. `}
                            It drops out of the near-miss counts and stays in history as "Voided by Admin".
                        </Box>

                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                        <TextField
                            autoFocus
                            fullWidth
                            label="Why?"
                            placeholder="Test press"
                            value={reason}
                            onChange={e => { setReason(e.target.value.slice(0, MAX_REASON)); setError(""); }}
                            slotProps={{ inputLabel: { shrink: true } }}
                            helperText={`${reason.length}/${MAX_REASON}`}
                        />

                    </DialogContent>

                    <DialogActions>

                        <Button color="inherit" onClick={() => setVoiding(null)} disabled={saving}>Keep it</Button>

                        <Button type="submit" variant="contained" color="warning" disabled={saving}>
                            {saving ? "Voiding…" : "Void near miss"}
                        </Button>

                    </DialogActions>

                </Box>

            </Dialog>

        </AdminPanel>

    );

}
