import { useState } from "react";
import { Box } from "@mui/material";

import Header from "../components/Header";
import Footer from "../components/Footer";
import StatusBanner from "../components/StatusBanner";
import ButtonGrid from "../components/ButtonGrid";
import AlertScreen from "../components/AlertScreen";

import useClock from "../hooks/useClock";

export default function Home() {

  const time = useClock();

  const [activeAlert, setActiveAlert] = useState(null);

  function handleAlert(alert) {
    setActiveAlert(alert);
  }

  function handleResolve() {
    setActiveAlert(null);
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "#ECEFF1"
      }}
    >
      <Header time={time} />

      {activeAlert ? (
        <AlertScreen
          alert={activeAlert}
          onResolve={handleResolve}
        />
      ) : (
        <>
          <StatusBanner />
          <ButtonGrid onAlert={handleAlert} />
          <Footer />
        </>
      )}

    </Box>
  );
}