import { useEffect, useState } from "react";

import {
  Box,
  Typography,
  Button
} from "@mui/material";

import { ALERT_COLORS, FALLBACK_COLOR, alertLabel } from "../config/alertColors";
import { labelSx, tokens } from "../theme/theme";

// mm:ss since the alert was raised (h:mm:ss after an hour).
function elapsed(requested, now) {

  const total = Math.max(0, Math.floor((now - Number(requested)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");

  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;

}

import {
  cancelAlert,
  getActiveAlerts
} from "../services/api";

import TabletCancelDialog from "./TabletCancelDialog";
import QrCode from "./QrCode";

import { nearMissFormUrl } from "../config/nearMissForm";

import EditNoteIcon from "@mui/icons-material/EditNote";

export default function AlertScreen({

  alert,
  onResolve

}) {

  const [currentAlert, setCurrentAlert] = useState(alert);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The timer keeps running even if a status check fails.
  useEffect(() => {

    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(tick);

  }, []);

  useEffect(() => {

    const timer = setInterval(async () => {

      try {

        const alerts = await getActiveAlerts();

        const updated = alerts.find(a => a.id === alert.id);

        if (!updated) {

          onResolve();
          return;

        }

        setCurrentAlert(updated);

      }

      catch (err) {

        console.error(err);

      }

    }, 1000);

    return () => clearInterval(timer);

  }, [alert.id, onResolve]);

  // Every tablet cancel carries a reason (one tap, or "Other").
  // The alert screen stays up if the cancel didn't go through.
  async function handleCancel(reason) {

    const result = await cancelAlert(currentAlert.id, {
      reason,
      cancelledBy: "Operator (tablet)"
    });

    if (result?.success === false)
      return result;

    setCancelOpen(false);
    onResolve();

    return result;

  }

  const acknowledged =
    currentAlert.status === "ACKNOWLEDGED";

  const colors = ALERT_COLORS[currentAlert.type] || FALLBACK_COLOR;

  const status = acknowledged
    ? { label: "ACKNOWLEDGED", dot: tokens.blueText }
    : { label: "WAITING FOR RESPONSE", dot: "#FF6B61" };

  return (

    <Box sx={{ flexGrow: 1, display: "flex", px: 3, py: 2.5 }}>

      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // NEAR MISS adds the form panel: tighter so CANCEL stays on a 768 px screen.
          gap: currentAlert.type === "NEAR_MISS" ? 1.75 : 2.5,
          p: currentAlert.type === "NEAR_MISS" ? 3 : 4,
          textAlign: "center",
          bgcolor: tokens.panel,
          border: `1px solid ${tokens.line}`,
          borderTop: `6px solid ${colors.edge}`
        }}
      >

        <Box component="span" sx={{ ...labelSx, fontSize: 14, letterSpacing: "3px" }}>
          Alert #{currentAlert.id} · {currentAlert.production_line} · {currentAlert.work_center}
        </Box>

        <Typography component="h2" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: { xs: 44, md: 64 }, letterSpacing: "3px", lineHeight: 1, color: colors.edge }}>
          {alertLabel(currentAlert.type)} ALERT
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2.25,
            py: 1.25,
            border: `1px solid ${tokens.lineStrong}`,
            fontFamily: tokens.display,
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: "2px"
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: status.dot, boxShadow: `0 0 8px ${status.dot}` }} />
          {status.label}
        </Box>

        <Typography sx={{ fontFamily: tokens.mono, fontSize: { xs: 44, md: 56 }, lineHeight: 1 }} aria-label="Time since the alert was raised">
          {elapsed(currentAlert.requested, now)}
        </Typography>

        {acknowledged && (

          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
            <Box component="span" sx={labelSx}>Responding</Box>
            <Typography sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 34, letterSpacing: "1px", color: tokens.blueText }}>
              {currentAlert.acknowledged_by}
            </Typography>
          </Box>

        )}

        <Typography sx={{ fontSize: 20, color: "#A9B3BE", maxWidth: 760 }}>
          {acknowledged
            ? `${currentAlert.acknowledged_by} is on the way. Please stay at your workstation.`
            : "Your request has been sent. Please stay at your workstation."}
        </Typography>

        {currentAlert.type === "NEAR_MISS" && (

          <NearMissForm alert={currentAlert} color={colors.edge} />

        )}

        <Button
          variant="outlined"
          color="error"
          size="large"
          onClick={() => setCancelOpen(true)}
          sx={{ mt: 1, height: 64, px: 6, fontSize: 22, letterSpacing: "3px", borderWidth: 2, color: "#FF8A80", borderColor: "#D84A41", "&:hover": { borderWidth: 2 } }}
        >
          CANCEL REQUEST
        </Button>

        <TabletCancelDialog
          open={cancelOpen}
          alertType={alertLabel(currentAlert.type)}
          onClose={() => setCancelOpen(false)}
          onCancel={handleCancel}
        />

      </Box>

    </Box>
  );

}

//------------------------------------------------------
// NEAR MISS: open the Near Miss & Safety Incident Form here
// (new tab, so this alert screen keeps running) or on a
// phone via the QR. Location, type, date and time are
// filled in from the alert.
//------------------------------------------------------

function NearMissForm({ alert, color }) {

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
