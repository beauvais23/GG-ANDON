import { useCallback, useEffect, useState } from "react";

import { Alert, Box, Button, Switch, TextField } from "@mui/material";

import { AdminPanel, AdminRow, Tag } from "./adminUi";

import { addFailureCode, getAllFailureCodes, setFailureCodeActive } from "../../api/hourly";
import { tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Failure codes (H3, 0011): the NCM form's Failure
// Code list, shown on the tablet after FAIL. Keep it the same
// as the form: add a code the form's way ("EC 060 - …") or
// turn one off. Codes are never deleted (history keeps them).
//------------------------------------------------------

export default function FailureCodesPanel() {

    const [codes, setCodes] = useState([]);
    const [label, setLabel] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(() => getAllFailureCodes().then(r => setCodes(r.codes)).catch(err => setError(err.message)), []);

    useEffect(() => { load(); }, [load]);

    async function act(run) {

        try { await run(); setError(""); await load(); } catch (err) { setError(err.message); }

    }

    const on = codes.filter(c => c.active).length;

    return (

        <AdminPanel title="Failure codes" meta={`${on} of ${codes.length} on · same list as the NCM form's Failure Code question`}>

            <AdminRow sx={{ bgcolor: tokens.ground }}>
                <TextField size="small" label="New code" placeholder="EC 060 - MISSING COMPONENT" value={label} onChange={e => setLabel(e.target.value.toUpperCase())} sx={{ minWidth: 420 }} slotProps={{ inputLabel: { shrink: true } }} />
                <Button variant="outlined" disabled={label.trim().length < 10} onClick={() => act(async () => { await addFailureCode(label.trim()); setLabel(""); })}>Add</Button>
                <Box sx={{ fontSize: 13, color: tokens.muted }}>Type it exactly as in the form, so the NCM link can fill it in.</Box>
            </AdminRow>

            {error && <Box sx={{ px: 2.25, py: 1 }}><Alert severity="error">{error}</Alert></Box>}

            {codes.map(c => (
                <AdminRow key={c.id} inactive={!c.active} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "90px minmax(300px, 1fr) 80px" } }}>
                    <Box><Tag>{c.code}</Tag></Box>
                    <Box sx={{ fontSize: 14 }}>{c.label.split(" - ").slice(1).join(" - ")}</Box>
                    <Switch size="small" checked={Boolean(c.active)} onChange={e => act(() => setFailureCodeActive(c.id, e.target.checked))} slotProps={{ input: { "aria-label": `${c.code} on` } }} />
                </AdminRow>
            ))}

        </AdminPanel>

    );

}
