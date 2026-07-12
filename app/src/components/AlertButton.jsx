import {
  Paper,
  Box,
  Typography
} from "@mui/material";

export default function AlertButton({

  color,
  icon,
  title,
  subtitle,
  onClick

}) {

  return (

    <Paper
      elevation={5}
      onClick={onClick}
      sx={{
        borderRadius: 3,
        cursor: "pointer",
        transition: "0.2s",

        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: 10
        }
      }}
    >

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",

          height: 125,

          px: 5,

          background: "#FFFFFF",

          borderLeft: `12px solid ${color}`,

          borderRadius: 3
        }}
      >

        {/* LEFT ICON */}

        <Box
          sx={{
            color: color,
            mr: 4,

            display: "flex",
            alignItems: "center",

            "& svg": {
              fontSize: 72
            }
          }}
        >
          {icon}
        </Box>

        {/* CENTERED TEXT */}

        <Box
          sx={{
            flex: 1,
            textAlign: "center"
          }}
        >

          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: 1
            }}
          >
            {title}
          </Typography>

          <Typography
            sx={{
              color: "text.secondary",
              fontSize: 16,
              mt: .5
            }}
          >
            {subtitle}
          </Typography>

        </Box>

      </Box>

    </Paper>

  );

}