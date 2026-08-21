import {
    Navigate,
    useLocation
} from "react-router-dom";

export default function ProtectedRoute({

    children,
    requireAdmin = false

}) {

    const location =
        useLocation();

    const token =
        localStorage.getItem(
            "authToken"
        );

    const userRole =
        localStorage.getItem(
            "userRole"
        );

    //------------------------------------------------------
    // Not Logged In
    //------------------------------------------------------

    if (!token) {

        return (

            <Navigate

                to="/login"

                state={{

                    from: location

                }}

                replace

            />

        );

    }

    //------------------------------------------------------
    // Admin Access Required
    //------------------------------------------------------

    if (

        requireAdmin &&

        userRole !== "admin"

    ) {

        return (

            <Navigate

                to="/"

                replace

            />

        );

    }

    //------------------------------------------------------
    // Authorized
    //------------------------------------------------------

    return children;

}