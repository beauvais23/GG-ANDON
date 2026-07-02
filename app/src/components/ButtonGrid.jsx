import Grid from "@mui/material/Grid";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { useNavigate } from "react-router-dom";

import AlertButton from "./AlertButton";

import { createAlert } from "../services/api";
import { useAlert } from "../context/AlertContext";

export default function ButtonGrid({ onAlert }) {

  const navigate = useNavigate();
  const { startAlert } = useAlert();

  async function handleAlert(type) {

    console.log("================================");
    console.log("Button pressed:", type);

    try {

      const response = await createAlert(type);

      console.log("Server response:", response);

      if (response.success) {

        console.log("Starting alert...");

        startAlert(response.alert);

        if (onAlert) {
          onAlert(response.alert);
        }

        console.log("Navigating to /active");

        navigate("/active");

      } else {

        console.error("Server returned success = false");

      }

    } catch (error) {

      console.error("Unable to create alert:", error);

    }

  }

  return (

    <Grid
      container
      spacing={3}
      sx={{
        mt: 2,
        px: 4
      }}
    >

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#d32f2f"
          icon={<SearchIcon sx={{ fontSize: 60 }} />}
          title="QUALITY"
          subtitle="Quality Assistance"
          onClick={() => handleAlert("QUALITY")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#f57c00"
          icon={<HandymanIcon sx={{ fontSize: 60 }} />}
          title="MAINTENANCE"
          subtitle="Equipment Assistance"
          onClick={() => handleAlert("MAINTENANCE")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#fbc02d"
          icon={<Inventory2Icon sx={{ fontSize: 60 }} />}
          title="MATERIAL"
          subtitle="Material Needed"
          onClick={() => handleAlert("MATERIAL")}
        />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <AlertButton
          color="#1976d2"
          icon={<GroupsIcon sx={{ fontSize: 60 }} />}
          title="SUPERVISOR"
          subtitle="Supervisor Assistance"
          onClick={() => handleAlert("SUPERVISOR")}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <AlertButton
          color="#2e7d32"
          icon={<CheckCircleIcon sx={{ fontSize: 60 }} />}
          title="CLEAR ALERT"
          subtitle="Return System to Ready"
          onClick={() => handleAlert("CLEAR")}
        />
      </Grid>

    </Grid>

  );

}