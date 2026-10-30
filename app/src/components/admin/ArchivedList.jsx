import { useState } from "react";

import {
    Box,
    Button,
    Collapse
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import UnarchiveIcon from "@mui/icons-material/Unarchive";

import { tokens } from "../../theme/theme";

//------------------------------------------------------
// Archived items with Restore (#15)
//
// Lines and responders are archived, never deleted.
// Collapsed by default; hidden when nothing is archived.
//------------------------------------------------------

function archivedOn(ms) {

    return new Date(ms).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York"
    });

}

export default function ArchivedList({

    items,
    label,
    onRestore

}) {

    const [open, setOpen] = useState(false);

    if (!items.length)
        return null;

    return (

        <Box sx={{ px: 1.25, py: 0.75 }}>

            <Button
                size="small"
                color="inherit"
                startIcon={open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                onClick={() => setOpen(!open)}
                sx={{ color: tokens.muted }}
            >

                Archived {label} ({items.length})

            </Button>

            <Collapse in={open}>

                {items.map(item => (

                    <Box
                        key={item.id}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 2,
                            px: 1,
                            py: 1,
                            borderTop: `1px solid ${tokens.line}`,
                            opacity: 0.85
                        }}
                    >

                        <Box>
                            <Box sx={{ fontWeight: 600 }}>{item.name}</Box>
                            <Box sx={{ fontSize: 13, color: tokens.muted }}>Archived {archivedOn(item.archived_at)}</Box>
                        </Box>

                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<UnarchiveIcon />}
                            onClick={() => onRestore(item)}
                        >
                            Restore
                        </Button>

                    </Box>

                ))}

            </Collapse>

        </Box>

    );

}
