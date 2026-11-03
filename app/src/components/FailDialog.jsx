import { Box, ButtonBase, Dialog, DialogContent, DialogTitle, Button } from "@mui/material";

import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// H3: FAIL → pick the failure code (the NCM form's list).
// Final Test codes (FA) first, then BA, then the rest, in
// the form's order. One tap records the failure.
//------------------------------------------------------

const GROUP_ORDER = ["FA", "BA"];
const GROUP_NAMES = { FA: "Final assembly / test", BA: "Board assembly", EC: "End cap", TH: "Tube / housing", HA: "Harness", CB: "Control box", DV: "Device", AL: "Aluminum" };

export default function FailDialog({ sku, codes, onPick, onClose }) {

    const groups = [...new Set(codes.map(c => c.grp))].sort((a, b) => {

        const ia = GROUP_ORDER.indexOf(a);
        const ib = GROUP_ORDER.indexOf(b);

        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);

    });

    return (

        <Dialog open onClose={onClose} maxWidth="lg" fullWidth>

            <DialogTitle sx={{ fontFamily: tokens.display, letterSpacing: "1.5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 2 }}>
                <Box component="span" sx={{ color: "#F85149" }}>Fail</Box>
                <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 18, textTransform: "none" }}>{sku}</Box>
                <Box sx={{ flex: 1 }} />
                <Button color="inherit" onClick={onClose}>Cancel</Button>
            </DialogTitle>

            <DialogContent sx={{ maxHeight: "70vh" }}>

                {groups.map(g => (

                    <Box key={g} sx={{ mb: 2 }}>

                        <Box sx={{ ...labelSx, mb: 1 }}>{g} · {GROUP_NAMES[g] || g}</Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1 }}>
                            {codes.filter(c => c.grp === g).map(c => (
                                <ButtonBase
                                    key={c.code}
                                    onClick={() => onPick(c)}
                                    focusRipple
                                    sx={{ minHeight: 56, px: 1.5, justifyContent: "flex-start", textAlign: "left", borderRadius: "2px", bgcolor: tokens.panel, border: `1px solid ${tokens.lineStrong}`, color: "#E6EDF3", fontSize: 14, "&:active": { borderColor: "#F85149" } }}
                                >
                                    <Box component="span" sx={{ fontFamily: tokens.mono, color: "#F85149", mr: 1.25, whiteSpace: "nowrap" }}>{c.code}</Box>
                                    {c.label.split(" - ").slice(1).join(" - ")}
                                </ButtonBase>
                            ))}
                        </Box>

                    </Box>

                ))}

            </DialogContent>

        </Dialog>

    );

}
