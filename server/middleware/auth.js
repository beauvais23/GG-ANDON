const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    const token =
        authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.substring(7)
            : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.AUTH_SECRET
        );

        req.user = decoded;

        next();

    } catch (err) {

        console.error("JWT verification failed:", err.message);

        return res.status(403).json({
            success: false,
            message: "Invalid or expired authentication token."
        });
    }
}

module.exports = authenticateToken;