import { createTheme } from "@mui/material/styles";

//------------------------------------------------------
// ManufacturingOS industrial theme (Option E1)
//
// Dark "mission control" look on every page: near-black
// ground, flat panels split by hairlines, 2 px corners,
// no shadows. G&G blue (#237EB5, from the logo) is the
// only accent. Alert colors keep the hues the floor
// already knows. Mockup approved Oct 29 2026.
//------------------------------------------------------

export const tokens = {
    ground: "#0B0D10",
    bar: "#101318",
    panel: "#14181D",
    raised: "#1B2027",
    line: "#262C33",
    lineStrong: "#333B45",
    text: "#E8EDF2",
    muted: "#8B96A3",
    blue: "#237EB5",
    blueText: "#5AB0E6",
    online: "#3FB950",

    display: "'Barlow Condensed', 'Arial Narrow', sans-serif",
    body: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Roboto Mono', ui-monospace, monospace"
};

// Small uppercase label: LINE · WORK CENTER · ELAPSED
export const labelSx = {
    fontFamily: tokens.display,
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: "2px",
    textTransform: "uppercase",
    color: tokens.muted
};

const display = {
    fontFamily: tokens.display,
    fontWeight: 700,
    letterSpacing: "1px"
};

const theme = createTheme({

    palette: {
        mode: "dark",
        primary: { main: tokens.blue, light: tokens.blueText, contrastText: "#FFFFFF" },
        error: { main: "#D84A41", light: "#FF8A80" },
        warning: { main: "#E07A1F", light: "#FFA040" },
        success: { main: "#2E8B47", light: "#5CC97A" },
        info: { main: tokens.blue, light: tokens.blueText },
        background: { default: tokens.ground, paper: tokens.panel },
        divider: tokens.line,
        text: { primary: tokens.text, secondary: tokens.muted }
    },

    shape: { borderRadius: 2 },

    // Flat: panels are separated by lines, not shadows.
    shadows: Array(25).fill("none"),

    typography: {
        fontFamily: tokens.body,
        h1: display,
        h2: display,
        h3: display,
        h4: display,
        h5: { ...display, fontWeight: 600 },
        h6: { ...display, fontWeight: 600, letterSpacing: "1.5px" },
        overline: { fontFamily: tokens.display, fontWeight: 600, letterSpacing: "2px" },
        button: { fontFamily: tokens.display, fontWeight: 700, letterSpacing: "1.5px", fontSize: 15 }
    },

    components: {

        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: tokens.ground,
                    scrollbarColor: `${tokens.lineStrong} ${tokens.ground}`
                }
            }
        },

        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    border: `1px solid ${tokens.line}`
                }
            }
        },

        MuiAppBar: {
            styleOverrides: {
                root: { backgroundColor: tokens.bar, border: 0, borderBottom: `1px solid ${tokens.line}` }
            }
        },

        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                outlined: { borderColor: tokens.lineStrong }
            }
        },

        MuiChip: {
            styleOverrides: {
                root: { borderRadius: 2, fontWeight: 600 }
            }
        },

        MuiDialog: {
            styleOverrides: {
                paper: { border: `1px solid ${tokens.lineStrong}`, borderTop: `4px solid ${tokens.blue}` }
            }
        },

        MuiTableCell: {
            styleOverrides: {
                head: { ...display, fontWeight: 600, fontSize: 13, letterSpacing: "1.5px", color: tokens.muted, textTransform: "uppercase" }
            }
        },

        MuiTab: {
            styleOverrides: {
                root: { fontFamily: tokens.display, fontWeight: 600, letterSpacing: "1.5px" }
            }
        }

    }

});

export default theme;
