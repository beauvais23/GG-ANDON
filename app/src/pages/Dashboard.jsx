import { useEffect, useState } from "react";

import {
  Box,
  Paper,
  Typography
} from "@mui/material";

import Header from "../components/Header";
import AlertList from "../components/AlertList";
import DashboardStats from "../components/DashboardStats";

import {
  getActiveAlerts,
  resolveAlert,
  acknowledgeAlert
} from "../services/api";

import useClock from "../hooks/useClock";

export default function Dashboard() {

  const time = useClock();

  const [alerts, setAlerts] = useState([]);

  async function loadAlerts() {

    try {

      const data = await getActiveAlerts();

      setAlerts(data);

    } catch (err) {

      console.error(err);

    }

  }

  useEffect(() => {

    loadAlerts();

    const timer = setInterval(loadAlerts, 1000);

    return () => clearInterval(timer);

  }, []);

  async function handleResolve(id) {

    await resolveAlert(id);

    loadAlerts();

  }

  async function handleAcknowledge(id) {

    await acknowledgeAlert(id);

    loadAlerts();

  }

  return (

    <Box
      sx={{
        minHeight: "100vh",
        background: "#ECEFF1"
      }}
    >

      <Header time={time} />

      <Paper
        elevation={2}
        sx={{
          p: 4,
          m: 3,
          borderRadius: 4
        }}
      >

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4
          }}
        >

          <Box>

            <Typography
              variant="h3"
              fontWeight="bold"
            >
              Production Response Center
            </Typography>

            <Typography
              variant="h6"
              color="text.secondary"
            >
              Live Manufacturing Alerts
            </Typography>

          </Box>

          <Box textAlign="right">

            <Typography
              variant="h2"
              color="error.main"
              fontWeight="bold"
            >
              {alerts.length}
            </Typography>

            <Typography color="text.secondary">
              Active Alerts
            </Typography>

          </Box>

        </Box>

        <DashboardStats alerts={alerts} />

        <AlertList
          alerts={alerts}
          onResolve={handleResolve}
          onAcknowledge={handleAcknowledge}
        />

      </Paper>

    </Box>

  );

}