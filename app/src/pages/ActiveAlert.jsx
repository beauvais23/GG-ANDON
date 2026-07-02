import { useEffect, useState } from "react";

import {
  Box,
  Paper,
  Typography,
  Button,
  Chip
} from "@mui/material";

import ErrorIcon from "@mui/icons-material/Error";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function ActiveAlert() {

  const [seconds, setSeconds] = useState(0);

  useEffect(() => {

    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(timer);

  }, []);

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  const elapsed =
    `${minutes.toString().padStart(2, "0")}:${remaining
      .toString()
      .padStart(2, "0")}`;

  return (

    <Box
      sx={{
        p: 5
      }}
    >

      <Paper
        elevation={5}
        sx={{
          p: 5,
          borderRadius: 4,
          textAlign: "center"
        }}
      >

        <ErrorIcon
          sx={{
            fontSize: 90,
            color: "#d32f2f"
          }}
        />

        <Typography
          variant="h3"
          sx={{ mt: 2 }}
        >
          QUALITY ALERT ACTIVE
        </Typography>

        <Typography
          variant="h5"
          color="text.secondary"
          sx={{ mt: 2 }}
        >
          Final Test Work Center
        </Typography>

        <Chip
          label="Waiting for Quality..."
          color="error"
          sx={{
            mt: 4,
            fontSize: 18,
            height: 42
          }}
        />

        <Typography
          variant="h2"
          sx={{
            mt: 5,
            fontWeight: 700
          }}
        >
          {elapsed}
        </Typography>

        <Typography
          variant="h6"
          color="text.secondary"
        >
          Elapsed Time
        </Typography>

        <Button
          variant="contained"
          color="success"
          size="large"
          startIcon={<CheckCircleIcon />}
          sx={{
            mt: 6,
            px: 6,
            py: 2,
            fontSize: 24
          }}
        >
          CLEAR ALERT
        </Button>

      </Paper>

    </Box>

  );

}