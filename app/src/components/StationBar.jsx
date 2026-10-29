import { useEffect, useState } from "react";

import { Box, ButtonBase } from "@mui/material";

import { getProductionLines } from "../api/productionLines";
import { useProductionLine } from "../context/ProductionLineContext";
import { useWorkCenter } from "../context/WorkCenterContext";
import { labelSx, tokens } from "../theme/theme";
import { ALERT_COLORS, alertLabel } from "../config/alertColors";

import TimerOffOutlinedIcon from "@mui/icons-material/TimerOffOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

//------------------------------------------------------
// Station strip (E2): LINE and WORK CENTER as big tap
// chips, replacing the line toggle and the work-center
// dropdown. The choice is remembered on the tablet as
// before (ProductionLine / WorkCenter contexts).
// Option B: DOWNTIME and NEAR MISS buttons on the right,
// under the clock (Director's layout, Oct 29 2026).
//------------------------------------------------------

function Chip({ selected, onClick, children }) {

    return (

        <ButtonBase
            onClick={onClick}
            aria-pressed={selected}
            focusRipple
            sx={{
                height: 44,
                px: 2,
                borderRadius: "2px",
                fontWeight: 600,
                fontSize: 15,
                bgcolor: selected ? tokens.blue : tokens.panel,
                color: selected ? "#FFFFFF" : "#C9D1D9",
                border: `1px solid ${selected ? tokens.blueText : tokens.lineStrong}`
            }}
        >
            {children}
        </ButtonBase>

    );

}

function Row({ label, children }) {

    return (

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Box component="span" sx={{ ...labelSx, width: 130 }}>{label}</Box>
            {children}
        </Box>

    );

}

const QUICK = [
    { type: "DOWNTIME", subtitle: "Line stopped", icon: <TimerOffOutlinedIcon /> },
    { type: "NEAR_MISS", subtitle: "Report a near miss", icon: <ReportProblemOutlinedIcon /> }
];

function QuickButton({ type, subtitle, icon, onClick }) {

    const colors = ALERT_COLORS[type];

    return (

        <ButtonBase
            onClick={onClick}
            focusRipple
            sx={{
                width: { xs: "100%", sm: 250 },
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 1.5,
                px: 1.75,
                py: 0.5,
                bgcolor: colors.fill,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderLeft: `5px solid ${colors.edge}`,
                borderRadius: "2px",
                textAlign: "left",
                "&:hover": { filter: "brightness(1.08)" },
                "&:active": { filter: "brightness(0.92)" },
                "& svg": { fontSize: 30 }
            }}
        >
            {icon}
            <Box>
                <Box sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 22, letterSpacing: "2px", lineHeight: 1 }}>
                    {alertLabel(type)}
                </Box>
                <Box sx={{ fontSize: 12, opacity: 0.85, mt: 0.25 }}>{subtitle}</Box>
            </Box>
        </ButtonBase>

    );

}

export default function StationBar({ onRaise }) {

    const { productionLine, changeProductionLine } = useProductionLine();
    const { workCenters, workCenter, changeWorkCenter } = useWorkCenter();

    const [lines, setLines] = useState([]);

    useEffect(() => {

        getProductionLines()
            .then(all => setLines(
                all
                    .filter(line => line.active)
                    .sort((a, b) => a.display_order - b.display_order)
            ))
            .catch(err => console.error(err));

    }, []);

    return (

        <Box
            component="section"
            aria-label="Station"
            sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 2,
                px: 3,
                py: 2,
                bgcolor: "#0E1115",
                borderBottom: `1px solid ${tokens.line}`
            }}
        >

            <Box sx={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 1.25 }}>

            <Row label="Line">
                {lines.map(line => (
                    <Chip
                        key={line.id}
                        selected={line.name === productionLine}
                        onClick={() => changeProductionLine(line.name)}
                    >
                        {line.name}
                    </Chip>
                ))}
            </Row>

            <Row label="Work center">
                {workCenters.map(wc => (
                    <Chip
                        key={wc.id}
                        selected={wc.name === workCenter}
                        onClick={() => changeWorkCenter(wc.name)}
                    >
                        {wc.name}
                    </Chip>
                ))}
            </Row>

            </Box>

            <Box sx={{ display: "flex", flexDirection: { xs: "row", lg: "column" }, gap: 1.25, flexWrap: "wrap", width: { xs: "100%", lg: "auto" } }}>
                {QUICK.map(q => (
                    <QuickButton key={q.type} {...q} onClick={() => onRaise(q.type)} />
                ))}
            </Box>

        </Box>

    );

}
