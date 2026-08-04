import {
  Card,
  Box,
  Stack,
  Typography,
  Chip,
  Button
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";

import PersonIcon from "@mui/icons-material/Person";
import TimerIcon from "@mui/icons-material/Timer";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

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

  const ageSeconds = Math.floor(
    (Date.now() - Number(alert.requested)) / 1000
  );

  const isCritical =
    alert.status === "ACTIVE" &&
    ageSeconds >= 600;

  return (
    <Card
      elevation={isCritical ? 10 : 3}
      sx={{
        borderRadius: 4,
        overflow: "hidden",
        border:
  isCritical
    ? "4px solid #B71C1C"
    : `3px solid ${theme.color}`,

        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: `0 10px 25px ${theme.color}33`,
        },

        animation: isCritical
          ? "criticalPulse 2s infinite"
          : "none",

        "@keyframes criticalPulse": {
          "0%": {
            boxShadow:
              "0 0 10px rgba(211,47,47,.20)"
          },
          "50%": {
            boxShadow:
              "0 0 30px rgba(211,47,47,.70)"
          },
          "100%": {
            boxShadow:
              "0 0 10px rgba(211,47,47,.20)"
          }
        }
      }}
    >
      {/* ========================= HEADER ========================= */}

      <Box
        sx={{
          background: theme.color,
          color: "white",
          px: 3,
          py: 2.5
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center"
          }}
        >
          {/* LEFT */}

          <Box sx={{ flex: 1 }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                alignItems: "center"
              }}
            >
              {theme.icon}

              <Typography
                sx={{
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: .5
                }}
              >
                {theme.title}
              </Typography>
            </Stack>

            <Typography
              sx={{
                mt: .5,
                ml: 7,
                opacity: .95,
                fontSize: 15
              }}
            >
              {alert.production_line} • {alert.work_center}
            </Typography>
          </Box>

          {/* TIMER */}

          <Box
  sx={{
    width: 360,
    textAlign: "center",
    ml: 6
  }}
>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1
              }}
            >
              ELAPSED TIME
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                justifyContent: "center",
                alignItems: "center"
              }}>
              <TimerIcon />

              <Typography
                sx={{
                  fontFamily: "monospace",
                  fontWeight: 800,
                  fontSize: 54,
                  lineHeight: 1
                }}
              >
                {elapsed}
              </Typography>
            </Stack>

            <Chip
              size="small"
              icon={
                alert.status === "ACTIVE"
                  ? <RadioButtonUncheckedIcon />
                  : <CheckCircleIcon />
              }
              label={alert.status}
              sx={{
                mt: .5,
                bgcolor: "white",
                color: theme.color,
                fontWeight: 700
              }}
            />
          </Box>
        </Stack>
      </Box>

      {/* ========================= BODY ========================= */}

      <Box
        sx={{
          p: 3,
          bgcolor: "#FAFAFA"
        }}
      >
        <Stack
          direction="row"
          spacing={7}
          sx={{
            alignItems: "center"
          }}
        >
          {/* LOCATION */}

          <Box sx={{ width: 230 }}>
  <Typography
    variant="overline"
    sx={{
      color: "text.secondary"
    }}
  >
    PRODUCTION LOCATION
  </Typography>

  <Typography sx={{
    fontWeight: 700
  }}>
    {alert.production_line}
  </Typography>

  <Typography>
    {alert.work_center}
  </Typography>
</Box>

          {/* ASSIGNED */}

          <Box sx={{ flex: 1 }}>
            <Typography
              variant="overline"
              sx={{
                color: "text.secondary"
              }}
            >
              ASSIGNED TO
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                mt: 1
              }}>
              <PersonIcon color="action" />

              <Chip
                label={
                  alert.assigned_to || "UNASSIGNED"
                }
                color={
                  alert.assigned_to
                    ? "primary"
                    : "default"
                }
              />
            </Stack>

            {isCritical && (
              <Chip
                sx={{
                  mt: 2,
                  fontWeight: 700
                }}
                color="error"
                icon={<WarningAmberIcon />}
                label="ESCALATION REQUIRED"
              />
            )}
          </Box>

          {/* BUTTONS */}

          <Stack
  spacing={2}
  sx={{
    justifyContent: "center"
  }}
>
            <Button
              variant="contained"
              color="primary"
              disabled={
                alert.status === "ACKNOWLEDGED"
              }
              onClick={() =>
                onAcknowledge(alert.id)
              }
              sx={{
                width: 185,
                height: 50,
                fontWeight: 700
              }}
            >
              ACKNOWLEDGE
            </Button>

            <Button
              variant="contained"
              color="success"
              onClick={() =>
                onResolve(alert.id)
              }
              sx={{
                width: 170,
                height: 50,
                fontWeight: 700
              }}
            >
              RESOLVE
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Card>
  );
}