import {
  Box,
  Typography,
  Chip,
  Stack
} from "@mui/material";

export default function Footer() {
  return (
    <Box
      sx={{
        mt: "auto",
        px: 3,
        py: 1.5,
        borderTop: "1px solid #d9d9d9",
        backgroundColor: "#ffffff"
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
      >
        <Typography
          variant="body2"
          color="text.secondary"
        >
          <strong>G&G ManufacturingOS</strong> &nbsp; Version 4.1.0
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
        >
          Gigabay Production Line • Final Test Work Center
        </Typography>

        <Stack
          direction="row"
          spacing={1}
        >
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
        </Stack>

      </Stack>
    </Box>
  );
}