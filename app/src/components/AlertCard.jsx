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
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

const alertTheme = {

  QUALITY: {
    color: "#D32F2F",
    icon: <SearchIcon sx={{ fontSize: 54 }} />
  },

  MAINTENANCE: {
    color: "#F57C00",
    icon: <HandymanIcon sx={{ fontSize: 54 }} />
  },

  MATERIAL: {
    color: "#FBC02D",
    icon: <Inventory2Icon sx={{ fontSize: 54 }} />
  },

  SUPERVISOR: {
    color: "#1976D2",
    icon: <GroupsIcon sx={{ fontSize: 54 }} />
  },

  SAFETY: {
    color: "#2E7D32",
    icon: <HealthAndSafetyIcon sx={{ fontSize: 54 }} />
  }

};

export default function ActiveAlertCard({

  alert,
  elapsed,
  isCritical,
  onAcknowledge,
  onResolve

}) {

  const theme = alertTheme[alert.type];

  return (

    <Card

      elevation={isCritical ? 14 : 5}

      sx={{

        borderLeft: `10px solid ${theme.color}`,

        border: isCritical
          ? "3px solid #D32F2F"
          : "1px solid rgba(0,0,0,.08)",

        borderRadius: 3,

        background: isCritical
          ? "#FFF7F7"
          : "#FFFFFF",

        transition: ".25s",

        "&:hover": {

          transform: "translateY(-2px)",

          boxShadow: isCritical
            ? "0 0 30px rgba(211,47,47,.35)"
            : "0 10px 22px rgba(0,0,0,.12)"

        }

      }}

    >

      <CardContent>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
        >

          {/* LEFT SIDE */}

          <Stack
            direction="row"
            spacing={3}
            flex={1}
          >

            <Box sx={{ color: theme.color }}>
              {theme.icon}
            </Box>

            <Box>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                mb={1}
              >

                <Typography
                  variant="h5"
                  fontWeight={800}
                >
                  {alert.type}
                </Typography>

                {isCritical && (

                  <Chip

                    icon={<WarningAmberIcon />}

                    label="CRITICAL"

                    color="error"

                    sx={{
                      fontWeight: 700
                    }}

                  />

                )}

              </Stack>

              <Stack spacing={0.5}>

                <Typography variant="caption" color="text.secondary">
                  FACILITY
                </Typography>

                <Typography fontWeight={700}>
                  {alert.facility}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  PRODUCTION LINE
                </Typography>

                <Typography fontWeight={700}>
                  {alert.production_line}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  WORK CENTER
                </Typography>

                <Typography fontWeight={700}>
                  {alert.work_center}
                </Typography>

              </Stack>

            </Box>

          </Stack>

          {/* RIGHT SIDE */}

          <Stack
            spacing={2}
            alignItems="flex-end"
            sx={{ minWidth: 240 }}
          >

            <Chip

              icon={
                alert.status === "ACTIVE"
                  ? <RadioButtonUncheckedIcon />
                  : <CheckCircleIcon />
              }

              label={alert.status}

              color={
                alert.status === "ACTIVE"
                  ? "error"
                  : "success"
              }

              sx={{
                fontWeight: 700,
                minWidth: 155
              }}

            />

            <Divider flexItem />

            <Box textAlign="right">

              <Typography
                variant="caption"
                color="text.secondary"
              >
                RESPONDER
              </Typography>

              <Typography
                fontWeight={700}
              >
                {alert.responder || "Unassigned"}
              </Typography>

            </Box>

            <Box textAlign="right">

              <Stack
                direction="row"
                spacing={1}
                justifyContent="flex-end"
                alignItems="center"
              >

                <AccessTimeIcon
                  color={
                    isCritical
                      ? "error"
                      : "action"
                  }
                />

                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  TIME OPEN
                </Typography>

              </Stack>

              <Typography

                sx={{

                  fontSize: 42,

                  fontWeight: 800,

                  fontFamily: "monospace",

                  color: isCritical
                    ? "#D32F2F"
                    : "#263238"

                }}

              >
                {elapsed}
              </Typography>

            </Box>

          </Stack>

        </Stack>

        <Divider sx={{ my: 3 }} />

        <Stack
          direction="row"
          spacing={2}
        >

          <Button

            fullWidth

            variant="contained"

            color="primary"

            disabled={alert.status === "ACKNOWLEDGED"}

            onClick={() => onAcknowledge(alert.id)}

            sx={{
              height: 48,
              fontWeight: 700
            }}

          >
            ACKNOWLEDGE
          </Button>

          <Button

            fullWidth

            variant="contained"

            color="success"

            onClick={() => onResolve(alert.id)}

            sx={{
              height: 48,
              fontWeight: 700
            }}

          >
            RESOLVE
          </Button>

        </Stack>

      </CardContent>

    </Card>

  );

}