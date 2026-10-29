import { useEffect, useRef, useState } from "react";

import { Box, Button } from "@mui/material";

import Header from "../components/Header";
import DashboardStats from "../components/DashboardStats";
import AlertBoard from "../components/AlertBoard";
import ResponderPanel from "../components/ResponderPanel";
import ResolveDialog from "../components/ResolveDialog";
import NeedsNotePanel from "../components/NeedsNotePanel";
import CancelDialog from "../components/CancelDialog";

import useClock from "../hooks/useClock";
import useResponseTeam from "../hooks/useResponseTeam";

import {
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert
} from "../services/api";

import { alertStats, isCritical } from "../utils/alertTime";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// Response Center (/supervisor), restyled in E3 to the
// approved mockup. Alarm, sound and polling unchanged.
//------------------------------------------------------

export default function ProductionResponseCenter() {

  const clock = useClock();

  const [alerts, setAlerts] = useState([]);
  const [resolving, setResolving] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [selectedType, setSelectedType] = useState("ALL");
  const [now, setNow] = useState(() => Date.now());

  const { team, actingAs: selectedResponder, setActingAs } = useResponseTeam();

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

  const timer = setInterval(() => setNow(Date.now()), 1000);

  return () => clearInterval(timer);

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

      const aCritical = isCritical(a);
      const bCritical = isCritical(b);

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
  // Status strip
  //--------------------------------------------------------

  const stats = alertStats(alerts, now);

  //--------------------------------------------------------
  // Actions
  //--------------------------------------------------------

  async function handleAcknowledge(id) {

    await acknowledgeAlert(id, selectedResponder);

    loadAlerts();

  }

  // Opens the note dialog; submitResolve does the resolve.
  function handleResolve(id) {

    setResolving(alerts.find(a => a.id === id) || { id });

  }

  // False alarm / test (#26): opens the reason dialog.
  function handleCancel(id) {

    setCancelling(alerts.find(a => a.id === id) || { id });

  }

  async function submitCancel(id, reason) {

    const result = await cancelAlert(id, {
      reason,
      cancelledBy: selectedResponder
    });

    loadAlerts();

    return result;

  }

  async function submitResolve(id, note) {

    const result = await resolveAlert(
      id,
      selectedResponder,
      note
    );

    loadAlerts();

    return result;

  }

  function toggleSilence() {

    const silenced = !alarmSilenced;

    alarmSilencedRef.current = silenced;
    setAlarmSilenced(silenced);

  }

  //--------------------------------------------------------
  // Render
  //--------------------------------------------------------

  return (

    <Box sx={{ minHeight: "100vh", bgcolor: tokens.ground }}>

      <Header time={clock.time} />

      <Box sx={{ maxWidth: 1600, mx: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>

        {/* Connection and sound */}
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>

          <Box sx={{ ...labelSx, display: "flex", alignItems: "center", gap: 1, color: serverOnline ? tokens.muted : "#FF8A80" }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: serverOnline ? tokens.online : "#FF6B61", boxShadow: `0 0 6px ${serverOnline ? tokens.online : "#FF6B61"}` }} />
            {serverOnline ? "Live · refresh 5 s" : "Server offline: alerts not updating"}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!soundEnabled && (
            <Button variant="outlined" onClick={enableSound} sx={{ color: "#F2C232", borderColor: "#5C4A12" }}>
              Enable sound
            </Button>
          )}

          {soundEnabled && (
            <Button variant="outlined" color="inherit" onClick={toggleSilence} aria-pressed={alarmSilenced}>
              {alarmSilenced ? "Alarm silenced: turn on" : "Silence alarm"}
            </Button>
          )}

        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2.5, alignItems: "flex-start" }}>

          <Box component="main" sx={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}>

            <DashboardStats {...stats} />

            <AlertBoard
              alerts={alerts}
              now={now}
              filter={selectedType}
              onFilter={setSelectedType}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
              onCancel={handleCancel}
            />

            <NeedsNotePanel responder={selectedResponder} />

          </Box>

          <Box component="aside" sx={{ flex: "1 1 300px" }}>
            <ResponderPanel team={team} actingAs={selectedResponder} setActingAs={setActingAs} />
          </Box>

        </Box>

      </Box>

      <ResolveDialog
        alert={resolving}
        responder={selectedResponder}
        onClose={() => setResolving(null)}
        onResolve={submitResolve}
      />

      <CancelDialog
        alert={cancelling}
        responder={selectedResponder}
        onClose={() => setCancelling(null)}
        onCancel={submitCancel}
      />

    </Box>

  );

}
