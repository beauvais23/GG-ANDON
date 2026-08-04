import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
    Paper,
    Stack,
    Typography,
    Chip,
    Box,
    IconButton
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

export default function SortableProductionLineCard({

    line,
    setSelectedLine,
    setEditOpen,
    setDeleteLine,
    setDeleteOpen

}) {

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition
    } = useSortable({

        id: line.id

    });

    const style = {

        transform: CSS.Transform.toString(transform),

        transition

    };

    return (
        <Paper
            ref={setNodeRef}
            style={style}
            elevation={2}
            sx={{
                px:4,
                py:3,
                mb:2.5,
                borderRadius:3,
                transition:".2s",

                "&:hover":{

                    boxShadow:6,

                    transform:"translateY(-2px)"

                }

            }}
        >

            <Stack
                direction="row"
                sx={{
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                }}>

                {/* LEFT SIDE */}

                <Stack
                    spacing={1}
                    sx={{ flex:1 }}
                >

                    <Typography
                        variant="h4"
                        {...attributes}
                        {...listeners}
                        sx={[{
                            fontWeight: 700,
                            cursor:"grab",
                            userSelect:"none"
                        }, ...(Array.isArray(listeners.sx) ? listeners.sx : [listeners.sx])]}>
                        {line.name}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        {line.description || "No description"}
                    </Typography>

                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            alignItems: "center"
                        }}
                    >

                        <Chip
                            label={line.facility}
                            size="small"
                            variant="outlined"
                        />

                        <Typography
                            variant="body2"
                            sx={{
                                color: "text.secondary"
                            }}
                        >
                            • Order {line.display_order}
                        </Typography>

                    </Stack>

                </Stack>

                {/* RIGHT SIDE */}

                <Stack
                    spacing={2}
                    sx={{
                        alignItems: "flex-end"
                    }}
                >

                    <Chip
                        label={line.active ? "ACTIVE" : "INACTIVE"}
                        color={line.active ? "success" : "default"}
                        size="small"
                        sx={{
                            fontWeight:700,
                            letterSpacing:1
                        }}
                    />

                    <Stack
                        direction="row"
                        spacing={2}
                        sx={{
                            alignItems: "center"
                        }}
                    >

                        <Box
                            sx={{
                                width:46,
                                height:46,
                                bgcolor:line.color,
                                borderRadius:2,
                                border:"1px solid #bbb",
                                boxShadow:2
                            }}
                        />

                        <IconButton

                            onClick={()=>{

                                setSelectedLine(line);

                                setEditOpen(true);

                            }}

                        >

                            <EditIcon/>

                        </IconButton>

                        <IconButton

                            color="error"

                            onClick={()=>{

                                setDeleteLine(line);

                                setDeleteOpen(true);

                            }}

                        >

                            <DeleteIcon/>

                        </IconButton>

                    </Stack>

                </Stack>

            </Stack>

        </Paper>
    );

}