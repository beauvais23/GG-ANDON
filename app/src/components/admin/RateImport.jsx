import { useEffect, useState } from "react";

import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";

import UploadIcon from "@mui/icons-material/FileUploadOutlined";

import { importRates } from "../../api/hourly";
import { labelSx, tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Products & rates → Import rates (Nov 4 2026).
// Paste rows from the capacity planner sheet: family prefix
// or SKU, cycle time (seconds per unit) or units per hour,
// optional effective date. Check shows what each row becomes;
// Save writes all rows or none.
//------------------------------------------------------

const EXAMPLE = "DMXP8\t185\nFBL4\t84\nFPX4-HO-50K-3P-THRU\t160\t11/10/2026";

export default function RateImport({ today, onSaved }) {

    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [unit, setUnit] = useState("seconds");
    const [date, setDate] = useState(today);
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);

    // today arrives after the boards load; fill the date once it does.
    useEffect(() => { if (today) setDate(d => d || today); }, [today]);

    async function run(save) {

        setBusy(true);
        setMessage(null);

        try {

            const r = await importRates({ text, unit, effectiveDate: date || today, save });

            setResult(r);

            if (save) {

                setMessage({ severity: "success", text: `Saved ${r.saved} rate${r.saved === 1 ? "" : "s"}.` });
                setText("");
                setResult(null);
                onSaved();

            }

        } catch (err) {

            setResult(err.data?.rows ? err.data : null);
            setMessage({ severity: "error", text: err.message });

        } finally {

            setBusy(false);

        }

    }

    if (!open)
        return (
            <Box sx={{ px: 2.25, py: 1.25, borderBottom: `1px solid ${tokens.line}` }}>
                <Button size="small" variant="outlined" startIcon={<UploadIcon />} onClick={() => setOpen(true)}>Import rates (paste from sheet)</Button>
            </Box>
        );

    const changed = () => { setResult(null); setMessage(null); };

    return (

        <Box component="section" aria-label="Import rates" sx={{ borderBottom: `1px solid ${tokens.line}`, bgcolor: tokens.ground }}>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, py: 1.25 }}>
                <Box sx={{ ...labelSx }}>Import rates</Box>
                <ToggleButtonGroup exclusive size="small" value={unit} onChange={(e, v) => { if (v) { setUnit(v); changed(); } }}>
                    <ToggleButton value="seconds">Cycle time (seconds per unit)</ToggleButton>
                    <ToggleButton value="perHour">Units per hour</ToggleButton>
                </ToggleButtonGroup>
                <TextField size="small" type="date" label="Effective from (if a row has no date)" value={date} onChange={e => { setDate(e.target.value); changed(); }} sx={{ width: 260 }} slotProps={{ inputLabel: { shrink: true } }} />
                <Box sx={{ flex: 1 }} />
                <Button size="small" color="inherit" onClick={() => { setOpen(false); setResult(null); setMessage(null); }}>Close</Button>
            </Box>

            <Box sx={{ px: 2.25, pb: 1.25 }}>
                <TextField
                    multiline
                    minRows={5}
                    maxRows={14}
                    fullWidth
                    label="Rows: family or SKU, value, optional date (copy the columns from Excel / Sheets)"
                    placeholder={EXAMPLE}
                    value={text}
                    onChange={e => { setText(e.target.value); changed(); }}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { style: { fontFamily: tokens.mono, fontSize: 13 } } }}
                />
                <Box sx={{ fontSize: 12, color: tokens.muted, mt: 0.75 }}>
                    A family prefix (e.g. WPX4, Z-DMX) sets the family rate; a full SKU sets that SKU's own rate. {unit === "seconds" ? "Units/hr = 3600 ÷ seconds, like the capacity planner." : ""} A header row is skipped.
                </Box>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, pb: 1.5 }}>
                <Button variant="outlined" disabled={busy || !text.trim()} onClick={() => run(false)}>Check</Button>
                <Button variant="contained" disabled={busy || !result || result.errors > 0 || !result.ok} onClick={() => run(true)}>
                    {result && !result.errors && result.ok ? `Save ${result.ok} rate${result.ok === 1 ? "" : "s"}` : "Save"}
                </Button>
                {result && <Box sx={{ fontSize: 13, color: result.errors ? "#F85149" : tokens.muted }}>{result.ok} ready · {result.errors} with a problem{result.errors ? " (fix them, then Check again; nothing is saved while any row has a problem)" : ""}</Box>}
            </Box>

            {message && <Box sx={{ px: 2.25, pb: 1.5 }}><Alert severity={message.severity}>{message.text}</Alert></Box>}

            {result?.rows?.length > 0 && (

                <Box sx={{ overflowX: "auto", px: 2.25, pb: 1.5 }}>
                    <Box sx={{ minWidth: 760 }}>
                        <Box sx={{ display: "grid", gridTemplateColumns: "50px minmax(200px, 1.5fr) 110px 140px 110px 120px minmax(220px, 2fr)", gap: 1, ...labelSx, fontSize: 11, py: 0.75, borderBottom: `1px solid ${tokens.line}` }}>
                            <span>Line</span><span>Pasted</span><span>Sets</span><span>Board</span><span>Units / hr</span><span>From</span><span>Problem</span>
                        </Box>
                        {result.rows.map(r => (
                            <Box key={r.line} sx={{ display: "grid", gridTemplateColumns: "50px minmax(200px, 1.5fr) 110px 140px 110px 120px minmax(220px, 2fr)", gap: 1, alignItems: "center", py: 0.6, borderBottom: `1px solid ${tokens.line}`, fontSize: 13, bgcolor: r.error ? "rgba(248,81,73,0.08)" : undefined }}>
                                <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{r.line}</Box>
                                <Box sx={{ fontFamily: tokens.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key} · {r.value}</Box>
                                <Box>{r.error ? "" : r.target === "family" ? "Family rate" : `SKU (${r.family})`}</Box>
                                <Box>{r.board || ""}</Box>
                                <Box sx={{ fontFamily: tokens.mono }}>{r.unitsPerHour ?? ""}</Box>
                                <Box sx={{ fontFamily: tokens.mono }}>{r.effectiveDate || ""}</Box>
                                <Box sx={{ color: "#F85149" }}>{r.error || ""}</Box>
                            </Box>
                        ))}
                    </Box>
                </Box>

            )}

        </Box>

    );

}
