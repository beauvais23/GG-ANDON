import {
  Typography,
  Box
} from "@mui/material";

import ActiveAlertCard from "./ActiveAlertCard";

export default function AlertList({
  alerts,
  responseTeamMember,
  onAcknowledge,
  onResolve
}) {

  //------------------------------------------------------
  // No Active Alerts
  //------------------------------------------------------

  if (
    !alerts ||
    alerts.length === 0
  ) {

    return (
      <Box
        sx={{
          mt: 6,
          textAlign: "center"
        }}
      >

        <Typography
          variant="h4"
          sx={{
            color: "text.secondary"
          }}
        >
          No Active Alerts
        </Typography>

      </Box>
    );

  }


  //------------------------------------------------------
  // Active Alerts
  //------------------------------------------------------

  return (

    <Box
      sx={{
        mt: 3
      }}
    >

      {alerts.map((alert) => (

        <Box
          key={alert.id}
          sx={{
            mb: 2
          }}
        >

          <ActiveAlertCard
            alert={alert}

            responseTeamMember={
              responseTeamMember
            }

            onAcknowledge={
              onAcknowledge
            }

            onResolve={
              onResolve
            }

          />

        </Box>

      ))}

    </Box>

  );

}