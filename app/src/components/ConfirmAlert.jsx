import {
  Paper,
  Typography,
  Button,
  Stack,
  Box
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import HandymanIcon from "@mui/icons-material/Handyman";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import GroupsIcon from "@mui/icons-material/Groups";

const themes = {

  QUALITY: {
    color: "#d62828",
    icon: <SearchIcon sx={{ fontSize: 90 }} />
  },

  MAINTENANCE: {
    color: "#f57c00",
    icon: <HandymanIcon sx={{ fontSize: 90 }} />
  },

  MATERIAL: {
    color: "#f9c74f",
    icon: <Inventory2Icon sx={{ fontSize: 90, color: "#222" }} />
  },

  SUPERVISOR: {
    color: "#1565c0",
    icon: <GroupsIcon sx={{ fontSize: 90 }} />
  }

};

export default function ConfirmAlert({
  alert,
  onCancel,
  onConfirm
}) {

  const theme = themes[alert.type];

  return (

    <Paper
      elevation={8}
      sx={{
        width: 820,
        maxWidth: "95%",
        mx: "auto",
        mt: 6,
        p: 5,
        borderRadius: 4,
        textAlign: "center"
      }}
    >

      {theme.icon}

      <Typography
        variant="h3"
        fontWeight="bold"
        sx={{
          mt: 2,
          color: theme.color
        }}
      >
        {alert.type} REQUEST
      </Typography>

      <Stack spacing={3} sx={{ mt: 5 }}>

        <Box>

          <Typography color="text.secondary">
            Station
          </Typography>

          <Typography variant="h4">
            {alert.station}
          </Typography>

        </Box>

        <Box>

          <Typography color="text.secondary">
            Operator
          </Typography>

          <Typography variant="h4">
            {alert.operator}
          </Typography>

        </Box>

      </Stack>

      <Typography
        sx={{
          mt: 5,
          mb: 5,
          fontSize: 22
        }}
      >
        You are about to notify
        <br />
        the {alert.type.toLowerCase()} team.
      </Typography>

      <Stack
        direction="row"
        spacing={3}
        justifyContent="center"
      >

        <Button
          variant="outlined"
          size="large"
          onClick={onCancel}
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          size="large"
          sx={{
            backgroundColor: theme.color
          }}
          onClick={onConfirm}
        >
          SEND ALERT
        </Button>

      </Stack>

    </Paper>

  );

}