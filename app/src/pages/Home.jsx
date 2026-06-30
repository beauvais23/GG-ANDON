import { Box, Typography } from "@mui/material";

export default function Home() {
  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "#f2f4f7",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Typography
        variant="h2"
        sx={{
          color: "#005BAA",
          fontWeight: 700,
        }}
      >
        G&amp;G ANDON
      </Typography>
    </Box>
  );
}