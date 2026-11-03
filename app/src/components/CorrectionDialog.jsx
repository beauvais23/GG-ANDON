import { useState } from "react";

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";

import { correctCount } from "../api/hourly";
import { tokens } from "../theme/theme";

//------------------------------------------------------
// Count correction (0010, admins on /board): set one hour's
// Actual for one SKU to the right number. Saved as a signed
// change with a reason and a name, kept as a trail (never
// edited or deleted; a wrong correction is fixed by another).
//------------------------------------------------------

const REASONS = ["Missed taps", "Double tap", "Wrong SKU", "Wrong hour", "Other"];
const NAME_KEY = "correctedBy";

function readName() {

    try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }

}

export default function CorrectionDialog({ board, date, period, index, skuOptions, onClose, onSaved }) {

    const skus = [...new Set([...Object.keys(period.actual), ...Object.keys(period.plan), ...skuOptions])];

    const [sku, setSku] = useState(skus[0] || "");
    const [count, setCount] = useState(String(period.actual[skus[0]] || 0));
    const [reason, setReason] = useState("Missed taps");
    const [other, setOther] = useState("");
    const [by, setBy] = useState(readName);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const current = period.actual[sku] || 0;
    const delta = count === "" ? 0 : Number(count) - current;
    const text = reason === "Other" ? other.trim() : reason;

    async function save() {

        setSaving(true);
        setError("");

        try {

            try { localStorage.setItem(NAME_KEY, by.trim()); } catch { /* convenience only */ }

            onSaved(await correctCount({ board, date, period: index, sku, delta, reason: text, by: by.trim() }));

        } catch (err) {

            setError(err.message);
            setSaving(false);

        }

    }

    const valid = sku && Number.isInteger(Number(count)) && Number(count) >= 0 && delta !== 0 && text.length >= 3 && by.trim().length >= 2;

    return (

        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>

            <DialogTitle sx={{ fontFamily: tokens.display, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Correct count · {board} · {period.label}
            </DialogTitle>

            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>

                <TextField select size="small" label="SKU" value={sku} onChange={e => { setSku(e.target.value); setCount(String(period.actual[e.target.value] || 0)); }}>
                    {skus.map(s => <MenuItem key={s} value={s} sx={{ fontFamily: tokens.mono }}>{s} · now {period.actual[s] || 0}</MenuItem>)}
                </TextField>

                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <TextField size="small" type="number" label="Correct count for this hour" value={count} onChange={e => setCount(e.target.value)} sx={{ width: 240 }} slotProps={{ htmlInput: { min: 0 } }} />
                    <Box sx={{ fontFamily: tokens.mono, color: delta ? "#E6EDF3" : tokens.muted }}>
                        was {current} → {delta > 0 ? `+${delta}` : delta || "no change"}
                    </Box>
                </Box>

                <ToggleButtonGroup exclusive size="small" value={reason} onChange={(e, v) => v && setReason(v)} sx={{ flexWrap: "wrap" }}>
                    {REASONS.map(r => <ToggleButton key={r} value={r}>{r}</ToggleButton>)}
                </ToggleButtonGroup>

                {reason === "Other" && <TextField size="small" label="Reason" value={other} onChange={e => setOther(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 200 } }} />}

                <TextField size="small" label="Your name" value={by} onChange={e => setBy(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 80 } }} />

                <Box sx={{ fontSize: 13, color: tokens.muted }}>
                    Wrong SKU or wrong hour: correct both sides (one down, the other up). Corrections are kept and listed under the board.
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

            </DialogContent>

            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={!valid || saving}>{saving ? "Saving…" : "Save correction"}</Button>
            </DialogActions>

        </Dialog>

    );

}
