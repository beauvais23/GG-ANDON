import {
  Paper,
  Box,
  Typography,
  Stack,
  Chip,
  Button
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

import alertTypes from "../config/alertTypes";
import productionLines from "../config/productionLines";

export default function ActiveAlertCard({

  alert,
  elapsed,
  responder,
  onAcknowledge,
  onResolve

}) {

  const theme =

    alertTypes[alert.type] || {

      color: "#546E7A",

      icon: null

    };

  const line =

    productionLines.find(

      p =>
        p.id === alert.production_line ||
        p.name === alert.production_line

    );

  const lineColor = line?.color || "#607D8B";

  const acknowledged =
    alert.status === "ACKNOWLEDGED";

  return (

    <Paper
      elevation={5}
      sx={{
        overflow: "hidden",
        borderRadius: 3
      }}
    >

      {/* Header */}

      <Box
        sx={{
          background: theme.color,
          color: "white",
          px: 3,
          py: 2
        }}
      >

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
          >

            {theme.icon}

            <Typography
              variant="h5"
              fontWeight={700}
            >

              {alert.type} ALERT

            </Typography>

          </Stack>

          <Chip

            label={alert.status}

            sx={{
              bgcolor: "rgba(255,255,255,.18)",
              color: "white",
              fontWeight: 700
            }}

          />

        </Stack>

      </Box>

      {/* Body */}

      <Box sx={{ p: 3 }}>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
        >

          <Box>

            <Typography
              variant="h5"
              fontWeight={700}
            >
              {alert.work_center}
            </Typography>

            <Chip
              label={alert.production_line}
              sx={{
                mt: 1,
                bgcolor: lineColor,
                color: "white",
                fontWeight: 700
              }}
            />

          </Box>

          <Box textAlign="right">

            <Typography
              color="text.secondary"
            >
              Elapsed
            </Typography>

            <Typography
              sx={{
                fontSize: 36,
                fontWeight: 700,
                fontFamily: "Roboto Mono"
              }}
            >
              {elapsed}
            </Typography>

          </Box>

        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 3 }}
        >

          <Typography
            color="text.secondary"
          >
            Responder:
          </Typography>

          <Typography
            fontWeight={700}
          >
            {responder}
          </Typography>

        </Stack>

        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 4 }}
        >

          {!acknowledged && (

            <Button
              fullWidth
              size="large"
              variant="contained"
              color="primary"
              startIcon={
                <CheckCircleIcon />
              }
              onClick={onAcknowledge}
            >

              ACKNOWLEDGE

            </Button>

          )}

          <Button
            fullWidth
            size="large"
            variant="contained"
            color="success"
            startIcon={<TaskAltIcon />}
            onClick={onResolve}
          >

            RESOLVE

          </Button>

        </Stack>

      </Box>

    </Paper>

  );

}