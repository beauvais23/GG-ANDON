import { useEffect, useState } from "react";

import {
    Box,
    Button,
    IconButton,
    Tooltip
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ArchiveIcon from "@mui/icons-material/Archive";

import {
    getResponseTeam,
    createResponder,
    updateResponder,
    deleteResponder,
    getArchivedResponders,
    restoreResponder
} from "../../api/responseTeam";

import ArchivedList from "./ArchivedList";
import { AdminPanel, EmptyRow, Light, SearchBar, StatStrip, Tag, AdminRow } from "./adminUi";

import { tokens } from "../../theme/theme";

import AddResponderDialog from "../AddResponderDialog";
import EditResponderDialog from "../EditResponderDialog";
import DeleteResponderDialog from "../DeleteResponderDialog";

//------------------------------------------------------
// Status lights (same colors as the Response Center)
//------------------------------------------------------

const LIGHTS = {
    available: "#3FB950",
    responding: tokens.blueText,
    busy: "#FF6B61",
    away: "#F2C232"
};

function availabilityLight(responder) {

    if (!responder.active)
        return { color: tokens.muted, label: "Inactive" };

    const label = responder.availability || "Available";

    return { color: LIGHTS[label.toLowerCase()] || tokens.muted, label };

}

// Name · department · phone · status · actions, aligned on wide screens.
const COLUMNS = { md: "minmax(220px, 2fr) minmax(140px, 1fr) minmax(130px, 1fr) 130px 96px" };

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

    const [archivedResponders, setArchivedResponders] = useState([]);

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

            setArchivedResponders(await getArchivedResponders());

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
    // Archive / Restore Responder (#15): never deleted
    //------------------------------------------------------

    async function handleRestore(responder) {

        try {

            await restoreResponder(responder.id);

            await loadResponders();

        } catch (err) {

            alert(err.message);

        }

    }

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
    // Render (E5)
    //------------------------------------------------------

    return (

        <AdminPanel
            title="Response team"
            meta="Who can acknowledge, resolve and cancel alerts"
            action={
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                    Add responder
                </Button>
            }
        >

            <StatStrip
                items={[
                    { label: "Responders", value: responders.length },
                    { label: "Active", value: activeCount },
                    { label: "Available", value: availableCount, color: LIGHTS.available },
                    { label: "Responding", value: respondingCount, color: LIGHTS.responding },
                    { label: "Departments", value: departmentCount }
                ]}
            />

            <SearchBar value={search} onChange={setSearch} placeholder="Search name, title, department or status" />

            {loading && <EmptyRow>Loading response team…</EmptyRow>}

            {!loading && filteredResponders.length === 0 && (
                <EmptyRow>{responders.length ? "No responders match the search." : "No responders yet. Add the first one."}</EmptyRow>
            )}

            {!loading && filteredResponders.map(responder => {

                const status = availabilityLight(responder);

                return (

                    <AdminRow
                        key={responder.id}
                        inactive={!responder.active}
                        sx={{ display: { xs: "flex", md: "grid" }, gridTemplateColumns: COLUMNS }}
                    >

                        <Box sx={{ minWidth: 0, flex: "1 1 220px" }}>
                            <Box sx={{ fontWeight: 600 }}>{responder.name}</Box>
                            {responder.job_title && (
                                <Box sx={{ fontSize: 13, color: tokens.muted }}>{responder.job_title}</Box>
                            )}
                        </Box>

                        <Box>
                            {responder.department ? <Tag>{responder.department}</Tag> : <Box component="span" sx={{ color: tokens.muted }}>—</Box>}
                        </Box>

                        <Box sx={{ fontFamily: tokens.mono, fontSize: 13, color: tokens.muted }}>
                            {responder.phone || "—"}
                        </Box>

                        <Light color={status.color} label={status.label} />

                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>

                            <Tooltip title="Edit responder">
                                <IconButton
                                    size="small"
                                    aria-label={`Edit ${responder.name}`}
                                    onClick={() => {
                                        setSelectedResponder(responder);
                                        setEditOpen(true);
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>

                            <Tooltip title="Archive responder">
                                <IconButton
                                    size="small"
                                    aria-label={`Archive ${responder.name}`}
                                    sx={{ color: tokens.muted, "&:hover": { color: "#FFA040" } }}
                                    onClick={() => {
                                        setDeleteResponderItem(responder);
                                        setDeleteOpen(true);
                                    }}
                                >
                                    <ArchiveIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>

                        </Box>

                    </AdminRow>

                );

            })}

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

            <ArchivedList
                items={archivedResponders}
                label="responders"
                onRestore={handleRestore}
            />

            {/* Archive Dialog */}

            <DeleteResponderDialog
                open={deleteOpen}
                responder={deleteResponderItem}
                onClose={() => {

                    setDeleteOpen(false);

                    setDeleteResponderItem(null);

                }}
                onDelete={handleDelete}
            />

        </AdminPanel>

    );

}
