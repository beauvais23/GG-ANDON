import { useEffect, useMemo, useRef, useState } from "react";

import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Button
} from "@mui/material";

import { Link } from "react-router-dom";

import Header from "../components/Header";
import DashboardStats from "../components/DashboardStats";
import ActiveAlertCard from "../components/ActiveAlertCard";
import ResponderSelector from "../components/ResponderSelector";
import ResponseTeamPanel from "../components/ResponseTeamPanel";

import useClock from "../hooks/useClock";

import {
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert
} from "../services/api";

import alertTypes from "../config/alertTypes";
import { getResponseTeam } from "../api/responseTeam";

export default function ProductionResponseCenter() {

  const clock = useClock();

  const [alerts, setAlerts] = useState([]);
const [responseTeam, setResponseTeam] = useState([]);
const [selectedResponder, setSelectedResponder] = useState("");
const [selectedType, setSelectedType] = useState("ALL");

const previousAlertIds = useRef(new Set());
const audioContextRef = useRef(null);

const soundEnabledRef = useRef(false);
const alarmSilencedRef = useRef(false);

const alertsInitializedRef = useRef(false);

//--------------------------------------------------------
// Alarm / Connection State
//--------------------------------------------------------

const [alarmSilenced, setAlarmSilenced] = useState(false);
const [soundEnabled, setSoundEnabled] = useState(false);
const [serverOnline, setServerOnline] = useState(true);

// Keep refs synchronized with the React state.
// This allows the polling function to always see the
// current sound/silence settings.

useEffect(() => {

  soundEnabledRef.current = soundEnabled;

}, [soundEnabled]);

useEffect(() => {

  alarmSilencedRef.current = alarmSilenced;

}, [alarmSilenced]);

//--------------------------------------------------------
// Alert Polling
//--------------------------------------------------------

useEffect(() => {

  loadAlerts();

  const timer =
    setInterval(loadAlerts, 5000);

  return () =>
    clearInterval(timer);

}, []);

//--------------------------------------------------------
// Live Timer Refresh
//--------------------------------------------------------

useEffect(() => {

  const timer = setInterval(() => {

    setAlerts(current => [...current]);

  }, 1000);

  return () => clearInterval(timer);

}, []);

//--------------------------------------------------------
// Response Team
//--------------------------------------------------------

useEffect(() => {

  async function loadTeam() {

    try {

      const team = await getResponseTeam();

      setResponseTeam(team);

      if (team.length > 0) {

        setSelectedResponder(team[0].name);

      }

    } catch (err) {

      console.error(err);

    }

  }

  loadTeam();

}, []);

//--------------------------------------------------------
// Browser Offline Detection
//--------------------------------------------------------

useEffect(() => {

  function handleOnline() {

    setServerOnline(true);
    loadAlerts();

  }

  function handleOffline() {

    setServerOnline(false);

  }

  window.addEventListener(
    "online",
    handleOnline
  );

  window.addEventListener(
    "offline",
    handleOffline
  );

  if (!navigator.onLine) {

    setServerOnline(false);

  }

  return () => {

    window.removeEventListener(
      "online",
      handleOnline
    );

    window.removeEventListener(
      "offline",
      handleOffline
    );

  };

}, []);

//--------------------------------------------------------
// Helpers
//--------------------------------------------------------

function elapsed(requested) {

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Number(requested)) / 1000)
  );

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {

    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;

  }

  return `${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;

}

//--------------------------------------------------------
// Critical Alert Helper
//--------------------------------------------------------

function isCritical(requested) {

  return (
    (Date.now() - Number(requested)) / 1000 >= 600
  );

}

//--------------------------------------------------------
// Audible Alarm
//--------------------------------------------------------

function enableSound() {

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {

      console.error(
        "Web Audio API not supported"
      );

      return;

    }

    if (!audioContextRef.current) {

      audioContextRef.current =
        new AudioContext();

    }

    if (
      audioContextRef.current.state === "suspended"
    ) {

      audioContextRef.current.resume();

    }

    soundEnabledRef.current = true;

    setSoundEnabled(true);

  }

  catch (err) {

    console.error(
      "Unable to enable sound:",
      err
    );

  }

}

function playAlarm() {

  if (
    !soundEnabledRef.current ||
    alarmSilencedRef.current
  ) {
    return;
  }

  try {

    const context = audioContextRef.current;

    if (!context) {
      console.warn("Audio context not initialized");
      return;
    }

    if (context.state === "suspended") {
      context.resume();
    }

    const now = context.currentTime;

    const toneDuration = 0.25;
    const gap = 0.075;

    const frequencies = [
      660,
      880,
      660,
      880
    ];

    frequencies.forEach((frequency, index) => {

      const start =
        now + index * (toneDuration + gap);

      const oscillator =
        context.createOscillator();

      const gain =
        context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        frequency,
        start
      );

      // Smooth attack
      gain.gain.setValueAtTime(
        0.001,
        start
      );

      gain.gain.exponentialRampToValueAtTime(
        0.18,
        start + 0.025
      );

      // Smooth decay
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        start + toneDuration
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(start);
      oscillator.stop(start + toneDuration);

    });

  }

  catch (err) {

    console.error(
      "Alarm error:",
      err
    );

  }

}

//--------------------------------------------------------
// Load Alerts
//--------------------------------------------------------

async function loadAlerts() {

  try {

    const data = await getActiveAlerts();

    //----------------------------------------------------
    // Server is responding
    //----------------------------------------------------

    setServerOnline(true);

    //----------------------------------------------------
    // Sort alerts
    //----------------------------------------------------

    data.sort((a, b) => {

      const aCritical = isCritical(a.requested);
      const bCritical = isCritical(b.requested);

      if (aCritical !== bCritical) {

        return aCritical ? -1 : 1;

      }

      if (a.status !== b.status) {

        if (a.status === "ACTIVE") return -1;
        if (b.status === "ACTIVE") return 1;

      }

      return Number(a.requested) - Number(b.requested);

    });

    //----------------------------------------------------
    // Detect NEW active alerts
    //----------------------------------------------------

    const currentIds =
      new Set(data.map(alert => alert.id));

    const hasNewAlert =
      alertsInitializedRef.current &&
      data.some(alert =>
        !previousAlertIds.current.has(alert.id) &&
        alert.status === "ACTIVE"
      );

    if (hasNewAlert) {

      console.log(
        "🚨 NEW ACTIVE ALERT DETECTED"
      );

      // New alert automatically unsilences the alarm
      setAlarmSilenced(false);
      alarmSilencedRef.current = false;

      playAlarm();

    }

    //----------------------------------------------------
    // Save alert IDs for next poll
    //----------------------------------------------------

    previousAlertIds.current = currentIds;

    //----------------------------------------------------
    // First successful poll is now complete
    //----------------------------------------------------

    alertsInitializedRef.current = true;

    //----------------------------------------------------
    // Update screen
    //----------------------------------------------------

    setAlerts(data);

  }

  catch (err) {

    console.error(
      "Alert polling error:",
      err
    );

    setServerOnline(false);

  }

}

  //--------------------------------------------------------
  // Dashboard Stats
  //--------------------------------------------------------

  const filteredAlerts = useMemo(() => {

    if (selectedType === "ALL") return alerts;

    return alerts.filter(
      a => a.type === selectedType
    );

  }, [alerts, selectedType]);

  const activeCount = alerts.length;

  const waitingCount =
    alerts.filter(a => a.status === "ACTIVE").length;

  const acknowledgedCount =
    alerts.filter(a => a.status === "ACKNOWLEDGED").length;

  const oldestAlert =
    alerts.length
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

    const avg = Math.floor(totalSeconds / alerts.length);

    const mins = Math.floor(avg / 60);
    const secs = avg % 60;

    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;

  })();

  //--------------------------------------------------------
  // Actions
  //--------------------------------------------------------

  async function handleAcknowledge(id) {

    await acknowledgeAlert(id, selectedResponder);

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

  //--------------------------------------------------------
  // Render
  //--------------------------------------------------------

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#EEF2F6"
      }}
    >

      <Header time={clock.time} />

      <Box
        sx={{
          maxWidth: 1800,
          mx: "auto",
          p: 3
        }}
      >

        {/*================================================*/}
        {/* PAGE HEADER */}
        {/*================================================*/}

        <Paper
  elevation={3}
  sx={{
    mb: 3,
    p: 3,
    borderRadius: 4,
    background:
      "linear-gradient(135deg,#1E293B,#334155)",
    color: "white"
  }}
>

  <Box>

    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "flex-start"
      }}>

      <Box>

        <Typography
          variant="h3"
          sx={{
            fontWeight: 800
          }}
        >
          Production Response Center
        </Typography>

        <Typography
          sx={{
            mt: 0.5,
            opacity: 0.85,
            mb: 3
          }}
        >
          Live Manufacturing Incident Dashboard
        </Typography>

      </Box>

      <Stack
        spacing={1}
        sx={{
          alignItems: "flex-end"
        }}
      >

        <Stack
  direction="row"
  spacing={1}
  sx={{
    alignItems: "center"
  }}
>

  <Chip
    color={serverOnline ? "success" : "error"}
    label={
      serverOnline
        ? "SYSTEM ONLINE"
        : "SERVER OFFLINE"
    }
    sx={{
      fontWeight: 700
    }}
  />

  {!soundEnabled && (

    <Button
      variant="contained"
      color="warning"
      size="small"
      onClick={enableSound}
      sx={{
        fontWeight: 700
      }}
    >
      ENABLE SOUND
    </Button>

  )}

  {soundEnabled && (

    <Button
      variant="outlined"
      color="inherit"
      size="small"
      onClick={() => {

  const newValue = !alarmSilenced;

  alarmSilencedRef.current = newValue;

  setAlarmSilenced(newValue);

}}
      sx={{
        fontWeight: 700,
        borderColor: "rgba(255,255,255,.5)",
        color: "white"
      }}
    >
      {alarmSilenced
        ? "🔇 ALARM SILENCED"
        : "🔊 SILENCE ALARM"}
    </Button>

  )}

  

</Stack>

        <Stack
          direction="row"
          spacing={1}
        >

          <Button
            component={Link}
            to="/"
            variant="contained"
            color="warning"
            size="small"
            sx={{
              height: 34,
              minWidth: 105,
              borderRadius: 2,
              fontWeight: 700,
              textTransform: "none"
            }}
          >
            Operator
          </Button>

          <Button
            component={Link}
            to="/wallboard"
            variant="contained"
            size="small"
            sx={{
              height: 34,
              minWidth: 105,
              borderRadius: 2,
              fontWeight: 700,
              textTransform: "none"
            }}
          >
            Wallboard
          </Button>

          <Button
            component={Link}
            to="/executive"
            variant="contained"
            color="secondary"
            size="small"
            sx={{
              height: 34,
              minWidth: 115,
              borderRadius: 2,
              fontWeight: 700,
              textTransform: "none"
            }}
          >
            Executive
          </Button>

        </Stack>

      </Stack>

    </Stack>

  </Box>

</Paper>

        {/*================================================*/}
        {/* MAIN LAYOUT */}
        {/*================================================*/}

        <Stack
          direction="row"
          spacing={3}
          sx={{
            alignItems: "flex-start"
          }}
        >

          {/* LEFT COLUMN */}

          <Box sx={{ flex: 1 }}>

            <DashboardStats
              active={activeCount}
              waiting={waitingCount}
              acknowledged={acknowledgedCount}
              oldest={oldestAlert}
              average={averageAge}
            />

            {/*================================================*/}
            {/* FILTERS */}
            {/*================================================*/}

            <Paper
              elevation={3}
              sx={{
                mt: 3,
                p: 2.5,
                borderRadius: 4
              }}
            >

              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 2
                }}>
                Active Alert Filters
              </Typography>

              <Stack
  direction="row"
  spacing={1}
  useFlexGap
  sx={{
    flexWrap: "wrap"
  }}
>

                {[
                  "ALL",
                  ...Object.keys(alertTypes)
                ].map(type => (

                  <Chip
                    key={type}
                    clickable
                    label={type}
                    color={
                      selectedType === type
                        ? "primary"
                        : "default"
                    }
                    onClick={() =>
                      setSelectedType(type)
                    }
                    sx={{
                      height: 36,
                      px: 1.5,
                      fontWeight: 700
                    }}
                  />

                ))}

              </Stack>

            </Paper>

            {/*================================================*/}
            {/* ACTIVE ALERTS */}
            {/*================================================*/}

            <Paper
              elevation={3}
              sx={{
                mt: 3,
                p: 3,
                borderRadius: 4
              }}
            >

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  mb: 3
                }}
              >

                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700
                  }}
                >
                  Active Manufacturing Alerts
                </Typography>

                <Chip
                  color="error"
                  label={`${filteredAlerts.length} ACTIVE`}
                  sx={{
                    fontWeight: 700
                  }}
                />

                <Box />

              </Box>

              {filteredAlerts.length === 0 ? (

                <Box
                  sx={{
                    py: 10,
                    textAlign: "center"
                  }}
                >

                  <Typography
                    variant="h6"
                    sx={{
                      color: "text.secondary"
                    }}
                  >
                    No Active Manufacturing Alerts
                  </Typography>

                </Box>

              ) : (

                <Stack spacing={2.5}>

                  {filteredAlerts.map(alert => (

                    <ActiveAlertCard
                      key={alert.id}
                      alert={alert}
                      elapsed={elapsed(alert.requested)}
                      onAcknowledge={() =>
                        handleAcknowledge(alert.id)
                      }
                      onResolve={() =>
                        handleResolve(alert.id)
                      }
                    />

                  ))}

                </Stack>

              )}

            </Paper>

          </Box>
          {/*================================================*/}
          {/* RIGHT COLUMN */}
          {/*================================================*/}

          <Box
            sx={{
              width: 340,
              flexShrink: 0,
              position: "sticky",
              top: 16
            }}
          >

            <Paper
              elevation={3}
              sx={{
                p: 2.5,
                borderRadius: 4,
                mb: 2
              }}
            >

              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 2
                }}>
                Active Responder
              </Typography>

              <ResponderSelector
                responder={selectedResponder}
                setResponder={setSelectedResponder}
                responseTeam={responseTeam}
              />

            </Paper>

            <ResponseTeamPanel
              responseTeam={responseTeam}
            />

          </Box>

        </Stack>

        {/*================================================*/}
        {/* FOOTER STATUS */}
        {/*================================================*/}

        <Paper
          elevation={2}
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 4
          }}
        >

          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center"
            }}>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center"
              }}
            >

              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: "#43A047"
                }}
              />

              <Typography sx={{
                fontWeight: 600
              }}>
                Connected to ManufacturingOS
              </Typography>

            </Stack>

            <Typography sx={{
              color: "text.secondary"
            }}>
              Auto Refresh Every 5 Seconds
            </Typography>

          </Stack>

        </Paper>

      </Box>

    </Box>
  );

}              