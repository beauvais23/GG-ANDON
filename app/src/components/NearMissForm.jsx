import { Box, Button } from "@mui/material";

import EditNoteIcon from "@mui/icons-material/EditNote";

import QrCode from "./QrCode";

import { nearMissFormUrl } from "../config/nearMissForm";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Open the Near Miss & Safety Incident Form here (new tab,
// so the tablet screen keeps running) or on a phone via
// the QR. Location, type, date and time are filled in from
// the alert.
//------------------------------------------------------

export default function NearMissForm({ alert, color, onOpen }) {

  const url = nearMissFormUrl(alert);

  return (

    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        px: 2.5,
        py: 1.75,
        bgcolor: tokens.ground,
        border: `1px solid ${tokens.lineStrong}`,
        borderLeft: `6px solid ${color}`,
        maxWidth: 760
      }}
    >

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>

        <Box component="span" sx={{ ...labelSx, fontSize: 14 }}>Tell us what happened</Box>

        <Button
          variant="contained"
          size="large"
          startIcon={<EditNoteIcon />}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          sx={{ height: 64, px: 4, fontSize: 22, letterSpacing: "3px", bgcolor: color, "&:hover": { bgcolor: color, filter: "brightness(1.15)" } }}
        >
          Fill out near miss form
        </Button>

        <Box sx={{ fontSize: 14, color: tokens.muted, maxWidth: 300 }}>
          Opens in a new tab. Close it after Submit.
        </Box>

      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>

        <QrCode value={url} label="QR code for the near miss form" />

        <Box component="span" sx={{ ...labelSx, fontSize: 12 }}>Or scan with your phone</Box>

      </Box>

    </Box>

  );

}
