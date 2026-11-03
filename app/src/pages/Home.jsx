import { Box } from "@mui/material";

import Header from "../components/Header";
import Footer from "../components/Footer";
import StationBar from "../components/StationBar";
import ButtonGrid from "../components/ButtonGrid";
import RaiseFeedback from "../components/RaiseFeedback";
import AlertScreen from "../components/AlertScreen";
import NearMissLogged from "../components/NearMissLogged";
import CountStrip from "../components/CountStrip";

import useClock from "../hooks/useClock";
import useRaiseAlert from "../hooks/useRaiseAlert";
import useCountStation from "../hooks/useCountStation";
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

  // H2: the count strip shows on the line's count station only.
  const countBoard = useCountStation(productionLine, workCenter);

  return (

    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "#0B0D10" }}>

      <Header time={clock.time} />

      {activeAlert?.type === "NEAR_MISS" && activeAlert.status !== "ACTIVE" ? (

        // Logged closed by the backend: a thank-you screen, not a wait.
        <NearMissLogged
          alert={activeAlert}
          onDone={clearAlert}
        />

      ) : activeAlert ? (

        <AlertScreen
          alert={activeAlert}
          onResolve={clearAlert}
        />

      ) : (

        <>

          <StationBar onRaise={raising.raise} />

          {countBoard && <CountStrip key={countBoard} board={countBoard} productionLine={productionLine} workCenter={workCenter} />}

          <RaiseFeedback raising={raising} />

          <ButtonGrid onRaise={raising.raise} />

        </>

      )}

      <Footer station={[productionLine, workCenter].filter(Boolean).join(" / ")} />

    </Box>

  );

}
