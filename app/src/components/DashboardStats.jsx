import { Box } from "@mui/material";

import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Status strip (E3): five numbers in one hairline grid.
// Same props as before.
//------------------------------------------------------

function Stat({ label, value, color }) {

    return (

        <Box sx={{ bgcolor: tokens.panel, px: 2.25, py: 2, display: "flex", flexDirection: "column", gap: 0.75, borderRight: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
            <Box component="span" sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
            <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 36, lineHeight: 1.1, color }}>{value}</Box>
        </Box>

    );

}

export default function DashboardStats({

    active,
    waiting,
    acknowledged,
    oldest,
    average

}) {

    return (

        <Box
            component="section"
            aria-label="Status"
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" },
                borderTop: `1px solid ${tokens.line}`,
                borderLeft: `1px solid ${tokens.line}`
            }}
        >
            <Stat label="Active" value={active} color="#FF6B61" />
            <Stat label="Waiting" value={waiting} color="#FFA040" />
            <Stat label="Acknowledged" value={acknowledged} color={tokens.blueText} />
            <Stat label="Oldest open" value={oldest} color={tokens.text} />
            <Stat label="Average age" value={average} color={tokens.text} />
        </Box>

    );

}
