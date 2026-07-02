import {
  AppBar,
  Toolbar,
  Typography,
  Chip,
  Box,
  IconButton
} from "@mui/material";

import SettingsIcon from "@mui/icons-material/Settings";
import logo from "../assets/logo.png";

export default function Header({ time }) {
  return (
    <AppBar
      position="static"
      elevation={4}
      sx={{
        backgroundColor: "#005DAA",
        height: 84,
        justifyContent: "center"
      }}
    >
      <Toolbar>

        {/* Company Logo */}
        <Box
          component="img"
          src={logo}
          alt="G&G Industrial Lighting"
          sx={{
            height: 56,
            mr: 2
          }}
        />

        {/* Title */}
        <Box sx={{ flexGrow: 1 }}>

          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              lineHeight: 1
            }}
          >
            ManufacturingOS
          </Typography>

          <Typography
            variant="subtitle1"
            sx={{
              opacity: 0.9
            }}
          >
            Gigabay Production Line • Final Test Work Center
          </Typography>

        </Box>

        {/* System Status */}
        <Chip
          label="SYSTEM READY"
          color="success"
          sx={{
            fontWeight: "bold",
            fontSize: "0.9rem",
            mr: 3,
            px: 1
          }}
        />

        {/* Clock */}
        <Typography
          variant="h4"
          sx={{
            mr: 2,
            minWidth: 120,
            textAlign: "right",
            fontWeight: 600
          }}
        >
          {time}
        </Typography>

        {/* Settings */}
        <IconButton color="inherit">
          <SettingsIcon fontSize="large" />
        </IconButton>

      </Toolbar>
    </AppBar>
  );
}