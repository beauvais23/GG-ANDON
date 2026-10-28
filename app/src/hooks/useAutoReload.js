/* global __BUILD_ID__ */
import { useEffect, useRef } from "react";

//------------------------------------------------------
// Auto Reload After a Deploy
//
// Open screens keep running the code they loaded until
// the page is reloaded. Every CHECK_MS this fetches
// /version.json; when the build id differs from the one
// this page was built with, the page reloads itself at
// the first safe moment:
//   - no alert screen in progress (tablet)
//   - no dialog open (e.g. "What fixed it?")
//   - no text field being typed in
//   - no touch, click or key press for IDLE_MS
//------------------------------------------------------

const CHECK_MS = 2 * 60 * 1000;
const IDLE_MS = 60 * 1000;
const SAFE_POLL_MS = 15 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];

function isTyping() {

  const el = document.activeElement;

  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));

}

export default function useAutoReload(busy) {

  // Read the latest value inside timers without restarting them.
  const busyRef = useRef(busy);

  busyRef.current = busy;

  useEffect(() => {

    if (import.meta.env.DEV)
      return undefined;

    let lastActivity = Date.now();
    let updateReady = false;

    const markActivity = () => { lastActivity = Date.now(); };

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, markActivity, { passive: true }));

    function safeToReload() {

      return (
        !busyRef.current &&
        !document.querySelector('[role="dialog"]') &&
        !isTyping() &&
        Date.now() - lastActivity >= IDLE_MS
      );

    }

    function reloadIfSafe() {

      if (updateReady && safeToReload())
        window.location.reload();

    }

    async function checkVersion() {

      try {

        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });

        if (!response.ok)
          return;

        const { buildId } = await response.json();

        if (buildId && buildId !== __BUILD_ID__)
          updateReady = true;

      } catch {

        // Offline or between deploys: try again next time.

      }

      reloadIfSafe();

    }

    const checkTimer = setInterval(checkVersion, CHECK_MS);
    const safeTimer = setInterval(reloadIfSafe, SAFE_POLL_MS);

    return () => {

      clearInterval(checkTimer);
      clearInterval(safeTimer);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, markActivity));

    };

  }, []);

}
