import { Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ProductionResponseCenter from "./pages/ProductionResponseCenter";
import Wallboard from "./pages/Wallboard";
import AdminPage from "./pages/AdminPage";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";

function App() {

  return (

    <Routes>

    <Route
        path="/"
        element={<Home />}
    />

    <Route
        path="/dashboard"
        element={<Dashboard />}
    />

    <Route
        path="/supervisor"
        element={<ProductionResponseCenter />}
    />

    <Route
        path="/wallboard"
        element={<Wallboard />}
    />

    <Route
    path="/executive"
    element={<ExecutiveDashboard />}
    />

    <Route
        path="/admin"
        element={<AdminPage />}
    />

</Routes>

  );

}

export default App;