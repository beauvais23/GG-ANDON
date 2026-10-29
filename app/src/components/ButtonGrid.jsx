import Box from "@mui/material/Box";

import SearchIcon from "@mui/icons-material/Search";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";

import AlertButton from "./AlertButton";
import { ALERT_COLORS } from "../config/alertColors";

// Five equal buttons, left to right (E2). DOWNTIME and NEAR MISS
// sit beside the station chips (StationBar, Option B).
const BUTTONS = [
  { type: "QUALITY", subtitle: "Quality assistance", icon: <SearchIcon /> },
  { type: "MAINTENANCE", subtitle: "Equipment assistance", icon: <BuildOutlinedIcon /> },
  { type: "MATERIAL", subtitle: "Material needed", icon: <Inventory2OutlinedIcon /> },
  { type: "SUPERVISOR", subtitle: "Supervisor assistance", icon: <PersonOutlineIcon /> },
  { type: "SAFETY", subtitle: "Safety assistance", icon: <GppMaybeOutlinedIcon /> }
];

export default function ButtonGrid({ onRaise }) {

  return (

    <Box
      sx={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" },
        gap: 1.5,
        px: 3,
        py: 2.5
      }}
    >

      {BUTTONS.map(button => (

        <AlertButton
          key={button.type}
          colors={ALERT_COLORS[button.type]}
          icon={button.icon}
          title={button.type}
          subtitle={button.subtitle}
          onClick={() => onRaise(button.type)}
        />

      ))}

    </Box>

  );

}
