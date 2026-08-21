import { useState } from "react";

import {
    useNavigate,
    useLocation
} from "react-router-dom";

import {
    Box,
    Button,
    Paper,
    TextField,
    Typography,
    Alert
} from "@mui/material";

import config from "../config/config";

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
    // Render
    //------------------------------------------------------

    return (

        <Box

            sx={{

                minHeight: "100vh",

                display: "flex",

                alignItems: "center",

                justifyContent: "center",

                backgroundColor:
                    "#f4f6f8",

                padding: 2

            }}

        >

            <Paper

                elevation={4}

                sx={{

                    width: "100%",

                    maxWidth: 420,

                    padding: 4

                }}

            >

                <Typography

                    variant="h4"

                    fontWeight={700}

                    gutterBottom

                    sx={{

                        textAlign: "center"

                    }}

                >

                    G&G ANDON

                </Typography>

                <Typography

                    variant="body1"

                    color="text.secondary"

                    sx={{

                        mb: 3,

                        textAlign: "center"

                    }}

                >

                    ManufacturingOS

                </Typography>

                {error && (

                    <Alert

                        severity="error"

                        sx={{

                            mb: 2

                        }}

                    >

                        {error}

                    </Alert>

                )}

                <Box

                    component="form"

                    onSubmit={handleSubmit}

                >

                    <TextField

                        fullWidth

                        label="Username"

                        value={username}

                        onChange={(event) =>

                            setUsername(
                                event.target.value
                            )

                        }

                        margin="normal"

                        autoComplete="username"

                        autoFocus

                    />

                    <TextField

                        fullWidth

                        label="Password"

                        type="password"

                        value={password}

                        onChange={(event) =>

                            setPassword(
                                event.target.value
                            )

                        }

                        margin="normal"

                        autoComplete="current-password"

                    />

                    <Button

                        fullWidth

                        type="submit"

                        variant="contained"

                        size="large"

                        disabled={

                            loading ||

                            !username ||

                            !password

                        }

                        sx={{

                            mt: 3

                        }}

                    >

                        {

                            loading

                                ? "Signing In..."

                                : "Sign In"

                        }

                    </Button>

                </Box>

            </Paper>

        </Box>

    );

}