import { Box, ButtonBase } from "@mui/material";

import { tokens } from "../theme/theme";

//------------------------------------------------------
// Tablet alert button (E2): one of five equal columns,
// full height, solid fill with a bright top edge. A real
// button, so it works with touch, mouse and keyboard.
//------------------------------------------------------

export default function AlertButton({

    colors,
    icon,
    title,
    subtitle,
    onClick

}) {

    return (

        <ButtonBase
            onClick={onClick}
            focusRipple
            sx={{
                height: "100%",
                minHeight: 260,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2.5,
                px: 1,
                bgcolor: colors.fill,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderTop: `6px solid ${colors.edge}`,
                borderRadius: "2px",
                transition: "filter 120ms",
                "&:hover": { filter: "brightness(1.08)" },
                "&:active": { filter: "brightness(0.92)" },
                "& svg": { fontSize: 72 }
            }}
        >

            {icon}

            <Box component="span" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: { xs: 26, lg: 36 }, letterSpacing: "2px", lineHeight: 1 }}>
                {title}
            </Box>

            <Box component="span" sx={{ fontSize: 15, opacity: 0.85 }}>
                {subtitle}
            </Box>

        </ButtonBase>

    );

}
