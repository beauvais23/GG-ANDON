import { Paper, Typography, Box, CircularProgress } from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function AlertSent({ alert }) {

  return (

    <Paper
      elevation={8}
      sx={{
        width: 820,
        maxWidth: "95%",
        mx: "auto",
        mt: 6,
        p: 6,
        borderRadius: 4,
        textAlign: "center"
      }}
    >

      <CheckCircleIcon
        color="success"
        sx={{
          fontSize: 120
        }}
      />

      <Typography
        variant="h3"
        fontWeight="bold"
        sx={{ mt: 3 }}
      >
        {alert.type} ALERT SENT
      </Typography>

      <Typography
        variant="h5"
        sx={{
          mt: 3,
          color: "text.secondary"
        }}
      >
        Notifying personnel...
      </Typography>

      <Box sx={{ mt: 5 }}>
        <CircularProgress size={60} />
      </Box>

    </Paper>

  );

}