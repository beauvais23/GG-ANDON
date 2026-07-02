import { Paper, Typography, Box } from "@mui/material";

export default function AlertButton({
  color,
  icon,
  title,
  subtitle,
  textColor = "white",
  onClick
}) {
  return (
    <Paper
      elevation={6}
      onClick={onClick}
      sx={{
        backgroundColor: color,
        color: textColor,
        borderRadius: 4,
        cursor: "pointer",
        height: 240,

        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",

        transition: "all .2s ease",

        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 10
        },

        "&:active": {
          transform: "scale(.98)"
        }
      }}
    >
      <Box sx={{ mb: 2 }}>
        {icon}
      </Box>

      <Typography
        variant="h3"
        fontWeight="bold"
      >
        {title}
      </Typography>

      <Typography
        variant="h6"
        sx={{ mt: 1 }}
      >
        {subtitle}
      </Typography>

    </Paper>
  );
}