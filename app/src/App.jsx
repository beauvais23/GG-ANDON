import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ProductionResponseCenter from "./pages/ProductionResponseCenter";
import Wallboard from "./pages/Wallboard";
import AdminPage from "./pages/AdminPage";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Login from "./pages/Login";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
    return (
        <Routes>

            {/* Public Route */}
            <Route
                path="/login"
                element={<Login />}
            />

            {/* Protected Routes */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Home />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                }
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

            <Route
                path="/admin"
                element={
                    <ProtectedRoute>
                        <AdminPage />
                    </ProtectedRoute>
                }
            />

        </Routes>
    );
}

export default App;