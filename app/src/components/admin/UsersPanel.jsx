import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Box, Button } from "@mui/material";

import { AdminPanel, AdminRow, EmptyRow, Light, SearchBar, StatStrip, Tag } from "./adminUi";

import { getUsers, updateUser } from "../../api/users";
import { tokens } from "../../theme/theme";

//------------------------------------------------------
// Admin → Users (Director, Nov 11 2026)
//
// Everyone who has signed in with a ggled.net Google account.
// New people get normal access (same as the old production
// login); make admin / remove admin / block take effect at once.
// Permanent admins (ADMIN_EMAILS in Railway) can't be changed
// here, and nobody can remove their own admin rights.
//------------------------------------------------------

const when = ms => (ms ? new Date(Number(ms)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "—");

export default function UsersPanel() {

    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [busy, setBusy] = useState("");

    const me = (() => { try { return localStorage.getItem("userEmail"); } catch { return null; } })();

    const load = useCallback(async () => {

        try { setData(await getUsers()); setError(""); }

        catch (err) { setError(err.message); }

    }, []);

    useEffect(() => { load(); }, [load]);

    async function change(email, body) {

        setBusy(email);

        try { await updateUser(email, body); await load(); }

        catch (err) { setError(err.message); }

        setBusy("");

    }

    const users = useMemo(() => (data?.users || []).filter(u => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
    const all = data?.users || [];

    return (

        <AdminPanel title="Users" meta={data ? `Anyone with a ${data.domain} Google account can sign in. They appear here after their first sign-in.` : null}>

            <StatStrip items={[
                { label: "Signed in", value: all.filter(u => u.active).length },
                { label: "Admins", value: all.filter(u => u.active && u.role === "admin").length, color: tokens.blue },
                { label: "Blocked", value: all.filter(u => !u.active).length, color: all.some(u => !u.active) ? "#F85149" : undefined }
            ]} />

            <SearchBar value={q} onChange={setQ} placeholder="Search name or email" />

            {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

            {data && !users.length && <EmptyRow>{all.length ? "No match." : "Nobody has signed in with Google yet."}</EmptyRow>}

            {users.map(raw => ({ ...raw, active: Boolean(raw.active) })).map(u => (

                <AdminRow key={u.email} inactive={!u.active}>

                    <Box sx={{ minWidth: 220, flex: "1 1 220px" }}>
                        <Box sx={{ fontWeight: 600 }}>{u.name || u.email}{u.email === me ? <Box component="span" sx={{ color: tokens.muted, fontWeight: 400 }}> (you)</Box> : null}</Box>
                        <Box sx={{ color: tokens.muted, fontSize: 13, fontFamily: tokens.mono }}>{u.email}</Box>
                    </Box>

                    <Box sx={{ minWidth: 150 }}>
                        {u.active ? <Light color={u.role === "admin" ? tokens.blue : "#3FB950"} label={u.role === "admin" ? "Admin" : "User"} /> : <Light color="#F85149" label="Blocked" />}
                        {u.fixedAdmin && <Box sx={{ mt: 0.5 }}><Tag>permanent</Tag></Box>}
                    </Box>

                    <Box sx={{ color: tokens.muted, fontSize: 13, minWidth: 190 }}>
                        Last sign-in {when(u.last_login_at)} · {u.login_count}×
                        {u.updated_by && <Box sx={{ fontSize: 12 }}>Changed by {u.updated_by}, {when(u.updated_at)}</Box>}
                    </Box>

                    <Box sx={{ display: "flex", gap: 1, ml: "auto" }}>
                        {u.active && u.role !== "admin" && <Button size="small" variant="outlined" disabled={busy === u.email} onClick={() => change(u.email, { role: "admin" })}>Make admin</Button>}
                        {u.active && u.role === "admin" && !u.fixedAdmin && u.email !== me && <Button size="small" variant="outlined" color="inherit" disabled={busy === u.email} onClick={() => change(u.email, { role: "user" })}>Remove admin</Button>}
                        {u.active && !u.fixedAdmin && u.email !== me && <Button size="small" color="error" disabled={busy === u.email} onClick={() => window.confirm(/^production@/i.test(u.email) ? `Block ${u.email}? EVERY floor tablet is signed out at once and can't raise alerts until unblocked.` : `Block ${u.name || u.email}? They are signed out at once.`) && change(u.email, { active: false })}>Block</Button>}
                        {!u.active && <Button size="small" variant="outlined" disabled={busy === u.email} onClick={() => change(u.email, { active: true })}>Unblock</Button>}
                    </Box>

                </AdminRow>

            ))}

        </AdminPanel>

    );

}
