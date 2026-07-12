import {
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Stack
} from "@mui/material";

import productionLines from "../config/productionLines";
import { useProductionLine } from "../context/ProductionLineContext";

export default function ProductionLineToolbar() {

  const {
    productionLine,
    changeProductionLine
  } = useProductionLine();

  function handleChange(event, newLine) {

    if (newLine) {
      changeProductionLine(newLine);
    }

  }

  return (

    <Paper
      elevation={2}
      sx={{
        mx: 3,
        mt: 2,
        mb: 2,
        px: 3,
        py: 2,
        borderRadius: 3
      }}
    >

      <Stack
        direction={{
          xs: "column",
          lg: "row"
        }}
        spacing={3}
        alignItems="center"
        justifyContent="space-between"
      >

        <Stack spacing={0}>

          <Typography
            variant="h6"
            fontWeight="bold"
          >
            Production Line
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
          >
            Currently running Final Test
          </Typography>

        </Stack>

        <ToggleButtonGroup
          exclusive
          value={productionLine}
          onChange={handleChange}
          size="large"
        >

          {productionLines.map((line) => (

            <ToggleButton
              key={line.id}
              value={line.id}
              sx={{
                px: 4,
                fontWeight: 700,
                textTransform: "none"
              }}
            >
              {line.name}
            </ToggleButton>

          ))}

        </ToggleButtonGroup>

      </Stack>

    </Paper>

  );

}