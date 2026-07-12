import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Chip
} from "@mui/material";

import CircleIcon from "@mui/icons-material/Circle";

import logo from "../assets/logo.png";

export default function Header({ time }) {

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  return (

    <AppBar
      position="static"
      elevation={6}
      sx={{
        background:
          "linear-gradient(135deg,#072A60 0%,#0A4AA8 60%,#1565C0 100%)",
        borderBottom: "3px solid rgba(255,255,255,.12)"
      }}
    >

      <Toolbar
        sx={{
          minHeight: 110,
          px: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >

        {/* LEFT SIDE */}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 3
          }}
        >

          <Box
            component="img"
            src={logo}
            alt="G&G Industrial Lighting"
            sx={{
              height: 78,
              width: "auto",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,.35))"
            }}
          />

          <Box>

            <Typography
              sx={{
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: .5
              }}
            >
              G&amp;G Production Response System
            </Typography>

            <Typography
              sx={{
                fontSize: 20,
                opacity: .92,
                mt: .6
              }}
            >
              Malta • Production Line • Final Test
            </Typography>

          </Box>

        </Box>

        {/* RIGHT SIDE */}

        <Box
          sx={{
            textAlign: "right"
          }}
        >

          <Chip
            icon={
              <CircleIcon
                sx={{
                  color: "#00E676 !important",
                  fontSize: 14
                }}
              />
            }
            label="SYSTEM ONLINE"
            sx={{
              mb: 1.5,
              background: "rgba(255,255,255,.18)",
              color: "white",
              fontWeight: 700,
              letterSpacing: .6
            }}
          />

          <Typography
            sx={{
              fontSize: 52,
              fontWeight: 700,
              fontFamily: "Roboto Mono",
              lineHeight: 1
            }}
          >
            {time}
          </Typography>

          <Typography
            sx={{
              fontSize: 18,
              opacity: .88
            }}
          >
            {today}
          </Typography>

        </Box>

      </Toolbar>

    </AppBar>

  );

}