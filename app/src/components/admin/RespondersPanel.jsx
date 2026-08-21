import { useEffect, useState } from "react";

import {
    Paper,
    Typography,
    Stack,
    Button,
    TextField,
    Avatar,
    Chip,
    IconButton,
    Box,
    Tooltip
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import {
    getResponseTeam,
    createResponder,
    updateResponder,
    deleteResponder
} from "../../api/responseTeam";

import AddResponderDialog from "../AddResponderDialog";
import EditResponderDialog from "../EditResponderDialog";
import DeleteResponderDialog from "../DeleteResponderDialog";

//------------------------------------------------------
// Responder Status Helpers
//------------------------------------------------------

function getAvailabilityColor(status) {

    switch ((status || "").toLowerCase()) {

        case "available":
            return "success";

        case "responding":
            return "primary";

        case "busy":
            return "error";

        case "away":
            return "warning";

        default:
            return "default";

    }

}

function getAvailabilityLabel(responder) {

    if (!responder.active) {
        return "Inactive";
    }

    return responder.availability || "Available";

}

function getDepartmentColor(department) {

    switch (department) {

        case "Leadership":
            return "secondary";

        case "Operations":
            return "primary";

        case "Engineering":
            return "info";

        case "Quality":
            return "success";

        case "Safety":
            return "warning";

        case "Maintenance":
            return "error";

        default:
            return "default";

    }

}

//------------------------------------------------------
// Component
//------------------------------------------------------

export default function RespondersPanel() {

    //------------------------------------------------------
    // State
    //------------------------------------------------------

    const [responders, setResponders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [addOpen, setAddOpen] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [selectedResponder, setSelectedResponder] =
        useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteResponderItem, setDeleteResponderItem] =
        useState(null);

    //------------------------------------------------------
    // Load Responders
    //------------------------------------------------------

    async function loadResponders() {

        setLoading(true);

        try {

            const data =
                await getResponseTeam();

            setResponders(data);

        } catch (err) {

            console.error(
                "Failed to load responders:",
                err
            );

        } finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        loadResponders();

    }, []);

    //------------------------------------------------------
    // Add Responder
    //------------------------------------------------------

    async function handleAdd(responder) {

        try {

            await createResponder(responder);

            setAddOpen(false);

            await loadResponders();

        } catch (err) {

            alert(err.message);

        }

    }

    //------------------------------------------------------
    // Update Responder
    //------------------------------------------------------

    async function handleUpdate(responder) {

        try {

            await updateResponder(
                selectedResponder.id,
                responder
            );

            setEditOpen(false);

            setSelectedResponder(null);

            await loadResponders();

        } catch (err) {

            alert(err.message);

        }

    }

    //------------------------------------------------------
    // Delete Responder
    //------------------------------------------------------

    async function handleDelete() {

        try {

            await deleteResponder(
                deleteResponderItem.id
            );

            setDeleteOpen(false);

            setDeleteResponderItem(null);

            await loadResponders();

        } catch (err) {

            alert(err.message);

        }

    }

    //------------------------------------------------------
    // Statistics
    //------------------------------------------------------

    const activeCount =
        responders.filter(
            responder => Boolean(responder.active)
        ).length;

    const availableCount =
        responders.filter(
            responder =>
                Boolean(responder.active) &&
                responder.availability === "Available"
        ).length;

    const respondingCount =
        responders.filter(
            responder =>
                Boolean(responder.active) &&
                responder.availability === "Responding"
        ).length;

    const departmentCount =
        new Set(
            responders
                .filter(
                    responder => responder.department
                )
                .map(
                    responder => responder.department
                )
        ).size;

    //------------------------------------------------------
    // Search
    //------------------------------------------------------

    const filteredResponders =
        responders.filter(responder => {

            const text =
                search.toLowerCase();

            return (

                (responder.name || "")
                    .toLowerCase()
                    .includes(text) ||

                (responder.department || "")
                    .toLowerCase()
                    .includes(text) ||

                (responder.job_title || "")
                    .toLowerCase()
                    .includes(text) ||

                (responder.availability || "")
                    .toLowerCase()
                    .includes(text)

            );

        });

    //------------------------------------------------------
    // Avatar Initials
    //------------------------------------------------------

    function initials(name) {

        return (name || "")
            .split(" ")
            .filter(Boolean)
            .map(word => word[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

    }

    //------------------------------------------------------
    // Render
    //------------------------------------------------------

    return (

        <Paper
            elevation={3}
            sx={{
                p: 4,
                borderRadius: 3,
                bgcolor: "#ECEFF1"
            }}
        >

            {/* Header */}

            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    mb: 4
                }}
            >

                <Box>

                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 700
                        }}
                    >
                        Response Team
                    </Typography>

                    <Typography
                        variant="body2"
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Manage responder availability and contact information.
                    </Typography>

                </Box>

                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{
                        ml: "auto"
                    }}
                    onClick={() =>
                        setAddOpen(true)
                    }
                >
                    Add Responder
                </Button>

            </Stack>

            {/* Statistics */}

            <Stack
                direction="row"
                spacing={2}
                sx={{
                    mb: 3
                }}
            >

                <Paper
                    sx={{
                        flex: 1,
                        p: 2
                    }}
                >

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700
                        }}
                    >
                        {responders.length}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Total Responders
                    </Typography>

                </Paper>

                <Paper
                    sx={{
                        flex: 1,
                        p: 2
                    }}
                >

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700
                        }}
                    >
                        {activeCount}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Active
                    </Typography>

                </Paper>

                <Paper
                    sx={{
                        flex: 1,
                        p: 2
                    }}
                >

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            color: "success.main"
                        }}
                    >
                        {availableCount}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Available
                    </Typography>

                </Paper>

                <Paper
                    sx={{
                        flex: 1,
                        p: 2
                    }}
                >

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            color: "primary.main"
                        }}
                    >
                        {respondingCount}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Responding
                    </Typography>

                </Paper>

                <Paper
                    sx={{
                        flex: 1,
                        p: 2
                    }}
                >

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700
                        }}
                    >
                        {departmentCount}
                    </Typography>

                    <Typography
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        Departments
                    </Typography>

                </Paper>

            </Stack>

            {/* Search */}

            <TextField
                fullWidth
                placeholder="Search responders..."
                value={search}
                onChange={(event) =>
                    setSearch(event.target.value)
                }
                sx={{
                    mb: 4,
                    bgcolor: "white"
                }}
            />

            {/* Loading */}

            {loading && (

                <Typography>

                    Loading response team...

                </Typography>

            )}

            {/* Empty State */}

            {!loading &&
                filteredResponders.length === 0 && (

                    <Paper
                        sx={{
                            p: 4,
                            textAlign: "center"
                        }}
                    >

                        <Typography
                            sx={{
                                color: "text.secondary"
                            }}
                        >
                            No responders found.
                        </Typography>

                    </Paper>

                )}

            {/* Responder Cards */}

            {!loading &&
                filteredResponders.map(
                    responder => (

                        <Paper
                            key={responder.id}
                            elevation={2}
                            sx={{
                                px: 4,
                                py: 3,
                                mb: 2,
                                borderRadius: 3,
                                opacity:
                                    responder.active
                                        ? 1
                                        : 0.65
                            }}
                        >

                            <Stack
                                direction="row"
                                sx={{
                                    justifyContent:
                                        "space-between",

                                    alignItems:
                                        "center"
                                }}
                            >

                                {/* Left Side */}

                                <Stack
                                    direction="row"
                                    spacing={2}
                                    sx={{
                                        flex: 1,
                                        alignItems:
                                            "center"
                                    }}
                                >

                                    <Avatar
                                        sx={{
                                            width: 54,
                                            height: 54,

                                            bgcolor:
                                                responder.active
                                                    ? "#1976d2"
                                                    : "grey.500",

                                            fontWeight: 700
                                        }}
                                    >
                                        {initials(
                                            responder.name
                                        )}
                                    </Avatar>

                                    <Box>

                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                alignItems:
                                                    "center",
                                                mb: 0.5
                                            }}
                                        >

                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    fontWeight: 700
                                                }}
                                            >
                                                {
                                                    responder.name
                                                }
                                            </Typography>

                                            {!responder.active && (

                                                <Chip
                                                    label="INACTIVE"
                                                    size="small"
                                                    variant="outlined"
                                                />

                                            )}

                                        </Stack>

                                        <Typography
                                            sx={{
                                                color:
                                                    "text.secondary"
                                            }}
                                        >
                                            {
                                                responder.job_title ||
                                                "No job title"
                                            }
                                        </Typography>

                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                mt: 1,
                                                alignItems:
                                                    "center"
                                            }}
                                        >

                                            <Chip
                                                label={
                                                    responder.department ||
                                                    "No Department"
                                                }
                                                size="small"
                                                color={
                                                    getDepartmentColor(
                                                        responder.department
                                                    )
                                                }
                                            />

                                            {responder.phone && (

                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color:
                                                            "text.secondary"
                                                    }}
                                                >
                                                    {
                                                        responder.phone
                                                    }
                                                </Typography>

                                            )}

                                        </Stack>

                                    </Box>

                                </Stack>

                                {/* Right Side */}

                                <Stack
                                    spacing={1.5}
                                    sx={{
                                        alignItems:
                                            "flex-end"
                                    }}
                                >

                                    <Chip
                                        label={
                                            getAvailabilityLabel(
                                                responder
                                            ).toUpperCase()
                                        }
                                        color={
                                            responder.active
                                                ? getAvailabilityColor(
                                                    responder.availability
                                                )
                                                : "default"
                                        }
                                        size="small"
                                        sx={{
                                            fontWeight: 700,
                                            px: 1,
                                            height: 28,
                                            letterSpacing: 0.5
                                        }}
                                    />

                                    <Stack
                                        direction="row"
                                        spacing={1}
                                    >

                                        <Tooltip
                                            title="Edit responder"
                                        >

                                            <IconButton
                                                onClick={() => {

                                                    setSelectedResponder(
                                                        responder
                                                    );

                                                    setEditOpen(
                                                        true
                                                    );

                                                }}
                                            >

                                                <EditIcon />

                                            </IconButton>

                                        </Tooltip>

                                        <Tooltip
                                            title="Delete responder"
                                        >

                                            <IconButton
                                                color="error"
                                                onClick={() => {

                                                    setDeleteResponderItem(
                                                        responder
                                                    );

                                                    setDeleteOpen(
                                                        true
                                                    );

                                                }}
                                            >

                                                <DeleteIcon />

                                            </IconButton>

                                        </Tooltip>

                                    </Stack>

                                </Stack>

                            </Stack>

                        </Paper>

                    )
                )}

            {/* Add Dialog */}

            <AddResponderDialog
                open={addOpen}
                onClose={() =>
                    setAddOpen(false)
                }
                onSave={handleAdd}
            />

            {/* Edit Dialog */}

            <EditResponderDialog
                open={editOpen}
                responder={selectedResponder}
                onClose={() => {

                    setEditOpen(false);

                    setSelectedResponder(null);

                }}
                onSave={handleUpdate}
            />

            {/* Delete Dialog */}

            <DeleteResponderDialog
                open={deleteOpen}
                responder={deleteResponderItem}
                onClose={() => {

                    setDeleteOpen(false);

                    setDeleteResponderItem(null);

                }}
                onDelete={handleDelete}
            />

        </Paper>

    );

}
```
