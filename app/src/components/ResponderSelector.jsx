import {
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
    Box,
    Chip
} from "@mui/material";

export default function ResponderSelector({

    responder,
    setResponder,
    responseTeam

}) {

    const selectedPerson =
        responseTeam.find(p => p.name === responder);

    function getColor(availability) {

        switch (availability) {

            case "Busy":
                return "error";

            case "Away":
                return "warning";

            case "Available":
            default:
                return "success";

        }

    }

    return (
        <Box sx={{ width: "100%" }}>

            <Typography
                variant="subtitle2"
                sx={{
                    fontWeight: 700,
                    mb: 1
                }}>
                Current Responder
            </Typography>

            <FormControl fullWidth>

                <InputLabel>
                    Select Responder
                </InputLabel>

                <Select
                    value={responder}
                    label="Select Responder"
                    onChange={(e) =>
                        setResponder(e.target.value)
                    }

                    renderValue={() => (

                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                width: "100%"
                            }}
                        >

                            <Typography
                                sx={{
                                    fontWeight: 700,
                                    fontSize: 20
                                }}>
                                {selectedPerson?.name}
                            </Typography>

                            {selectedPerson && (

                                <Chip
                                    label={selectedPerson.availability}
                                    color={getColor(selectedPerson.availability)}
                                    size="small"
                                />

                            )}

                        </Box>

                    )}

                >

                    {responseTeam.map((person) => (

                        <MenuItem
                            key={person.id}
                            value={person.name}
                        >

                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    width: "100%"
                                }}
                            >

                                <Typography
                                    sx={{
                                        fontWeight: 600
                                    }}
                                >
                                    {person.name}
                                </Typography>

                                <Chip
                                    label={person.availability}
                                    color={getColor(person.availability)}
                                    size="small"
                                />

                            </Box>

                        </MenuItem>

                    ))}

                </Select>

            </FormControl>

        </Box>
    );

}