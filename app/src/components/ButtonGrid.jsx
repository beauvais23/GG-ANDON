import { useState } from "react";

import Box from "@mui/material/Box";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

import SearchIcon from "@mui/icons-material/Search";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";

import AlertButton from "./AlertButton";
import { ALERT_COLORS } from "../config/alertColors";

// Five equal buttons, left to right (E2).
const BUTTONS = [
  { type: "QUALITY", subtitle: "Quality assistance", icon: <SearchIcon /> },
  { type: "MAINTENANCE", subtitle: "Equipment assistance", icon: <BuildOutlinedIcon /> },
  { type: "MATERIAL", subtitle: "Material needed", icon: <Inventory2OutlinedIcon /> },
  { type: "SUPERVISOR", subtitle: "Supervisor assistance", icon: <PersonOutlineIcon /> },
  { type: "SAFETY", subtitle: "Safety assistance", icon: <GppMaybeOutlinedIcon /> }
];

import { createAlert } from "../services/api";
import { useAlert } from "../context/AlertContext";
import { useProductionLine } from "../context/ProductionLineContext";
import { useWorkCenter } from "../context/WorkCenterContext";


// Time the existing alert was raised, in plant time and the
// same 12-hour format as the header clock (e.g. 1:04 PM).
function plantTime(ms) {

  return new Date(Number(ms)).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });

}

export default function ButtonGrid() {

  const [duplicateMessage, setDuplicateMessage] = useState("");

  // Shown whenever an alert was NOT created (#25). Before this, a
  // refused or failed request left the tablet silent.
  const [errorMessage, setErrorMessage] = useState("");

  const { startAlert } = useAlert();

  const {
    productionLine
  } = useProductionLine();

  const {
  workCenter,
  workCenters,
  workCentersLoaded
} = useWorkCenter();

  const noWorkCenters = workCentersLoaded && workCenters.length === 0;

  async function handleAlert(type) {

  setErrorMessage("");

  if (!workCenter) {

    setErrorMessage(
      noWorkCenters
        ? `${type} alert NOT sent: no work centers are set up for ${productionLine}. Call your lead.`
        : `${type} alert NOT sent: choose a work center first.`
    );

    return;

  }

  try {

    const response = await createAlert({

      productionLine,

      workCenter,

      type,

      priority: "NORMAL"

    });

    if (response.success) {

      startAlert(response.alert);

    }

    // 409: the same alert is already open on this line / work center.
    else if (response.duplicate && response.alert) {

      setDuplicateMessage(
        `${type}: Already open since ${plantTime(response.alert.requested)}`
      );

    }

    else {

      setErrorMessage(
        `${type} alert NOT sent: ${response.message || "the server refused it."} Call your lead.`
      );

    }

  }

  catch (error) {

    console.error(error);

    // No answer, or not JSON (e.g. the backend restarting during a deploy).
    setErrorMessage(
      `${type} alert NOT sent: no connection to the server. Try again, or call your lead.`
    );

  }

}

  return (

    <>

    {noWorkCenters && (
      <Alert severity="error" variant="filled" sx={{ mx: 3, mt: 2, fontSize: "1.3rem" }}>
        No work centers are set up for {productionLine}. Alerts cannot be sent from this line. Call your lead.
      </Alert>
    )}

    <Box
      sx={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" },
        gap: 1.5,
        px: 3,
        py: 2.5
      }}
    >

      {BUTTONS.map(button => (

        <AlertButton
          key={button.type}
          colors={ALERT_COLORS[button.type]}
          icon={button.icon}
          title={button.type}
          subtitle={button.subtitle}
          onClick={() => handleAlert(button.type)}
        />

      ))}

    </Box>

    <Snackbar
      open={Boolean(duplicateMessage)}
      autoHideDuration={8000}
      onClose={() => setDuplicateMessage("")}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert
        severity="warning"
        variant="filled"
        onClose={() => setDuplicateMessage("")}
        sx={{ fontSize: "1.4rem", alignItems: "center" }}
      >
        {duplicateMessage}
      </Alert>
    </Snackbar>

    <Snackbar
      open={Boolean(errorMessage)}
      autoHideDuration={15000}
      onClose={() => setErrorMessage("")}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert
        severity="error"
        variant="filled"
        onClose={() => setErrorMessage("")}
        sx={{ fontSize: "1.4rem", alignItems: "center" }}
      >
        {errorMessage}
      </Alert>
    </Snackbar>

    </>

  );

}