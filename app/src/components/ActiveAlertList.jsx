import { useEffect, useState } from "react";

import {
  Box,
  Typography,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";

import ActiveAlertCard from "./ActiveAlertCard";
import DashboardStats from "./DashboardStats";

import {
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert
} from "../services/api";

export default function ActiveAlertList({ responseTeamMember }) {

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  async function loadAlerts() {

    try {

      const response = await getActiveAlerts();

      const data = Array.isArray(response)
        ? response
        : (response.alerts || []);

      data.sort(
        (a, b) => Number(a.requested) - Number(b.requested)
      );

      setAlerts(data);

    } catch (err) {

      console.error("Error loading alerts:", err);
      setAlerts([]);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    loadAlerts();

    const timer = setInterval(loadAlerts, 2000);

    return () => clearInterval(timer);

  }, []);

  async function handleAcknowledge(id) {

    try {

      await acknowledgeAlert(id, responseTeamMember);

      await loadAlerts();

    } catch (err) {

      console.error(err);

    }

  }

  async function handleResolve(id) {

    try {

      await resolveAlert(
        id,
        responseTeamMember,
        ""
      );

      await loadAlerts();

    } catch (err) {

      console.error(err);

    }

  }

  const filteredAlerts =
    filter === "ALL"
      ? alerts
      : alerts.filter(alert => alert.type === filter);

  if (loading) {

    return (

      <Box
        sx={{
          textAlign: "center",
          mt: 8
        }}
      >

        <CircularProgress size={70} />

        <Typography sx={{ mt: 2 }}>
          Loading Active Alerts...
        </Typography>

      </Box>

    );

  }

  return (

    <Box>

      <DashboardStats alerts={alerts} />

      <ToggleButtonGroup
        value={filter}
        exclusive
        onChange={(event, value) => {

          if (value) {

            setFilter(value);

          }

        }}
        sx={{
          mb: 4,
          flexWrap: "wrap"
        }}
      >

        <ToggleButton value="ALL">
          All
        </ToggleButton>

        <ToggleButton value="QUALITY">
          Quality
        </ToggleButton>

        <ToggleButton value="MAINTENANCE">
          Maintenance
        </ToggleButton>

        <ToggleButton value="MATERIAL">
          Material
        </ToggleButton>

        <ToggleButton value="SUPERVISOR">
          Supervisor
        </ToggleButton>

        <ToggleButton value="SAFETY">
          Safety
        </ToggleButton>

      </ToggleButtonGroup>

      {filteredAlerts.length === 0 ? (

        <Typography
          variant="h5"
          color="text.secondary"
          sx={{ mt: 4 }}
        >
          No Active Alerts
        </Typography>

      ) : (

        filteredAlerts.map((alert) => (

          <ActiveAlertCard
            key={alert.id}
            alert={alert}
            responseTeamMember={responseTeamMember}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
          />

        ))

      )}

    </Box>

  );

}