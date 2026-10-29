import { useState } from "react";

import { createAlert } from "../services/api";
import { useAlert } from "../context/AlertContext";
import { useProductionLine } from "../context/ProductionLineContext";
import { useWorkCenter } from "../context/WorkCenterContext";
import { alertLabel } from "../config/alertColors";

//------------------------------------------------------
// Raise an alert from the tablet (moved out of ButtonGrid
// for Option B, so the five big buttons and the DOWNTIME /
// NEAR MISS buttons share one path). Every press ends in:
// the alert screen, the duplicate banner, or a NOT-sent
// banner (#25).
//------------------------------------------------------

// Time the existing alert was raised, in plant time and the
// same 12-hour format as the header clock (e.g. 1:04 PM).
function plantTime(ms) {

  return new Date(Number(ms)).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });

}

export default function useRaiseAlert() {

  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { startAlert } = useAlert();
  const { productionLine } = useProductionLine();
  const { workCenter, workCenters, workCentersLoaded } = useWorkCenter();

  const noWorkCenters = workCentersLoaded && workCenters.length === 0;

  async function raise(type) {

    const name = alertLabel(type);

    setErrorMessage("");

    if (!workCenter) {

      setErrorMessage(
        noWorkCenters
          ? `${name} alert NOT sent: no work centers are set up for ${productionLine}. Call your lead.`
          : `${name} alert NOT sent: choose a work center first.`
      );

      return;

    }

    try {

      const response = await createAlert({ productionLine, workCenter, type, priority: "NORMAL" });

      if (response.success) {

        startAlert(response.alert);

      }

      // 409: the same alert is already open on this line / work center.
      else if (response.duplicate && response.alert) {

        setDuplicateMessage(`${name}: Already open since ${plantTime(response.alert.requested)}`);

      }

      else {

        setErrorMessage(`${name} alert NOT sent: ${response.message || "the server refused it."} Call your lead.`);

      }

    }

    catch (error) {

      console.error(error);

      // No answer, or not JSON (e.g. the backend restarting during a deploy).
      setErrorMessage(`${name} alert NOT sent: no connection to the server. Try again, or call your lead.`);

    }

  }

  return {
    raise,
    productionLine,
    noWorkCenters,
    duplicateMessage,
    errorMessage,
    clearDuplicate: () => setDuplicateMessage(""),
    clearError: () => setErrorMessage("")
  };

}
