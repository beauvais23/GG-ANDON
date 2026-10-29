import { useEffect, useState } from "react";

import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Stack
} from "@mui/material";

import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";

import {
  cancelAlert,
  getActiveAlerts
} from "../services/api";

import TabletCancelDialog from "./TabletCancelDialog";

export default function AlertScreen({

  alert,
  onResolve

}) {

  const [currentAlert, setCurrentAlert] = useState(alert);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {

    const timer = setInterval(async () => {

      try {

        const alerts = await getActiveAlerts();

        const updated = alerts.find(a => a.id === alert.id);

        if (!updated) {

          onResolve();
          return;

        }

        setCurrentAlert(updated);

      }

      catch (err) {

        console.error(err);

      }

    }, 1000);

    return () => clearInterval(timer);

  }, [alert.id, onResolve]);

  // Every tablet cancel carries a reason (one tap, or "Other").
  // The alert screen stays up if the cancel didn't go through.
  async function handleCancel(reason) {

    const result = await cancelAlert(currentAlert.id, {
      reason,
      cancelledBy: "Operator (tablet)"
    });

    if (result?.success === false)
      return result;

    setCancelOpen(false);
    onResolve();

    return result;

  }

  const acknowledged =
    currentAlert.status === "ACKNOWLEDGED";

  return (
    <Box
      sx={{
        p: 5,
        display: "flex",
        justifyContent: "center"
      }}
    >

      <Paper
        elevation={8}
        sx={{
          width: "100%",
          maxWidth: 900,
          p: 6,
          borderRadius: 4,
          textAlign: "center"
        }}
      >

        <Typography
          variant="h2"
          color={acknowledged ? "primary.main" : "error.main"}
          sx={{
            fontWeight: "bold"
          }}
        >

          {currentAlert.type} ALERT

        </Typography>

        <Typography
          variant="h5"
          sx={{
            mt: 2,
            fontWeight: 500
          }}
        >

          {acknowledged
            ? "Help Is On The Way"
            : "Assistance Requested"}

        </Typography>

        <Chip
          sx={{
            mt: 3,
            height: 48,
            fontSize: 18,
            px: 2
          }}
          color={acknowledged ? "primary" : "error"}
          icon={
            acknowledged
              ? <CheckCircleIcon />
              : undefined
          }
          label={
            acknowledged
              ? "ACKNOWLEDGED"
              : "WAITING FOR RESPONSE"
          }
        />

        {acknowledged && (

          <Stack
            spacing={1}
            sx={{
              alignItems: "center",
              mt: 5
            }}>

            <PersonIcon
              color="primary"
              sx={{
                fontSize: 42
              }}
            />

            <Typography
              variant="overline"
              sx={{
                color: "text.secondary"
              }}
            >

              RESPONDING

            </Typography>

            <Typography
              variant="h4"
              color="primary"
              sx={{
                fontWeight: "bold"
              }}
            >

              {currentAlert.acknowledged_by}

            </Typography>

          </Stack>

        )}

        <Typography
          sx={{
            mt: 5,
            fontSize: 22,
            color: "text.secondary",
            lineHeight: 1.6
          }}
        >

          {acknowledged
            ? `${currentAlert.acknowledged_by} has acknowledged your request. Please remain at your workstation.`
            : "Your request has been sent. Please remain at your workstation while a responder is notified."}

        </Typography>

        <Button
          variant="contained"
          color="error"
          size="large"
          startIcon={<CancelIcon />}
          sx={{
            mt: 6,
            px: 8,
            py: 2,
            fontSize: 20,
            fontWeight: "bold"
          }}
          onClick={() => setCancelOpen(true)}
        >

          CANCEL REQUEST

        </Button>

        <TabletCancelDialog
          open={cancelOpen}
          alertType={currentAlert.type}
          onClose={() => setCancelOpen(false)}
          onCancel={handleCancel}
        />

      </Paper>

    </Box>
  );

}