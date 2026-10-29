import {
    AppBar,
    Box,
    Toolbar,
    Typography
} from "@mui/material";

import { useLocation } from "react-router-dom";

import PagesMenu from "./PagesMenu";
import { PAGES } from "../config/pages";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Top bar, the same on every page (E1): G&G mark, page
// name, ONLINE light, clock, PAGES menu.
//------------------------------------------------------


export default function Header({ time }) {

    const { pathname } = useLocation();

    const title = PAGES.find(p => p.path === pathname)?.title || "ManufacturingOS";

    return (

        <AppBar position="static" elevation={0}>

            <Toolbar sx={{ minHeight: 64, px: 3, gap: 2.5, flexWrap: "wrap", py: 1 }}>

                {/* G&G mark */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }} aria-label="G&G Industrial Lighting">

                    <Box sx={{ width: 6, height: 32, bgcolor: tokens.blue }} />

                    <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                        <Box component="span" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 24, letterSpacing: "1px" }}>
                            G&amp;G
                        </Box>
                        <Box component="span" sx={{ ...labelSx, fontSize: 11, letterSpacing: "2.5px" }}>
                            Industrial Lighting
                        </Box>
                    </Box>

                </Box>

                <Box sx={{ width: "1px", height: 32, bgcolor: tokens.line }} />

                <Typography component="h1" sx={{ fontFamily: tokens.display, fontWeight: 600, fontSize: 22, letterSpacing: "3px", textTransform: "uppercase" }}>
                    {title}
                </Typography>

                <Box component="span" sx={{ ...labelSx, px: 1.25, py: 0.5, border: `1px solid ${tokens.line}` }}>
                    Malta
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                <Box sx={{ ...labelSx, display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.online, boxShadow: `0 0 6px ${tokens.online}` }} />
                    Online
                </Box>

                <Typography sx={{ fontFamily: tokens.mono, fontSize: 22 }}>
                    {time}
                </Typography>

                <PagesMenu />

            </Toolbar>

        </AppBar>

    );

}
