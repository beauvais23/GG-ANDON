import {
  createContext,
  useContext,
  useState
} from "react";

const AlertContext = createContext(null);

export function AlertProvider({ children }) {

  const [activeAlert, setActiveAlert] = useState(null);

  //--------------------------------------------------
  // Start Alert
  //--------------------------------------------------

  function startAlert(alert) {

    setActiveAlert({

      ...alert,

      requested: Date.now()

    });

  }

  //--------------------------------------------------
  // Clear Alert
  //--------------------------------------------------

  function clearAlert() {

    setActiveAlert(null);

  }

  //--------------------------------------------------

  const value = {

    activeAlert,
    startAlert,
    clearAlert

  };

  return (

    <AlertContext.Provider value={value}>

      {children}

    </AlertContext.Provider>

  );

}

export function useAlert() {

  const context = useContext(AlertContext);

  if (!context) {

    throw new Error(
      "useAlert must be used inside AlertProvider"
    );

  }

  return context;

}