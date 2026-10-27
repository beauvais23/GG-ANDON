import { useState } from "react";

import Grid from "@mui/material/Grid";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";

import AlertButton from "./AlertButton";

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

  const { startAlert } = useAlert();

  const {
    productionLine
  } = useProductionLine();

  const {
  workCenter
} = useWorkCenter();

  async function handleAlert(type) {

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

  }

  catch (error) {

    console.error(error);

  }

}

  return (

    <>

    <Grid
      container
      spacing={2}
      sx={{
        px: 2,
        py: 2,
        background: "#263238",
        borderRadius: 3,
        mx: 2,
        mb: 2
      }}
    >

      <Grid size={{ xs: 12 }}>
        <AlertButton
          color="#D32F2F"
          icon={<SearchIcon sx={{ fontSize: 60 }} />}
          title="QUALITY"
          subtitle="Quality Assistance"
          onClick={() => handleAlert("QUALITY")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#F57C00"
          icon={<HandymanIcon sx={{ fontSize: 60 }} />}
          title="MAINTENANCE"
          subtitle="Equipment Assistance"
          onClick={() => handleAlert("MAINTENANCE")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#FBC02D"
          icon={<Inventory2Icon sx={{ fontSize: 60 }} />}
          title="MATERIAL"
          subtitle="Material Needed"
          onClick={() => handleAlert("MATERIAL")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#1976D2"
          icon={<GroupsIcon sx={{ fontSize: 60 }} />}
          title="SUPERVISOR"
          subtitle="Supervisor Assistance"
          onClick={() => handleAlert("SUPERVISOR")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#2E7D32"
          icon={<HealthAndSafetyIcon sx={{ fontSize: 60 }} />}
          title="SAFETY"
          subtitle="Safety Assistance"
          onClick={() => handleAlert("SAFETY")}
        />
      </Grid>

    </Grid>

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

    </>

  );

}