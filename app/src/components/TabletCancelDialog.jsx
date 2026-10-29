import { useEffect, useState } from "react";

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

//------------------------------------------------------
// Tablet cancel reason
//
// One tap for the common cases, so every cancel has a
// reason (false alarms per line, problems that cleared
// themselves) without slowing the operator down. "Other"
// asks for a short text. Labels approved Oct 29 2026.
//------------------------------------------------------

export const TABLET_CANCEL_REASONS = [
  "Pressed by mistake",
  "Problem cleared itself",
  "Test"
];

// Matches the backend limit in PATCH /alerts/:id/cancel.
const MAX_REASON = 500;

export default function TabletCancelDialog({

  open,
  alertType,
  onClose,
  onCancel

}) {

  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {

    if (open) {
      setOther(false);
      setText("");
      setError("");
      setSaving(false);
    }

  }, [open]);

  async function submit(reason) {

    setSaving(true);
    setError("");

    try {

      const result = await onCancel(reason);

      if (result && result.success === false) {
        setError(result.message || "The alert was NOT cancelled.");
        setSaving(false);
      }

    } catch {

      setError("The alert was NOT cancelled: no connection to the server. Try again, or call your lead.");
      setSaving(false);

    }

  }

  const clean = text.trim();

  const bigButton = {
    py: 2.5,
    fontSize: 22,
    fontWeight: "bold"
  };

  return (

    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >

      <DialogTitle sx={{ fontSize: 28, fontWeight: "bold" }}>
        Why cancel this {alertType} alert?
      </DialogTitle>

      <DialogContent>

        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>

          {!other && TABLET_CANCEL_REASONS.map(reason => (

            <Button
              key={reason}
              variant="outlined"
              size="large"
              disabled={saving}
              onClick={() => submit(reason)}
              sx={bigButton}
            >
              {reason}
            </Button>

          ))}

          {!other && (

            <Button
              variant="outlined"
              color="inherit"
              size="large"
              disabled={saving}
              onClick={() => setOther(true)}
              sx={bigButton}
            >
              Other
            </Button>

          )}

          {other && (

            <TextField
              label="What happened?"
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_REASON))}
              multiline
              minRows={2}
              autoFocus
              fullWidth
              disabled={saving}
              helperText={`${clean.length}/${MAX_REASON}`}
              slotProps={{ input: { sx: { fontSize: 20 } } }}
            />

          )}

          {error && (
            <Alert severity="error" sx={{ fontSize: 18 }}>
              {error}
            </Alert>
          )}

        </Box>

      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 2 }}>

        <Button
          size="large"
          disabled={saving}
          onClick={other ? () => setOther(false) : onClose}
          sx={{ fontSize: 18 }}
        >
          {other ? "Back" : "Keep alert open"}
        </Button>

        {other && (

          <Button
            variant="contained"
            color="error"
            size="large"
            disabled={saving || !clean}
            onClick={() => submit(clean)}
            sx={{ fontSize: 18, fontWeight: "bold" }}
          >
            {saving ? "Cancelling…" : "Cancel alert"}
          </Button>

        )}

      </DialogActions>

    </Dialog>

  );

}
