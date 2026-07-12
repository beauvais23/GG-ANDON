import { Box, Button, Chip, Typography } from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import TvIcon from "@mui/icons-material/Tv";

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
        fontWeight="bold"
        fontSize={15}
      >
        G&G ManufacturingOS
      </Typography>

      <Typography
        fontSize={13}
        color="text.secondary"
      >
        Version 5.2
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

      <Chip
        size="small"
        color="warning"
        label="Google Chat Pending"
      />

    </Box>

  );

}