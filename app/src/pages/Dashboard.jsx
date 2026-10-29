import { useEffect, useState } from "react";

import { Box } from "@mui/material";

import Header from "../components/Header";
import DashboardStats from "../components/DashboardStats";
import AlertBoard from "../components/AlertBoard";
import ResponderPanel from "../components/ResponderPanel";
import ResolveDialog from "../components/ResolveDialog";
import NeedsNotePanel from "../components/NeedsNotePanel";
import CancelDialog from "../components/CancelDialog";

import {
  getActiveAlerts,
  resolveAlert,
  cancelAlert,
  acknowledgeAlert
} from "../services/api";

import useClock from "../hooks/useClock";
import useResponseTeam from "../hooks/useResponseTeam";
import { alertStats } from "../utils/alertTime";
import { tokens } from "../theme/theme";

//------------------------------------------------------
// Dashboard (/dashboard), rebuilt in E3 from the same
// parts as the Response Center, without the alarm and
// filters.
// #29: the status strip got no numbers and the alert
// cards no elapsed time. #30: there was no responder
// picker, so every action was recorded under the first
// person on the team list.
//------------------------------------------------------

export default function Dashboard() {

  const clock = useClock();

  const [alerts, setAlerts] = useState([]);
  const [resolving, setResolving] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const { team, actingAs, setActingAs } = useResponseTeam();

  async function loadAlerts() {

    try {

      const data = await getActiveAlerts();

      setAlerts(Array.isArray(data) ? data : (data.alerts || []));

    }

    catch (err) {

      console.error("Failed to load alerts:", err);

    }

  }

  // Alerts every 5 s (was every 1 s); timers tick every second.
  useEffect(() => {

    loadAlerts();

    const poll = setInterval(loadAlerts, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };

  }, []);

  async function handleAcknowledge(id) {

    if (!actingAs) return;

    await acknowledgeAlert(id, actingAs);

    await loadAlerts();

  }

  // Opens the note dialog; submitResolve does the resolve.
  function handleResolve(id) {

    if (!actingAs) return;

    setResolving(alerts.find(a => a.id === id) || { id });

  }

  // False alarm / test (#26): opens the reason dialog.
  function handleCancel(id) {

    setCancelling(alerts.find(a => a.id === id) || { id });

  }

  async function submitCancel(id, reason) {

    const result = await cancelAlert(id, { reason, cancelledBy: actingAs });

    await loadAlerts();

    return result;

  }

  async function submitResolve(id, note) {

    const result = await resolveAlert(id, actingAs, note);

    await loadAlerts();

    return result;

  }

  return (

    <Box sx={{ minHeight: "100vh", bgcolor: tokens.ground }}>

      <Header time={clock.time} />

      <Box sx={{ maxWidth: 1600, mx: "auto", px: 3, py: 2.5, display: "flex", flexWrap: "wrap", gap: 2.5, alignItems: "flex-start" }}>

        <Box component="main" sx={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}>

          <DashboardStats {...alertStats(alerts, now)} />

          <AlertBoard
            alerts={alerts}
            now={now}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
            onCancel={handleCancel}
          />

          <NeedsNotePanel responder={actingAs} />

        </Box>

        <Box component="aside" sx={{ flex: "1 1 300px" }}>
          <ResponderPanel team={team} actingAs={actingAs} setActingAs={setActingAs} />
        </Box>

      </Box>

      <ResolveDialog
        alert={resolving}
        responder={actingAs}
        onClose={() => setResolving(null)}
        onResolve={submitResolve}
      />

      <CancelDialog
        alert={cancelling}
        responder={actingAs}
        onClose={() => setCancelling(null)}
        onCancel={submitCancel}
      />

    </Box>

  );

}
