import { Paper, Typography, Box } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function StatusBanner() {
  return (
    <Paper
      elevation={2}
      sx={{
        m: 2,
        p: 2,
        display: "flex",
        alignItems: "center",
        borderLeft: "8px solid #2e7d32",
        backgroundColor: "#eef8ef"
      }}
    >
      <CheckCircleIcon
        color="success"
        sx={{
          fontSize: 40,
          mr: 2
        }}
      />

      <Box>
        <Typography
          variant="h5"
          fontWeight="bold"
        >
          SYSTEM READY
        </Typography>

        <Typography variant="body1">
          Touch a button below to request assistance.
        </Typography>
      </Box>

    </Paper>
  );
}