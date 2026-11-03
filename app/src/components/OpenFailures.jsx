import { useState } from "react";

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import QrCode from "./QrCode";

import { disposeFailure } from "../api/hourly";
import { ncmFormUrl } from "../config/ncmForm";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// H3: open failures on this board. Each stays open until
// REWORK PASSED (adds 1 to Actual in the hour it passed) or
// SCRAP (then the NCM form opens with the unit filled in).
//------------------------------------------------------

const time = ms => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default function OpenFailures({ failures, codes, onClose, onChanged }) {

    const [scrapped, setScrapped] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [error, setError] = useState("");

    const label = code => codes.find(c => c.code === code)?.label || code;

    async function dispose(f, disposition) {

        setError("");

        try {

            const r = await disposeFailure(f.fail_id, disposition);

            if (!r.ok)
                throw new Error(r.data.message || "Not saved.");

            setConfirm(null);

            if (disposition === "SCRAP")
                setScrapped({ ...f, codeLabel: label(f.code) });

            onChanged();

        } catch (err) {

            setError(err.message === "Failed to fetch" ? "No connection. Try again." : err.message);

        }

    }

    if (scrapped) {

        const url = ncmFormUrl(scrapped);

        return (

            <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontFamily: tokens.display, letterSpacing: "1.5px", textTransform: "uppercase" }}>Scrapped · fill out the NCM</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <Box sx={{ fontFamily: tokens.mono }}>{scrapped.sku} · {scrapped.codeLabel}</Box>
                    <Button variant="contained" size="large" startIcon={<OpenInNewIcon />} href={url} target="_blank" rel="noopener" sx={{ minHeight: 56, px: 3 }}>Fill out NCM form</Button>
                    <QrCode value={url} />
                    <Box sx={{ fontSize: 13, color: tokens.muted }}>Or scan with your phone.</Box>
                </DialogContent>
                <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
            </Dialog>

        );

    }

    return (

        <Dialog open onClose={onClose} maxWidth="md" fullWidth>

            <DialogTitle sx={{ fontFamily: tokens.display, letterSpacing: "1.5px", textTransform: "uppercase" }}>Open failures · {failures.length}</DialogTitle>

            <DialogContent>

                {failures.length === 0 && <Box sx={{ color: tokens.muted, py: 2 }}>No open failures.</Box>}

                {failures.map(f => (

                    <Box key={f.fail_id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, py: 1.25, borderBottom: `1px solid ${tokens.line}` }}>

                        <Box sx={{ flex: 1, minWidth: 260 }}>
                            <Box sx={{ fontFamily: tokens.mono }}>{f.sku}</Box>
                            <Box sx={{ fontSize: 13, color: tokens.muted }}>{label(f.code)} · failed {time(f.failed_at)}{f.plan_date ? ` · ${f.plan_date}` : ""}</Box>
                        </Box>

                        {confirm === f.fail_id ? (
                            <>
                                <Box sx={{ ...labelSx, color: "#F85149" }}>Scrap this unit?</Box>
                                <Button color="inherit" onClick={() => setConfirm(null)}>No</Button>
                                <Button variant="contained" color="error" onClick={() => dispose(f, "SCRAP")}>Yes, scrap</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="contained" color="success" onClick={() => dispose(f, "REWORK_PASS")} sx={{ minHeight: 48 }}>Rework passed</Button>
                                <Button variant="outlined" color="error" onClick={() => setConfirm(f.fail_id)} sx={{ minHeight: 48 }}>Scrap</Button>
                            </>
                        )}

                    </Box>

                ))}

                {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}

            </DialogContent>

            <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>

        </Dialog>

    );

}
