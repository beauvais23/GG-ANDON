import { useState } from "react";

import {
    Box,
    Button,
    Collapse,
    Stack,
    Typography
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import UnarchiveIcon from "@mui/icons-material/Unarchive";

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

        <Box sx={{ mt: 3 }}>

            <Button
                size="small"
                color="inherit"
                startIcon={open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                onClick={() => setOpen(!open)}
            >

                Archived {label} ({items.length})

            </Button>

            <Collapse in={open}>

                <Stack spacing={1} sx={{ mt: 1 }}>

                    {items.map(item => (

                        <Box
                            key={item.id}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 2,
                                px: 2,
                                py: 1,
                                borderRadius: 1,
                                bgcolor: "action.hover"
                            }}
                        >

                            <Box>

                                <Typography fontWeight={600}>

                                    {item.name}

                                </Typography>

                                <Typography variant="body2" color="text.secondary">

                                    Archived {archivedOn(item.archived_at)}

                                </Typography>

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

                </Stack>

            </Collapse>

        </Box>

    );

}
