import { Box, Button, Chip, Typography } from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import TvIcon from "@mui/icons-material/Tv";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import InsightsIcon from "@mui/icons-material/Insights";

import { useNavigate } from "react-router-dom";

export default function Footer() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1,
        bgcolor: "#ECEFF1",
        borderTop: "1px solid #CFD8DC",
        flexWrap: "wrap"
      }}
    >
      <Typography
        sx={{
          fontWeight: "bold",
          fontSize: 15,
          mr: 1
        }}
      >
        G&G ManufacturingOS
      </Typography>

      <Button
        size="small"
        variant="contained"
        startIcon={<DashboardIcon />}
        onClick={() => navigate("/supervisor")}
      >
        Production Manager Dashboard
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<TvIcon />}
        onClick={() => navigate("/wallboard")}
      >
        TV Wallboard
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<InsightsIcon />}
        onClick={() => navigate("/executive")}
      >
        Executive Dashboard
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<AdminPanelSettingsIcon />}
        onClick={() => navigate("/admin")}
      >
        Administration
      </Button>

      <Chip
        size="small"
        color="success"
        label="API Connected"
      />

      <Chip
        size="small"
        color="success"
        label="SQLite Connected"
      />

      
    </Box>
  );
}