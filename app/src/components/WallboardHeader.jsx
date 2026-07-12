import {
  Paper,
  Grid,
  Typography,
  Box
} from "@mui/material";

export default function WallboardHeader({

  time,
  activeAlerts

}) {

  return (

    <Paper
      elevation={8}
      sx={{
        p:3,
        mb:4,
        borderRadius:4,
        background:"#1A1A1A",
        color:"white"
      }}
    >

      <Grid container spacing={2} alignItems="center">

        <Grid size={{ xs:12, md:6 }}>

          <Typography
            variant="h3"
            fontWeight="bold"
          >
            G&G Production Response System
          </Typography>

          <Typography
            sx={{
              opacity:.7
            }}
          >
            Malta Manufacturing Campus
          </Typography>

        </Grid>

        <Grid
          size={{ xs:12, md:6 }}
          sx={{
            textAlign:"right"
          }}
        >

          <Typography
            variant="h3"
            fontFamily="Roboto Mono"
          >
            {time}
          </Typography>

        </Grid>

      </Grid>

      <Box
        sx={{
          mt:3,
          display:"flex",
          justifyContent:"space-around",
          textAlign:"center"
        }}
      >

        <Box>

          <Typography
            variant="h5"
            color="gray"
          >
            OPEN ALERTS
          </Typography>

          <Typography
            variant="h2"
            color="error"
            fontWeight="bold"
          >
            {activeAlerts}
          </Typography>

        </Box>

        <Box>

          <Typography
            variant="h5"
            color="gray"
          >
            FACILITY
          </Typography>

          <Typography variant="h4">
            Malta
          </Typography>

        </Box>

        <Box>

          <Typography
            variant="h5"
            color="gray"
          >
            API
          </Typography>

          <Typography
            variant="h4"
            color="#4CAF50"
          >
            ● ONLINE
          </Typography>

        </Box>

      </Box>

    </Paper>

  );

}