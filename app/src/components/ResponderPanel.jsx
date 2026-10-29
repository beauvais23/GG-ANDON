import { Box, FormControl, InputLabel, MenuItem, Select } from "@mui/material";

import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// "Acting as" picker + response team with status lights
// (E3). Replaces ResponderSelector and ResponseTeamPanel.
//------------------------------------------------------

const LIGHTS = {
    available: { color: "#3FB950", label: "Available" },
    responding: { color: tokens.blueText, label: "Responding" },
    busy: { color: "#FF6B61", label: "Busy" },
    away: { color: "#F2C232", label: "Away" }
};

function light(availability) {

    return LIGHTS[(availability || "").toLowerCase()] || { color: tokens.muted, label: availability || "Unknown" };

}

function Panel({ title, children }) {

    return (

        <Box component="section" aria-label={title} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>
            <Box sx={{ px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}`, fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "2px", textTransform: "uppercase" }}>
                {title}
            </Box>
            {children}
        </Box>

    );

}

export default function ResponderPanel({ team, actingAs, setActingAs }) {

    return (

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>

            <Panel title="Acting as">
                <Box sx={{ p: 2.25 }}>
                    <FormControl fullWidth>
                        <InputLabel id="acting-as-label">Responder</InputLabel>
                        <Select
                            labelId="acting-as-label"
                            label="Responder"
                            value={team.some(p => p.name === actingAs) ? actingAs : ""}
                            onChange={e => setActingAs(e.target.value)}
                        >
                            {team.map(person => (
                                <MenuItem key={person.id} value={person.name}>{person.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box sx={{ fontSize: 13, mt: 1, color: tokens.muted }}>
                        Acknowledge, Resolve and Cancel are recorded under this name.
                    </Box>
                </Box>
            </Panel>

            <Panel title="Response team">
                {team.length === 0 && (
                    <Box sx={{ px: 2.25, py: 2, color: tokens.muted }}>No responders set up. Add them in Admin.</Box>
                )}
                {team.map((person, i) => {

                    const l = light(person.availability);

                    return (

                        <Box
                            key={person.id}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 2,
                                px: 2.25,
                                py: 1.5,
                                borderTop: i ? "1px solid #1E242B" : 0
                            }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Box sx={{ fontWeight: 600 }}>{person.name}</Box>
                                {person.department && (
                                    <Box sx={{ fontSize: 13, color: tokens.muted }}>{person.department}</Box>
                                )}
                            </Box>
                            <Box sx={{ ...labelSx, color: l.color, display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: l.color }} />
                                {l.label}
                            </Box>
                        </Box>

                    );

                })}
            </Panel>

        </Box>

    );

}
