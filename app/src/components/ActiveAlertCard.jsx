import { Box, Button } from "@mui/material";

import { ALERT_COLORS, FALLBACK_COLOR, alertLabel } from "../config/alertColors";
import { isCritical } from "../utils/alertTime";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// One open alert as a row (E3): type edge, line / work
// center, elapsed, status light, who has it, actions.
// Resolve shows only once acknowledged: the backend only
// resolves acknowledged alerts.
//------------------------------------------------------

const actionSx = {
    height: 44,
    px: 2,
    fontSize: 16,
    letterSpacing: "2px"
};

function Field({ label, children, minWidth }) {

    return (

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth }}>
            <Box component="span" sx={{ ...labelSx, fontSize: 12 }}>{label}</Box>
            {children}
        </Box>

    );

}

export default function ActiveAlertCard({

    alert,
    elapsed,
    onAcknowledge,
    onResolve,
    onCancel

}) {

    const colors = ALERT_COLORS[alert.type] || FALLBACK_COLOR;

    const acknowledged = alert.status === "ACKNOWLEDGED";
    const critical = isCritical(alert);

    const status = acknowledged
        ? { label: "Acknowledged", dot: tokens.blueText }
        : { label: critical ? "Waiting 10+ min" : "Waiting", dot: "#FF6B61" };

    return (

        <Box
            component="article"
            aria-label={`${alertLabel(alert.type)} alert #${alert.id}`}
            sx={{
                // Fixed columns on wide screens so rows line up;
                // wraps on narrower ones.
                display: { xs: "flex", lg: "grid" },
                flexWrap: "wrap",
                gridTemplateColumns: "minmax(180px, 1fr) 100px 180px 160px 264px",
                alignItems: "center",
                gap: "14px 24px",
                p: 2.25,
                borderBottom: `1px solid ${tokens.line}`,
                borderLeft: `6px solid ${colors.edge}`,
                bgcolor: critical ? "rgba(216,74,65,0.10)" : "transparent"
            }}
        >

            <Box sx={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
                    <Box component="span" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 26, letterSpacing: "2px", color: colors.edge }}>
                        {alertLabel(alert.type)}
                    </Box>
                    <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 13, color: tokens.muted }}>
                        #{alert.id}
                    </Box>
                </Box>
                <Box sx={{ fontSize: 16 }}>
                    {alert.production_line} <Box component="span" sx={{ color: tokens.muted }}>/</Box> {alert.work_center}
                </Box>
            </Box>

            <Field label="Elapsed" minWidth={96}>
                <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 28, lineHeight: 1.1, color: critical ? "#FF6B61" : tokens.text }}>
                    {elapsed}
                </Box>
            </Field>

            <Field label="Status" minWidth={150}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, fontFamily: tokens.display, fontWeight: 600, fontSize: 17, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: status.dot, boxShadow: `0 0 6px ${status.dot}` }} />
                    {status.label}
                </Box>
            </Field>

            <Field label="Assigned to" minWidth={130}>
                <Box sx={{ fontWeight: 600, color: alert.assigned_to ? tokens.text : tokens.muted }}>
                    {alert.assigned_to || "Unassigned"}
                </Box>
            </Field>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", ml: "auto", justifyContent: "flex-end" }}>

                {!acknowledged && (
                    <Button variant="contained" color="primary" onClick={() => onAcknowledge(alert.id)} sx={actionSx}>
                        Acknowledge
                    </Button>
                )}

                {acknowledged && (
                    <Button variant="contained" color="success" onClick={() => onResolve(alert.id)} sx={actionSx}>
                        Resolve
                    </Button>
                )}

                {onCancel && (
                    <Button
                        variant="outlined"
                        color="error"
                        onClick={() => onCancel(alert.id)}
                        sx={{ ...actionSx, color: "#FF8A80", borderColor: "#5C2622" }}
                    >
                        Cancel
                    </Button>
                )}

            </Box>

        </Box>

    );

}
