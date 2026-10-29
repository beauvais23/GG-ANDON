// Alert colors (E2): the hues the floor already knows, deeper and flat.
// fill = button and header, edge = bright top edge and accents,
// text = readable text on the fill (Material is dark-on-yellow).
export const ALERT_COLORS = {
    QUALITY: { fill: "#B3261E", border: "#D84A41", edge: "#FF6B61", text: "#FFFFFF" },
    MAINTENANCE: { fill: "#C2570C", border: "#E07A1F", edge: "#FFA040", text: "#FFFFFF" },
    MATERIAL: { fill: "#E0A800", border: "#F2C232", edge: "#FFE07A", text: "#111111" },
    SUPERVISOR: { fill: "#1D6A99", border: "#237EB5", edge: "#5AB0E6", text: "#FFFFFF" },
    SAFETY: { fill: "#1E6B34", border: "#2E8B47", edge: "#5CC97A", text: "#FFFFFF" },
    // Option B (Oct 29 2026): purple and teal, apart from the five above.
    DOWNTIME: { fill: "#5B34B0", border: "#6E40C9", edge: "#A78BFA", text: "#FFFFFF" },
    NEAR_MISS: { fill: "#0E6F78", border: "#0E7C86", edge: "#2DD4BF", text: "#FFFFFF" }
};

// How a type reads on screen: NEAR_MISS → "NEAR MISS".
export function alertLabel(type) {
    return String(type || "").replace(/_/g, " ");
}

export const FALLBACK_COLOR = { fill: "#1B2027", border: "#333B45", edge: "#5AB0E6", text: "#E8EDF2" };
