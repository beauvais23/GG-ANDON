// G&G Non Conformance Report (Google Form). SCRAP on the tablet
// opens it for the scrapped unit. Until the Director sends the
// form's pre-filled link (⋮ → Get pre-filled link), ENTRY is empty
// and the plain form opens; then fill in the entry IDs below and
// FORM_URL with the /d/e/…/viewform address from that link.

const FORM_URL = "https://docs.google.com/forms/d/1lCsrEJx4JtFaqoX9HQkiWjCPxp0RSqDhrR2Z0EROY90/viewform";

const ENTRY = {
    // partNumber: "entry.…",    // Affected Part Number
    // failureCode: "entry.…",   // Failure Code (exact option text)
    // quantity: "entry.…",      // Quantity
    // station: "entry.…",       // Station of Occurence (exact option text)
    // description: "entry.…"    // brief description of the observed defect
};

// Station of Occurence per board (Director, Nov 3 2026), exact
// option text. Count station = the board's final test; PCB Test
// = its PCB station. Blank → the operator picks it in the form.
// Team A final test = A11, Gigabay final test = C6 (Director,
// Nov 4 2026). Deca E3 is not in the form yet (Deca will have
// E1-E3 like Terabay).
const STATIONS = {
    FINAL: {
        "Team A": "A11 - TEAM A LEAK TEST",
        "Gigabay": "C6 - GIGABAY PCB TEST / DEPANEL",
        "Team B": "B12 - TEAM B FINAL TESTING",
        "Terabay": "D3 - TERABAY TESTING",
        "Gigabay - Vertical": "V1 - GIGA VERTICAL STATION"
    },
    PCB: {
        "Gigabay": "C6 - GIGABAY PCB TEST / DEPANEL"
    }
};

export function ncmFormUrl(failure) {

    const values = {
        partNumber: failure.sku,
        failureCode: failure.codeLabel || failure.code,
        quantity: "1",
        station: STATIONS[failure.station === "PCB" ? "PCB" : "FINAL"][failure.board] || "",
        description: `ANDON ${failure.board} ${failure.work_center || ""}: ${failure.codeLabel || failure.code}`.trim()
    };

    const params = new URLSearchParams();

    for (const [key, id] of Object.entries(ENTRY))
        if (id && values[key])
            params.set(id, values[key]);

    const query = params.toString();

    return query ? `${FORM_URL}?${query}` : FORM_URL;

}
