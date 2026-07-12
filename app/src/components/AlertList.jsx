import { Typography, Box } from "@mui/material";

import ActiveAlertCard from "./ActiveAlertCard";

export default function AlertList({
  alerts,
  onAcknowledge,
  onResolve
}) {

  if (!alerts || alerts.length === 0) {
    return (
      <Box sx={{ mt: 6, textAlign: "center" }}>
        <Typography
          variant="h4"
          color="text.secondary"
        >
          No Active Alerts
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 3 }}>

      {alerts.map((alert) => (

        <ActiveAlertCard
          key={alert.id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />

      ))}

    </Box>
  );

}
