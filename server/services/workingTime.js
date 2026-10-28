//------------------------------------------------------
// Working time (defect #18)
//
// MTTA/MTTR count working minutes only: inside a shift
// and outside planned downtime (CLAUDE.md, Plant model).
// All clock times are America/New_York.
//
// Shift days:
//   - Mon-Thu, the standard shift.
//   - Fri/Sat/Sun only when that day was an overtime day.
//     There is no OT schedule yet, so a Fri-Sun day counts
//     as OT when at least one alert was raised on it, and
//     it uses the standard schedule.
//------------------------------------------------------

const { offsetAt, dateNY, monthNY } = require("./nyTime");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Working windows in minutes after midnight. The gaps are the
// planned downtime:
//   6:00-6:05 AM start-up, 9:00-9:15 AM break 1,
//   11:00-11:30 AM lunch, 2:00-2:15 PM break 2,
//   4:20-4:30 PM clean-up / EOD huddle.
// Total 175 + 105 + 150 + 125 = 555 min.
const WORK_WINDOWS = [
    [6 * 60 + 5, 9 * 60],
    [9 * 60 + 15, 11 * 60],
    [11 * 60 + 30, 14 * 60],
    [14 * 60 + 15, 16 * 60 + 20]
];

const STANDARD_DAYS = new Set([1, 2, 3, 4]); // Mon-Thu

// Epoch ms of a New York wall-clock time. dayUtc is 00:00 UTC of
// the calendar date. Shift times are far from the 2 AM DST switch,
// so two passes always settle.
function nyWallToEpoch(dayUtc, minutes) {

    const wall = dayUtc + minutes * MINUTE;

    let t = wall - offsetAt(wall);

    t = wall - offsetAt(t);

    return t;

}

function calendarDayUtc(ms) {

    const [y, m, d] = dateNY(ms).split("-").map(Number);

    return Date.UTC(y, m - 1, d);

}

// Working milliseconds between two epoch ms timestamps.
// overtimeDates: Set of "YYYY-MM-DD" (New York) Fri-Sun OT days.
function workingMs(start, end, overtimeDates = new Set()) {

    if (!(end > start))
        return 0;

    let total = 0;

    const lastDay = calendarDayUtc(end);

    for (let day = calendarDayUtc(start); day <= lastDay; day += DAY) {

        const weekday = new Date(day).getUTCDay();
        const date = new Date(day).toISOString().slice(0, 10);

        if (!STANDARD_DAYS.has(weekday) && !overtimeDates.has(date))
            continue;

        for (const [from, to] of WORK_WINDOWS) {

            const a = Math.max(start, nyWallToEpoch(day, from));
            const b = Math.min(end, nyWallToEpoch(day, to));

            if (b > a)
                total += b - a;

        }

    }

    return total;

}

// New York dates (Fri-Sun) on which any alert was raised.
function overtimeDatesFrom(alerts) {

    const dates = new Set();

    for (const alert of alerts) {

        if (!alert.requested)
            continue;

        const date = dateNY(Number(alert.requested));
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

        if (!STANDARD_DAYS.has(weekday))
            dates.add(date);

    }

    return dates;

}

function averageSeconds(spansMs) {

    if (spansMs.length === 0)
        return null;

    return Math.round(spansMs.reduce((a, b) => a + b, 0) / spansMs.length / 1000);

}

// Response (requested -> acknowledged) and resolution
// (requested -> resolved) averages in working seconds.
// Same alert populations as the old SQL:
//   response: every alert with an acknowledged time,
//   resolution: RESOLVED alerts only (cancelled excluded, #8).
function responseStats(alerts) {

    const ot = overtimeDatesFrom(alerts);

    const response = [];
    const resolution = [];
    const responseByMonth = new Map();
    const resolutionByMonth = new Map();

    for (const alert of alerts) {

        const requested = Number(alert.requested);

        if (!requested)
            continue;

        const month = monthNY(requested);

        if (alert.acknowledged) {

            const ms = workingMs(requested, Number(alert.acknowledged), ot);

            response.push(ms);

            if (!responseByMonth.has(month))
                responseByMonth.set(month, []);

            responseByMonth.get(month).push(ms);

        }

        if (alert.status === "RESOLVED" && alert.resolved) {

            const ms = workingMs(requested, Number(alert.resolved), ot);

            resolution.push(ms);

            if (!resolutionByMonth.has(month))
                resolutionByMonth.set(month, []);

            resolutionByMonth.get(month).push(ms);

        }

    }

    const trend = (byMonth, key) =>
        [...byMonth.keys()].sort().map(month => ({
            month,
            [key]: averageSeconds(byMonth.get(month))
        }));

    return {
        avgResponseSeconds: averageSeconds(response),
        avgResolutionSeconds: averageSeconds(resolution),
        responseTrend: trend(responseByMonth, "responseSeconds"),
        resolutionTrend: trend(resolutionByMonth, "resolutionSeconds")
    };

}

module.exports = {
    WORK_WINDOWS,
    workingMs,
    overtimeDatesFrom,
    responseStats
};
