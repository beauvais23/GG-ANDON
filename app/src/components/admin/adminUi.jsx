import { Box, InputAdornment, TextField } from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";

import { labelSx, tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin building blocks (E5): the same flat panels,
// hairlines, status lights and stat strip as the
// Response Center, so Admin reads as one system.
//------------------------------------------------------

export function AdminPanel({ title, meta, action, children }) {

    return (

        <Box component="section" aria-label={title} sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", px: 2.25, py: 1.75, borderBottom: `1px solid ${tokens.line}` }}>

                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "2px", textTransform: "uppercase" }}>
                    {title}
                </Box>

                {meta && (
                    <Box component="span" sx={{ color: tokens.muted, fontSize: 14 }}>{meta}</Box>
                )}

                <Box sx={{ flexGrow: 1 }} />

                {action}

            </Box>

            {children}

        </Box>

    );

}

export function StatStrip({ items }) {

    return (

        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: `repeat(${items.length}, minmax(0, 1fr))` },
                borderBottom: `1px solid ${tokens.line}`
            }}
        >
            {items.map(({ label, value, color }, i) => (
                <Box key={label} sx={{ px: 2.25, py: 1.5, display: "flex", flexDirection: "column", gap: 0.5, borderLeft: i ? `1px solid ${tokens.line}` : "none" }}>
                    <Box component="span" sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
                    <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 28, lineHeight: 1.1, color: color || tokens.text }}>{value}</Box>
                </Box>
            ))}
        </Box>

    );

}

export function SearchBar({ value, onChange, placeholder }) {

    return (

        <Box sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
            <TextField
                fullWidth
                size="small"
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                slotProps={{
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: tokens.muted }} />
                            </InputAdornment>
                        )
                    }
                }}
            />
        </Box>

    );

}

// Status light + label, as on the Response Center team list.
export function Light({ color, label }) {

    return (

        <Box component="span" sx={{ ...labelSx, fontSize: 12, color, display: "inline-flex", alignItems: "center", gap: 0.75, whiteSpace: "nowrap" }}>
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
            {label}
        </Box>

    );

}

// Small outlined tag: department, facility.
export function Tag({ children }) {

    return (

        <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 12, px: 0.75, py: 0.25, color: tokens.muted, border: `1px solid ${tokens.lineStrong}`, whiteSpace: "nowrap" }}>
            {children}
        </Box>

    );

}

export function EmptyRow({ children }) {

    return (

        <Box sx={{ px: 2.25, py: 3, color: tokens.muted, textAlign: "center" }}>{children}</Box>

    );

}

// One row in an admin list; dimmed when inactive.
export function AdminRow({ inactive, sx, children }) {

    return (

        <Box
            sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "8px 16px",
                px: 2.25,
                py: 1.25,
                borderBottom: `1px solid ${tokens.line}`,
                opacity: inactive ? 0.6 : 1,
                "&:hover": { bgcolor: tokens.raised },
                ...sx
            }}
        >
            {children}
        </Box>

    );

}
