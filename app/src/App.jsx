import { Routes, Route } from "react-router-dom";

import Layout from "./layout/Layout";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ActiveAlert from "./pages/ActiveAlert";

import useClock from "./hooks/useClock";

function App() {
  const time = useClock();

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={<Home time={time} />}
        />

        <Route
          path="/active"
          element={<ActiveAlert />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/history"
          element={
            <div style={{ padding: 40 }}>
              <h2>Alert History</h2>
              <p>Coming Soon</p>
            </div>
          }
        />

        <Route
          path="/settings"
          element={
            <div style={{ padding: 40 }}>
              <h2>Settings</h2>
              <p>Coming Soon</p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;