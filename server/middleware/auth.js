const jwt = require("jsonwebtoken");

let userStmt = null;

function userRow(email) {

    try {

        userStmt ||= require("../database").db.prepare("SELECT role, active FROM users WHERE email = ?");

        return userStmt.get(email) || null;

    } catch { return null; }

}

//------------------------------------------------------
// Authenticate Token
//------------------------------------------------------

function authenticateToken(req, res, next) {

    const authHeader =
        req.headers["authorization"];

    const token =
        authHeader &&
        authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

    if (!token) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });

    }

    try {

        const decoded =
            jwt.verify(
                token,
                process.env.AUTH_SECRET
            );

        req.user = decoded;

        // Google sign-in sessions follow Admin → Users at once (Nov 11
        // 2026): blocked → signed out; admin removed → normal access.
        const u = decoded.email ? userRow(decoded.email) : null;

        if (u && !u.active)
            return res.status(401).json({ success: false, message: "Your account is blocked in ManufacturingOS." });

        if (u && u.role !== "admin" && decoded.role === "admin")
            req.user = { ...decoded, role: "production" };

        next();

    }

    catch (err) {

        console.error(
            "JWT verification failed:",
            err.message
        );

        return res.status(403).json({

            success: false,

            message:
                "Invalid or expired authentication token."

        });

    }

}

//------------------------------------------------------
// Require Admin
//------------------------------------------------------

function requireAdmin(req, res, next) {

    if (
        !req.user ||
        req.user.role !== "admin"
    ) {

        return res.status(403).json({

            success: false,

            message:
                "Administrator access required."

        });

    }

    next();

}

//------------------------------------------------------
// Exports
//------------------------------------------------------

module.exports = {

    authenticateToken,

    requireAdmin

};