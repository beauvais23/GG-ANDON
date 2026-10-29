import { Box, ButtonBase } from "@mui/material";

import ActiveAlertCard from "./ActiveAlertCard";
import { elapsed } from "../utils/alertTime";
import { tokens } from "../theme/theme";

//------------------------------------------------------
// Open alerts as rows, with optional type filters (E3).
// Used by the Response Center and the Dashboard.
//------------------------------------------------------

const TYPES = ["ALL", "QUALITY", "MAINTENANCE", "MATERIAL", "SUPERVISOR", "SAFETY"];

function Filter({ type, selected, onSelect }) {

    return (

        <ButtonBase
            onClick={() => onSelect(type)}
            aria-pressed={selected}
            sx={{
                height: 32,
                px: 1.5,
                borderRadius: "2px",
                fontSize: 13,
                fontWeight: 600,
                textTransform: "capitalize",
                bgcolor: selected ? tokens.blue : "transparent",
                color: selected ? "#FFFFFF" : "#C9D1D9",
                border: `1px solid ${selected ? tokens.blueText : tokens.lineStrong}`
            }}
        >
            {type.toLowerCase()}
        </ButtonBase>

    );

}

export default function AlertBoard({

    alerts,
    now,
    filter,
    onFilter,
    onAcknowledge,
    onResolve,
    onCancel

}) {

    const shown = !filter || filter === "ALL" ? alerts : alerts.filter(a => a.type === filter);

    return (

        <Box component="section" aria-label="Active alerts" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>

                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "2px", textTransform: "uppercase" }}>
                    Active alerts
                </Box>

                <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 13, px: 1, py: 0.25, color: "#FF8A80", border: "1px solid #5C2622" }}>
                    {shown.length}
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                {onFilter && TYPES.map(type => (
                    <Filter key={type} type={type} selected={filter === type} onSelect={onFilter} />
                ))}

            </Box>

            {shown.length === 0 && (
                <Box sx={{ p: 6, textAlign: "center", color: tokens.muted, fontFamily: tokens.display, fontWeight: 600, fontSize: 18, letterSpacing: "2px" }}>
                    NO ACTIVE ALERTS
                </Box>
            )}

            {shown.map(alert => (
                <ActiveAlertCard
                    key={alert.id}
                    alert={alert}
                    elapsed={elapsed(alert.requested, now)}
                    onAcknowledge={onAcknowledge}
                    onResolve={onResolve}
                    onCancel={onCancel}
                />
            ))}

        </Box>

    );

}
