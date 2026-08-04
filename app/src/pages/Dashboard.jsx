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
import { getResponseTeam } from "../api/responseTeam";

export default function Dashboard() {

  const clock = useClock();

  const [alerts, setAlerts] = useState([]);

  const [responseTeam, setResponseTeam] = useState([]);

  const [selectedResponder, setSelectedResponder] =
    useState("");


  //------------------------------------------------------
  // Load Response Team
  //------------------------------------------------------

  useEffect(() => {

    async function loadResponseTeam() {

      try {

        const team =
          await getResponseTeam();

        setResponseTeam(team);

        if (
          team.length > 0 &&
          !selectedResponder
        ) {

          setSelectedResponder(
            team[0].name
          );

        }

      }

      catch (err) {

        console.error(
          "Failed to load response team:",
          err
        );

      }

    }

    loadResponseTeam();

  }, [selectedResponder]);


  //------------------------------------------------------
  // Load Alerts
  //------------------------------------------------------

  async function loadAlerts() {

    try {

      const data =
        await getActiveAlerts();

      setAlerts(
        Array.isArray(data)
          ? data
          : (data.alerts || [])
      );

    }

    catch (err) {

      console.error(
        "Failed to load alerts:",
        err
      );

    }

  }


  //------------------------------------------------------
  // Auto Refresh
  //------------------------------------------------------

  useEffect(() => {

    loadAlerts();

    const timer =
      setInterval(
        loadAlerts,
        1000
      );

    return () =>
      clearInterval(timer);

  }, []);


  //------------------------------------------------------
  // Acknowledge Alert
  //------------------------------------------------------

  async function handleAcknowledge(id) {

    try {

      if (!selectedResponder) {

        console.error(
          "No responder selected."
        );

        return;

      }

      await acknowledgeAlert(
        id,
        selectedResponder
      );

      await loadAlerts();

    }

    catch (err) {

      console.error(
        "Dashboard acknowledge error:",
        err
      );

    }

  }


  //------------------------------------------------------
  // Resolve Alert
  //------------------------------------------------------

  async function handleResolve(id) {

    try {

      if (!selectedResponder) {

        console.error(
          "No responder selected."
        );

        return;

      }

      await resolveAlert(
        id,
        selectedResponder,
        "Resolved"
      );

      await loadAlerts();

    }

    catch (err) {

      console.error(
        "Dashboard resolve error:",
        err
      );

    }

  }


  //------------------------------------------------------
  // Render
  //------------------------------------------------------

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "#ECEFF1"
      }}
    >

      <Header
        time={clock.time}
      />

      <Paper
        elevation={2}
        sx={{
          p: 4,
          m: 3,
          borderRadius: 4
        }}
      >


        {/*================================================*/}
        {/* PAGE HEADER */}
        {/*================================================*/}

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
              sx={{
                fontWeight: "bold"
              }}
            >
              Production Response Center
            </Typography>

            <Typography
              variant="h6"
              sx={{
                color: "text.secondary"
              }}
            >
              Live Manufacturing Alerts
            </Typography>

          </Box>


          <Box
            sx={{
              textAlign: "right"
            }}
          >

            <Typography
              variant="h2"
              sx={{
                color: "error.main",
                fontWeight: "bold"
              }}>
              {alerts.length}
            </Typography>

            <Typography
              sx={{
                color: "text.secondary"
              }}
            >
              Active Alerts
            </Typography>

          </Box>

        </Box>


        {/*================================================*/}
        {/* DASHBOARD STATS */}
        {/*================================================*/}

        <DashboardStats
          alerts={alerts}
        />


        {/*================================================*/}
        {/* ALERT LIST */}
        {/*================================================*/}

        <AlertList
          alerts={alerts}
          responseTeamMember={selectedResponder}
          responseTeam={responseTeam}
          onResolve={handleResolve}
          onAcknowledge={handleAcknowledge}
        />


      </Paper>

    </Box>
  );

}