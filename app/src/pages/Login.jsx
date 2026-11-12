import { useCallback, useEffect, useRef, useState } from "react";

import {
    useNavigate,
    useLocation
} from "react-router-dom";

import {
    Box,
    Button,
    TextField,
    Alert
} from "@mui/material";

import config from "../config/config";

import { labelSx, tokens } from "../theme/theme";

export default function Login() {

    const navigate = useNavigate();

    const location = useLocation();

    const [username, setUsername] =
        useState("");

    const [password, setPassword] =
        useState("");

    const [error, setError] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    // Google sign-in (ggled.net, Nov 11 2026). Password form stays as a
    // backup behind "Other sign-in".
    const [google, setGoogle] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const googleButton = useRef(null);

    //------------------------------------------------------
    // After either sign-in: store the session, go on
    //------------------------------------------------------

    const finishLogin = useCallback(data => {

        //--------------------------------------------------
        // Store Authentication
        //--------------------------------------------------

        localStorage.setItem(

            "authToken",

            data.token

        );

        localStorage.setItem(

            "userRole",

            data.role

        );

        // Google sign-in: remember who, and fill the "Your name" boxes
        // (backlog notes, BOM requests, count corrections) when empty.
        if (data.email) {

            localStorage.setItem("userName", data.name || data.email);
            localStorage.setItem("userEmail", data.email);

            if (!/^production@/i.test(data.email))
                for (const key of ["backlogBy", "bomRequestedBy", "correctedBy"])
                    if (!localStorage.getItem(key))
                        localStorage.setItem(key, data.name || data.email);

        }

        else {

            localStorage.removeItem("userName");
            localStorage.removeItem("userEmail");

        }

        //--------------------------------------------------
        // Determine Destination
        //--------------------------------------------------

        const requestedPath =
            location.state?.from?.pathname;

        //--------------------------------------------------
        // Admin User
        //--------------------------------------------------

        if (data.role === "admin") {

            navigate(

                requestedPath || "/admin",

                {
                    replace: true
                }

            );

            return;

        }

        //--------------------------------------------------
        // Production User
        //--------------------------------------------------

        navigate(

            requestedPath &&
            requestedPath !== "/admin"
                ? requestedPath
                : "/",

            {
                replace: true
            }

        );

    }, [location, navigate]);

    //------------------------------------------------------
    // Google sign-in
    //------------------------------------------------------

    const onGoogle = useCallback(async ({ credential }) => {

        setError("");
        setLoading(true);

        try {

            const response = await fetch(`${config.apiBaseUrl}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.token) {

                setError(data.message || "Google sign-in failed.");
                return;

            }

            try { localStorage.removeItem("gsiNoAuto"); } catch { /* storage blocked */ }

            finishLogin(data);

        }

        catch { setError("Unable to connect to the authentication server."); }

        finally { setLoading(false); }

    }, [finishLogin]);

    useEffect(() => {

        let cancelled = false;

        fetch(`${config.apiBaseUrl}/auth/config`).then(r => r.json()).then(c => {

            if (cancelled || !c.googleClientId)
                return setShowPassword(true);

            setGoogle(c);

            const start = () => {

                if (cancelled || !window.google?.accounts?.id)
                    return;

                let noAuto = false;

                try { noAuto = localStorage.getItem("gsiNoAuto") === "1"; } catch { /* storage blocked */ }

                // auto_select: a tablet already signed in to Google comes
                // straight back in when its session ends (Nov 11 2026).
                window.google.accounts.id.initialize({ client_id: c.googleClientId, callback: onGoogle, auto_select: !noAuto, cancel_on_tap_outside: false });

                if (googleButton.current)
                    window.google.accounts.id.renderButton(googleButton.current, { theme: "filled_blue", size: "large", shape: "rectangular", text: "signin_with", width: 340 });

                if (!noAuto)
                    window.google.accounts.id.prompt();

            };

            if (window.google?.accounts?.id)
                return start();

            const script = document.createElement("script");

            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.onload = start;
            script.onerror = () => { setError("Couldn't load Google sign-in. Use Other sign-in."); setShowPassword(true); };
            document.head.appendChild(script);

        }).catch(() => setShowPassword(true));

        return () => { cancelled = true; };

    }, [onGoogle]);

    //------------------------------------------------------
    // Login
    //------------------------------------------------------

    async function handleSubmit(event) {

        event.preventDefault();

        setError("");

        setLoading(true);

        try {

            const response =
                await fetch(

                    `${config.apiBaseUrl}/auth/login`,

                    {
                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body: JSON.stringify({

                            username:
                                username.trim(),

                            password

                        })

                    }

                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success ||
                !data.token ||
                !data.role
            ) {

                setError(

                    data.message ||
                    "Invalid username or password."

                );

                return;

            }

            finishLogin(data);

        }

        catch (err) {

            console.error(

                "Login error:",

                err

            );

            setError(

                "Unable to connect to the authentication server."

            );

        }

        finally {

            setLoading(false);

        }

    }

    //------------------------------------------------------
    // Render (E5)
    //------------------------------------------------------

    return (

        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                bgcolor: tokens.ground,
                p: 2
            }}
        >

            <Box
                component="main"
                sx={{
                    width: "100%",
                    maxWidth: 420,
                    bgcolor: tokens.panel,
                    border: `1px solid ${tokens.line}`,
                    borderTop: `4px solid ${tokens.blue}`
                }}
            >

                {/* G&G mark */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3.5, pt: 3.5 }} aria-label="G&G Industrial Lighting">
                    <Box sx={{ width: 6, height: 34, bgcolor: tokens.blue }} />
                    <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                        <Box component="span" sx={{ fontFamily: tokens.display, fontWeight: 700, fontSize: 26, letterSpacing: "1px" }}>
                            G&amp;G
                        </Box>
                        <Box component="span" sx={{ ...labelSx, fontSize: 11, letterSpacing: "2.5px" }}>
                            Industrial Lighting
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ px: 3.5, pt: 3 }}>
                    <Box component="h1" sx={{ m: 0, fontFamily: tokens.display, fontWeight: 700, fontSize: 34, letterSpacing: "2px", textTransform: "uppercase", lineHeight: 1 }}>
                        ManufacturingOS
                    </Box>
                    <Box sx={{ ...labelSx, mt: 0.75 }}>
                        Production Response System · Malta
                    </Box>
                </Box>

                {google && (
                    <Box sx={{ px: 3.5, pt: 3, pb: showPassword ? 0 : 3.5 }}>
                        <Box sx={{ color: tokens.muted, fontSize: 14, mb: 1.5 }}>Sign in with your {google.domain} Google account.</Box>
                        <Box ref={googleButton} sx={{ minHeight: 44, display: "flex", justifyContent: "center" }} />
                        {loading && <Box sx={{ color: tokens.muted, fontSize: 13, mt: 1, textAlign: "center" }}>Signing in…</Box>}
                        {error && !showPassword && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
                        {!showPassword && (
                            <Box sx={{ textAlign: "center", mt: 2 }}>
                                <Button size="small" color="inherit" sx={{ color: tokens.muted, fontSize: 12, letterSpacing: "1px" }} onClick={() => setShowPassword(true)}>Other sign-in</Button>
                            </Box>
                        )}
                    </Box>
                )}

                {showPassword && (
                <Box component="form" onSubmit={handleSubmit} sx={{ px: 3.5, pt: 2, pb: 3.5 }}>

                    {error && (
                        <Alert severity="error" sx={{ mt: 1.5 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        fullWidth
                        label="Username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        margin="normal"
                        autoComplete="username"
                        autoFocus={!google}
                    />

                    <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        margin="normal"
                        autoComplete="current-password"
                    />

                    <Button
                        fullWidth
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={loading || !username || !password}
                        sx={{ mt: 2.5, height: 52, fontSize: 18, letterSpacing: "3px" }}
                    >
                        {loading ? "Signing in…" : "Sign in"}
                    </Button>

                </Box>
                )}

            </Box>

            <Box sx={{ ...labelSx, fontSize: 11 }}>
                {google ? `Floor tablets sign in with production@${google.domain}` : "Floor tablets and screens use the production login"}
            </Box>

        </Box>

    );

}
