import {
    createWorkCenter,
    updateWorkCenter,
    updateWorkCenterOrder
} from "../../api/workCenters";

import AddWorkCenterDialog from "./AddWorkCenterDialog";

import { getWorkCenters } from "../../api/workCenters";

import Collapse from "@mui/material/Collapse";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import EditWorkCenterDialog from "./EditWorkCenterDialog";

import {
    getProductionLines,
    createProductionLine,
    updateProductionLine,
    deleteProductionLine,
    updateProductionLineOrder,
    getArchivedProductionLines,
    restoreProductionLine
} from "../../api/productionLines";

import ArchivedList from "./ArchivedList";
import { AdminPanel, EmptyRow, Light, SearchBar, StatStrip, Tag, AdminRow } from "./adminUi";

import { tokens } from "../../theme/theme";
import ArchiveIcon from "@mui/icons-material/Archive";

import { useEffect, useState } from "react";

import {
    Box,
    Button,
    IconButton,
    Tooltip
} from "@mui/material";


import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
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
    const [archivedLines, setArchivedLines] = useState([]);
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

        setArchivedLines(await getArchivedProductionLines());

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
// Archive / Restore (#15): lines are never deleted
//------------------------------------------------------

async function handleRestore(line) {

    try {

        await restoreProductionLine(line.id);

        await loadLines();

    }

    catch (err) {

        alert(err.message);

    }

}

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
    // Render (E5)
    //------------------------------------------------------

    const iconSx = { color: tokens.muted, "&:hover": { color: tokens.text } };

    return (

        <AdminPanel
            title="Production lines"
            meta="Lines and work centers on the tablet, in this order"
            action={
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                    Add production line
                </Button>
            }
        >

            <StatStrip
                items={[
                    { label: "Lines", value: lines.length },
                    { label: "Active", value: activeCount, color: tokens.online },
                    { label: "Inactive", value: inactiveCount },
                    { label: "Facilities", value: facilityCount }
                ]}
            />

            <SearchBar value={search} onChange={setSearch} placeholder="Search line, facility or description" />

            {loading && <EmptyRow>Loading production lines…</EmptyRow>}

            {!loading && filteredLines.length === 0 && (
                <EmptyRow>{lines.length ? "No lines match the search." : "No production lines yet."}</EmptyRow>
            )}

            {!loading && filteredLines.map(line => {

                const position = lines.findIndex(l => l.id === line.id);
                const centers = workCenters[line.id] || [];
                const open = Boolean(expandedLines[line.id]);

                return (

                    <Box key={line.id}>

                        <AdminRow inactive={!line.active} sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: { md: "minmax(240px, 2fr) 110px 150px 120px 200px" } }}>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: "1 1 240px" }}>

                                <IconButton
                                    size="small"
                                    aria-label={`${open ? "Hide" : "Show"} work centers for ${line.name}`}
                                    aria-expanded={open}
                                    onClick={() => toggleExpanded(line.id)}
                                    sx={iconSx}
                                >
                                    {open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                                </IconButton>

                                <Box sx={{ width: 4, alignSelf: "stretch", minHeight: 28, bgcolor: line.color || tokens.blue, flexShrink: 0 }} title="Line color" />

                                <Box sx={{ minWidth: 0 }}>
                                    <Box sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 20, letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.2 }}>
                                        {line.name}
                                    </Box>
                                    {line.description && (
                                        <Box sx={{ fontSize: 13, color: tokens.muted }}>{line.description}</Box>
                                    )}
                                </Box>

                            </Box>

                            <Box><Tag>{line.facility}</Tag></Box>

                            <Box sx={{ fontFamily: tokens.mono, fontSize: 13, color: tokens.muted }}>
                                {centers.length} work center{centers.length === 1 ? "" : "s"}
                            </Box>

                            <Light color={line.active ? tokens.online : tokens.muted} label={line.active ? "Active" : "Inactive"} />

                            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>

                                <Tooltip title="Move up">
                                    <span>
                                        <IconButton size="small" aria-label={`Move ${line.name} up`} disabled={position === 0} onClick={() => moveLineUp(line.id)} sx={iconSx}>
                                            <KeyboardArrowUpIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>

                                <Tooltip title="Move down">
                                    <span>
                                        <IconButton size="small" aria-label={`Move ${line.name} down`} disabled={position === lines.length - 1} onClick={() => moveLineDown(line.id)} sx={iconSx}>
                                            <KeyboardArrowDownIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>

                                <Tooltip title="Edit line">
                                    <IconButton
                                        size="small"
                                        aria-label={`Edit ${line.name}`}
                                        onClick={() => {
                                            setSelectedLine(line);
                                            setEditOpen(true);
                                        }}
                                        sx={iconSx}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>

                                <Tooltip title="Archive line">
                                    <IconButton
                                        size="small"
                                        aria-label={`Archive ${line.name}`}
                                        onClick={() => {
                                            setDeleteLine(line);
                                            setDeleteOpen(true);
                                        }}
                                        sx={{ color: tokens.muted, "&:hover": { color: "#FFA040" } }}
                                    >
                                        <ArchiveIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>

                            </Box>

                        </AdminRow>

                        <Collapse in={open}>

                            <Box sx={{ bgcolor: tokens.ground, borderBottom: `1px solid ${tokens.line}` }}>

                                {centers.length === 0 && (
                                    <Box sx={{ pl: 9, py: 1.25, color: tokens.muted, fontSize: 14 }}>No work centers. The tablet can't raise alerts on this line until one is added.</Box>
                                )}

                                {centers.map((wc, i) => (

                                    <Box
                                        key={wc.id}
                                        sx={{ display: "flex", alignItems: "center", gap: 2, pl: 9, pr: 2.25, py: 0.75, borderTop: i ? `1px solid ${tokens.line}` : "none", opacity: wc.active ? 1 : 0.6 }}
                                    >

                                        <Box sx={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.muted, width: 20 }}>{String(i + 1).padStart(2, "0")}</Box>

                                        <Box sx={{ flex: 1, fontWeight: 500 }}>{wc.name}</Box>

                                        {!wc.active && <Light color={tokens.muted} label="Inactive" />}

                                        <IconButton size="small" aria-label={`Move ${wc.name} up`} disabled={i === 0} onClick={() => moveWorkCenterUp(line.id, wc.id)} sx={iconSx}>
                                            <KeyboardArrowUpIcon fontSize="small" />
                                        </IconButton>

                                        <IconButton size="small" aria-label={`Move ${wc.name} down`} disabled={i === centers.length - 1} onClick={() => moveWorkCenterDown(line.id, wc.id)} sx={iconSx}>
                                            <KeyboardArrowDownIcon fontSize="small" />
                                        </IconButton>

                                        <IconButton
                                            size="small"
                                            aria-label={`Edit ${wc.name}`}
                                            onClick={() => {
                                                setSelectedWorkCenter(wc);
                                                setEditWorkCenterOpen(true);
                                            }}
                                            sx={iconSx}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>

                                    </Box>

                                ))}

                                <Box sx={{ pl: 8, py: 1, borderTop: `1px solid ${tokens.line}` }}>
                                    <Button
                                        size="small"
                                        startIcon={<AddIcon />}
                                        onClick={() => {
                                            setSelectedProductionLine(line);
                                            setAddWorkCenterOpen(true);
                                        }}
                                    >
                                        Add work center
                                    </Button>
                                </Box>

                            </Box>

                        </Collapse>

                    </Box>

                );

            })}

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

            <ArchivedList
                items={archivedLines}
                label="lines"
                onRestore={handleRestore}
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

        </AdminPanel>
    );

}
