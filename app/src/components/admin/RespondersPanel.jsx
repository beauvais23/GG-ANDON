import { useEffect, useState } from "react";

import {
    Paper,
    Typography,
    Stack,
    Button,
    TextField,
    Avatar,
    Chip,
    IconButton
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

export default function RespondersPanel() {

//------------------------------------------------------
// State
//------------------------------------------------------

const [responders, setResponders] = useState([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");

const [addOpen, setAddOpen] = useState(false);

const [editOpen, setEditOpen] = useState(false);
const [selectedResponder, setSelectedResponder] = useState(null);

const [deleteOpen, setDeleteOpen] = useState(false);
const [deleteResponderItem, setDeleteResponderItem] = useState(null);

    //------------------------------------------------------
    // Load
    //------------------------------------------------------

    async function loadResponders() {

        setLoading(true);

        try {

            const data = await getResponseTeam();

            setResponders(data);

        }

        finally {

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

    }

    catch (err) {

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

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Delete Responder
//------------------------------------------------------

async function handleDelete() {

    try {

        await deleteResponder(deleteResponderItem.id);

        setDeleteOpen(false);

        setDeleteResponderItem(null);

        await loadResponders();

    }

    catch (err) {

        alert(err.message);

    }

}

    //------------------------------------------------------
    // Statistics
    //------------------------------------------------------

    const activeCount =
        responders.filter(r => r.active).length;

    const departmentCount =
        new Set(
            responders.map(r => r.department)
        ).size;

    const availableCount =
    responders.filter(
        r => r.active && r.availability === "Available"
    ).length;

const inactiveCount =
    responders.filter(
        r => !r.active
    ).length;    

    //------------------------------------------------------
    // Search
    //------------------------------------------------------

    const filteredResponders =
        responders.filter(r => {

            const text = search.toLowerCase();

            return (

                r.name.toLowerCase().includes(text) ||

                (r.department || "")
                    .toLowerCase()
                    .includes(text) ||

                (r.job_title || "")
                    .toLowerCase()
                    .includes(text)

            );

        });

    //------------------------------------------------------
    // Avatar
    //------------------------------------------------------

    function initials(name) {

        return name
            .split(" ")
            .map(n => n[0])
            .join("")
            .substring(0,2)
            .toUpperCase();

    }

    //------------------------------------------------------
    // Render
    //------------------------------------------------------

    return (
        <Paper
            elevation={3}
            sx={{
                p:4,
                borderRadius:3,
                bgcolor:"#ECEFF1"
            }}
        >

            {/* Header */}

            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    mb:4
                }}>

                <Typography
                    variant="h5"
                    sx={{
                        fontWeight: 700
                    }}
                >
                    Response Team
                </Typography>

                <Button
    variant="contained"
    startIcon={<AddIcon />}
    sx={{ ml: "auto" }}
    onClick={() => setAddOpen(true)}
>
    Add Responder
</Button>

            </Stack>

            {/* Statistics */}

            <Stack
                direction="row"
                spacing={2}
                sx={{ mb: 3 }}
            >

                <Paper sx={{ flex: 1, p: 2 }}>
                    <Typography variant="h4" sx={{
                        fontWeight: 700
                    }}>
                        {responders.length}
                    </Typography>
                    <Typography sx={{
                        color: "text.secondary"
                    }}>
                        Total Responders
                    </Typography>
                </Paper>

                <Paper sx={{ flex: 1, p: 2 }}>
                    <Typography variant="h4" sx={{
                        fontWeight: 700
                    }}>
                        {activeCount}
                    </Typography>
                    <Typography sx={{
                        color: "text.secondary"
                    }}>
                        Active
                    </Typography>
                </Paper>

                <Paper sx={{ flex: 1, p: 2 }}>
                    <Typography variant="h4" sx={{
                        fontWeight: 700
                    }}>
                        {availableCount}
                    </Typography>
                    <Typography sx={{
                        color: "text.secondary"
                    }}>
                        Available
                    </Typography>
                </Paper>

                <Paper sx={{ flex: 1, p: 2 }}>
                    <Typography variant="h4" sx={{
                        fontWeight: 700
                    }}>
                        {departmentCount}
                    </Typography>
                    <Typography sx={{
                        color: "text.secondary"
                    }}>
                        Departments
                    </Typography>
                </Paper>

            </Stack>

            {/* Search */}

            <TextField

                fullWidth

                placeholder="Search Responders..."

                value={search}

                onChange={(e)=>setSearch(e.target.value)}

                sx={{ mb:4 }}

            />

            {/* Cards */}

            {loading && (

                <Typography>

                    Loading...

                </Typography>

            )}

            {!loading && filteredResponders.map(responder => (

                <Paper

                    key={responder.id}

                    elevation={2}

                    sx={{

                        px:4,

                        py:3,

                        mb:2,

                        borderRadius:3

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
        direction="row"
        spacing={2}
        sx={{ flex: 1 }}
    >

        <Avatar
            sx={{
                width: 54,
                height: 54,
                bgcolor: "#1976d2",
                fontWeight: 700
            }}
        >
            {initials(responder.name)}
        </Avatar>

        <Stack spacing={0.5}>

            <Typography
                variant="h6"
                sx={{
                    fontWeight: 700
                }}
            >
                {responder.name}
            </Typography>

            <Typography sx={{
                color: "text.secondary"
            }}>
                {responder.job_title}
            </Typography>

            <Chip
    label={responder.department}
    size="small"
    color={
        responder.department === "Leadership"
            ? "secondary"
        : responder.department === "Operations"
            ? "primary"
        : responder.department === "Engineering"
            ? "info"
        : responder.department === "Quality"
            ? "success"
        : responder.department === "Safety"
            ? "warning"
        : responder.department === "Maintenance"
            ? "error"
        : "default"
    }
/>

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
            label={responder.active ? "ACTIVE" : "INACTIVE"}
            color={responder.active ? "success" : "default"}
            size="small"
            sx={{
                fontWeight: 700,
                px: 1,
                height: 28,
                letterSpacing: 1
            }}
        />

        <Stack
            direction="row"
            spacing={2}
            sx={{
                alignItems: "center"
            }}
        >

            <IconButton
    onClick={() => {

        setSelectedResponder(responder);

        setEditOpen(true);

    }}
>

    <EditIcon />

</IconButton>

            <IconButton
    color="error"
    onClick={() => {

        setDeleteResponderItem(responder);

        setDeleteOpen(true);

    }}
>

    <DeleteIcon />

</IconButton>

        </Stack>

    </Stack>

</Stack>

                </Paper>

            ))}

            <AddResponderDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSave={handleAdd}
            />

            <EditResponderDialog
                open={editOpen}
                responder={selectedResponder}
                onClose={() => {

                    setEditOpen(false);

                    setSelectedResponder(null);

                }}
                onSave={handleUpdate}
            />

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