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

// Matches the backend limit in PATCH /alerts/:id/resolve.
const MAX_NOTE = 500;

//------------------------------------------------------
// Resolve Dialog
//
// Asks what fixed the problem before an alert is
// resolved. The note is required; it feeds the alert
// history and future root-cause review.
//------------------------------------------------------

export default function ResolveDialog({

    alert,
    responder,
    onClose,
    onResolve

}) {

    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {

        setNote("");
        setError("");
        setSaving(false);

    }, [alert?.id]);

    const clean = note.trim();

    async function handleSubmit(event) {

        event.preventDefault();

        if (!clean) {
            setError("Describe what fixed the problem.");
            return;
        }

        setSaving(true);
        setError("");

        try {

            const result = await onResolve(alert.id, clean);

            if (result && result.success === false) {
                setError(result.message || "Could not resolve the alert.");
                setSaving(false);
                return;
            }

            onClose();

        } catch (err) {

            setError(err.message || "Could not resolve the alert.");
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
                    Resolve alert #{alert?.id}
                </DialogTitle>

                <DialogContent sx={{ display: "grid", gap: 2 }}>

                    <Typography variant="body2" color="text.secondary">
                        {alert?.type} · {alert?.production_line} / {alert?.work_center}
                        {responder ? ` · resolved by ${responder}` : ""}
                    </Typography>

                    <TextField
                        id="resolution-note"
                        label="What fixed it?"
                        placeholder="e.g. Replaced worn fixture pin; retested 3 units, all passed"
                        value={note}
                        onChange={e => setNote(e.target.value.slice(0, MAX_NOTE))}
                        multiline
                        minRows={3}
                        autoFocus
                        required
                        fullWidth
                        helperText={`${clean.length}/${MAX_NOTE}`}
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
                        color="success"
                        disabled={saving || !clean}
                    >
                        {saving ? "Resolving…" : "Resolve"}
                    </Button>

                </DialogActions>

            </form>

        </Dialog>

    );

}
