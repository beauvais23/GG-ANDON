import { RAG_COLORS } from "./ragColors";

// FPY colours (0012): green at or above the company target (99%),
// amber down to fpy_amber_pct (97%), red below. Admin-editable in
// Admin → Products & rates → Board colours.
export function fpyRag(fpy, settings = {}) {

    if (fpy === null || fpy === undefined)
        return null;

    const green = settings.fpy_green_pct ?? 99;
    const amber = settings.fpy_amber_pct ?? 97;

    return fpy >= green ? "green" : fpy >= amber ? "amber" : "red";

}

export const fpyColor = (fpy, settings) => RAG_COLORS[fpyRag(fpy, settings)] || "#8B96A3";
