import { useState } from "react";

import { Box, Tab, Tabs } from "@mui/material";

import Header from "../components/Header";
import Footer from "../components/Footer";

import RespondersPanel from "../components/admin/RespondersPanel";
import ProductionLinesPanel from "../components/admin/ProductionLinesPanel";
import BackupsPanel from "../components/admin/BackupsPanel";

import useClock from "../hooks/useClock";

import { tokens } from "../theme/theme";

//------------------------------------------------------
// Administration (E5)
//
// Top bar title says ADMINISTRATION; the tabs hold the
// three panels. The old responder grid that lived here
// (unused since the panels were added) is removed.
//------------------------------------------------------

const SECTIONS = [
    { value: "responders", label: "Responders", Panel: RespondersPanel },
    { value: "productionLines", label: "Production lines", Panel: ProductionLinesPanel },
    { value: "backups", label: "Backups", Panel: BackupsPanel }
];

export default function AdminPage() {

    const clock = useClock();

    const [section, setSection] = useState("responders");

    const { Panel } = SECTIONS.find(s => s.value === section);

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1400, mx: "auto" }}>

                <Tabs
                    value={section}
                    onChange={(e, value) => setSection(value)}
                    sx={{ mb: 2.5, borderBottom: `1px solid ${tokens.line}` }}
                >
                    {SECTIONS.map(s => (
                        <Tab key={s.value} label={s.label} value={s.value} />
                    ))}
                </Tabs>

                <Panel />

            </Box>

            <Footer />

        </Box>

    );

}
