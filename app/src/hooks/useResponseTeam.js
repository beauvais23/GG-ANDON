import { useCallback, useEffect, useState } from "react";

import { getResponseTeam } from "../api/responseTeam";

//------------------------------------------------------
// Response team + "acting as" person (E3)
//
// Refreshes every 30 s so availability lights stay
// current (they were loaded once). The chosen person is
// remembered on this browser; before E3 /dashboard
// always acted as the first person on the list (#30).
//------------------------------------------------------

const KEY = "actingAs";
const REFRESH_MS = 30000;

function remembered() {

    try {
        return localStorage.getItem(KEY) || "";
    } catch {
        return "";
    }

}

export default function useResponseTeam() {

    const [team, setTeam] = useState([]);
    const [actingAs, setActingAsState] = useState(remembered);

    const load = useCallback(async () => {

        try {

            const data = await getResponseTeam();

            if (!Array.isArray(data)) return;

            setTeam(data);

            // Keep a valid choice: the remembered person if still
            // on the team, else the first person.
            setActingAsState(current =>
                data.some(p => p.name === current) ? current : (data[0]?.name || ""));

        } catch (err) {

            console.error("Failed to load response team:", err);

        }

    }, []);

    useEffect(() => {

        load();

        const timer = setInterval(load, REFRESH_MS);

        return () => clearInterval(timer);

    }, [load]);

    function setActingAs(name) {

        setActingAsState(name);

        try {
            localStorage.setItem(KEY, name);
        } catch {
            // Private mode: the choice lasts until reload.
        }

    }

    return { team, actingAs, setActingAs, reloadTeam: load };

}
