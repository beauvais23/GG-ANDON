import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

//------------------------------------------------------
// Tablet feedback (moved from ButtonGrid): the standing
// no-work-centers warning, the duplicate banner, and the
// NOT-sent banner (#25).
//------------------------------------------------------

export default function RaiseFeedback({ raising }) {

  const {
    productionLine,
    noWorkCenters,
    duplicateMessage,
    errorMessage,
    clearDuplicate,
    clearError
  } = raising;

  return (

    <>

      {noWorkCenters && (
        <Alert severity="error" variant="filled" sx={{ mx: 3, mt: 2, fontSize: "1.3rem" }}>
          No work centers are set up for {productionLine}. Alerts cannot be sent from this line. Call your lead.
        </Alert>
      )}

      <Snackbar
        open={Boolean(duplicateMessage)}
        autoHideDuration={8000}
        onClose={clearDuplicate}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="warning" variant="filled" onClose={clearDuplicate} sx={{ fontSize: "1.4rem", alignItems: "center" }}>
          {duplicateMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(errorMessage)}
        autoHideDuration={15000}
        onClose={clearError}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="error" variant="filled" onClose={clearError} sx={{ fontSize: "1.4rem", alignItems: "center" }}>
          {errorMessage}
        </Alert>
      </Snackbar>

    </>

  );

}
