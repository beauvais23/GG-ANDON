import SearchIcon from "@mui/icons-material/Search";
import BuildIcon from "@mui/icons-material/Build";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";

const alertTypes = {
  QUALITY: {
    label: "Quality",
    color: "#D32F2F",
    icon: <SearchIcon sx={{ fontSize: 34, color: "#D32F2F" }} />
  },

  MAINTENANCE: {
    label: "Maintenance",
    color: "#F57C00",
    icon: <BuildIcon sx={{ fontSize: 34, color: "#F57C00" }} />
  },

  MATERIAL: {
    label: "Material",
    color: "#FBC02D",
    icon: <Inventory2Icon sx={{ fontSize: 34, color: "#FBC02D" }} />
  },

  SUPERVISOR: {
    label: "Supervisor",
    color: "#1976D2",
    icon: (
      <SupervisorAccountIcon
        sx={{ fontSize: 34, color: "#1976D2" }}
      />
    )
  },

  SAFETY: {
    label: "Safety",
    color: "#388E3C",
    icon: (
      <HealthAndSafetyIcon
        sx={{ fontSize: 34, color: "#388E3C" }}
      />
    )
  }
};

export default alertTypes;