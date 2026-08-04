import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

const ProductionLineContext = createContext();

export function ProductionLineProvider({ children }) {

  const [productionLine, setProductionLine] =
    useState("Gigabay");

  //------------------------------------------------------
  // Restore Saved Production Line
  //------------------------------------------------------

  useEffect(() => {

    const saved =
      localStorage.getItem("productionLine");

    if (saved) {

      setProductionLine(saved);

    }

  }, []);

  //------------------------------------------------------
  // Change Production Line
  //------------------------------------------------------

  function changeProductionLine(line) {

    if (!line) {
      return;
    }

    localStorage.setItem(
      "productionLine",
      line
    );

    setProductionLine(line);

  }

  //------------------------------------------------------
  // Context
  //------------------------------------------------------

  return (

    <ProductionLineContext.Provider
      value={{
        productionLine,
        changeProductionLine
      }}
    >

      {children}

    </ProductionLineContext.Provider>

  );

}

export function useProductionLine() {

  return useContext(
    ProductionLineContext
  );

}