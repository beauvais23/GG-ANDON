import { useEffect } from "react";

import Box from "@mui/material/Box";

//------------------------------------------------------
// Staging Banner
//
// Staging and production screens look identical, and a
// test alert raised on staging is never sent to Telegram
// or Google Chat (Oct 29: a smoke test was run on staging
// by mistake). Every staging page shows this bar.
//
// Detected from the address: Railway's staging URLs
// contain "staging"; production's never do. No variable
// to set, so production cannot show it by mistake.
//------------------------------------------------------

function isStagingHost(hostname = window.location.hostname) {

    return /staging/i.test(hostname);

}

export default function StagingBanner() {

    const staging = isStagingHost();

    useEffect(() => {

        if (staging && !document.title.startsWith("[STAGING]"))
            document.title = `[STAGING] ${document.title}`;

    }, [staging]);

    if (!staging)
        return null;

    return (

        <Box
            role="status"
            sx={{
                position: "sticky",
                top: 0,
                zIndex: 2000,
                bgcolor: "#FF6F00",
                color: "#000",
                textAlign: "center",
                fontWeight: 800,
                fontSize: "1rem",
                letterSpacing: 0.5,
                py: 0.75,
                px: 2
            }}
        >
            STAGING (test system): alerts raised here are NOT sent to Telegram or Google Chat.
        </Box>

    );

}
