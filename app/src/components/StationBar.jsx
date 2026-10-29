import { useEffect, useState } from "react";

import { Box, ButtonBase } from "@mui/material";

import { getProductionLines } from "../api/productionLines";
import { useProductionLine } from "../context/ProductionLineContext";
import { useWorkCenter } from "../context/WorkCenterContext";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Station strip (E2): LINE and WORK CENTER as big tap
// chips, replacing the line toggle and the work-center
// dropdown. The choice is remembered on the tablet as
// before (ProductionLine / WorkCenter contexts).
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

export default function StationBar() {

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
                flexDirection: "column",
                gap: 1.25,
                px: 3,
                py: 2,
                bgcolor: "#0E1115",
                borderBottom: `1px solid ${tokens.line}`
            }}
        >

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

    );

}
