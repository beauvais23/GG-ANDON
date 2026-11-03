import { useCallback, useEffect, useRef, useState } from "react";

import { sendTap, undoTapRequest } from "../api/hourly";

//------------------------------------------------------
// H2 offline tap queue (one tap per good unit).
//
// Every tap gets an id on the tablet and goes into a queue
// kept in localStorage, then is sent in order. A tap whose
// send fails (no connection, server down, login expired)
// stays queued and is retried every 10 s and when the
// connection comes back. The server stores a tap id once, so
// a re-send can't double count. Undo (30 s) takes a tap out of
// the queue if it hasn't gone yet, else asks the server.
//------------------------------------------------------

const KEY = "countQueue";
export const UNDO_SECONDS = 30;

function read() {

    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }

}

function write(queue) {

    try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* the in-memory queue still works */ }

}

function newId() {

    if (globalThis.crypto?.randomUUID)
        return globalThis.crypto.randomUUID();

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

}

export default function useTapQueue({ onSent } = {}) {

    const [queue, setQueue] = useState(read);
    const [last, setLast] = useState(null);       // { tapId, at, sku }
    const [message, setMessage] = useState("");
    const sending = useRef(false);
    const queueRef = useRef(queue);

    const update = useCallback(next => {

        queueRef.current = next;
        write(next);
        setQueue(next);

    }, []);

    const flush = useCallback(async () => {

        if (sending.current)
            return;

        sending.current = true;

        try {

            let sent = 0;

            while (queueRef.current.length) {

                const tap = queueRef.current[0];
                let result;

                try { result = await sendTap(tap); } catch { break; }   // no connection: keep it

                if (result.ok || (result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 403 && result.status !== 429)) {

                    if (!result.ok)
                        setMessage(`A tap was refused: ${result.data.message || result.status}`);

                    // Undo pressed while this tap was on its way: take it back on the server too.
                    if (result.ok && !queueRef.current.some(t => t.tapId === tap.tapId))
                        await undoTapRequest(tap.tapId).catch(() => setMessage("Undo failed: no connection. Ask your lead to correct the count."));

                    update(queueRef.current.filter(t => t.tapId !== tap.tapId));
                    sent += 1;

                } else {

                    break;   // server down or login expired: retry later

                }

            }

            if (sent && onSent)
                onSent();

        } finally {

            sending.current = false;

        }

    }, [onSent, update]);

    useEffect(() => {

        flush();

        const id = setInterval(flush, 10 * 1000);
        window.addEventListener("online", flush);

        return () => { clearInterval(id); window.removeEventListener("online", flush); };

    }, [flush]);

    const tap = useCallback((details) => {

        const t = { tapId: newId(), tappedAt: Date.now(), ...details };

        update([...queueRef.current, t]);
        setLast({ tapId: t.tapId, at: t.tappedAt, sku: t.sku });
        setMessage("");
        flush();

    }, [flush, update]);

    const undo = useCallback(async () => {

        if (!last)
            return;

        const { tapId } = last;

        setLast(null);

        if (queueRef.current.some(t => t.tapId === tapId)) {

            update(queueRef.current.filter(t => t.tapId !== tapId));
            return;

        }

        try {

            const result = await undoTapRequest(tapId);

            if (!result.ok)
                setMessage(result.data.message || "Undo failed.");
            else if (onSent)
                onSent();

        } catch {

            setMessage("Undo failed: no connection. Ask your lead to correct the count.");

        }

    }, [last, onSent, update]);

    return { queue, last, tap, undo, message };

}
