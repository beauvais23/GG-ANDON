import { useEffect, useMemo, useState } from "react";

import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  Divider
} from "@mui/material";

import Header from "../components/Header";
import DashboardStats from "../components/DashboardStats";
import ActiveAlertCard from "../components/ActiveAlertCard";

import useClock from "../hooks/useClock";

import {
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert
} from "../services/api";

import alertTypes from "../config/alertTypes";
import responseTeam from "../config/responseTeam";

export default function ProductionResponseCenter() {

  const time = useClock();

  const [alerts, setAlerts] = useState([]);

  const [selectedType, setSelectedType] = useState("ALL");

  const [selectedResponder, setSelectedResponder] = useState(
    responseTeam[0]?.name || ""
  );

  const [, refresh] = useState(0);

  //----------------------------------------------------
  // Update elapsed timers every second
  //----------------------------------------------------

  useEffect(() => {

    const timer = setInterval(() => {

      refresh(v => v + 1);

    }, 1000);

    return () => clearInterval(timer);

  }, []);

  //----------------------------------------------------
  // Load alerts
  //----------------------------------------------------

  async function loadAlerts() {

    try {

      const data = await getActiveAlerts();

      data.sort(
        (a, b) =>
          Number(a.requested) -
          Number(b.requested)
      );

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

  //----------------------------------------------------
  // Helpers
  //----------------------------------------------------

  function elapsed(requested) {

    const seconds = Math.max(
      0,
      Math.floor(
        (Date.now() - Number(requested)) / 1000
      )
    );

    const h = Math.floor(seconds / 3600);

    const m = Math.floor(
      (seconds % 3600) / 60
    );

    const s = seconds % 60;

    if (h > 0) {

      return `${h}:${m
        .toString()
        .padStart(2, "0")}:${s
        .toString()
        .padStart(2, "0")}`;

    }

    return `${m
      .toString()
      .padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;

  }

  const filteredAlerts = useMemo(() => {

    if (selectedType === "ALL")
      return alerts;

    return alerts.filter(

      a => a.type === selectedType

    );

  }, [alerts, selectedType]);
  //----------------------------------------------------
  // Dashboard Statistics
  //----------------------------------------------------

  const activeCount = alerts.length;

  const waitingCount = alerts.filter(
    a => a.status === "ACTIVE"
  ).length;

  const acknowledgedCount = alerts.filter(
    a => a.status === "ACKNOWLEDGED"
  ).length;

  const oldestAlert = alerts.length
    ? elapsed(alerts[0].requested)
    : "00:00";

  const averageAge = (() => {

    if (!alerts.length) return "00:00";

    const totalSeconds = alerts.reduce((sum, alert) => {

      return (
        sum +
        Math.floor(
          (Date.now() - Number(alert.requested)) / 1000
        )
      );

    }, 0);

    const avg = Math.floor(
      totalSeconds / alerts.length
    );

    const mins = Math.floor(avg / 60);

    const secs = avg % 60;

    return `${mins
      .toString()
      .padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;

  })();

  //----------------------------------------------------
  // Button Handlers
  //----------------------------------------------------

  async function handleAcknowledge(id) {

    await acknowledgeAlert(
      id,
      selectedResponder
    );

    loadAlerts();

  }

  async function handleResolve(id) {

    await resolveAlert(
      id,
      selectedResponder,
      "Resolved"
    );

    loadAlerts();

  }

  //----------------------------------------------------
  // Render
  //----------------------------------------------------

  return (

    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#ECEFF1"
      }}
    >

      <Header time={time} />

      <Box sx={{ p: 3 }}>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
        >

          <Box>

            <Typography
              variant="h3"
              fontWeight={700}
            >
              Production Response Center
            </Typography>

            <Typography color="text.secondary">

              Live Manufacturing Alerts

            </Typography>

          </Box>

        </Stack>

        <DashboardStats

          active={activeCount}

          waiting={waitingCount}

          acknowledged={acknowledgedCount}

          oldest={oldestAlert}

          average={averageAge}

        />

        <Paper
          elevation={3}
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 3
          }}
        >

          <Typography
            variant="h6"
            fontWeight={700}
            gutterBottom
          >

            Alert Filters

          </Typography>

          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
          >

            {[
              "ALL",
              ...Object.keys(alertTypes)
            ].map(type => (

              <Chip

                key={type}

                label={type}

                clickable

                color={
                  selectedType === type
                    ? "primary"
                    : "default"
                }

                onClick={() =>
                  setSelectedType(type)
                }

              />

            ))}

          </Stack>

        </Paper>

        <Paper
          elevation={3}
          sx={{
            mt: 3,
            borderRadius: 3,
            overflow: "hidden"
          }}
        >
          {filteredAlerts.length === 0 ? (

            <Box
              sx={{
                py: 8,
                textAlign: "center"
              }}
            >

              <Typography
                variant="h5"
                color="text.secondary"
              >
                No matching active alerts
              </Typography>

            </Box>

          ) : (

            <Box
              sx={{
                p: 2,
                display: "grid",
                gap: 2
              }}
            >

              {filteredAlerts.map((alert) => (

                <ActiveAlertCard

                  key={alert.id}

                  alert={alert}

                  elapsed={elapsed(alert.requested)}

                  responder={selectedResponder}

                  onAcknowledge={() =>
                    handleAcknowledge(alert.id)
                  }

                  onResolve={() =>
                    handleResolve(alert.id)
                  }

                />

              ))}

            </Box>

          )}

        </Paper>

        <Divider sx={{ my: 3 }} />

        <Paper
  elevation={3}
  sx={{
    mt: 3,
    p: 3,
    borderRadius: 3
  }}
>

  <Typography
    variant="h5"
    fontWeight={700}
    gutterBottom
  >
    Response Team
  </Typography>

  <Typography
    color="text.secondary"
    sx={{ mb: 3 }}
  >
    Select the person currently responding to production calls.
  </Typography>

  <Stack
    direction="row"
    spacing={2}
    flexWrap="wrap"
    useFlexGap
  >

    {responseTeam.map((person) => (

      <Chip

        key={person.name}

        label={person.name}

        clickable

        size="medium"

        color={
          selectedResponder === person.name
            ? "primary"
            : "default"
        }

        sx={{
          fontWeight: 700,
          fontSize: 15,
          px: 1,
          height: 42
        }}

        onClick={() =>
          setSelectedResponder(person.name)
        }

      />

    ))}

  </Stack>

</Paper>    
      </Box>

            <Paper
        elevation={2}
        sx={{
          mt: 3,
          p: 2,
          borderRadius: 3,
          bgcolor: "#ECEFF1"
        }}
      >

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
          >

            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: "#43A047"
              }}
            />

            <Typography
              fontWeight={600}
            >
              Connected to ManufacturingOS
            </Typography>

          </Stack>

          <Typography
            color="text.secondary"
          >
            Auto Refresh: Every 5 Seconds
          </Typography>

        </Stack>

      </Paper>

      <Box
        sx={{
          mt: 4,
          py: 2,
          bgcolor: "#263238",
          color: "white",
          textAlign: "center"
        }}
      >

        <Typography
          variant="body2"
        >
          ManufacturingOS v6.1 • Production Response Center • G&G Industrial Lighting
        </Typography>

      </Box>
   

    </Box>

  );

}              