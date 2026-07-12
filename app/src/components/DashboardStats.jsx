import {
  Grid,
  Paper,
  Typography,
  Stack
} from "@mui/material";

import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TimerIcon from "@mui/icons-material/Timer";

function StatCard({

  title,
  value,
  icon,
  color

}) {

  return (

    <Paper
      elevation={3}
      sx={{
        p: 2.5,
        borderRadius: 3,
        height: "100%"
      }}
    >

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >

        <Typography
          color="text.secondary"
          fontWeight={600}
        >
          {title}
        </Typography>

        {icon}

      </Stack>

      <Typography
        sx={{
          mt: 2,
          fontSize: 36,
          fontWeight: 700,
          color
        }}
      >
        {value}
      </Typography>

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

      <Grid size={{ xs: 12, md: 2.4 }}>

        <StatCard
          title="ACTIVE"
          value={active}
          color="#D32F2F"
          icon={
            <NotificationsActiveIcon
              sx={{
                color: "#D32F2F",
                fontSize: 34
              }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, md: 2.4 }}>

        <StatCard
          title="WAITING"
          value={waiting}
          color="#EF6C00"
          icon={
            <HourglassTopIcon
              sx={{
                color: "#EF6C00",
                fontSize: 34
              }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, md: 2.4 }}>

        <StatCard
          title="ACKNOWLEDGED"
          value={acknowledged}
          color="#2E7D32"
          icon={
            <CheckCircleIcon
              sx={{
                color: "#2E7D32",
                fontSize: 34
              }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, md: 2.4 }}>

        <StatCard
          title="OLDEST"
          value={oldest}
          color="#1565C0"
          icon={
            <ScheduleIcon
              sx={{
                color: "#1565C0",
                fontSize: 34
              }}
            />
          }
        />

      </Grid>

      <Grid size={{ xs: 12, md: 2.4 }}>

        <StatCard
          title="AVERAGE"
          value={average}
          color="#6A1B9A"
          icon={
            <TimerIcon
              sx={{
                color: "#6A1B9A",
                fontSize: 34
              }}
            />
          }
        />

      </Grid>

    </Grid>

  );

}