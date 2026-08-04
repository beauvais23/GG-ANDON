import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";

import App from "./App";

import { AlertProvider } from "./context/AlertContext";
import { ProductionLineProvider } from "./context/ProductionLineContext";

import "./index.css";

import { WorkCenterProvider } from "./context/WorkCenterContext";

ReactDOM.createRoot(document.getElementById("root")).render(

  <React.StrictMode>

    <BrowserRouter>

      <ProductionLineProvider>
    <WorkCenterProvider>
        <AlertProvider>
            <App />
        </AlertProvider>
    </WorkCenterProvider>
</ProductionLineProvider>

    </BrowserRouter>

  </React.StrictMode>

);