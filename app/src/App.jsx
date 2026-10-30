import {
    Routes,
    Route,
    Navigate
} from "react-router-dom";

import Home from "./pages/Home";
import ProductionResponseCenter from "./pages/ProductionResponseCenter";
import Wallboard from "./pages/Wallboard";
import AdminPage from "./pages/AdminPage";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Login from "./pages/Login";

import ProtectedRoute from "./components/ProtectedRoute";
import StagingBanner from "./components/StagingBanner";
import { useAlert } from "./context/AlertContext";
import useAutoReload from "./hooks/useAutoReload";

function App() {

    // Pick up new deploys on screens that stay open all shift.
    // Never while a tablet is showing an alert in progress.
    const { activeAlert } = useAlert();

    useAutoReload(Boolean(activeAlert));

    return (

        <>

        <StagingBanner />

        <Routes>

            {/* Public Route */}

            <Route
                path="/login"
                element={<Login />}
            />

            {/* Production Routes */}

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Home />
                    </ProtectedRoute>
                }
            />

            {/* /dashboard was a copy of the Response Center
                (removed Oct 30 2026); old bookmarks land there. */}

            <Route
                path="/dashboard"
                element={<Navigate to="/supervisor" replace />}
            />

            <Route
                path="/supervisor"
                element={
                    <ProtectedRoute>
                        <ProductionResponseCenter />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/wallboard"
                element={
                    <ProtectedRoute>
                        <Wallboard />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/executive"
                element={
                    <ProtectedRoute>
                        <ExecutiveDashboard />
                    </ProtectedRoute>
                }
            />

            {/* Administration - Admin Only */}

            <Route
                path="/admin"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminPage />
                    </ProtectedRoute>
                }
            />

        </Routes>

        </>

    );

}

export default App;