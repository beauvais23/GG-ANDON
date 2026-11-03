import { useCallback, useEffect, useMemo, useState } from "react";

import { Box, ButtonBase } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import UndoIcon from "@mui/icons-material/Undo";
import CloseIcon from "@mui/icons-material/Close";

import FailDialog from "./FailDialog";
import OpenFailures from "./OpenFailures";

import useTapQueue, { UNDO_SECONDS } from "../hooks/useTapQueue";
import { getFailureCodes, getOpenFailures, getPlan } from "../api/hourly";
import { labelSx, tokens } from "../theme/theme";
import { RAG_COLORS } from "../config/ragColors";
import { fpyColor } from "../config/fpyColors";

//------------------------------------------------------
// H2 count strip (Option 1A, Nov 3 2026): above the alert
// buttons on the count station (Final Test; PCB Coating:
// Production). One tap on +1 GOOD per good unit. The SKU
// choice stays until changed (remembered per board); the SKU
// chips are today's plan runs. Undo for 30 s. Taps wait in an
// offline queue when there is no connection.
// H3: FAIL → failure code (same queue and 30 s undo); open
// failures → REWORK PASSED or SCRAP (then the NCM form).
// PCB Test (pcb, 0012): the same strip with PASS / FAIL per
// board for PCB FPY; passes never count toward Actual.
//------------------------------------------------------

const todayNY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const skuKey = (board, pcb) => `countSku:${board}${pcb ? ":pcb" : ""}`;

function readSku(board, pcb) {

    try { return localStorage.getItem(skuKey(board, pcb)) || ""; } catch { return ""; }

}

function SkuChip({ selected, onClick, children }) {

    return (

        <ButtonBase
            onClick={onClick}
            aria-pressed={selected}
            focusRipple
            sx={{
                height: 40,
                px: 1.5,
                borderRadius: "2px",
                fontFamily: tokens.mono,
                fontSize: 14,
                whiteSpace: "nowrap",
                bgcolor: selected ? tokens.blue : tokens.panel,
                color: selected ? "#FFFFFF" : "#C9D1D9",
                border: `1px solid ${selected ? tokens.blueText : tokens.lineStrong}`
            }}
        >
            {children}
        </ButtonBase>

    );

}

function Stat({ label, value, of, rag }) {

    return (

        <Box sx={{ minWidth: 120 }}>
            <Box sx={{ ...labelSx, fontSize: 11 }}>{label}</Box>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                <Box sx={{ fontFamily: tokens.mono, fontSize: 34, fontWeight: 600, color: rag ? RAG_COLORS[rag] : "#E6EDF3", lineHeight: 1.1 }}>{value}</Box>
                <Box sx={{ fontFamily: tokens.mono, fontSize: 16, color: tokens.muted }}>/ {of}</Box>
            </Box>
        </Box>

    );

}

export default function CountStrip({ board, productionLine, workCenter, pcb = false }) {

    const [day, setDay] = useState(null);
    const [error, setError] = useState("");
    const [sku, setSku] = useState(() => readSku(board, pcb));
    const station = pcb ? "PCB" : undefined;
    const [now, setNow] = useState(Date.now());

    const [codes, setCodes] = useState([]);
    const [open, setOpen] = useState([]);
    const [failing, setFailing] = useState(false);
    const [showOpen, setShowOpen] = useState(false);

    useEffect(() => { getFailureCodes().then(r => setCodes(r.codes)).catch(() => setCodes([])); }, []);

    const load = useCallback(async () => {

        try {

            setDay(await getPlan(board, todayNY()));
            setOpen((await getOpenFailures(board, station)).failures);
            setError("");

        } catch (err) {

            setError(err.message);

        }

    }, [board, station]);

    const { queue, last, tap, fail, undo, message } = useTapQueue({ onSent: load });

    useEffect(() => { load(); const id = setInterval(load, 60 * 1000); return () => clearInterval(id); }, [load]);
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

    const skus = useMemo(() => [...new Set((day?.runs || []).map(r => r.sku))], [day]);
    const current = day?.periods.find(p => p.status === "now") || null;

    // Default SKU: the remembered one if it is on today's plan, else the
    // run planned for this hour, else the first run.
    const planNow = current ? Object.entries(current.plan).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
    const chosen = skus.includes(sku) ? sku : (planNow || skus[0] || "");

    const choose = s => {

        setSku(s);
        try { localStorage.setItem(skuKey(board, pcb), s); } catch { /* per-tablet convenience */ }

    };

    // Taps not sent yet count on screen straight away.
    const mine = queue.filter(t => t.board === board && t.station === station);
    const waiting = mine.filter(t => t.kind !== "fail").length;
    const stuck = mine.filter(t => now - t.tappedAt > 5000).length;
    const waitingFails = mine.filter(t => t.kind === "fail").length;
    const hourActual = (current?.actualTotal || 0) + waiting;
    const shiftActual = (day?.actualTotal || 0) + waiting;
    const undoLeft = last ? Math.max(0, UNDO_SECONDS - Math.floor((now - last.at) / 1000)) : 0;

    if (error && !day)
        return <Box sx={{ mx: 3, mt: 1.5, p: 1.5, border: `1px solid ${tokens.lineStrong}`, color: "#FFA040" }}>Count strip: {error}</Box>;

    if (!day)
        return null;

    if (!day.saved || skus.length === 0)
        return (
            <Box sx={{ mx: 3, mt: 1.5, px: 2, py: 1.5, bgcolor: tokens.panel, border: `1px solid ${tokens.line}`, color: tokens.muted }}>
                <Box component="span" sx={{ ...labelSx, mr: 1.5 }}>Count · {workCenter}</Box>
                No plan for {board} today. Counting starts when your lead saves today's plan on the hour-by-hour board.
            </Box>
        );

    return (

        <Box component="section" aria-label={pcb ? "PCB test pass and fail" : "Count good units"} sx={{ mx: 3, mt: 1.5, display: "flex", alignItems: "stretch", gap: 2, flexWrap: { xs: "wrap", lg: "nowrap" }, px: 2, py: 1.25, bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

            <Box sx={{ flex: 1, minWidth: 0 }}>

                <Box sx={{ ...labelSx, mb: 0.75 }}>{pcb ? "PCB test · pass / fail" : `Count · ${workCenter}`} · SKU</Box>

                <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
                    {skus.map(s => <SkuChip key={s} selected={s === chosen} onClick={() => choose(s)}>{s}</SkuChip>)}
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.75 }}>

                    <ButtonBase
                        onClick={() => setShowOpen(true)}
                        sx={{ height: 34, px: 1.5, borderRadius: "2px", border: `1px solid ${open.length ? "#F85149" : tokens.lineStrong}`, color: open.length ? "#F85149" : tokens.muted, fontSize: 13, letterSpacing: "1px" }}
                    >
                        OPEN FAILURES · {open.length + waitingFails}
                    </ButtonBase>

                    {!pcb && day.quality?.fpy !== null && day.quality?.fpy !== undefined && (
                        <Box sx={{ fontSize: 13, color: tokens.muted }}>FPY today <Box component="span" sx={{ fontFamily: tokens.mono, color: fpyColor(day.quality.fpy, day.settings) }}>{day.quality.fpy}%</Box></Box>
                    )}

                </Box>

                <Box sx={{ mt: 0.5, fontSize: 13, minHeight: 18, color: message ? "#FF6B6B" : "#FFA040" }}>
                    {message || (stuck ? `${stuck} tap${stuck === 1 ? "" : "s"} waiting to send (no connection). They will send by themselves.` : "")}
                </Box>

            </Box>

            {pcb ? (
                <>
                    <Stat label="PCBs passed today" value={(day.pcb?.pass || 0) + waiting} of={(day.pcb?.pass || 0) + (day.pcb?.fail || 0) + waiting + waitingFails} />
                    <Box sx={{ minWidth: 120 }}>
                        <Box sx={{ ...labelSx, fontSize: 11 }}>PCB FPY today</Box>
                        <Box sx={{ fontFamily: tokens.mono, fontSize: 34, fontWeight: 600, lineHeight: 1.1, color: fpyColor(day.pcb?.fpy, day.settings) }}>{day.pcb?.fpy === null || day.pcb?.fpy === undefined ? "—" : `${day.pcb.fpy}%`}</Box>
                    </Box>
                </>
            ) : (
                <>
                    <Stat label={current ? `This hour · ${current.label}` : "This hour"} value={hourActual} of={current ? current.total : 0} rag={current?.rag} />
                    <Stat label="Shift · so far" value={shiftActual} of={day.planToNow} rag={day.rag} />
                </>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, width: 250 }}>

                <ButtonBase
                    onClick={() => tap({ board, sku: chosen, productionLine, workCenter, station })}
                    disabled={!chosen}
                    focusRipple
                    aria-label={pcb ? `PCB passed ${chosen}` : `Count one good ${chosen}`}
                    sx={{ flex: 1, minHeight: 64, borderRadius: "2px", bgcolor: "#1F7A3A", color: "#FFFFFF", border: "1px solid #2EA352", fontFamily: tokens.display, fontWeight: 700, fontSize: 30, letterSpacing: "2px", "&:active": { bgcolor: "#2EA352" } }}
                >
                    {pcb ? "PASS" : <><AddIcon sx={{ fontSize: 32, mr: 0.5 }} /> 1 GOOD</>}
                </ButtonBase>

                <Box sx={{ display: "flex", gap: 0.75 }}>

                    <ButtonBase
                        onClick={() => setFailing(true)}
                        disabled={!chosen || !codes.length}
                        focusRipple
                        aria-label={`Fail one ${chosen}`}
                        sx={{ flex: 1, height: 40, borderRadius: "2px", bgcolor: "#5C1A1A", border: "1px solid #F85149", color: "#FFFFFF", fontFamily: tokens.display, fontWeight: 700, fontSize: 18, letterSpacing: "2px" }}
                    >
                        <CloseIcon sx={{ fontSize: 20, mr: 0.5 }} /> FAIL
                    </ButtonBase>

                    <ButtonBase
                        onClick={undo}
                        disabled={!undoLeft}
                        sx={{ flex: 1, height: 40, borderRadius: "2px", border: `1px solid ${tokens.lineStrong}`, color: undoLeft ? "#E6EDF3" : tokens.muted, fontSize: 12, letterSpacing: "1px", opacity: undoLeft ? 1 : 0.5 }}
                    >
                        <UndoIcon sx={{ fontSize: 16, mr: 0.5 }} /> {undoLeft ? `UNDO ${last.kind === "fail" ? "FAIL" : "LAST"} (${undoLeft}s)` : "UNDO"}
                    </ButtonBase>

                </Box>

            </Box>

            {failing && (
                <FailDialog
                    sku={chosen}
                    codes={codes}
                    onClose={() => setFailing(false)}
                    onPick={c => { setFailing(false); fail({ board, sku: chosen, code: c.code, productionLine, workCenter, station }); }}
                />
            )}

            {showOpen && <OpenFailures failures={open} codes={codes} onClose={() => setShowOpen(false)} onChanged={load} />}

        </Box>

    );

}
