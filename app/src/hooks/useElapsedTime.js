import { useEffect, useState } from "react";

export default function useElapsedTime() {

  const [seconds, setSeconds] = useState(0);

  useEffect(() => {

    const timer = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);

  }, []);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${secs}`;

}