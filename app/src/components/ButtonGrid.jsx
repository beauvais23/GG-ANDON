import Grid from "@mui/material/Grid";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";

import AlertButton from "./AlertButton";

import { createAlert } from "../services/api";
import { useAlert } from "../context/AlertContext";
import { useProductionLine } from "../context/ProductionLineContext";
import config from "../config/config";

export default function ButtonGrid() {

  const { startAlert } = useAlert();

  const {
    productionLine
  } = useProductionLine();

  async function handleAlert(type) {

    try {

      const response = await createAlert({

        facility: config.facility,

        productionLine,

        workCenter: config.workCenter,

        type,

        priority: "NORMAL"

      });

      if (response.success) {

        startAlert(response.alert);

      }

    }

    catch (error) {

      console.error(error);

    }

  }

  return (

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

  );

}