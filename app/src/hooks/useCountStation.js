import { useEffect, useState } from "react";

import { getBoards } from "../api/hourly";

//------------------------------------------------------
// H2: is this tablet's station where its line counts good
// units? Each app line has a board of the same name; the
// count station is Final Test (PCB Coating: Production),
// from GET /hourly/boards. Returns the board name, or null.
//------------------------------------------------------

export default function useCountStation(productionLine, workCenter) {

    const [stations, setStations] = useState(null);

    useEffect(() => {

        let alive = true;

        getBoards().then(b => alive && setStations(b.countStations || {})).catch(() => alive && setStations({}));

        return () => { alive = false; };

    }, []);

    if (!stations || !productionLine || !workCenter)
        return null;

    return stations[productionLine] && stations[productionLine] === workCenter ? productionLine : null;

}
