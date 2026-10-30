import { useEffect, useState } from "react";

import { Box, Button, Typography } from "@mui/material";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";

import NearMissForm from "./NearMissForm";

import { cancelAlert } from "../services/api";
import { ALERT_COLORS } from "../config/alertColors";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// NEAR MISS LOGGED (Director, Oct 30 2026)
//
// A near miss is a report, not a call for help: the
// backend saves it already closed, so there is no timer,
// no "waiting for response" and nothing to cancel. The
// operator can fill out the form, press DONE, or undo a
// mistaken press. Back to the buttons after 3 minutes;
// the countdown pauses while the form tab is in front and
// starts over when the form is opened or the operator
// comes back to this tab.
//------------------------------------------------------

const RETURN_SECONDS = 180;

function mmss(seconds) {

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

}

export default function NearMissLogged({ alert, onDone }) {

  const [left, setLeft] = useState(RETURN_SECONDS);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState("");

  const color = ALERT_COLORS.NEAR_MISS.edge;

  useEffect(() => {

    const tick = setInterval(() => {

      // Paused while the form is open in another tab.
      if (!document.hidden)
        setLeft(s => Math.max(0, s - 1));

    }, 1000);

    // Back from the form tab: a full 3 minutes to press DONE.
    const back = () => { if (!document.hidden) setLeft(RETURN_SECONDS); };

    document.addEventListener("visibilitychange", back);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
    };

  }, []);

  useEffect(() => {

    if (left === 0)
      onDone();

  }, [left, onDone]);

  async function undo() {

    setUndoing(true);
    setError("");

    try {

      const result = await cancelAlert(alert.id, {
        reason: "Pressed by mistake",
        cancelledBy: "Operator (tablet)"
      });

      if (result?.success === false) {

        setError(result.message || "Could not undo. Call your lead.");
        setUndoing(false);
        return;

      }

      onDone();

    } catch {

      setError("Could not undo: no connection to the server. Call your lead.");
      setUndoing(false);

    }

  }

  return (

    <Box sx={{ flexGrow: 1, display: "flex", px: 3, py: 2.5 }}>

      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          p: 3,
          textAlign: "center",
          bgcolor: tokens.panel,
          border: `1px solid ${tokens.line}`,
          borderTop: `6px solid ${color}`
        }}
      >

        <Box component="span" sx={{ ...labelSx, fontSize: 14, letterSpacing: "3px" }}>
          Near miss #{alert.id} · {alert.production_line} · {alert.work_center}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>

          <CheckCircleOutlineIcon sx={{ fontSize: { xs: 44, md: 60 }, color }} />

          <Typography component="h2" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: { xs: 44, md: 64 }, letterSpacing: "3px", lineHeight: 1, color }}>
            NEAR MISS LOGGED
          </Typography>

        </Box>

        <Typography sx={{ fontSize: 20, color: "#A9B3BE", maxWidth: 760 }}>
          Thank you. The safety team has been notified. Nobody needs to come to your station.
        </Typography>

        <NearMissForm alert={alert} color={color} onOpen={() => setLeft(RETURN_SECONDS)} />

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>

          <Button
            variant="outlined"
            size="large"
            onClick={onDone}
            sx={{ height: 60, px: 7, fontSize: 22, letterSpacing: "3px", borderWidth: 2, color: tokens.text, borderColor: tokens.lineStrong, "&:hover": { borderWidth: 2 } }}
          >
            Done
          </Button>

          <Box sx={{ ...labelSx, fontSize: 12 }}>
            Back to the buttons in {mmss(left)}
          </Box>

        </Box>

        <Button
          size="small"
          color="inherit"
          disabled={undoing}
          onClick={undo}
          sx={{ color: tokens.muted, letterSpacing: "1.5px", textDecoration: "underline" }}
        >
          {undoing ? "Undoing…" : "Pressed by mistake? Undo"}
        </Button>

        {error && (
          <Box role="alert" sx={{ color: "#FF8A80", fontSize: 16 }}>{error}</Box>
        )}

      </Box>

    </Box>

  );

}
