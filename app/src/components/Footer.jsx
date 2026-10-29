import { Box } from "@mui/material";

import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Status strip (E1). Page links moved to the PAGES menu
// in the top bar.
//------------------------------------------------------

export default function Footer({ station }) {

    return (

        <Box
            component="footer"
            sx={{
                ...labelSx,
                display: "flex",
                alignItems: "center",
                gap: 3,
                px: 3,
                minHeight: 40,
                bgcolor: tokens.bar,
                borderTop: `1px solid ${tokens.line}`
            }}
        >
            {station && (
                <span>Station <Box component="span" sx={{ color: tokens.text }}>{station}</Box></span>
            )}
            <span>Facility <Box component="span" sx={{ color: tokens.text }}>Malta</Box></span>
            <Box sx={{ flexGrow: 1 }} />
            <span>ManufacturingOS</span>
        </Box>

    );

}
