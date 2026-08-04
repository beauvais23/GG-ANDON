import { Box } from "@mui/material";

import Header from "../components/Header";
import Footer from "../components/Footer";
import HomeBanner from "../components/HomeBanner";
import ButtonGrid from "../components/ButtonGrid";
import AlertScreen from "../components/AlertScreen";
import ProductionLineToolbar from "../components/ProductionLineToolbar";
import WorkCenterToolbar from "../components/WorkCenterToolbar";

import useClock from "../hooks/useClock";
import { useAlert } from "../context/AlertContext";

export default function Home() {

  const clock = useClock();

  const {
    activeAlert,
    clearAlert
  } = useAlert();

  return (

    <Box
      sx={{
        minHeight: "100vh",
        background: "#DCE3EA"
      }}
    >

      <Header time={clock.time} />

      {activeAlert ? (

        <AlertScreen
          alert={activeAlert}
          onResolve={clearAlert}
        />

      ) : (

        <>

          <HomeBanner />

<ProductionLineToolbar />

<WorkCenterToolbar />

<ButtonGrid />

          <Footer />

        </>

      )}

    </Box>

  );

}