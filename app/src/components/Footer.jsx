import {
    Box,
    Button,
    Chip,
    Typography
} from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import TvIcon from "@mui/icons-material/Tv";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import InsightsIcon from "@mui/icons-material/Insights";
import LogoutIcon from "@mui/icons-material/Logout";

import { useNavigate } from "react-router-dom";

export default function Footer() {

    const navigate =
        useNavigate();

    //------------------------------------------------------
    // Administration Access
    //------------------------------------------------------

    function handleAdministration() {

        const userRole =
            localStorage.getItem(
                "userRole"
            );

        //--------------------------------------------------
        // Already Logged In As Admin
        //--------------------------------------------------

        if (userRole === "admin") {

            navigate("/admin");

            return;

        }

        //--------------------------------------------------
        // Production User
        //
        // Clear the production session so the user can
        // authenticate using an admin account.
        //--------------------------------------------------

        localStorage.removeItem(
            "authToken"
        );

        localStorage.removeItem(
            "userRole"
        );

        //--------------------------------------------------
        // Send To Login
        //--------------------------------------------------

        navigate(

            "/login",

            {
                state: {

                    from: {

                        pathname: "/admin"

                    }

                },

                replace: true

            }

        );

    }

    //------------------------------------------------------
    // Logout
    //------------------------------------------------------

    function handleLogout() {

        //--------------------------------------------------
        // Clear Authentication
        //--------------------------------------------------

        localStorage.removeItem(
            "authToken"
        );

        localStorage.removeItem(
            "userRole"
        );

        //--------------------------------------------------
        // Return To Login
        //--------------------------------------------------

        navigate(

            "/login",

            {
                replace: true
            }

        );

    }

    return (

        <Box

            sx={{

                display: "flex",

                alignItems: "center",

                gap: 1,

                px: 2,

                py: 1,

                bgcolor: "#ECEFF1",

                borderTop:
                    "1px solid #CFD8DC",

                flexWrap: "wrap"

            }}

        >

            <Typography

                sx={{

                    fontWeight: "bold",

                    fontSize: 15,

                    mr: 1

                }}

            >

                G&G ManufacturingOS

            </Typography>

            <Button

                size="small"

                variant="contained"

                startIcon={<DashboardIcon />}

                onClick={() =>
                    navigate("/supervisor")
                }

            >

                Production Manager Dashboard

            </Button>

            <Button

                size="small"

                variant="outlined"

                startIcon={<TvIcon />}

                onClick={() =>
                    navigate("/wallboard")
                }

            >

                TV Wallboard

            </Button>

            <Button

                size="small"

                variant="outlined"

                startIcon={<InsightsIcon />}

                onClick={() =>
                    navigate("/executive")
                }

            >

                Executive Dashboard

            </Button>

            <Button

                size="small"

                variant="outlined"

                startIcon={
                    <AdminPanelSettingsIcon />
                }

                onClick={
                    handleAdministration
                }

            >

                Administration

            </Button>

            <Button

                size="small"

                variant="outlined"

                color="error"

                startIcon={<LogoutIcon />}

                onClick={
                    handleLogout
                }

            >

                Logout

            </Button>

            <Chip

                size="small"

                color="success"

                label="API Connected"

            />

            <Chip

                size="small"

                color="success"

                label="SQLite Connected"

            />

        </Box>

    );

}