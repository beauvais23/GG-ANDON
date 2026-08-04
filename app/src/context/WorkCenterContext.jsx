import {
    createContext,
    useContext,
    useEffect,
    useState
} from "react";

import {
    getWorkCentersByProductionLine
} from "../api/workCenters";

import {
    useProductionLine
} from "./ProductionLineContext";


const WorkCenterContext = createContext();


export function WorkCenterProvider({ children }) {

    const { productionLine } = useProductionLine();

    const [workCenters, setWorkCenters] = useState([]);

    const [workCenter, setWorkCenter] = useState("");


    //------------------------------------------------------
    // Load Work Centers When Production Line Changes
    //------------------------------------------------------

    useEffect(() => {

    // Clear the current Work Center immediately
    // whenever the Production Line changes.

    setWorkCenters([]);
    setWorkCenter("");

    if (!productionLine) {
        return;
    }

    loadWorkCenters();

}, [productionLine]);


    //------------------------------------------------------
    // Load Work Centers
    //------------------------------------------------------

    async function loadWorkCenters() {

        try {

            const data =
                await getWorkCentersByProductionLine(
                    productionLine
                );

            setWorkCenters(data);


            //--------------------------------------------------
            // Restore previously selected Work Center
            //--------------------------------------------------

            const saved =
                localStorage.getItem(
                    `workCenter_${productionLine}`
                );


            //--------------------------------------------------
            // If saved Work Center still exists, use it
            //--------------------------------------------------

            if (
                saved &&
                data.some(wc => wc.name === saved)
            ) {

                setWorkCenter(saved);

                return;

            }


            //--------------------------------------------------
            // Otherwise select first Work Center
            //--------------------------------------------------

            if (data.length > 0) {

                setWorkCenter(data[0].name);

                localStorage.setItem(
                    `workCenter_${productionLine}`,
                    data[0].name
                );

            }

            else {

                setWorkCenter("");

                localStorage.removeItem(
                    `workCenter_${productionLine}`
                );

            }

        }

        catch (err) {

            console.error(
                "Failed to load Work Centers:",
                err
            );

            setWorkCenters([]);
            setWorkCenter("");

        }

    }


    //------------------------------------------------------
    // Change Selected Work Center
    //------------------------------------------------------

    function changeWorkCenter(name) {

        setWorkCenter(name);

        localStorage.setItem(
            `workCenter_${productionLine}`,
            name
        );

    }


    //------------------------------------------------------
    // Context
    //------------------------------------------------------

    return (

        <WorkCenterContext.Provider
            value={{
                workCenters,
                workCenter,
                changeWorkCenter,
                reloadWorkCenters: loadWorkCenters
            }}
        >

            {children}

        </WorkCenterContext.Provider>

    );

}


export function useWorkCenter() {

    return useContext(
        WorkCenterContext
    );

}