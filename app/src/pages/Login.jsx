import { useState } from "react";

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
                        autoFocus
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

            </Box>

            <Box sx={{ ...labelSx, fontSize: 11 }}>
                Floor tablets and screens use the production login
            </Box>

        </Box>

    );

}
