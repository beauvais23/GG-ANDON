import { Box } from "@mui/material";

import Header from "../components/Header";
import Footer from "../components/Footer";
import StationBar from "../components/StationBar";
import ButtonGrid from "../components/ButtonGrid";
import RaiseFeedback from "../components/RaiseFeedback";
import AlertScreen from "../components/AlertScreen";

import useClock from "../hooks/useClock";
import useRaiseAlert from "../hooks/useRaiseAlert";
import { useAlert } from "../context/AlertContext";
import { useProductionLine } from "../context/ProductionLineContext";
import { useWorkCenter } from "../context/WorkCenterContext";

//------------------------------------------------------
// Operator tablet (E2): station strip, five equal alert
// buttons filling the screen, status strip. Mockup
// approved Oct 29 2026.
//------------------------------------------------------

export default function Home() {

  const clock = useClock();

  const { activeAlert, clearAlert } = useAlert();
  const { productionLine } = useProductionLine();
  const { workCenter } = useWorkCenter();

  const raising = useRaiseAlert();

  return (

    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "#0B0D10" }}>

      <Header time={clock.time} />

      {activeAlert ? (

        <AlertScreen
          alert={activeAlert}
          onResolve={clearAlert}
        />

      ) : (

        <>

          <StationBar onRaise={raising.raise} />

          <RaiseFeedback raising={raising} />

          <ButtonGrid onRaise={raising.raise} />

        </>

      )}

      <Footer station={[productionLine, workCenter].filter(Boolean).join(" / ")} />

    </Box>

  );

}
