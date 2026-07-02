import { Paper, Typography, Button, Stack, Box } from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import useElapsedTime from "../hooks/useElapsedTime";

const alertTypes = {
  QUALITY: {
    color: "#d62828",
    title: "QUALITY ALERT",
    icon: <SearchIcon sx={{ fontSize: 90 }} />
  },

  MAINTENANCE: {
    color: "#f57c00",
    title: "MAINTENANCE ALERT",
    icon: <HandymanIcon sx={{ fontSize: 90 }} />
  },

  MATERIAL: {
    color: "#f9c74f",
    title: "MATERIAL ALERT",
    icon: <Inventory2Icon sx={{ fontSize: 90, color: "#222" }} />
  },

  SUPERVISOR: {
    color: "#1565c0",
    title: "SUPERVISOR REQUEST",
    icon: <GroupsIcon sx={{ fontSize: 90 }} />
  },

  PRODUCTION: {
    color: "#2e7d32",
    title: "PRODUCTION RESUMED",
    icon: <CheckCircleIcon sx={{ fontSize: 90 }} />
  }
};

export default function AlertScreen({ alert, onResolve }) {

  const elapsed = useElapsedTime();

  const theme = alertTypes[alert.type];

  return (
    <Paper
      elevation={8}
      sx={{
        width: 900,
        maxWidth: "95%",
        mx: "auto",
        mt: 4,
        borderRadius: 4,
        overflow: "hidden"
      }}
    >
      {/* Header Banner */}
      <Box
        sx={{
          backgroundColor: theme.color,
          color: "white",
          py: 2,
          textAlign: "center"
        }}
      >
        <Typography
          variant="h4"
          fontWeight="bold"
          letterSpacing={2}
        >
          {theme.title}
        </Typography>
      </Box>

      {/* Main Content */}
      <Box
        sx={{
          p: 5,
          textAlign: "center"
        }}
      >
        {theme.icon}

        <Typography
          variant="h2"
          fontWeight="bold"
          sx={{ mt: 2 }}
        >
          {alert.type}
        </Typography>

        <Stack spacing={3} sx={{ mt: 5 }}>

          <Box>
            <Typography variant="h6" color="text.secondary">
              Station
            </Typography>

            <Typography variant="h4" fontWeight="bold">
              {alert.station}
            </Typography>
          </Box>

          <Box>
            <Typography variant="h6" color="text.secondary">
              Operator
            </Typography>

            <Typography variant="h4" fontWeight="bold">
              {alert.operator}
            </Typography>
          </Box>

          <Box>
            <Typography variant="h6" color="text.secondary">
              Elapsed Time
            </Typography>

            <Typography
              variant="h2"
              sx={{
                color: theme.color,
                fontWeight: "bold",
                fontFamily: "monospace"
              }}
            >
              {elapsed}
            </Typography>
          </Box>

        </Stack>

        <Button
          variant="contained"
          color="success"
          size="large"
          onClick={onResolve}
          sx={{
            mt: 6,
            px: 8,
            py: 2,
            fontSize: 24,
            borderRadius: 3
          }}
        >
          RESOLVE ALERT
        </Button>

      </Box>

    </Paper>
  );
}