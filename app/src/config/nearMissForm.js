// G&G Near Miss & Safety Incident Form (Google Form, Safety folder).
// The NEAR MISS alert screen links here with the alert's details
// filled in (kept short so the tablet's QR stays easy to scan).
// IDs come from the form's pre-filled link (Oct 30 2026);
// if a question is replaced in the form, its ID changes: get a new
// pre-filled link and update ENTRY.

const FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSczf6FmlATYeVQKQfD_La7wiPoSxInm-iYyTG28E0F95wITyg/viewform";

const ENTRY = {
    date: "entry.312517433",      // Date it Occurred (YYYY-MM-DD)
    time: "entry.668869833",      // Estimated Time (HH:mm, 24 h)
    location: "entry.69294643",   // Location (short answer)
    type: "entry.979212342"       // Type of Concern or Incident
};

const NY = "America/New_York";

export function nearMissFormUrl(alert) {

    const raised = new Date(Number(alert.requested) || Date.now());

    const date = raised.toLocaleDateString("en-CA", { timeZone: NY });
    const time = raised.toLocaleTimeString("en-GB", { timeZone: NY, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

    const params = new URLSearchParams({
        [ENTRY.date]: date,
        [ENTRY.time]: time,
        [ENTRY.location]: `${alert.production_line} / ${alert.work_center}, ANDON alert ${alert.id}`,
        [ENTRY.type]: "Near Miss"
    });

    return `${FORM_URL}?${params}`;

}
