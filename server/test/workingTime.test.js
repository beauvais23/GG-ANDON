//------------------------------------------------------
// Working minutes for MTTA/MTTR (defect #18)
//
// Times are written as New York local time with their
// offset (-04:00 EDT, -05:00 EST). Planned downtime:
// 6:00-6:05 AM, 9:00-9:15 AM, 11:00-11:30 AM,
// 2:00-2:15 PM, 4:20-4:30 PM.
//------------------------------------------------------

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    workingMs,
    overtimeDatesFrom,
    responseStats
} = require("../services/workingTime");

const T = iso => Date.parse(iso);
const minutes = (start, end, ot) => workingMs(T(start), T(end), ot) / 60000;

// Week of Oct 26 2026 (EDT): Mon 26, Tue 27, Wed 28, Thu 29, Fri 30.

test("a full standard day is 555 working minutes, every Mon-Thu", () => {

    for (const day of ["26", "27", "28", "29"])
        assert.equal(minutes(`2026-10-${day}T06:00:00-04:00`, `2026-10-${day}T16:30:00-04:00`), 555, day);

    assert.equal(minutes("2026-10-26T00:00:00-04:00", "2026-10-29T23:59:00-04:00"), 4 * 555);

});

test("each planned downtime window is excluded", () => {

    assert.equal(minutes("2026-10-28T06:00:00-04:00", "2026-10-28T06:10:00-04:00"), 5);  // start-up
    assert.equal(minutes("2026-10-28T08:55:00-04:00", "2026-10-28T09:20:00-04:00"), 10); // break 1
    assert.equal(minutes("2026-10-28T10:50:00-04:00", "2026-10-28T11:40:00-04:00"), 20); // lunch
    assert.equal(minutes("2026-10-28T13:58:00-04:00", "2026-10-28T14:16:00-04:00"), 3);  // break 2
    assert.equal(minutes("2026-10-28T16:15:00-04:00", "2026-10-28T16:30:00-04:00"), 5);  // clean-up

});

test("an alert raised during lunch starts counting at 11:30 AM", () => {

    assert.equal(minutes("2026-10-28T11:10:00-04:00", "2026-10-28T11:35:00-04:00"), 5);

});

test("outside the shift counts nothing; end before start counts nothing", () => {

    assert.equal(minutes("2026-10-28T18:00:00-04:00", "2026-10-28T19:00:00-04:00"), 0);
    assert.equal(minutes("2026-10-28T05:00:00-04:00", "2026-10-28T06:05:00-04:00"), 0);
    assert.equal(minutes("2026-10-28T12:00:00-04:00", "2026-10-28T11:00:00-04:00"), 0);

});

test("Thu 4:20 PM -> Mon 6:10 AM: 5 minutes with no OT, plus a full day with Saturday OT", () => {

    // Nov 1 is the fall-back Sunday, so Monday is EST.
    const start = "2026-10-29T16:20:00-04:00";
    const end = "2026-11-02T06:10:00-05:00";

    assert.equal(minutes(start, end), 5);
    assert.equal(minutes(start, end, new Set(["2026-10-31"])), 5 + 555);

});

test("Friday is not a shift day unless it is an OT day", () => {

    const start = "2026-10-30T06:00:00-04:00";
    const end = "2026-10-30T16:30:00-04:00";

    assert.equal(minutes(start, end), 0);
    assert.equal(minutes(start, end, new Set(["2026-10-30"])), 555);

});

test("DST spring forward (Sun Mar 8 2026): OT day is 555, weekend span is correct", () => {

    assert.equal(minutes("2026-03-08T06:00:00-04:00", "2026-03-08T16:30:00-04:00", new Set(["2026-03-08"])), 555);

    // Thu 4:00 PM EST -> Mon 6:10 AM EDT: 20 + 5.
    assert.equal(minutes("2026-03-05T16:00:00-05:00", "2026-03-09T06:10:00-04:00"), 25);

});

test("DST fall back (Sun Nov 1 2026): OT day is 555, weekend span is correct", () => {

    assert.equal(minutes("2026-11-01T06:00:00-05:00", "2026-11-01T16:30:00-05:00", new Set(["2026-11-01"])), 555);

    // Thu 4:00 PM EDT -> Mon 6:10 AM EST: 20 + 5.
    assert.equal(minutes("2026-10-29T16:00:00-04:00", "2026-11-02T06:10:00-05:00"), 25);

});

test("OT days: a Fri-Sun New York date with any alert; Mon-Thu never listed", () => {

    const dates = overtimeDatesFrom([
        { requested: T("2026-10-31T09:00:00-04:00") }, // Saturday
        { requested: T("2026-10-30T23:30:00-04:00") }, // Friday night NY, Saturday in UTC
        { requested: T("2026-10-28T09:00:00-04:00") }, // Wednesday
        { requested: null }
    ]);

    assert.deepEqual([...dates].sort(), ["2026-10-30", "2026-10-31"]);

});

test("responseStats: working-time averages; cancelled alerts count for response, not resolution", () => {

    const alerts = [
        // Ack 10 min, resolved 50 min across lunch (10:50 -> 12:10 = 10 + 40).
        {
            status: "RESOLVED",
            requested: T("2026-10-28T10:50:00-04:00"),
            acknowledged: T("2026-10-28T11:00:00-04:00"),
            resolved: T("2026-10-28T12:10:00-04:00")
        },
        // Thu 4:15 PM -> ack Mon 6:10 AM (5 + 5), resolved Mon 6:25 AM (5 + 20).
        {
            status: "RESOLVED",
            requested: T("2026-10-29T16:15:00-04:00"),
            acknowledged: T("2026-11-02T06:10:00-05:00"),
            resolved: T("2026-11-02T06:25:00-05:00")
        },
        // Acknowledged after 6 min, then cancelled after a full day.
        {
            status: "CANCELLED",
            requested: T("2026-10-27T07:00:00-04:00"),
            acknowledged: T("2026-10-27T07:06:00-04:00"),
            resolved: T("2026-10-28T07:00:00-04:00")
        },
        // Still open: in neither average.
        { status: "ACTIVE", requested: T("2026-10-28T08:00:00-04:00") }
    ];

    const stats = responseStats(alerts);

    // Response: (10 + 10 + 6) / 3 = 8.67 min = 520 s.
    assert.equal(stats.avgResponseSeconds, 520);

    // Resolution: (50 + 25) / 2 = 37.5 min = 2250 s.
    assert.equal(stats.avgResolutionSeconds, 2250);

    // All raised in October (New York).
    assert.deepEqual(stats.responseTrend, [{ month: "2026-10", responseSeconds: 520 }]);
    assert.deepEqual(stats.resolutionTrend, [{ month: "2026-10", resolutionSeconds: 2250 }]);

});

test("responseStats with no alerts returns empty averages, not zero", () => {

    assert.deepEqual(responseStats([]), {
        avgResponseSeconds: null,
        avgResolutionSeconds: null,
        responseTrend: [],
        resolutionTrend: []
    });

});
