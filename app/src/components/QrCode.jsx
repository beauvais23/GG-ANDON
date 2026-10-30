import { useMemo } from "react";

import qrcode from "qrcode-generator";

import { Box } from "@mui/material";

//------------------------------------------------------
// QR code drawn on the tablet itself (no outside service).
// Dark modules on a white square with a quiet zone, so
// phone cameras read it off the dark theme.
//------------------------------------------------------

export default function QrCode({ value, size = 200, label }) {

    const svg = useMemo(() => {

        const qr = qrcode(0, "L");
        qr.addData(value);
        qr.make();

        return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });

    }, [value]);

    return (

        <Box
            role="img"
            aria-label={label}
            sx={{ width: size, height: size, bgcolor: "#FFFFFF", flexShrink: 0, "& svg": { width: "100%", height: "100%", display: "block" } }}
            dangerouslySetInnerHTML={{ __html: svg }}
        />

    );

}
