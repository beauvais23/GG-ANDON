// Alert timing shared by the Response Center and Wallboard (E3).

// Seconds since the alert was raised.
export function ageSeconds(requested, now = Date.now()) {

    return Math.max(0, Math.floor((now - Number(requested)) / 1000));

}

// mm:ss, or h:mm:ss after an hour.
export function formatDuration(totalSeconds) {

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = String(totalSeconds % 60).padStart(2, "0");

    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;

}

export function elapsed(requested, now = Date.now()) {

    return formatDuration(ageSeconds(requested, now));

}

// Waiting 10 minutes or more with nobody on it.
export const CRITICAL_SECONDS = 600;

export function isCritical(alert, now = Date.now()) {

    return alert.status === "ACTIVE" && ageSeconds(alert.requested, now) >= CRITICAL_SECONDS;

}

// Status strip numbers for a list of open alerts.
export function alertStats(alerts, now = Date.now()) {

    const ages = alerts.map(a => ageSeconds(a.requested, now));

    return {
        active: alerts.length,
        waiting: alerts.filter(a => a.status === "ACTIVE").length,
        acknowledged: alerts.filter(a => a.status === "ACKNOWLEDGED").length,
        oldest: formatDuration(ages.length ? Math.max(...ages) : 0),
        average: formatDuration(ages.length ? Math.floor(ages.reduce((a, b) => a + b, 0) / ages.length) : 0)
    };

}
