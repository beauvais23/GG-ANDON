//------------------------------------------------------
// America/New_York day and month math
//
// Railway runs in UTC. All plant day/month boundaries
// are New York local time (CLAUDE.md, Plant model).
//------------------------------------------------------

const TZ = "America/New_York";

const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
});

function partsOf(ms) {

    const parts = {};

    for (const { type, value } of formatter.formatToParts(new Date(ms)))
        parts[type] = value;

    return parts;

}

// Milliseconds to add to UTC to get New York wall time (-4h or -5h).
function offsetAt(ms) {

    const p = partsOf(ms);

    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);

    return wall - Math.floor(ms / 1000) * 1000;

}

// Epoch ms of 00:00 New York time on the New York date of `ms`.
// DST switches happen at 02:00, so the offset at midnight is
// the same as the offset at 00:00 UTC of that date.
function startOfDayNY(ms = Date.now()) {

    const p = partsOf(ms);

    const midnightUtc = Date.UTC(+p.year, +p.month - 1, +p.day);

    return midnightUtc - offsetAt(midnightUtc);

}

// "YYYY-MM" of `ms` in New York time.
function monthNY(ms) {

    const p = partsOf(ms);

    return `${p.year}-${p.month}`;

}

// "YYYY-MM-DD" of `ms` in New York time.
function dateNY(ms) {

    const p = partsOf(ms);

    return `${p.year}-${p.month}-${p.day}`;

}

// Hour 0-23 of `ms` in New York time.
function hourNY(ms) {

    return Number(partsOf(ms).hour);

}

module.exports = {
    startOfDayNY,
    monthNY,
    dateNY,
    hourNY
};
