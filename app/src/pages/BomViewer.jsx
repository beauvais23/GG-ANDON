import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { Alert, Autocomplete, Box, Button, FormControlLabel, IconButton, Switch, TextField, Tooltip } from "@mui/material";

import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditNoteIcon from "@mui/icons-material/EditNote";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import CloseIcon from "@mui/icons-material/Close";

import Header from "../components/Header";
import Footer from "../components/Footer";
import useClock from "../hooks/useClock";

import { getAssemblies, getBom, refreshItems } from "../api/bom";
import { downloadCsv } from "../utils/csv";
import ChangeRequestPanel, { AddComponent } from "../components/bom/ChangeRequestPanel";
import { CHANGE_COLORS, CHANGE_LABELS } from "../components/bom/changeColors";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// BOM viewer (Nov 5 2026): pick a line, then a config
// (QuickBooks assembly SKU), see its indented multi-level BOM
// (up to 5 levels). Read only; QuickBooks data through CData,
// fetched when the SKU is opened and kept 1 hour. ?sku= opens
// one directly.
// REQUEST A CHANGE (Nov 6 2026): level-1 lines only; type a new
// qty (amber) or Delete (red) per line, Add components (green),
// then reason / name → Send alert (BOM alert Chat space).
//------------------------------------------------------

const ALL = "All";

const when = ms => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const num = v => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 }));

function Chip({ active, children, onClick }) {

    return (
        <Button size="small" variant={active ? "contained" : "outlined"} color={active ? "primary" : "inherit"} onClick={onClick}
            sx={{ borderColor: tokens.lineStrong, color: active ? undefined : tokens.text, letterSpacing: "1.5px" }}>
            {children}
        </Button>
    );

}

const COLS = [
    { label: "Level", width: "64px" },
    { label: "Line #", width: "64px" },
    { label: "Component", width: "minmax(180px, 1.4fr)" },
    { label: "Description", width: "minmax(220px, 2.4fr)" },
    { label: "Qty per", width: "90px" },
    { label: "Ext qty", width: "90px" },
    { label: "UoM", width: "110px" },
    { label: "On hand", width: "90px" },
    { label: "Sub-assy", width: "84px" }
];

const GRID = COLS.map(c => c.width).join(" ");
const EDIT_GRID = `${GRID} 190px`;

const tint = color => `${color}1F`;

function rowSx(color, editing, level) {

    return {
        display: "grid", gridTemplateColumns: editing ? EDIT_GRID : GRID, gap: 1, alignItems: "center", px: 2.25, py: 0.75,
        borderBottom: `1px solid ${tokens.line}`, fontSize: 14,
        borderLeft: `4px solid ${color || "transparent"}`,
        bgcolor: color ? tint(color) : level === 1 ? "transparent" : "rgba(255,255,255,0.015)"
    };

}

function ChangeCell({ r, mark, onMark }) {

    if (mark?.action === "DELETE")
        return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ color: CHANGE_COLORS.DELETE, fontWeight: 700, fontSize: 13 }}>DELETE</Box>
                <Button size="small" color="inherit" startIcon={<UndoIcon />} onClick={() => onMark(r, null)}>Undo</Button>
            </Box>
        );

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TextField size="small" placeholder={`qty ${num(r.qty)}`} value={mark?.newQty ?? ""} sx={{ width: 110 }} slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `New qty for ${r.component}` } }}
                onChange={e => {

                    const v = e.target.value.trim();

                    onMark(r, v === "" ? null : { action: "CHANGE_QTY", newQty: v });

                }} />
            <Tooltip title="Delete this line">
                <IconButton size="small" aria-label={`Delete ${r.component}`} onClick={() => onMark(r, { action: "DELETE" })} sx={{ color: CHANGE_COLORS.DELETE }}><DeleteIcon fontSize="small" /></IconButton>
            </Tooltip>
        </Box>
    );

}

function AddedRow({ a, onRemove }) {

    return (
        <Box sx={rowSx(CHANGE_COLORS.ADD, true, 1)}>
            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>1</Box>
            <Box sx={{ color: CHANGE_COLORS.ADD, fontWeight: 700, fontSize: 12 }}>NEW</Box>
            <Box sx={{ fontFamily: tokens.mono, fontWeight: 700, color: CHANGE_COLORS.ADD }}>{a.component}</Box>
            <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.description || ""}>{a.description || "—"}</Box>
            <Box sx={{ fontFamily: tokens.mono, color: CHANGE_COLORS.ADD, fontWeight: 700 }}>{num(a.newQty)}</Box>
            <Box />
            <Box sx={{ color: tokens.muted }}>{a.uom || "—"}</Box>
            <Box />
            <Box />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ color: CHANGE_COLORS.ADD, fontWeight: 700, fontSize: 13 }}>ADD</Box>
                <Button size="small" color="inherit" startIcon={<CloseIcon />} onClick={onRemove}>Remove</Button>
            </Box>
        </Box>
    );

}

function BomRow({ r, editing, mark, onMark }) {

    const flag = r.cycle ? "Loop: not expanded" : r.truncated ? "More levels below" : r.notLoaded ? "Not loaded" : r.unknown ? "Not in QuickBooks" : !r.active ? "Inactive" : "";
    const color = mark ? CHANGE_COLORS[mark.action] : null;
    const struck = mark?.action === "DELETE" ? { textDecoration: "line-through", color: tokens.muted } : {};
    const changed = mark?.action === "CHANGE_QTY" && mark.newQty !== "";

    return (
        <Box sx={rowSx(color, editing, r.level)}>
            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{r.level}</Box>
            <Box sx={{ fontFamily: tokens.mono, color: tokens.muted }}>{r.line >= 10000 ? "—" : r.line}</Box>
            <Box sx={{ fontFamily: tokens.mono, pl: (r.level - 1) * 2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.isAssembly ? 700 : 400, ...struck }} title={r.component}>
                {r.level > 1 && <Box component="span" sx={{ color: tokens.lineStrong, mr: 0.75 }}>└</Box>}
                {r.component}
            </Box>
            <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: r.description ? tokens.text : tokens.muted, ...struck }} title={r.description || ""}>
                {r.description || "—"}
                {flag && <Box component="span" sx={{ ml: 1, fontSize: 12, color: "#E3A008" }}>({flag})</Box>}
            </Box>
            <Box sx={{ fontFamily: tokens.mono, ...struck }}>
                {changed ? <Box component="span" sx={{ color: CHANGE_COLORS.CHANGE_QTY, fontWeight: 700 }}>{num(r.qty)} → {mark.newQty}</Box> : num(r.qty)}
            </Box>
            <Box sx={{ fontFamily: tokens.mono, ...struck }}>{num(r.extQty)}</Box>
            <Box sx={{ color: tokens.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.uom || ""}>{r.uom || "—"}</Box>
            <Box sx={{ fontFamily: tokens.mono }}>{num(r.onHand)}</Box>
            <Box>{r.isAssembly ? "Yes" : ""}</Box>
            {editing && <ChangeCell r={r} mark={mark} onMark={onMark} />}
        </Box>
    );

}

export default function BomViewer() {

    const clock = useClock();
    const [params, setParams] = useSearchParams();
    const sku = params.get("sku") || "";

    const isAdmin = (() => { try { return localStorage.getItem("userRole") === "admin"; } catch { return false; } })();

    const [list, setList] = useState(null);
    const [group, setGroup] = useState(ALL);
    const [bom, setBom] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [listError, setListError] = useState("");
    const [allLevels, setAllLevels] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState(false);
    const [marks, setMarks] = useState({});
    const [adds, setAdds] = useState([]);
    const [sentCode, setSentCode] = useState(null);

    function resetChanges() {

        setMarks({});
        setAdds([]);
        setEditing(false);

    }

    const loadList = useCallback(async () => {

        try {

            setList(await getAssemblies());
            setListError("");

        } catch (err) {

            setListError(err.message);

        }

    }, []);

    useEffect(() => { loadList(); }, [loadList]);

    useEffect(() => {

        setMarks({});
        setAdds([]);
        setEditing(false);
        setSentCode(null);

        if (!sku) {

            setBom(null);
            return;

        }

        let live = true;

        setLoading(true);
        setError("");

        getBom(sku).then(
            data => { if (live) { setBom(data); setGroup(g => (g === ALL ? g : data.lineGroup)); } },
            err => { if (live) { setBom(null); setError(err.message); } }
        ).finally(() => { if (live) setLoading(false); });

        return () => { live = false; };

    }, [sku]);

    const options = useMemo(() => (list ? list.assemblies.filter(a => group === ALL || a.lineGroup === group) : []), [list, group]);
    const selected = list?.assemblies.find(a => a.sku === sku) || null;
    const rows = bom ? (allLevels && !editing ? bom.rows : bom.rows.filter(r => r.level === 1)) : [];

    const changes = [
        ...Object.entries(marks).map(([line, m]) => {

            const r = bom.rows.find(x => x.level === 1 && x.line === Number(line));

            return { action: m.action, line: Number(line), component: r.component, newQty: m.action === "CHANGE_QTY" ? m.newQty : undefined };

        }),
        ...adds.map(a => ({ action: "ADD", component: a.component, newQty: a.newQty }))
    ];

    const onBomOrAdded = useMemo(() => new Set([...(bom ? bom.rows.filter(r => r.level === 1).map(r => r.component) : []), ...adds.map(a => a.component)]), [bom, adds]);

    function mark(r, m) {

        setMarks(prev => {

            const next = { ...prev };

            if (m)
                next[r.line] = m;
            else
                delete next[r.line];

            return next;

        });

    }
    const status = list?.status;

    async function refresh() {

        setRefreshing(true);

        try {

            await refreshItems();
            await loadList();

        } catch (err) {

            setListError(err.message);
            await loadList();

        } finally {

            setRefreshing(false);

        }

    }

    function csv() {

        downloadCsv(`BOM_${bom.sku}.csv`, [
            { label: "Level", key: "level" },
            { label: "Line #", value: r => (r.line >= 10000 ? "" : r.line) },
            { label: "Parent", key: "parent" },
            { label: "Component", key: "component" },
            { label: "Description", key: "description" },
            { label: "Qty per", key: "qty" },
            { label: "Ext qty", key: "extQty" },
            { label: "UoM", key: "uom" },
            { label: "On hand", key: "onHand" },
            { label: "Sub-assembly", value: r => (r.isAssembly ? "Yes" : "") }
        ], rows);

    }

    return (

        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.ground }}>

            <Header time={clock.time} />

            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: 2.5, width: "100%", maxWidth: 1400, mx: "auto" }}>

                {status && !status.configured && (
                    <Alert severity="warning" sx={{ mb: 2 }}>QuickBooks connection is not set up on this server (CDATA_USER / CDATA_PAT). The BOM viewer can't load data until it is.</Alert>
                )}

                {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

                {status?.configured && status.items === 0 && !listError && (
                    <Alert severity="info" sx={{ mb: 2 }}>The QuickBooks item list hasn't loaded yet.{isAdmin ? " Press Refresh items." : " An admin can press Refresh items."}</Alert>
                )}

                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>

                    {[ALL, ...(list?.lineGroups || [])].map(g => <Chip key={g} active={g === group} onClick={() => setGroup(g)}>{g}</Chip>)}

                    <Box sx={{ flex: 1 }} />

                    {isAdmin && (
                        <Button variant="outlined" color="inherit" startIcon={<RefreshIcon />} disabled={refreshing || !status?.configured} onClick={refresh} sx={{ borderColor: tokens.lineStrong }}>
                            {refreshing ? "Refreshing…" : "Refresh items"}
                        </Button>
                    )}

                </Box>

                <Autocomplete
                    options={options}
                    value={selected}
                    onChange={(e, v) => setParams(v ? { sku: v.sku } : {})}
                    getOptionLabel={o => `${o.sku}${o.description ? ` — ${o.description}` : ""}`}
                    isOptionEqualToValue={(a, b) => a.sku === b.sku}
                    renderInput={p => <TextField {...p} label={`Config (assembly SKU) · ${options.length.toLocaleString()} in ${group}`} placeholder="Type to search" />}
                    sx={{ mb: 1, maxWidth: 720 }}
                />

                <Box sx={{ fontSize: 13, color: tokens.muted, mb: 2 }}>
                    QuickBooks item list as of {when(status?.itemsOk?.finished_at)}
                    {status?.itemsLast && !status.itemsLast.ok && <Box component="span" sx={{ color: "#E3A008" }}> · last refresh failed {when(status.itemsLast.finished_at)}: {status.itemsLast.error}</Box>}
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {loading && <Box sx={{ color: tokens.muted, mb: 2 }}>Loading BOM from QuickBooks…</Box>}

                {bom && !loading && (

                    <Box component="section" aria-label="Bill of materials" sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.line}` }}>

                        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: 2.25, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
                            <Box>
                                <Box component="h2" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 22, letterSpacing: "1.5px" }}>{bom.sku}</Box>
                                <Box sx={{ fontSize: 13, color: tokens.muted }}>{bom.description || "—"} · {bom.lineGroup}</Box>
                            </Box>
                            <Box sx={{ flex: 1 }} />
                            {!editing && <FormControlLabel control={<Switch checked={allLevels} onChange={e => setAllLevels(e.target.checked)} />} label="All levels" />}
                            {!editing && <Button size="small" startIcon={<DownloadIcon />} onClick={csv}>CSV</Button>}
                            {!editing && <Button variant="contained" startIcon={<EditNoteIcon />} onClick={() => { setEditing(true); setSentCode(null); }}>Request a change</Button>}
                            {editing && <Box sx={{ fontSize: 13, color: tokens.muted }}>Change mode: level-1 lines of {bom.sku}. {Object.entries(CHANGE_LABELS).map(([k, v]) => <Box key={k} component="span" sx={{ color: CHANGE_COLORS[k], fontWeight: 700, ml: 1 }}>■ {v}</Box>)}</Box>}
                        </Box>

                        <Box sx={{ px: 2.25, py: 1, fontSize: 13, color: bom.stale ? "#E3A008" : tokens.muted, borderBottom: `1px solid ${tokens.line}` }}>
                            BOM read from QuickBooks {when(bom.asOf)}
                            {bom.stale && " · QuickBooks unreachable, showing the last copy"}
                            {bom.error && ` (${bom.error})`}
                            {` · ${bom.rows.filter(r => r.level === 1).length} lines at level 1, ${bom.rows.length} in all`}
                            {bom.cycles > 0 && ` · ${bom.cycles} loop(s) stopped`}
                            {bom.truncated > 0 && ` · deeper than 5 levels: ${bom.truncated}`}
                        </Box>

                        {sentCode && !editing && (
                            <Alert severity="success" sx={{ m: 2 }} action={<Button component={RouterLink} to={`/bom/requests?code=${sentCode}`} color="inherit">Open {sentCode}</Button>}>{sentCode} sent to the BOM alert space.</Alert>
                        )}

                        <Box sx={{ overflowX: "auto" }}>
                            <Box sx={{ minWidth: editing ? 1200 : 1000 }}>
                                <Box sx={{ display: "grid", gridTemplateColumns: editing ? EDIT_GRID : GRID, gap: 1, ...labelSx, fontSize: 11, px: 2.25, py: 1, borderBottom: `1px solid ${tokens.line}`, borderLeft: "4px solid transparent" }}>
                                    {COLS.map(c => <span key={c.label}>{c.label}</span>)}
                                    {editing && <span>Change</span>}
                                </Box>
                                {rows.length === 0 && <Box sx={{ px: 2.25, py: 2, color: tokens.muted }}>This assembly has no BOM lines in QuickBooks.</Box>}
                                {rows.map((r, i) => <BomRow key={`${r.parent}-${r.line}-${i}`} r={r} editing={editing} mark={editing ? marks[r.line] : null} onMark={mark} />)}
                                {editing && adds.map((a, i) => <AddedRow key={a.component} a={a} onRemove={() => setAdds(prev => prev.filter((_, j) => j !== i))} />)}
                            </Box>
                        </Box>

                        {editing && <AddComponent exclude={onBomOrAdded} onAdd={a => setAdds(prev => [...prev, a])} />}

                        {editing && (
                            <ChangeRequestPanel
                                sku={bom.sku}
                                changes={changes}
                                onSent={r => { setSentCode(r.code); resetChanges(); }}
                                onCancel={resetChanges}
                            />
                        )}

                    </Box>

                )}

                {!sku && !loading && list && (
                    <Box sx={{ color: tokens.muted }}>Pick a line, then type a config SKU to see its BOM.</Box>
                )}

            </Box>

            <Footer />

        </Box>

    );

}
