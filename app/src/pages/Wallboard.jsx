import { useEffect, useMemo, useState } from "react";

import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Divider,
  Avatar
} from "@mui/material";

import Header from "../components/Header";

import useClock from "../hooks/useClock";

import { getActiveAlerts } from "../services/api";

import alertTypes from "../config/alertTypes";
import productionLines from "../config/productionLines";

export default function Wallboard() {

  const time = useClock();

  const [alerts, setAlerts] = useState([]);

  // Used only to refresh elapsed timers every second
  const [, forceRefresh] = useState(0);

  //--------------------------------------------------
  // Refresh elapsed timers
  //--------------------------------------------------

  useEffect(() => {

    const timer = setInterval(() => {

      forceRefresh(v => v + 1);

    }, 1000);

    return () => clearInterval(timer);

  }, []);

  //--------------------------------------------------
  // Load alerts every 5 seconds
  //--------------------------------------------------

  async function loadAlerts() {

    try {

      const response = await getActiveAlerts();

      const data = Array.isArray(response)
        ? response
        : response.alerts || [];

      data.sort((a, b) => {

  // ACTIVE alerts always appear first
  if (a.status !== b.status) {

    if (a.status === "ACTIVE") return -1;
    if (b.status === "ACTIVE") return 1;

  }

  // Then sort by oldest request first
  return Number(a.requested) - Number(b.requested);

});

      setAlerts(data);

    }

    catch (err) {

      console.error(err);

    }

  }

  useEffect(() => {

    loadAlerts();

    const timer = setInterval(

      loadAlerts,

      5000

    );

    return () => clearInterval(timer);

  }, []);

  //--------------------------------------------------
  // Helper Functions
  //--------------------------------------------------

  function elapsed(requested) {

    if (!requested) return "00:00";

    const totalSeconds = Math.max(

      0,

      Math.floor(

        (Date.now() - Number(requested)) / 1000

      )

    );

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor(

      (totalSeconds % 3600) / 60

    );

    const seconds = totalSeconds % 60;

    if (hours > 0) {

      return `${hours}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;

    }

    return `${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;

  }

  function lineColor(id) {

    const line = productionLines.find(

      l =>

        l.id === id ||

        l.name === id

    );

    return line?.color || "#607D8B";

  }

  function statusColor(status) {

    switch (status) {

      case "ACTIVE":

        return "#EF4444";

      case "ACKNOWLEDGED":

        return "#22C55E";

      default:

        return "#64748B";

    }

  }

  function isOverdue(requested) {

    return (

      (Date.now() - Number(requested)) / 1000 >= 300

    );

  }
  function timerColor(requested) {

  const minutes =
    (Date.now() - Number(requested)) / 60000;

  if (minutes >= 10) return "#EF4444"; // Red

  if (minutes >= 5) return "#F59E0B"; // Amber

  return "#22C55E"; // Green

}

  //--------------------------------------------------
  // Dashboard Totals
  //--------------------------------------------------

  const waiting = useMemo(

    () =>

      alerts.filter(

        a => a.status === "ACTIVE"

      ).length,

    [alerts]

  );

  const acknowledged = useMemo(

    () =>

      alerts.filter(

        a => a.status === "ACKNOWLEDGED"

      ).length,

    [alerts]

  );
   //--------------------------------------------------
  // No Active Alerts
  //--------------------------------------------------

  if (alerts.length === 0) {

    return (

      <Box
        sx={{
          minHeight: "100vh",
          background: `
            linear-gradient(
              180deg,
              #1A2235 0%,
              #151E31 50%,
              #101726 100%
            )
          `,
          color: "white"
        }}
      >

        <Header time={time} />

        <Box
          sx={{
            height: "82vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center"
          }}
        >

          <Typography
            sx={{
              fontSize: 120
            }}
          >
            ✔
          </Typography>

          <Typography
            variant="h2"
            fontWeight={800}
          >
            ALL SYSTEMS NORMAL
          </Typography>

          <Typography
            sx={{
              mt: 2,
              fontSize: 28,
              color: "#94A3B8"
            }}
          >
            No Active Production Alerts
          </Typography>

        </Box>

      </Box>

    );

  }

  //--------------------------------------------------
  // Main Render
  //--------------------------------------------------

  return (

    <Box
      sx={{
        minHeight: "100vh",
        background: `
          linear-gradient(
            180deg,
            #1A2235 0%,
            #151E31 45%,
            #101726 100%
          )
        `,
        color: "white"
      }}
    >

      <Header time={time} />

      <Box sx={{ p: 4 }}>

        <Box sx={{ mb: 4 }}>

          <Typography
            variant="h3"
            fontWeight={800}
            sx={{
              letterSpacing: 2
            }}
          >
            MANUFACTURING OPERATIONS CENTER
          </Typography>

          <Typography
            sx={{
              mt: 1,
              fontSize: 22,
              color: "#94A3B8"
            }}
          >
            G&G Industrial Lighting • Live Production Response Dashboard
          </Typography>

        </Box>

        <Stack
  direction="row"
  spacing={3}
  sx={{ mb: 4 }}
>

  {[
    {
      title: "ACTIVE ALERTS",
      value: alerts.length,
      color: "#EF4444",
      subtitle: "Open Requests"
    },
    {
      title: "WAITING",
      value: waiting,
      color: "#F59E0B",
      subtitle: "Needs Response"
    },
    {
      title: "ACKNOWLEDGED",
      value: acknowledged,
      color: "#22C55E",
      subtitle: "Supervisor Assigned"
    },
    {
      title: "CURRENT TIME",
      value: time,
      color: "#60A5FA",
      subtitle: "Facility Time"
    }

  ].map(card => (

    <Paper
      key={card.title}
      elevation={10}
      sx={{
        flex: 1,
        p: 3,
        borderRadius: 4,

        background:
          "linear-gradient(180deg,#243247 0%,#1A2435 100%)",

        border:
          "1px solid rgba(255,255,255,.05)",

        transition: ".25s",

        "&:hover": {

          transform: "translateY(-4px)",

          boxShadow:
            "0 14px 30px rgba(0,0,0,.35)"
        }
      }}
    >

      <Typography
        sx={{
          color: "#94A3B8",
          fontWeight: 700,
          letterSpacing: 1.5,
          fontSize: 13
        }}
      >
        {card.title}
      </Typography>

      <Typography
        sx={{
          mt: 2,
          fontSize: 46,
          fontWeight: 800,
          color: card.color
        }}
      >
        {card.value}
      </Typography>

      <Typography
        sx={{
          mt: .5,
          color: "#64748B",
          fontSize: 14
        }}
      >
        {card.subtitle}
      </Typography>

    </Paper>

  ))}

</Stack>

        <Paper
          elevation={10}
          sx={{
            overflow: "hidden",
            borderRadius: 4,
            bgcolor: "#182131"
          }}
        >
          <Box
  sx={{
    display: "grid",
    gridTemplateColumns: "2.4fr 1.3fr 2fr 1.5fr 1.3fr",
    bgcolor: "#2A384E",
    px: 4,
    py: 3,
    borderBottom: "1px solid rgba(255,255,255,.08)"
  }}
>

  <Typography
    sx={{
      color: "#F8FAFC",
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: 1.3
    }}
  >
    🚨 ALERT TYPE
  </Typography>

  <Typography
    sx={{
      color: "#F8FAFC",
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: 1.3
    }}
  >
    🏭 LINE
  </Typography>

  <Typography
    sx={{
      color: "#F8FAFC",
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: 1.3
    }}
  >
    📍 WORK CENTER
  </Typography>

  <Typography
    textAlign="center"
    sx={{
      color: "#F8FAFC",
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: 1.3
    }}
  >
    ✔ STATUS
  </Typography>

  <Typography
    textAlign="right"
    sx={{
      color: "#F8FAFC",
      fontWeight: 800,
      fontSize: 17,
      letterSpacing: 1.3
    }}
  >
    ⏱ ELAPSED
  </Typography>

</Box>

          <Divider />

          {alerts.map((alert, index) => {

            const theme = alertTypes[alert.type];
            const highestPriority =
  alert.status === "ACTIVE" &&
  index === 0;

            return (

              <Box
  key={alert.id}
  sx={{
    position: "relative",

    display: "grid",

    gridTemplateColumns:
      "2.4fr 1.3fr 2fr 1.5fr 1.3fr",

    alignItems: "center",

    px: 4,

    py: 2.4,

    bgcolor: highestPriority
  ? "#25344B"
  : index % 2 === 0
    ? "#1C2737"
    : "#172131",
    border: highestPriority
  ? "2px solid rgba(239,68,68,.45)"
  : "none",

boxShadow: highestPriority
  ? "0 0 18px rgba(239,68,68,.18)"
  : "none",

    transition: ".2s",

    "&:hover": {
      bgcolor: "#243247"
    },

    borderBottom:
      "1px solid rgba(255,255,255,.06)"
  }}
>

  {/* Priority Color Strip */}

  <Box
    sx={{
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 8,
      bgcolor: theme.color,
      borderTopLeftRadius: 16,
      borderBottomLeftRadius: 16
    }}
  />

  {/* Alert Type */}

<Stack
  direction="row"
  spacing={2.5}
  alignItems="center"
>

  <Avatar
    sx={{
      bgcolor: theme.color,
      width: 58,
      height: 58,
      boxShadow: `0 0 18px ${theme.color}55`
    }}
  >
    {theme.icon}
  </Avatar>

  <Box>

  <Typography
    sx={{
      fontSize: 30,
      fontWeight: 900,
      color: "#FFFFFF",
      letterSpacing: 1,
      lineHeight: 1
    }}
  >
    {theme.label.toUpperCase()}
  </Typography>

  <Typography
    sx={{
      mt: 1,
      color: "#CBD5E1",
      fontSize: 17,
      fontWeight: 600
    }}
  >
    Alert #{alert.id}
  </Typography>

</Box>

</Stack>

                {/* Production Line */}

                <Chip
                  label={alert.production_line}
                  sx={{
                    bgcolor: lineColor(
                      alert.production_line
                    ),
                    color: "white",
                    fontWeight: 700,
                    fontSize: 16,
                    width: 150,
                    height: 40,
                    borderRadius: 2
                  }}
                />

                {/* Work Center */}

                <Typography
  sx={{
    fontSize: 24,
    fontWeight: 700,
    color: "#F8FAFC",
    letterSpacing: .3
  }}
>
  {alert.work_center}
</Typography>

                {/* Status */}

                <Chip
  label={alert.status}
  sx={{
    bgcolor: statusColor(alert.status),

    color: "#FFFFFF",

    fontWeight: 800,

    fontSize: 15,

    width: 170,

    height: 42,

    borderRadius: "10px",

    letterSpacing: 1,

    boxShadow:
      alert.status === "ACTIVE"
        ? "0 0 14px rgba(239,68,68,.45)"
        : "0 0 14px rgba(34,197,94,.35)",

    "& .MuiChip-label": {
      px: 2
    }
  }}
/>

                {/* Timer */}

                <Typography
  textAlign="right"
  sx={{
    fontFamily: "Roboto Mono",

    fontWeight: 900,

    fontSize: 44,

    letterSpacing: 2,

    color:
      isOverdue(alert.requested)
        ? "#FF5252"
        : "#FFFFFF",

    textShadow:
      isOverdue(alert.requested)
        ? "0 0 16px rgba(255,82,82,.8)"
        : "0 0 8px rgba(255,255,255,.15)",

    animation:
      isOverdue(alert.requested)
        ? "blinker .8s linear infinite"
        : "none"
  }}
>
  {elapsed(alert.requested)}
</Typography>

              </Box>

            );

          })}  
        </Paper>

      </Box>

      <Box
        sx={{
          mt: 5,
          py: 2,
          px: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: "#0B1220",
          borderTop: "1px solid rgba(255,255,255,.08)"
        }}
      >

        <Typography
          sx={{
            color: "#94A3B8",
            fontSize: 15
          }}
        >
          ManufacturingOS v6.2
        </Typography>

        <Typography
          sx={{
            color: "#64748B",
            fontSize: 14
          }}
        >
          G&G Industrial Lighting • Production Response System
        </Typography>

      </Box>

      <style>
        {`
          @keyframes blinker {
            50% {
              opacity:.25;
            }
          }
        `}
      </style>

    </Box>

  );

}
          