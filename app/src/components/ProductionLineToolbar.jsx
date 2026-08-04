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

export default function ProductionLineToolbar() {

  const {
    productionLine,
    changeProductionLine
  } = useProductionLine();

  const [productionLines, setProductionLines] = useState([]);

  //------------------------------------------------------
  // Load Production Lines
  //------------------------------------------------------

  useEffect(() => {

    async function loadProductionLines() {

      try {

        const lines = await getProductionLines();

        setProductionLines(

          lines
            .filter(line => line.active)
            .sort((a, b) => a.display_order - b.display_order)

        );

      }

      catch (err) {

        console.error(err);

      }

    }

    loadProductionLines();

  }, []);

  //------------------------------------------------------
  // Change Production Line
  //------------------------------------------------------

  function handleChange(event, newLine) {

    if (newLine) {

      changeProductionLine(newLine);

    }

  }

  //------------------------------------------------------
  // Render
  //------------------------------------------------------

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
        sx={{
          alignItems: "center",
          justifyContent: "space-between"
        }}>

        <Stack spacing={0}>

          <Typography
            variant="h6"
            sx={{
              fontWeight: "bold"
            }}
          >
            Production Line
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
              value={line.name}
              sx={{
                px: 4,
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

      </Stack>

    </Paper>
  );

}