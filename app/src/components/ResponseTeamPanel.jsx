import {
    Paper,
    Typography,
    Stack,
    Avatar,
    Chip,
    Divider,
    Box
} from "@mui/material";

function availabilityColor(status) {

    switch ((status || "").toLowerCase()) {

        case "available":
            return "success";

        case "busy":
            return "error";

        case "away":
            return "warning";

        default:
            return "default";

    }

}

function initials(name) {

    return name
        ?.split(" ")
        .map(n => n[0])
        .join("")
        .toUpperCase();

}

export default function ResponseTeamPanel({ responseTeam }) {

    return (
        <Paper
            elevation={3}
            sx={{
                mt: 3,
                p: 2.5,
                borderRadius: 3
            }}
        >

            <Typography
                variant="h6"
                gutterBottom
                sx={{
                    fontWeight: 700
                }}
            >
                Response Team
            </Typography>

            <Stack spacing={2}>

                {responseTeam.map((person) => (

                    <Box key={person.id}>

                        <Stack
                            direction="row"
                            spacing={2}
                            sx={{
                                alignItems: "center"
                            }}
                        >

                            <Avatar
                                sx={{
                                    bgcolor: "#1976d2"
                                }}
                            >
                                {initials(person.name)}
                            </Avatar>

                            <Box sx={{ flex: 1 }}>

                                <Typography
                                    sx={{
                                        fontWeight: 700
                                    }}
                                >
                                    {person.name}
                                </Typography>

                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: "text.secondary"
                                    }}
                                >
                                    {person.job_title}
                                </Typography>

                            </Box>

                            <Chip
                                label={person.availability}
                                color={availabilityColor(person.availability)}
                                size="small"
                            />

                        </Stack>

                        <Divider sx={{ mt: 2 }} />

                    </Box>

                ))}

            </Stack>

        </Paper>
    );

}