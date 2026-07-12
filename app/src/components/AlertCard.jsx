import {
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Button,
  Box
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";

const alertTheme = {

  QUALITY: {
    color: "#d32f2f",
    icon: <SearchIcon sx={{ fontSize: 42 }} />
  },

  MAINTENANCE: {
    color: "#f57c00",
    icon: <HandymanIcon sx={{ fontSize: 42 }} />
  },

  MATERIAL: {
    color: "#fbc02d",
    icon: <Inventory2Icon sx={{ fontSize: 42 }} />
  },

  SUPERVISOR: {
    color: "#1976d2",
    icon: <GroupsIcon sx={{ fontSize: 42 }} />
  },

  SAFETY: {
    color: "#2e7d32",
    icon: <HealthAndSafetyIcon sx={{ fontSize: 42 }} />
  }

};

export default function ActiveAlertCard({

  alert,
  onAcknowledge,
  onResolve

}) {

  const theme = alertTheme[alert.type];

  return (

    <Card
      elevation={8}
      sx={{
        borderLeft: `10px solid ${theme.color}`,
        borderRadius: 3,
        mb: 2
      }}
    >

      <CardContent>

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

            <Box sx={{ color: theme.color }}>
              {theme.icon}
            </Box>

            <Box>

              <Typography
                variant="h5"
                fontWeight="bold"
              >
                {alert.type}
              </Typography>

              <Typography color="text.secondary">
                {alert.facility}
              </Typography>

              <Typography color="text.secondary">
                {alert.production_line}
              </Typography>

              <Typography color="text.secondary">
                {alert.work_center}
              </Typography>

            </Box>

          </Stack>

          <Stack
            spacing={2}
            alignItems="flex-end"
          >

            <Chip
              label={alert.status}
              color="error"
            />

            <Stack
              direction="row"
              spacing={1}
            >

              <Button
                variant="contained"
                color="warning"
                onClick={() => onAcknowledge(alert.id)}
              >
                ACKNOWLEDGE
              </Button>

              <Button
                variant="contained"
                color="success"
                onClick={() => onResolve(alert.id)}
              >
                RESOLVE
              </Button>

            </Stack>

          </Stack>

        </Stack>

      </CardContent>

    </Card>

  );

}