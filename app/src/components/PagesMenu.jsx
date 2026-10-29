import { useState } from "react";

import {
    Box,
    Button,
    Divider,
    Menu,
    MenuItem,
    Typography
} from "@mui/material";

import MenuIcon from "@mui/icons-material/Menu";

import { useLocation, useNavigate } from "react-router-dom";

import { PAGES } from "../config/pages";
import { labelSx, tokens } from "../theme/theme";

//------------------------------------------------------
// PAGES menu (E1)
//
// The same list on every page, so any screen is one
// click from any other. Replaces the footer buttons.
//------------------------------------------------------


function signOut() {

    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");

}

export default function PagesMenu() {

    const [anchor, setAnchor] = useState(null);

    const navigate = useNavigate();
    const { pathname } = useLocation();

    function go(path) {

        setAnchor(null);

        // Admin needs an admin login: a production session
        // signs out and returns to /admin after the login.
        if (path === "/admin" && localStorage.getItem("userRole") !== "admin") {

            signOut();

            navigate("/login", { state: { from: { pathname: "/admin" } }, replace: true });

            return;

        }

        navigate(path);

    }

    function handleSignOut() {

        setAnchor(null);
        signOut();
        navigate("/login", { replace: true });

    }

    return (

        <>

            <Button
                variant="outlined"
                color="inherit"
                startIcon={<MenuIcon />}
                onClick={e => setAnchor(e.currentTarget)}
                aria-haspopup="true"
                aria-expanded={Boolean(anchor)}
                aria-controls="pages-menu"
                sx={{ height: 40, bgcolor: tokens.raised, borderColor: tokens.lineStrong }}
            >
                Pages
            </Button>

            <Menu
                id="pages-menu"
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { width: 300, mt: 0.5, border: `1px solid ${tokens.lineStrong}` } } }}
            >

                <Typography sx={{ ...labelSx, fontSize: 12, px: 2, py: 1 }}>
                    Go to
                </Typography>

                {PAGES.map(page => {

                    const current = page.path === pathname;

                    return (

                        <MenuItem
                            key={page.path}
                            selected={current}
                            onClick={() => go(page.path)}
                            sx={{
                                py: 1.5,
                                borderLeft: `3px solid ${current ? tokens.blue : "transparent"}`,
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 2
                            }}
                        >
                            <span>{page.name}</span>
                            <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.muted }}>
                                {page.path}
                            </Box>
                        </MenuItem>

                    );

                })}

                <Divider />

                <MenuItem onClick={handleSignOut} sx={{ py: 1.5, color: tokens.muted }}>
                    Sign out
                </MenuItem>

            </Menu>

        </>

    );

}
