import { useCallback, useEffect, useState } from "react";

import { Alert, Box, Button, IconButton, TextField, Tooltip } from "@mui/material";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { AdminPanel, AdminRow, EmptyRow, Tag } from "./adminUi";

import { addRate, addSku, deleteRate, getBoards, getPlanSettings, getProducts, removeSku, resolveSku, saveHourlySettings } from "../../api/hourly";
import { labelSx, tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Products & rates (hour-by-hour board, H1)
//
// Families are the Ship Report's SKU prefixes (Team A /
// Team B tabs) plus the SpaceX families and Coating. A
// family rate applies to all its SKUs; a SKU rate
// overrides it. Every rate has an effective date; plans
// keep the rate they were saved with.
//
// SKU list (0008): SKUs listed under their family (the
// SpaceX boards start with the 19 active QuickBooks SKUs).
// A listed SKU shows the rate in effect: its own, or the
// family's. Add to list / remove here; rates are kept.
//------------------------------------------------------

function rateText(rate) {

    if (!rate)
        return <Box component="span" sx={{ color: "#FFA040" }}>No rate yet</Box>;

    return (
        <>
            {rate.unitsPerHour}/hr{" "}
            <Box component="span" sx={{ color: tokens.muted }}>
                {rate.source === "sku" ? `own rate since ${rate.effectiveDate}` : "family rate"}
            </Box>
        </>
    );

}

function RateForm({ label, onSave, today }) {

    const [rate, setRate] = useState("");
    const [date, setDate] = useState(today);

    return (

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>

            <TextField size="small" type="number" label={label} value={rate} onChange={e => setRate(e.target.value)} sx={{ width: 110 }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: "any" } }} />

            <TextField size="small" type="date" label="From" value={date} onChange={e => setDate(e.target.value)} sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />

            <Button size="small" variant="outlined" disabled={!(Number(rate) > 0) || !date} onClick={async () => { await onSave(Number(rate), date); setRate(""); }}>
                Set
            </Button>

        </Box>

    );

}

// H2: RAG thresholds for the boards (percent of plan).
function RagSettings() {

    const [green, setGreen] = useState("");
    const [amber, setAmber] = useState("");
    const [note, setNote] = useState("");

    useEffect(() => {

        getPlanSettings().then(s => { setGreen(String(s.green_pct)); setAmber(String(s.amber_pct)); }).catch(() => {});

    }, []);

    async function save() {

        try {

            const s = await saveHourlySettings(Number(green), Number(amber));

            setNote(`Saved: green ≥ ${s.green_pct}%, amber ≥ ${s.amber_pct}%, red below.`);

        } catch (err) {

            setNote(err.message);

        }

    }

    return (

        <AdminRow sx={{ bgcolor: tokens.ground }}>
            <Box sx={{ ...labelSx, minWidth: 160 }}>Board colours</Box>
            <TextField size="small" type="number" label="Green at or above %" value={green} onChange={e => setGreen(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="number" label="Amber at or above %" value={amber} onChange={e => setAmber(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
            <Button size="small" variant="outlined" onClick={save}>Save</Button>
            <Box sx={{ fontSize: 13, color: tokens.muted }}>{note || "Below amber is red. The current hour is compared with the plan so far."}</Box>
        </AdminRow>

    );

}

export default function ProductsPanel() {

    const [boards, setBoards] = useState([]);
    const [board, setBoard] = useState("");
    const [today, setToday] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [sku, setSku] = useState("");
    const [skuInfo, setSkuInfo] = useState(null);
    const [open, setOpen] = useState({});

    useEffect(() => {

        getBoards().then(b => { setBoards(b.boards); setBoard(b.boards[0]); setToday(b.today); }).catch(err => setError(err.message));

    }, []);

    const load = useCallback(async () => {

        if (!board || !today)
            return;

        try {

            setData(await getProducts(board, today));
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, [board, today]);

    useEffect(() => { load(); }, [load]);

    async function act(run) {

        try {

            await run();
            await load();

        } catch (err) {

            setError(err.message);

        }

    }

    async function checkSku(value) {

        setSku(value);
        setSkuInfo(value.trim() ? await resolveSku(value.trim(), today).catch(() => null) : null);

    }

    const withRate = data?.families.filter(f => f.rate).length || 0;

    // Long lists (Team B has 600+ SKUs) start folded; short ones open.
    const listed = data ? data.skus.filter(s => s.sku !== s.prefix) : [];
    const isOpen = id => open[`${board}:${id}`] ?? listed.length <= 25;
    const toggle = id => setOpen({ ...open, [`${board}:${id}`]: !isOpen(id) });

    return (

        <AdminPanel title="Products & rates" meta="Units per hour for the hour-by-hour boards. Families come from the Ship Report prefixes.">

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                {boards.map(b => (
                    <Button key={b} size="small" variant={b === board ? "contained" : "outlined"} color={b === board ? "primary" : "inherit"} onClick={() => setBoard(b)} sx={{ borderColor: tokens.lineStrong }}>
                        {b}
                    </Button>
                ))}
            </Box>

            <RagSettings />

            {error && <Box sx={{ px: 2.25, pt: 1.5 }}><Alert severity="error">{error}</Alert></Box>}

            {data && (

                <>

                    <Box sx={{ ...labelSx, px: 2.25, py: 1.25, bgcolor: tokens.ground }}>
                        Families · {withRate} of {data.families.length} have a rate today
                    </Box>

                    {data.families.length === 0 && <EmptyRow>No families on this board.</EmptyRow>}

                    {data.families.map(f => {

                        const skus = listed.filter(s => s.family_id === f.id);

                        return (

                            <Box key={f.id}>

                                <AdminRow sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "minmax(300px, 1fr) 260px 380px 40px" } }}>

                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                        <Tag>{f.prefix}</Tag>
                                        {skus.length > 0 && (
                                            <Button size="small" color="inherit" onClick={() => toggle(f.id)} startIcon={isOpen(f.id) ? <ExpandMoreIcon /> : <ChevronRightIcon />} sx={{ color: tokens.muted, letterSpacing: "1px" }}>
                                                {skus.length} SKU{skus.length === 1 ? "" : "s"}
                                            </Button>
                                        )}
                                    </Box>

                                    <Box sx={{ fontFamily: tokens.mono, fontSize: 14 }}>
                                        {f.rate
                                            ? <>{f.rate}/hr <Box component="span" sx={{ color: tokens.muted }}>since {f.rateEffective}</Box></>
                                            : <Box component="span" sx={{ color: "#FFA040" }}>No rate yet</Box>}
                                    </Box>

                                    <RateForm label="Family units/hr" today={today} onSave={(rate, date) => act(() => addRate({ familyId: f.id, unitsPerHour: rate, effectiveDate: date }))} />

                                    <Box />

                                </AdminRow>

                                {isOpen(f.id) && skus.map(s => (

                                    <AdminRow key={s.id} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "minmax(300px, 1fr) 260px 380px 40px" }, py: 0.75 }}>

                                        <Box sx={{ fontFamily: tokens.mono, fontSize: 14, pl: { md: 3 }, borderLeft: { md: `2px solid ${tokens.lineStrong}` } }}>{s.sku}</Box>

                                        <Box sx={{ fontFamily: tokens.mono, fontSize: 14 }}>{rateText(s.rate)}</Box>

                                        <RateForm label="SKU units/hr" today={today} onSave={(rate, date) => act(() => addRate({ sku: s.sku, unitsPerHour: rate, effectiveDate: date }))} />

                                        <Tooltip title="Remove from the list (rates are kept)">
                                            <IconButton size="small" aria-label={`Remove ${s.sku} from the list`} onClick={() => act(() => removeSku(s.id))} sx={{ color: tokens.muted }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                                        </Tooltip>

                                    </AdminRow>

                                ))}

                            </Box>

                        );

                    })}

                    <Box sx={{ ...labelSx, px: 2.25, py: 1.25, bgcolor: tokens.ground }}>
                        SKU rates · every SKU override, newest first · add a SKU to the list or give it its own rate
                    </Box>

                    {data.skuRates.map(r => (

                        <AdminRow key={r.id} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "minmax(260px, 1fr) 140px 160px 60px" } }}>
                            <Box sx={{ fontFamily: tokens.mono }}>{r.sku}</Box>
                            <Box sx={{ fontFamily: tokens.mono }}>{r.units_per_hour}/hr</Box>
                            <Box sx={{ color: tokens.muted }}>from {r.effective_date}</Box>
                            <Tooltip title="Delete this SKU rate">
                                <IconButton size="small" aria-label={`Delete rate for ${r.sku}`} onClick={() => act(() => deleteRate(r.id))} sx={{ color: tokens.muted }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                            </Tooltip>
                        </AdminRow>

                    ))}

                    <AdminRow sx={{ bgcolor: tokens.ground }}>

                        <TextField size="small" label="SKU" value={sku} onChange={e => checkSku(e.target.value.toUpperCase())} sx={{ minWidth: 300 }} slotProps={{ inputLabel: { shrink: true } }} />

                        <Box sx={{ fontSize: 13, minWidth: 220, color: skuInfo && !skuInfo.family ? "#FFA040" : tokens.muted }}>
                            {skuInfo?.family
                                ? `${skuInfo.family.prefix} · ${skuInfo.family.board}${skuInfo.family.board !== board ? " (another board)" : ""}`
                                : skuInfo ? "Matches no family: not on a board" : ""}
                        </Box>

                        <RateForm
                            label="Units/hr"
                            today={today}
                            onSave={(rate, date) => act(async () => { await addRate({ sku: sku.trim(), unitsPerHour: rate, effectiveDate: date }); setSku(""); setSkuInfo(null); })}
                        />

                        <Button
                            size="small"
                            variant="outlined"
                            disabled={!skuInfo?.family || data.skus.some(s => s.sku === sku.trim()) || skuInfo.family.board !== board}
                            onClick={() => act(async () => { await addSku(sku.trim()); setSku(""); setSkuInfo(null); })}
                        >
                            Add to SKU list
                        </Button>

                    </AdminRow>

                </>

            )}

        </AdminPanel>

    );

}
