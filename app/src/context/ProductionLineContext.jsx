import {
  createContext,
  useContext,
  useState,
  useEffect
} from "react";

const ProductionLineContext = createContext();

export function ProductionLineProvider({ children }) {

  const [productionLine, setProductionLine] = useState("Gigabay");

  useEffect(() => {

    const saved = localStorage.getItem("productionLine");

    if (saved) {
      setProductionLine(saved);
    }

  }, []);

  function changeProductionLine(line) {

    localStorage.setItem(
      "productionLine",
      line
    );

    setProductionLine(line);

  }

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