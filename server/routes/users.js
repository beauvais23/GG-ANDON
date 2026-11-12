const express = require("express");
const jwt = require("jsonwebtoken");

const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { verifyGoogleIdToken, googleClientId, allowedDomain, adminEmails } = require("../services/googleAuth");

//------------------------------------------------------
// Google sign-in + Admin → Users (Director, Nov 11 2026).
// Any verified ggled.net Google account signs in; a new person gets
// role 'user' (the old shared production access), or admin when the
// email is in ADMIN_EMAILS (always admin). Admins switch others to
// admin / user or block them. The session token is the same JWT as the
// password login: role 'admin' or 'production', plus email and name.
//------------------------------------------------------

function sessionToken({ email, name, role }) {

    return jwt.sign({ username: name || email, email, name, role: role === "admin" ? "admin" : "production" }, process.env.AUTH_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "12h" });

}

function usersRoutes(db) {

    const router = express.Router();

    const st = {
        get: db.prepare("SELECT * FROM users WHERE email = ?"),
        add: db.prepare("INSERT INTO users (email, name, role, active, created_at, last_login_at, login_count) VALUES (?, ?, ?, 1, ?, ?, 1)"),
        seen: db.prepare("UPDATE users SET name = ?, role = ?, last_login_at = ?, login_count = login_count + 1 WHERE email = ?"),
        all: db.prepare("SELECT email, name, role, active, created_at, last_login_at, login_count, updated_by, updated_at FROM users ORDER BY active DESC, last_login_at DESC"),
        set: db.prepare("UPDATE users SET role = ?, active = ?, updated_by = ?, updated_at = ? WHERE email = ?")
    };

    // What the login page offers (the client ID is public, not a secret).
    router.get("/auth/config", (req, res) => {

        res.json({ success: true, googleClientId: googleClientId(), domain: allowedDomain() });

    });

    router.post("/auth/google", async (req, res) => {

        let who;

        try { who = await verifyGoogleIdToken(req.body?.credential); }

        catch (err) { return res.status(401).json({ success: false, message: err.message }); }

        const now = Date.now();
        const forcedAdmin = adminEmails().has(who.email);
        let user = st.get.get(who.email);

        if (user && !user.active)
            return res.status(403).json({ success: false, message: "Your account is blocked in ManufacturingOS. Ask an admin." });

        if (!user)
            st.add.run(who.email, who.name, forcedAdmin ? "admin" : "user", now, now);
        else
            st.seen.run(who.name, forcedAdmin ? "admin" : user.role, now, who.email);

        user = st.get.get(who.email);

        res.json({ success: true, token: sessionToken(user), role: user.role === "admin" ? "admin" : "production", name: user.name, email: user.email });

    });

    router.get("/admin/users", authenticateToken, requireAdmin, (req, res) => {

        const fixed = adminEmails();

        res.json({ success: true, domain: allowedDomain(), users: st.all.all().map(u => ({ ...u, fixedAdmin: fixed.has(u.email) })) });

    });

    router.put("/admin/users/:email", authenticateToken, requireAdmin, (req, res) => {

        const email = String(req.params.email).toLowerCase();
        const user = st.get.get(email);
        const role = req.body?.role ?? user?.role;
        const active = req.body?.active === undefined ? user?.active : (req.body.active ? 1 : 0);

        if (!user)
            return res.status(404).json({ success: false, message: "No such user (they appear after their first sign-in)." });

        if (!["user", "admin"].includes(role))
            return res.status(400).json({ success: false, message: "role must be user or admin." });

        if (adminEmails().has(email) && (role !== "admin" || !active))
            return res.status(409).json({ success: false, message: "This person is a permanent admin (ADMIN_EMAILS in Railway)." });

        if (email === req.user?.email && (role !== "admin" || !active))
            return res.status(409).json({ success: false, message: "You can't remove your own admin rights or block yourself." });

        st.set.run(role, active, req.user?.email || req.user?.username || "admin", Date.now(), email);

        res.json({ success: true, user: st.get.get(email) });

    });

    return router;

}

module.exports = { usersRoutes, sessionToken };
