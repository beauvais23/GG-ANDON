import {
  Paper,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Stack
} from "@mui/material";

import { useEffect, useState } from "react";
import { getProductionLines } from "../api/productionLines";
import { useProductionLine } from "../context/ProductionLineContext";

export default function ProductionLineSelector() {

  const {
    productionLine,
    changeProductionLine
  } = useProductionLine();

  const [productionLines, setProductionLines] = useState([]);

  useEffect(() => {

    async function loadProductionLines() {

      try {

        const lines = await getProductionLines();

        setProductionLines(
          lines
            .filter(line => line.active)
            .sort((a, b) => a.display_order - b.display_order)
        );

      } catch (err) {

        console.error(err);

      }

    }

    loadProductionLines();

  }, []);

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
        gutterBottom
        sx={{
          fontWeight: "bold"
        }}
      >
        Production Line
      </Typography>

      <Typography
        sx={{
          color: "text.secondary",
          mb: 2
        }}>
        Select the production line
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
        sx={{
          justifyContent: "center",
          mt: 2
        }}>

        <Typography
          color="primary"
          sx={{
            fontWeight: "bold"
          }}
        >
          Current Line: {productionLine}
        </Typography>

      </Stack>

    </Paper>
  );

}