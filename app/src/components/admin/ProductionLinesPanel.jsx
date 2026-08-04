import {
    createWorkCenter,
    updateWorkCenter,
    updateWorkCenterOrder
} from "../../api/workCenters";

import AddWorkCenterDialog from "./AddWorkCenterDialog";

import { getWorkCenters } from "../../api/workCenters";

import Collapse from "@mui/material/Collapse";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import EditWorkCenterDialog from "./EditWorkCenterDialog";

import {
    getProductionLines,
    createProductionLine,
    updateProductionLine,
    deleteProductionLine,
    updateProductionLineOrder
} from "../../api/productionLines";

import { useEffect, useState } from "react";

import {
    Paper,
    Typography,
    Stack,
    Button,
    Chip,
    IconButton,
    Box,
    TextField
} from "@mui/material";


import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";



import AddProductionLineDialog from "./AddProductionLineDialog";
import EditProductionLineDialog from "./EditProductionLineDialog";
import DeleteProductionLineDialog from "./DeleteProductionLineDialog";

export default function ProductionLinesPanel() {

    //------------------------------------------------------
    // State
    //------------------------------------------------------

    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");

    const [addOpen, setAddOpen] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [selectedLine, setSelectedLine] = useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteLine, setDeleteLine] = useState(null);

    const [expandedLines, setExpandedLines] = useState({});

    const [workCenters, setWorkCenters] = useState({});

    const [addWorkCenterOpen, setAddWorkCenterOpen] = useState(false);
    const [selectedProductionLine, setSelectedProductionLine] = useState(null);

    const [editWorkCenterOpen, setEditWorkCenterOpen] = useState(false);
    const [selectedWorkCenter, setSelectedWorkCenter] = useState(null);

    //------------------------------------------------------
    // Load Production Lines
    //------------------------------------------------------

    async function loadLines() {

    setLoading(true);

    try {

        const data = await getProductionLines();

        data.sort(
            (a, b) => a.display_order - b.display_order
        );

        setLines(data);

        //------------------------------------
        // Load Work Centers
        //------------------------------------

        const wc = await getWorkCenters();

        const grouped = {};

        wc.forEach(item => {

            if (!grouped[item.production_line_id]) {

                grouped[item.production_line_id] = [];

            }

            grouped[item.production_line_id].push(item);

        });

        setWorkCenters(grouped);

    }

    finally {

        setLoading(false);

    }

}

    //------------------------------------------------------
    // Initial Load
    //------------------------------------------------------

    useEffect(() => {

        loadLines();

    }, []);

    //------------------------------------------------------
    // Statistics
    //------------------------------------------------------

    const activeCount =
        lines.filter(line => line.active).length;

    const inactiveCount =
        lines.filter(line => !line.active).length;

    const facilityCount =
        new Set(lines.map(line => line.facility)).size;

    //------------------------------------------------------
    // Search
    //------------------------------------------------------

    const filteredLines = lines.filter(line => {

        const text = search.toLowerCase();

        return (

            line.name.toLowerCase().includes(text) ||

            line.facility.toLowerCase().includes(text) ||

            (line.description || "")
                .toLowerCase()
                .includes(text)

        );

    });

//------------------------------------------------------
// Add
//------------------------------------------------------

async function handleAdd(line) {

    try {

        await createProductionLine(line);

        setAddOpen(false);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Update
//------------------------------------------------------

async function handleUpdate(line) {

    try {

        await updateProductionLine(
            selectedLine.id,
            line
        );

        setEditOpen(false);
        setSelectedLine(null);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Delete
//------------------------------------------------------

async function handleDelete() {

    try {

        await deleteProductionLine(deleteLine.id);

        setDeleteOpen(false);
        setDeleteLine(null);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Add Work Center
//------------------------------------------------------

async function handleAddWorkCenter(workCenter) {

    try {

        await createWorkCenter(workCenter);

        setAddWorkCenterOpen(false);

        setSelectedProductionLine(null);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Move Work Center Up
//------------------------------------------------------

function moveWorkCenterUp(productionLineId, workCenterId) {

    const current = [...(workCenters[productionLineId] || [])];

    const index = current.findIndex(
        wc => wc.id === workCenterId
    );

    if (index <= 0) return;

    [current[index - 1], current[index]] =
    [current[index], current[index - 1]];

    current.forEach((wc, i) => {

        wc.display_order = i + 1;

    });

    setWorkCenters({

        ...workCenters,

        [productionLineId]: current

    });

    updateWorkCenterOrder(current)
        .catch(console.error);

}

//------------------------------------------------------
// Update Work Center
//------------------------------------------------------

async function handleUpdateWorkCenter(workCenter) {

    try {

        await updateWorkCenter(

            workCenter.id,
            workCenter

        );

        setEditWorkCenterOpen(false);
        setSelectedWorkCenter(null);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

//------------------------------------------------------
// Move Work Center Down
//------------------------------------------------------

function moveWorkCenterDown(productionLineId, workCenterId) {

    const current = [...(workCenters[productionLineId] || [])];

    const index = current.findIndex(
        wc => wc.id === workCenterId
    );

    if (index >= current.length - 1) return;

    [current[index], current[index + 1]] =
    [current[index + 1], current[index]];

    current.forEach((wc, i) => {

        wc.display_order = i + 1;

    });

    setWorkCenters({

        ...workCenters,

        [productionLineId]: current

    });

    updateWorkCenterOrder(current)
        .catch(console.error);

}

//------------------------------------------------------
// Expand / Collapse
//------------------------------------------------------

function toggleExpanded(id) {

    setExpandedLines(prev => ({

        ...prev,

        [id]: !prev[id]

    }));

}

//------------------------------------------------------
// Move Up
//------------------------------------------------------

function moveLineUp(lineId) {

    const currentIndex = lines.findIndex(
        line => line.id === lineId
    );

    if (currentIndex <= 0) return;

    const updated = [...lines];

    [
        updated[currentIndex - 1],
        updated[currentIndex]
    ] = [
        updated[currentIndex],
        updated[currentIndex - 1]
    ];

    updated.forEach((line, index) => {
        line.display_order = index + 1;
    });

    setLines(updated);

    updateProductionLineOrder(updated)
        .catch(console.error);

}

//------------------------------------------------------
// Move Down
//------------------------------------------------------

function moveLineDown(lineId) {

    const currentIndex = lines.findIndex(
        line => line.id === lineId
    );

    if (currentIndex >= lines.length - 1) return;

    const updated = [...lines];

    [
        updated[currentIndex],
        updated[currentIndex + 1]
    ] = [
        updated[currentIndex + 1],
        updated[currentIndex]
    ];

    updated.forEach((line, index) => {
        line.display_order = index + 1;
    });

    setLines(updated);

    updateProductionLineOrder(updated)
        .catch(console.error);

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
                    mb: 3
                }}>

                <Box sx={{ flexGrow: 1 }}>

                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 700
                        }}
                    >
                        Production Lines
                    </Typography>

                    <Typography
                        variant="body2"
                        sx={{
                            color: "text.secondary"
                        }}
                    >
                        {lines.length} Total • {activeCount} Active • {inactiveCount} Inactive • {facilityCount} Facility{facilityCount !== 1 ? "ies" : ""}
                    </Typography>

                </Box>

                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setAddOpen(true)}
                >
                    Add Production Line
                </Button>

            </Stack>

            {/* Search */}

            <TextField
                fullWidth
                placeholder="Search Production Lines..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 3 }}
            />

            {/* Search */}

            {loading && (
                <Typography>Loading...</Typography>
            )}

            {!loading &&
    filteredLines.map((line, index) => (

        <Paper
            key={line.id}
            elevation={2}
            sx={{
                px: 3,
                py: 2,
                mb: 2.5,
                borderRadius: 3,
                transition: "all .25s ease",
                "&:hover": {
                    boxShadow: 6,
                    transform: "translateY(-2px)"
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
                    sx={{ flex: 1 }}
                >

                    <Stack
    direction="row"
    spacing={1}
    sx={{
        alignItems: "center"
    }}
>

    <IconButton
    onClick={() => toggleExpanded(line.id)}
>

    {expandedLines[line.id]

        ? <ExpandMoreIcon />

        : <ChevronRightIcon />

    }

</IconButton>

    <Typography
        variant="h5"
        sx={{
            fontWeight: 700
        }}
    >
        {line.name}
    </Typography>

</Stack>

                    <Typography sx={{
                        color: "text.secondary"
                    }}>
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
                    />

                    <Stack
    direction="row"
    spacing={0.5}
    sx={{
        alignItems: "center"
    }}
>

    <IconButton
        size="small"
        disabled={lines.findIndex(l => l.id === line.id) === 0}
        onClick={() => moveLineUp(line.id)}
    >
        <KeyboardArrowUpIcon />
    </IconButton>

    <IconButton
        size="small"
        disabled={
    lines.findIndex(l => l.id === line.id) === lines.length - 1
}
        onClick={() => moveLineDown(line.id)}
    >
        <KeyboardArrowDownIcon />
    </IconButton>

    <Box
        sx={{
            width: 34,
            height: 34,
            bgcolor: line.color,
            borderRadius: 2,
            border: "1px solid #bbb",
            boxShadow: 2,
            mx: 1
        }}
    />

    <IconButton
        onClick={() => {
            setSelectedLine(line);
            setEditOpen(true);
        }}
    >
        <EditIcon />
    </IconButton>

    <IconButton
        color="error"
        onClick={() => {
            setDeleteLine(line);
            setDeleteOpen(true);
        }}
    >
        <DeleteIcon />
    </IconButton>

</Stack>

                </Stack>

            </Stack>

           <Collapse in={expandedLines[line.id]}>

    <List dense>

        {(workCenters[line.id] || []).map((wc) => (

            <ListItem
                key={wc.id}
                secondaryAction={

    <Stack
        direction="row"
        spacing={0.5}
    >

        <IconButton
            size="small"
            disabled={
                (workCenters[line.id] || []).findIndex(
                    x => x.id === wc.id
                ) === 0
            }
            onClick={() =>
                moveWorkCenterUp(line.id, wc.id)
            }
        >
            <KeyboardArrowUpIcon fontSize="small" />
        </IconButton>

        <IconButton
            size="small"
            disabled={
                (workCenters[line.id] || []).findIndex(
                    x => x.id === wc.id
                ) === (workCenters[line.id] || []).length - 1
            }
            onClick={() =>
                moveWorkCenterDown(line.id, wc.id)
            }
        >
            <KeyboardArrowDownIcon fontSize="small" />
        </IconButton>

        <IconButton
            size="small"
            onClick={() => {

                setSelectedWorkCenter(wc);
                setEditWorkCenterOpen(true);

            }}
        >
            <EditIcon fontSize="small" />
        </IconButton>

        <IconButton
            size="small"
            color="error"
        >
            <DeleteIcon fontSize="small" />
        </IconButton>

    </Stack>

}
            >

                <ListItemText
                    primary={wc.name}
                />

            </ListItem>

        ))}

        <Button
    startIcon={<AddIcon />}
    sx={{ ml: 2, mt: 1 }}
    onClick={() => {

        setSelectedProductionLine(line);
        setAddWorkCenterOpen(true);

    }}
>
    Add Work Center
</Button>

    </List>

</Collapse>

        </Paper>

    ))
}

            <AddWorkCenterDialog
                open={addWorkCenterOpen}
                productionLine={selectedProductionLine}
                onClose={() => {

                    setAddWorkCenterOpen(false);
                    setSelectedProductionLine(null);

                }}
                onSave={handleAddWorkCenter}
            />

            <AddProductionLineDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSave={handleAdd}
            />

            <EditProductionLineDialog
                open={editOpen}
                line={selectedLine}
                onClose={() => {

                    setEditOpen(false);
                    setSelectedLine(null);

                }}
                onSave={handleUpdate}
            />

            <DeleteProductionLineDialog
                open={deleteOpen}
                line={deleteLine}
                onClose={() => {

                    setDeleteOpen(false);
                    setDeleteLine(null);

                }}
                onDelete={handleDelete}
            />

            <EditWorkCenterDialog
    open={editWorkCenterOpen}
    workCenter={selectedWorkCenter}
    onClose={() => {

        setEditWorkCenterOpen(false);
        setSelectedWorkCenter(null);

    }}
    onSave={handleUpdateWorkCenter}
/>

        </Paper>
    );

}

