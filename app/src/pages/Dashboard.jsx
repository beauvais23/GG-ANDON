import {
  Box,
  Typography,
  Paper
} from "@mui/material";

import useClock from "../hooks/useClock";
import { useAlert } from "../context/AlertContext";

export default function Dashboard() {

  const time = useClock();

  const { activeAlert } = useAlert();

  return (

    <Box
      sx={{
        p: 4,
        background: "#ECEFF1",
        minHeight: "100vh"
      }}
    >

      <Typography
        variant="h3"
        fontWeight="bold"
      >
        Supervisor Dashboard
      </Typography>

      <Typography
        variant="h6"
        color="text.secondary"
        sx={{ mb: 4 }}
      >
        {time}
      </Typography>

      <Paper
        elevation={5}
        sx={{
          p: 4,
          borderRadius: 3
        }}
      >

        {activeAlert ? (

          <>

            <Typography variant="h4">
              Active Alert
            </Typography>

            <Typography
              variant="h2"
              color="error"
              sx={{ mt: 3 }}
            >
              {activeAlert.type}
            </Typography>

            <Typography variant="h5" sx={{ mt: 2 }}>
              Facility: {activeAlert.facility}
            </Typography>

            <Typography variant="h5">
              Production Line: {activeAlert.productionLine}
            </Typography>

            <Typography variant="h5">
              Work Center: {activeAlert.workCenter}
            </Typography>

            <Typography variant="h5">
              Status: {activeAlert.status}
            </Typography>

          </>

        ) : (

          <Typography variant="h4">
            No Active Alerts
          </Typography>

        )}

      </Paper>

    </Box>

  );

}