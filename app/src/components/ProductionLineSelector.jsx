import {
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Stack
} from "@mui/material";

import productionLines from "../config/productionLines";
import { useProductionLine } from "../context/ProductionLineContext";

export default function ProductionLineSelector() {

  const {
    productionLine,
    changeProductionLine
  } = useProductionLine();

  function handleChange(event, newValue) {

    if (newValue) {
      changeProductionLine(newValue);
    }

  }

  return (

    <Paper
      elevation={3}
      sx={{
        mx: 3,
        mb: 3,
        p: 3,
        borderRadius: 3
      }}
    >

      <Typography
        variant="h5"
        fontWeight="bold"
        gutterBottom
      >
        Production Line
      </Typography>

      <Typography
        color="text.secondary"
        sx={{ mb: 2 }}
      >
        Select the production line currently running Final Test.
      </Typography>

      <ToggleButtonGroup
        value={productionLine}
        exclusive
        fullWidth
        orientation="vertical"
        onChange={handleChange}
      >

        {productionLines.map((line) => (

          <ToggleButton
            key={line.id}
            value={line.name}
            sx={{
              py: 2,
              fontSize: 22,
              fontWeight: 700,
              textTransform: "none",

              "&.Mui-selected": {
                backgroundColor: line.color,
                color: "#fff",

                "&:hover": {
                  backgroundColor: line.color
                }
              }
            }}
          >
            {line.name}
          </ToggleButton>

        ))}

      </ToggleButtonGroup>

      <Stack
        direction="row"
        justifyContent="center"
        sx={{ mt: 2 }}
      >

        <Typography
          color="primary"
          fontWeight="bold"
        >
          Current Line: {productionLine}
        </Typography>

      </Stack>

    </Paper>

  );

}