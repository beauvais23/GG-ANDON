import { useEffect, useState } from "react";

import { Link as RouterLink } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, MenuItem, TextField } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import SendIcon from "@mui/icons-material/Send";

import { getReasons, searchItems, sendRequest } from "../../api/bom";
import { labelSx, tokens } from "../../theme/theme";
import { CHANGE_COLORS } from "./changeColors";

//------------------------------------------------------
// BOM change request builder (Nov 6 2026), under the BOM on
// /bom in change mode: add a component, then reason, NCM/ECO,
// note, your name (remembered per browser) → Send alert.
// The marked lines come from the BOM table (marks / adds).
//------------------------------------------------------

const NAME_KEY = "bomRequestedBy";

const remembered = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };

export function AddComponent({ onAdd, exclude }) {

    const [q, setQ] = useState("");
    const [options, setOptions] = useState([]);
    const [item, setItem] = useState(null);
    const [qty, setQty] = useState("1");

    useEffect(() => {

        if (q.trim().length < 2) {

            setOptions([]);
            return;

        }

        let live = true;
        const t = setTimeout(() => {

            searchItems(q.trim()).then(r => { if (live) setOptions(r.items.filter(i => !exclude.has(i.full_name))); }, () => {});

        }, 250);

        return () => { live = false; clearTimeout(t); };

    }, [q, exclude]);

    const ok = item && Number(qty) > 0;

    return (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", px: 2.25, py: 1.25, borderBottom: `1px solid ${tokens.line}`, bgcolor: "rgba(63,185,80,0.05)" }}>
            <Box sx={{ ...labelSx, fontSize: 12, color: CHANGE_COLORS.ADD, minWidth: 64 }}>Add</Box>
            <Autocomplete
                options={options}
                value={item}
                onChange={(e, v) => setItem(v)}
                inputValue={q}
                onInputChange={(e, v) => setQ(v)}
                filterOptions={x => x}
                getOptionLabel={o => `${o.full_name}${o.description ? ` — ${o.description}` : ""}`}
                isOptionEqualToValue={(a, b) => a.full_name === b.full_name}
                noOptionsText={q.trim().length < 2 ? "Type 2+ characters of the part number or description" : "No active part matches"}
                renderInput={p => <TextField {...p} size="small" label="Component to add" />}
                sx={{ flex: "1 1 360px", minWidth: 260 }}
            />
            <TextField size="small" label="Qty per" value={qty} onChange={e => setQty(e.target.value)} sx={{ width: 100 }} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <Button variant="outlined" color="inherit" startIcon={<AddIcon />} disabled={!ok} sx={{ borderColor: tokens.lineStrong }}
                onClick={() => { onAdd({ component: item.full_name, description: item.description, uom: item.uom, newQty: Number(qty) }); setItem(null); setQ(""); setQty("1"); }}>
                Add line
            </Button>
        </Box>
    );

}

export default function ChangeRequestPanel({ sku, changes, onSent, onCancel }) {

    const [reasons, setReasons] = useState([]);
    const [reason, setReason] = useState("");
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [name, setName] = useState(remembered);
    const [errors, setErrors] = useState([]);
    const [duplicates, setDuplicates] = useState(null);
    const [sending, setSending] = useState(false);

    useEffect(() => { getReasons().then(r => setReasons(r.reasons), () => {}); }, []);

    // confirmDuplicate: the person saw the open request(s) for the same
    // components and pressed Send anyway (duplicate guard, 409).
    async function send(confirmDuplicate = false) {

        setSending(true);
        setErrors([]);
        setDuplicates(null);

        try {

            const r = await sendRequest({ sku, reason, reference, note, requestedBy: name, lines: changes, confirmDuplicate });

            try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* private window */ }

            onSent(r.request);

        } catch (err) {

            if (err.data?.duplicates)
                setDuplicates(err.data.duplicates);
            else
                setErrors(err.data?.errors || [err.message]);

        } finally {

            setSending(false);

        }

    }

    const n = changes.length;

    return (
        <Box sx={{ px: 2.25, py: 2, borderTop: `1px solid ${tokens.lineStrong}` }}>

            <Box sx={{ ...labelSx, mb: 1.5 }}>Send BOM change alert · {n} change{n === 1 ? "" : "s"} marked</Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 200px 1fr 220px" }, gap: 1.5 }}>
                <TextField select size="small" label="Reason" value={reason} onChange={e => setReason(e.target.value)}>
                    {reasons.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </TextField>
                <TextField size="small" label="NCM / ECO # (optional)" value={reference} onChange={e => setReference(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
                <TextField size="small" label="Note (optional)" value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
                <TextField size="small" label="Your name" value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
            </Box>

            {errors.length > 0 && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                    {errors.map(e => <div key={e}>{e}</div>)}
                </Alert>
            )}

            {duplicates && (
                <Alert severity="warning" sx={{ mt: 1.5 }} action={<Button color="inherit" disabled={sending} onClick={() => send(true)}>Send anyway</Button>}>
                    Already in an open request for this config:
                    {duplicates.map(d => (
                        <div key={`${d.code}-${d.component}`}>
                            <Box component={RouterLink} to={`/bom/requests?code=${d.code}`} sx={{ color: "inherit", fontWeight: 700 }}>{d.code}</Box> · {d.component} ({d.action === "CHANGE_QTY" ? "change qty" : d.action.toLowerCase()}) · {d.requested_by}
                        </div>
                    ))}
                    Finish or cancel that request, or send this one anyway.
                </Alert>
            )}

            <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                <Button variant="contained" startIcon={<SendIcon />} disabled={sending || !n || !reason || !name.trim()} onClick={() => send(false)}>
                    {sending ? "Sending…" : "Send alert"}
                </Button>
                <Button color="inherit" onClick={onCancel}>Discard changes</Button>
            </Box>

        </Box>
    );

}
