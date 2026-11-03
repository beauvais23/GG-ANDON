import { useEffect, useState } from "react";

import { getBoards } from "../api/hourly";

//------------------------------------------------------
// H2: is this tablet's station where its line counts good
// units? Each app line has a board of the same name; the
// count station is Final Test (PCB Coating: Production),
// from GET /hourly/boards. Returns the board name, or null.
// usePcbStation: the line's PCB Test work center (0012), for
// the PASS / FAIL strip.
//------------------------------------------------------

function useBoards() {

    const [info, setInfo] = useState(null);

    useEffect(() => {

        let alive = true;

        getBoards().then(b => alive && setInfo(b)).catch(() => alive && setInfo({ countStations: {} }));

        return () => { alive = false; };

    }, []);

    return info;

}

export default function useCountStation(productionLine, workCenter) {

    const info = useBoards();

    if (!info || !productionLine || !workCenter)
        return { board: null, pcb: false };

    const stations = info.countStations || {};

    if (stations[productionLine] && stations[productionLine] === workCenter)
        return { board: productionLine, pcb: false };

    if (stations[productionLine] && info.pcbStation && workCenter === info.pcbStation)
        return { board: productionLine, pcb: true };

    return { board: null, pcb: false };

}
