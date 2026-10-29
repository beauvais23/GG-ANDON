import { useEffect, useState } from "react";

import { Box } from "@mui/material";

import Header from "../components/Header";
import useClock from "../hooks/useClock";
import { getActiveAlerts } from "../services/api";
import { ALERT_COLORS, FALLBACK_COLOR } from "../config/alertColors";
import { ageSeconds, alertStats, elapsed } from "../utils/alertTime";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// TV Wallboard (E4): read from across the floor. Big
// status strip, one row per open alert, the elapsed time
// turns amber at 5 minutes and red at 10 while nobody has
// acknowledged it. Polls every 5 s, ticks every second.
//------------------------------------------------------

const AMBER = "#F2C232";
const RED = "#FF6B61";

// Waiting alerts first, then oldest first.
function byUrgency(a, b) {

  if (a.status !== b.status) {
    if (a.status === "ACTIVE") return -1;
    if (b.status === "ACTIVE") return 1;
  }

  return Number(a.requested) - Number(b.requested);

}

function timerColor(alert, now) {

  if (alert.status !== "ACTIVE") return tokens.text;

  const minutes = ageSeconds(alert.requested, now) / 60;

  if (minutes >= 10) return RED;
  if (minutes >= 5) return AMBER;

  return tokens.text;

}

function Stat({ label, value, color }) {

  return (

    <Box sx={{ bgcolor: tokens.panel, px: 3, py: 2.5, borderRight: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
      <Box sx={{ ...labelSx, fontSize: 18, letterSpacing: "3px" }}>{label}</Box>
      <Box sx={{ fontFamily: tokens.mono, fontSize: 72, lineHeight: 1.1, color }}>{value}</Box>
    </Box>

  );

}

const columns = "minmax(320px, 2fr) minmax(220px, 1.4fr) minmax(200px, 1.2fr) minmax(260px, 1.4fr) 220px";

export default function Wallboard() {

  const clock = useClock();

  const [alerts, setAlerts] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);

  useEffect(() => {

    async function load() {

      try {

        const response = await getActiveAlerts();
        const data = Array.isArray(response) ? response : response.alerts || [];

        setAlerts([...data].sort(byUrgency));
        setOnline(true);

      } catch (err) {

        console.error(err);
        setOnline(false);

      }

    }

    load();

    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };

  }, []);

  const stats = alertStats(alerts, now);

  return (

    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

      <Header time={clock.time} />

      <Box sx={{ flexGrow: 1, px: 4, py: 3, display: "flex", flexDirection: "column", gap: 3 }}>

        {!online && (
          <Box sx={{ ...labelSx, fontSize: 20, color: RED, border: `1px solid ${RED}`, px: 3, py: 1.5 }}>
            Connection lost: this board is not updating
          </Box>
        )}

        <Box
          component="section"
          aria-label="Status"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
            borderTop: `1px solid ${tokens.line}`,
            borderLeft: `1px solid ${tokens.line}`
          }}
        >
          <Stat label="Open alerts" value={stats.active} color={RED} />
          <Stat label="Waiting" value={stats.waiting} color="#FFA040" />
          <Stat label="Acknowledged" value={stats.acknowledged} color={tokens.blueText} />
          <Stat label="Oldest open" value={stats.oldest} color={tokens.text} />
        </Box>

        <Box component="section" aria-label="Open alerts" sx={{ flexGrow: 1, bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

          <Box sx={{ display: { xs: "none", lg: "grid" }, gridTemplateColumns: columns, gap: 3, px: 3, py: 1.5, borderBottom: `1px solid ${tokens.line}`, ...labelSx, fontSize: 16, letterSpacing: "3px" }}>
            <span>Alert</span>
            <span>Line</span>
            <span>Work center</span>
            <span>Status</span>
            <Box component="span" sx={{ textAlign: "right" }}>Elapsed</Box>
          </Box>

          {alerts.length === 0 && (
            <Box sx={{ py: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 2.5, fontFamily: tokens.display, fontWeight: 700, fontSize: 48, letterSpacing: "4px", color: "#5CC97A" }}>
              <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: tokens.online, boxShadow: `0 0 12px ${tokens.online}` }} />
              ALL CLEAR · NO OPEN ALERTS
            </Box>
          )}

          {alerts.map(alert => {

            const colors = ALERT_COLORS[alert.type] || FALLBACK_COLOR;
            const acknowledged = alert.status === "ACKNOWLEDGED";
            const dot = acknowledged ? tokens.blueText : RED;

            return (

              <Box
                key={alert.id}
                sx={{
                  display: { xs: "flex", lg: "grid" },
                  flexWrap: "wrap",
                  gridTemplateColumns: columns,
                  alignItems: "center",
                  gap: "12px 24px",
                  px: 3,
                  py: 2.5,
                  borderLeft: `10px solid ${colors.edge}`,
                  borderBottom: `1px solid ${tokens.line}`
                }}
              >

                <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <Box component="span" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 44, letterSpacing: "2px", color: colors.edge, lineHeight: 1 }}>
                    {alert.type}
                  </Box>
                  <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 20, color: tokens.muted }}>#{alert.id}</Box>
                </Box>

                <Box sx={{ fontSize: 30, fontWeight: 600 }}>{alert.production_line}</Box>

                <Box sx={{ fontSize: 30 }}>{alert.work_center}</Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, fontFamily: tokens.display, fontWeight: 600, fontSize: 28, letterSpacing: "2px" }}>
                  <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: dot, boxShadow: `0 0 8px ${dot}`, flexShrink: 0 }} />
                  {acknowledged ? (alert.assigned_to || "ACKNOWLEDGED").toUpperCase() : "WAITING"}
                </Box>

                <Box sx={{ fontFamily: tokens.mono, fontSize: 56, lineHeight: 1, textAlign: { lg: "right" }, color: timerColor(alert, now) }}>
                  {elapsed(alert.requested, now)}
                </Box>

              </Box>

            );

          })}

        </Box>

      </Box>

    </Box>

  );

}
