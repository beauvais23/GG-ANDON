import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  Box
} from "@mui/material";

export default function ResponderSelector({
  responder,
  setResponder,
  responseTeam
}) {
  return (
    <Box sx={{ width: "100%" }}>

      <Typography
        variant="subtitle2"
        fontWeight={700}
        sx={{ mb: 1 }}
      >
        Current Responder
      </Typography>

      <FormControl fullWidth size="medium">

        <InputLabel>
          Select Responder
        </InputLabel>

        <Select
          value={responder}
          label="Select Responder"
          onChange={(e) =>
            setResponder(e.target.value)
          }
          sx={{
            fontWeight: 700,
            fontSize: 20,
            "& .MuiSelect-select": {
              fontWeight: 700
            }
          }}
        >

          {responseTeam.map((person) => (
            <MenuItem
              key={person.name}
              value={person.name}
              sx={{
                fontWeight: 700,
                fontSize: 18
              }}
            >
              {person.name}
            </MenuItem>
          ))}

        </Select>

      </FormControl>

    </Box>
  );
}