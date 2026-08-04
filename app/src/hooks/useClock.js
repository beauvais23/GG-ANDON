import { useState, useEffect } from "react";

export default function useClock() {

    const [clock, setClock] = useState({
        time: "",
        date: ""
    });

    useEffect(() => {

        function updateClock() {

            const now = new Date();

            setClock({

                time: now.toLocaleTimeString([],{
                    hour:"numeric",
                    minute:"2-digit"
                }),

                date: now.toLocaleDateString([],{
                    weekday:"long",
                    month:"long",
                    day:"numeric",
                    year:"numeric"
                })

            });

        }

        updateClock();

        const timer = setInterval(updateClock,1000);

        return () => clearInterval(timer);

    },[]);

    return clock;

}