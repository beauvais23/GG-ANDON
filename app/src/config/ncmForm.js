// G&G Non Conformance Report (Google Form). SCRAP on the tablet
// opens it for the scrapped unit with these questions filled in.
// IDs come from the form's pre-filled link (Director, Nov 4 2026);
// if a question is replaced in the form, its ID changes: get a new
// pre-filled link and update ENTRY. Station and Failure Code must
// match the form's option text exactly. Quantity is not pre-filled
// (not in the link).

const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfC38IyD-wuawc8tTrwpyrdjsAFYBmq3gbw94DRKjA_4Ho16Q/viewform";

const ENTRY = {
    station: "entry.1959917029",      // Station of Occurence (dropdown)
    partNumber: "entry.1729124195",   // Affected Part Number
    failureCode: "entry.956504614",   // Failure Code (dropdown)
    description: "entry.2106367373"   // brief description of the observed defect
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
        station: STATIONS[failure.station === "PCB" ? "PCB" : "FINAL"][failure.board] || "",
        description: failure.station === "PCB" ? "ANDON scrap (PCB Test)" : "ANDON scrap"
    };

    const params = new URLSearchParams();

    for (const [key, id] of Object.entries(ENTRY))
        if (id && values[key])
            params.set(id, values[key]);

    const query = params.toString();

    return query ? `${FORM_URL}?${query}` : FORM_URL;

}
