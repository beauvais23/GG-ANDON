import {
  Paper,
  Typography,
  Box,
  Chip
} from "@mui/material";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";

import { useProductionLine } from "../context/ProductionLineContext";

export default function HomeBanner() {

  const { productionLine } = useProductionLine();

  return (

    <Paper
      elevation={4}
      sx={{
        mx: 2,
        mt: 2,
        mb: 2,
        p: 2.5,
        borderRadius: 3,
        background: "#263238",
        color: "white"
      }}
    >

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2
        }}
      >

        <Box>

          <Typography
            variant="h4"
            fontWeight={700}
            sx={{ mb: 0.5 }}
          >
            Operator Assistance Station
          </Typography>

          <Typography
            sx={{
              color: "#CFD8DC"
            }}
          >
            Select the type of assistance you need.
          </Typography>

        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap"
          }}
        >

          <Chip
            icon={<PrecisionManufacturingIcon />}
            label={`${productionLine} Production`}
            color="primary"
            sx={{
              fontWeight: 700
            }}
          />

          <Chip
            icon={<CheckCircleIcon />}
            label="System Ready"
            color="success"
            sx={{
              fontWeight: 700
            }}
          />

        </Box>

      </Box>

    </Paper>

  );

}