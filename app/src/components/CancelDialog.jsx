import { useEffect, useState } from "react";

import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography
} from "@mui/material";

// Matches the backend limit in PATCH /alerts/:id/cancel.
const MAX_REASON = 500;

//------------------------------------------------------
// Cancel Dialog (#26)
//
// For false alarms and tests, when the tablet that
// raised the alert can no longer cancel it. A reason is
// required. Cancelled alerts are not counted in MTTR.
//------------------------------------------------------

export default function CancelDialog({

    alert,
    responder,
    onClose,
    onCancel

}) {

    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {

        setReason("");
        setError("");
        setSaving(false);

    }, [alert?.id]);

    const clean = reason.trim();

    async function handleSubmit(event) {

        event.preventDefault();

        if (!clean) {
            setError("Say why the alert is cancelled.");
            return;
        }

        setSaving(true);
        setError("");

        try {

            const result = await onCancel(alert.id, clean);

            if (result && result.success === false) {
                setError(result.message || "Could not cancel the alert.");
                setSaving(false);
                return;
            }

            onClose();

        } catch (err) {

            setError(err.message || "Could not cancel the alert.");
            setSaving(false);

        }

    }

    return (

        <Dialog
            open={Boolean(alert)}
            onClose={saving ? undefined : onClose}
            maxWidth="sm"
            fullWidth
        >

            <form onSubmit={handleSubmit}>

                <DialogTitle>
                    Cancel alert #{alert?.id}
                </DialogTitle>

                <DialogContent sx={{ display: "grid", gap: 2 }}>

                    <Typography variant="body2" color="text.secondary">
                        {alert?.type} · {alert?.production_line} / {alert?.work_center}
                        {responder ? ` · cancelled by ${responder}` : ""}
                    </Typography>

                    <Typography variant="body2">
                        Use this only for false alarms and tests. If someone fixed a
                        problem, use Resolve instead. Cancelled alerts are not counted
                        in response or repair times.
                    </Typography>

                    <TextField
                        id="cancel-reason"
                        label="Why cancel?"
                        placeholder="e.g. Pressed by mistake; smoke test after release"
                        value={reason}
                        onChange={e => setReason(e.target.value.slice(0, MAX_REASON))}
                        multiline
                        minRows={2}
                        autoFocus
                        required
                        fullWidth
                        helperText={`${clean.length}/${MAX_REASON}`}
                        disabled={saving}
                    />

                    {error && (
                        <Alert severity="error">
                            {error}
                        </Alert>
                    )}

                </DialogContent>

                <DialogActions>

                    <Button onClick={onClose} disabled={saving}>
                        Back
                    </Button>

                    <Button
                        type="submit"
                        variant="contained"
                        color="error"
                        disabled={saving || !clean}
                    >
                        {saving ? "Cancelling…" : "Cancel alert"}
                    </Button>

                </DialogActions>

            </form>

        </Dialog>

    );

}
