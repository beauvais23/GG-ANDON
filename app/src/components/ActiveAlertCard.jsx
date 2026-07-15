import {
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Button,
  Box,
  Divider
  
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";



const alertTheme = {

  QUALITY: {
    color: "#D32F2F",
    title: "QUALITY ALERT",
    icon: <SearchIcon sx={{ fontSize: 34 }} />
  },

  MAINTENANCE: {
    color: "#F57C00",
    title: "MAINTENANCE ALERT",
    icon: <HandymanIcon sx={{ fontSize: 34 }} />
  },

  MATERIAL: {
    color: "#FBC02D",
    title: "MATERIAL ALERT",
    icon: <Inventory2Icon sx={{ fontSize: 34 }} />
  },

  SUPERVISOR: {
    color: "#1976D2",
    title: "SUPERVISOR ALERT",
    icon: <GroupsIcon sx={{ fontSize: 34 }} />
  },

  SAFETY: {
    color: "#2E7D32",
    title: "SAFETY ALERT",
    icon: <HealthAndSafetyIcon sx={{ fontSize: 34 }} />
  }

};

export default function ActiveAlertCard({

  alert,
  elapsed,
  onAcknowledge,
  onResolve

}) {

  const theme = alertTheme[alert.type];

  const ageSeconds =
    Math.floor(
      (Date.now() - Number(alert.requested)) / 1000
    );

  const isCritical =
    alert.status === "ACTIVE" &&
    ageSeconds >= 600;

  

  return (

  <Card
    elevation={isCritical ? 8 : 2}
    sx={{
      borderRadius: 3,
      overflow: "hidden",
      border: isCritical
        ? "2px solid #D32F2F"
        : "1px solid #D9D9D9"
    }}
  >

    {/* HEADER */}

<Box
  sx={{
    bgcolor: theme.color,
    color: "white",
    px: 3,
    py: 1.5
  }}
>

  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
  >

    {/* Left Side */}

    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
    >

      <Box sx={{ display: "flex", alignItems: "center" }}>
        {theme.icon}
      </Box>

      <Typography
        sx={{
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: .5
        }}
      >
        {theme.title}
      </Typography>

      <Chip
        size="small"
        icon={
          alert.status === "ACTIVE"
            ? <RadioButtonUncheckedIcon />
            : <CheckCircleIcon />
        }
        label={alert.status}
        sx={{
          bgcolor: "white",
          color: theme.color,
          fontWeight: 700,
          ml: 1
        }}
      />

    </Stack>

    {/* Right Side */}

    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
    >

      <AccessTimeIcon
        sx={{
          fontSize: 32
        }}
      />

      <Typography
        sx={{
          fontFamily: "monospace",
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: 1
        }}
      >
        {elapsed}
      </Typography>

    </Stack>

  </Stack>

</Box>

          <CardContent
  sx={{
    py: 2,
    px: 3
  }}
>

  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    spacing={3}
  >

    {/* Location */}

    <Typography
      sx={{
        fontSize: 20,
        fontWeight: 600,
        flex: 1
      }}
    >
      {alert.facility}
      {" • "}
      {alert.production_line}
      {" • "}
      {alert.work_center}
    </Typography>

    {/* Right Side */}

    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
    >

      {isCritical && (
        <Chip
          icon={<WarningAmberIcon />}
          label="ESCALATION REQUIRED"
          color="error"
        />
      )}

      <Button
        variant="contained"
        disabled={alert.status === "ACKNOWLEDGED"}
        onClick={() => onAcknowledge(alert.id)}
        sx={{
          width: 180,
          fontWeight: 700
        }}
      >
        ACKNOWLEDGE
      </Button>

      <Button
        variant="contained"
        color="success"
        onClick={() => onResolve(alert.id)}
        sx={{
          width: 180,
          fontWeight: 700
        }}
      >
        RESOLVE
      </Button>

    </Stack>

  </Stack>

</CardContent>

</Card>

  );

}              