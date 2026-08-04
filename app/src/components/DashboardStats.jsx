import {
  Grid,
  Paper,
  Typography,
  Stack,
  Box
} from "@mui/material";

import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TimerIcon from "@mui/icons-material/Timer";

function StatCard({

  title,
  value,
  subtitle,
  icon,
  color

}) {

  return (
    <Paper
      elevation={3}
      sx={{
        overflow: "hidden",
        borderRadius: 3,
        transition: "all .25s",

        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: 8
        }
      }}
    >

      {/* Colored Accent */}

      <Box
        sx={{
          height: 6,
          bgcolor: color
        }}
      />

      <Box
        sx={{
          p: 2.5
        }}
      >

        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start"
          }}>

          <Box>

            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: "text.secondary",
                letterSpacing: 1
              }}
            >
              {title}
            </Typography>

            <Typography
              sx={{
                mt: .5,
                fontSize: 40,
                fontWeight: 800,
                lineHeight: 1,
                color
              }}
            >
              {value}
            </Typography>

            <Typography
              sx={{
                mt: .5,
                fontSize: 13,
                color: "text.secondary"
              }}
            >
              {subtitle}
            </Typography>

          </Box>

          <Box
            sx={{
              bgcolor: `${color}15`,
              color,
              borderRadius: 2,
              p: 1.25
            }}
          >

            {icon}

          </Box>

        </Stack>

      </Box>

    </Paper>
  );

}
export default function DashboardStats({

  active,
  waiting,
  acknowledged,
  oldest,
  average

}) {

  return (

    <Grid
      container
      spacing={2}
    >

      <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>

        <StatCard
          title="ACTIVE ALERTS"
          value={active}
          subtitle="Live Incidents"
          color="#D32F2F"
          icon={
            <NotificationsActiveIcon
              sx={{ fontSize: 34 }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>

        <StatCard
          title="WAITING"
          value={waiting}
          subtitle="Awaiting Response"
          color="#F57C00"
          icon={
            <HourglassTopIcon
              sx={{ fontSize: 34 }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>

        <StatCard
          title="ACKNOWLEDGED"
          value={acknowledged}
          subtitle="Being Worked"
          color="#2E7D32"
          icon={
            <CheckCircleIcon
              sx={{ fontSize: 34 }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>

        <StatCard
          title="OLDEST ALERT"
          value={oldest}
          subtitle="Current Maximum Age"
          color="#1565C0"
          icon={
            <ScheduleIcon
              sx={{ fontSize: 34 }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>

        <StatCard
          title="AVERAGE AGE"
          value={average}
          subtitle="Average Response Time"
          color="#6A1B9A"
          icon={
            <TimerIcon
              sx={{ fontSize: 34 }}
            />
          }
        />

      </Grid>

    </Grid>

  );

}