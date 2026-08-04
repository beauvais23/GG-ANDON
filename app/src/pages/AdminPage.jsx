import RespondersPanel from "../components/admin/RespondersPanel";
import ProductionLinesPanel from "../components/admin/ProductionLinesPanel";

import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
    Box,
    Typography,
    Paper,
    Button,
    Stack,
    Card,
    CardContent,
    Snackbar,
    Alert,
    Avatar,
    TextField,
    Chip
} from "@mui/material";

import { DataGrid } from "@mui/x-data-grid";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SearchIcon from "@mui/icons-material/Search";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";

import Header from "../components/Header";

import useClock from "../hooks/useClock";

import {
    getResponseTeam,
    createResponder,
    updateResponder,
    deleteResponder
} from "../api/responseTeam";

import AddResponderDialog from "../components/AddResponderDialog";
import EditResponderDialog from "../components/EditResponderDialog";
import DeleteResponderDialog from "../components/DeleteResponderDialog";



export default function AdminPage() {

    //------------------------------------------------------
    // State
    //------------------------------------------------------

    const clock = useClock();

    const [rows, setRows] = useState([]);

    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");

    const [addOpen, setAddOpen] = useState(false);

    const [editOpen, setEditOpen] = useState(false);

    const [deleteOpen, setDeleteOpen] = useState(false);

    const [selectedResponder, setSelectedResponder] = useState(null);

    const [deleteResponderItem, setDeleteResponderItem] = useState(null);

    const [adminSection, setAdminSection] = useState("responders");

    const [snackbar, setSnackbar] = useState({

        open: false,

        message: "",

        severity: "success"

    });

    //------------------------------------------------------
// Load Response Team
//------------------------------------------------------

async function loadResponseTeam() {

    try {

        setLoading(true);

        const data = await getResponseTeam();

        setRows(data);

    }

    catch (err) {

        console.error(err);

    }

    finally {

        setLoading(false);

    }

}

//------------------------------------------------------
// Initial Load
//------------------------------------------------------

useEffect(() => {

    loadResponseTeam();

}, []);

    //------------------------------------------------------
    // Snackbar
    //------------------------------------------------------

    function showSnackbar(message, severity = "success") {

        setSnackbar({

            open: true,

            message,

            severity

        });

    }

    //------------------------------------------------------
    // CRUD
    //------------------------------------------------------

    async function handleAdd(responder) {

        try {

            await createResponder(responder);

            setAddOpen(false);

            await loadResponseTeam();

            showSnackbar("Responder added successfully.");

        }

        catch (err) {

            alert(err.message);

        }

    }

    async function handleUpdate(responder) {

        try {

            await updateResponder(

                selectedResponder.id,

                responder

            );

            setEditOpen(false);

            await loadResponseTeam();

            showSnackbar("Responder updated successfully.");

        }

        catch (err) {

            alert(err.message);

        }

    }

    async function handleDelete() {

        try {

            await deleteResponder(deleteResponderItem.id);

            setDeleteOpen(false);

            setDeleteResponderItem(null);

            await loadResponseTeam();

            showSnackbar("Responder deleted successfully.");

        }

        catch (err) {

            alert(err.message);

        }

    }

    //------------------------------------------------------
    // Search
    //------------------------------------------------------

    const filteredRows = useMemo(() => {

        if (!search.trim()) return rows;

        return rows.filter((row) =>

    row.name.toLowerCase().includes(search.toLowerCase()) ||

    row.department.toLowerCase().includes(search.toLowerCase()) ||

    row.job_title.toLowerCase().includes(search.toLowerCase())

);

    }, [rows, search]);

//------------------------------------------------------
// Statistics
//------------------------------------------------------

const activeCount = rows.filter(
    r => r.active
).length;

const qualityCount = rows.filter(
    r => (r.department || "").toLowerCase() === "quality"
).length;

const maintenanceCount = rows.filter(
    r => (r.department || "").toLowerCase() === "maintenance"
).length;

const leadershipCount = rows.filter(
    r => (r.department || "").toLowerCase() === "leadership"
).length;

    //------------------------------------------------------
    // Avatar
    //------------------------------------------------------

    function initials(name) {

        return name

            .split(" ")

            .map(n => n[0])

            .join("")

            .substring(0, 2)

            .toUpperCase();

    }

//------------------------------------------------------
// Grid Columns
//------------------------------------------------------

const columns = [

    {
        field: "avatar",
        headerName: "",
        width: 80,
        sortable: false,
        filterable: false,

        renderCell: (params) => (

            <Avatar
                sx={{
                    bgcolor: "#1976d2",
                    width: 38,
                    height: 38,
                    fontSize: 14,
                    fontWeight: 700
                }}
            >
                {initials(params.row.name)}
            </Avatar>

        )

    },

    {
        field: "name",
        headerName: "Responder",
        flex: 1.8,
        minWidth: 220
    },

    {
        field: "department",
        headerName: "Department",
        width: 170,

        renderCell: (params) => {

            const department = (params.value || "").toLowerCase();

            let color = "default";

            if (department === "leadership")
                color = "secondary";

            else if (department === "operations")
                color = "primary";

            else if (department === "engineering")
                color = "info";

            else if (department === "quality")
                color = "success";

            else if (department === "safety")
                color = "warning";

            else if (department === "inventory")
                color = "default";

            else if (department === "maintenance")
                color = "error";

            return (

                <Chip
                    label={params.value}
                    color={color}
                    size="small"
                />

            );

        }

    },

    {
        field: "job_title",
        headerName: "Job Title",
        flex: 1.8
    },

    {
        field: "availability",
        headerName: "Presence",
        width: 160,

        renderCell: (params) => {

            // If responder is inactive, always show Inactive
            if (!params.row.active) {

                return (

                    <Chip
                        label="Inactive"
                        color="default"
                        size="small"
                    />

                );

            }

            const availability = params.value || "Available";

            let color = "success";

            if (availability === "Away")
                color = "warning";

            else if (availability === "Busy")
                color = "error";

            return (

                <Chip
                    label={availability}
                    color={color}
                    size="small"
                />

            );

        }

    },

    {
        field: "actions",
        headerName: "",
        width: 110,
        sortable: false,
        filterable: false,

        renderCell: (params) => (

            <>

                <Tooltip title="Edit">

                    <IconButton
                        color="primary"
                        onClick={() => {

                            setSelectedResponder(params.row);
                            setEditOpen(true);

                        }}
                    >

                        <EditIcon />

                    </IconButton>

                </Tooltip>

                <Tooltip title="Delete">

                    <IconButton
                        color="error"
                        onClick={() => {

                            setDeleteResponderItem(params.row);
                            setDeleteOpen(true);

                        }}
                    >

                        <DeleteIcon />

                    </IconButton>

                </Tooltip>

            </>

        )

    }

];



//------------------------------------------------------
// Render
//------------------------------------------------------

return (
    <Box
        sx={{
            minHeight: "100vh",
            bgcolor: "#ECEFF1"
        }}
    >

        <Header time={clock.time} />

        <Box sx={{ p: 4 }}>

            <Typography
                variant="h3"
                sx={{
                    fontWeight: 700
                }}
            >
                Administration
            </Typography>

            <Typography
    sx={{
        color: "text.secondary",
        mb: 2
    }}
>
    ManufacturingOS Configuration
</Typography>

<Paper
    elevation={2}
    sx={{
        p: 2,
        mb: 3,
        borderRadius: 3
    }}
>
    <Stack
        direction="row"
        spacing={1.5}
        sx={{
            flexWrap: "wrap",
            gap: 1.5
        }}
    >

        <Button
            component={Link}
            to="/"
            variant="contained"
        >
            Operator Assistance
        </Button>

        <Button
            component={Link}
            to="/supervisor"
            variant="contained"
            color="primary"
        >
            Production Response Center
        </Button>

        <Button
            component={Link}
            to="/wallboard"
            variant="contained"
            color="secondary"
        >
            TV Wallboard
        </Button>

        <Button
            component={Link}
            to="/executive"
            variant="contained"
            color="success"
        >
            Executive Dashboard
        </Button>

    </Stack>
</Paper>

            <Tabs
                value={adminSection}
                onChange={(e, value) => setAdminSection(value)}
                sx={{ mb: 3 }}
            >
                <Tab
                    label="Responders"
                    value="responders"
                />

                <Tab
                    label="Production Lines"
                    value="productionLines"
                />
            </Tabs>

            {adminSection === "responders" && (

    <RespondersPanel />

)}

            {adminSection === "productionLines" && (

    <ProductionLinesPanel />

)}

        </Box>

        <AddResponderDialog
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSave={handleAdd}
        />

        <EditResponderDialog
            open={editOpen}
            responder={selectedResponder}
            onClose={() => setEditOpen(false)}
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

        <Snackbar
            open={snackbar.open}
            autoHideDuration={3000}
            onClose={() =>
                setSnackbar({
                    ...snackbar,
                    open: false
                })
            }
            anchorOrigin={{
                vertical: "bottom",
                horizontal: "center"
            }}
        >

            <Alert
                severity={snackbar.severity}
                variant="filled"
                onClose={() =>
                    setSnackbar({
                        ...snackbar,
                        open: false
                    })
                }
            >
                {snackbar.message}
            </Alert>

        </Snackbar>

        <Box
            sx={{
                mt: 5,
                py: 2,
                bgcolor: "#263238",
                color: "white",
                textAlign: "center"
            }}
        >

            <Typography variant="body2">
                ManufacturingOS v6.2 • Administration • G&G Industrial Lighting
            </Typography>

        </Box>

    </Box>
);

}    