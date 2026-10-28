const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();
const { db } = require("../database");
const { startOfDayNY, monthNY } = require("../services/nyTime");

const T = iso => Date.parse(iso);

let auth;

function insertAlert({ status, requested, acknowledged = null, resolved = null, cancelled_at = null }) {

    db.prepare(`
        INSERT INTO alerts
        (production_line, work_center, type, status, requested, acknowledged,
         resolved, cancelled_at, created_at, updated_at)
        VALUES ('Team A', 'Assembly', 'QUALITY', ?, ?, ?, ?, ?, ?, ?)
    `).run(status, requested, acknowledged, resolved, cancelled_at, requested, requested);

}

before(async () => {

    const res = await request(app)
        .post("/auth/login")
        .send({ username: "test_floor", password: "test-floor-pw" });

    auth = { Authorization: `Bearer ${res.body.token}` };

});

after(() => mock.timers.reset());

//------------------------------------------------------
// New York time helper
//------------------------------------------------------

test("startOfDayNY: EDT, EST, and both DST change days", () => {

    const cases = [
        ["2026-10-27T03:30:00Z", "2026-10-26T04:00:00.000Z"], // 23:30 EDT Oct 26
        ["2026-10-27T04:30:00Z", "2026-10-27T04:00:00.000Z"], // 00:30 EDT Oct 27
        ["2026-01-15T04:59:59Z", "2026-01-14T05:00:00.000Z"], // 23:59 EST Jan 14
        ["2026-03-08T12:00:00Z", "2026-03-08T05:00:00.000Z"], // spring forward: midnight is EST
        ["2026-11-01T12:00:00Z", "2026-11-01T04:00:00.000Z"]  // fall back: midnight is EDT
    ];

    for (const [now, midnight] of cases)
        assert.equal(new Date(startOfDayNY(T(now))).toISOString(), midnight, now);

});

test("monthNY: month boundary follows New York, not UTC", () => {

    assert.equal(monthNY(T("2026-11-01T02:00:00Z")), "2026-10"); // Oct 31 22:00 EDT
    assert.equal(monthNY(T("2026-11-01T04:00:00Z")), "2026-11"); // Nov 1 00:00 EDT
    assert.equal(monthNY(T("2027-01-01T04:59:00Z")), "2026-12"); // Dec 31 23:59 EST

});

//------------------------------------------------------
// KPIs through the API
//------------------------------------------------------

test("MTTR is working minutes and excludes CANCELLED; resolvedToday counts New York today; months bucket in New York", async () => {

    // Frozen at Mon Oct 26 11:30 PM New York (Oct 27 03:30 UTC).
    mock.timers.enable({ apis: ["Date"], now: T("2026-10-27T03:30:00Z") });

    // 10:00 -> 10:10 AM Monday: 10 working minutes, resolved today in NY.
    insertAlert({ status: "RESOLVED", requested: T("2026-10-26T14:00:00Z"), resolved: T("2026-10-26T14:10:00Z") });

    // 10:50 AM -> 12:10 PM Monday, across lunch: 10 + 40 = 50 working minutes.
    insertAlert({ status: "RESOLVED", requested: T("2026-10-26T14:50:00Z"), resolved: T("2026-10-26T16:10:00Z") });

    // 10:40 -> 11:00 PM Monday: after the shift, 0 working minutes.
    // Resolved today in NY, already Oct 27 in UTC.
    insertAlert({ status: "RESOLVED", requested: T("2026-10-27T02:40:00Z"), resolved: T("2026-10-27T03:00:00Z") });

    // Sun Oct 25 11:29 -> 11:59 PM NY: resolved yesterday in NY, Oct 26 in UTC. 0 working minutes.
    insertAlert({ status: "RESOLVED", requested: T("2026-10-26T03:29:00Z"), resolved: T("2026-10-26T03:59:00Z") });

    // Cancelled after 9:00 AM -> 7:00 PM Monday (380 working minutes): must not count.
    insertAlert({
        status: "CANCELLED",
        requested: T("2026-10-26T13:00:00Z"),
        resolved: T("2026-10-26T23:00:00Z"),
        cancelled_at: T("2026-10-26T23:00:00Z")
    });

    // Raised Oct 31 10:00 PM NY = Nov 1 02:00 UTC: belongs to October.
    insertAlert({ status: "ACTIVE", requested: T("2026-11-01T02:00:00Z") });

    const kpis = await request(app).get("/dashboard/kpis").set(auth);

    assert.equal(kpis.status, 200);
    assert.equal(kpis.body.resolvedToday, 3); // UTC-day logic gives 1, all-time gives 4
    assert.equal(kpis.body.mttr, 15);         // (10 + 50 + 0 + 0) / 4 minutes; clock time gives 35

    const exec = await request(app).get("/dashboard/executive").set(auth);

    assert.equal(exec.status, 200);

    // (600 + 3000 + 0 + 0) / 4 = 900 s. Including the cancel would give 5280.
    assert.equal(exec.body.kpis.avgResolutionSeconds, 900);
    assert.equal(exec.body.kpis.resolvedAlerts, 4);

    assert.deepEqual(exec.body.monthlyTrend, [{ month: "2026-10", total: 6 }]);
    assert.deepEqual(exec.body.resolutionTrend, [{ month: "2026-10", resolutionSeconds: 900 }]);

    mock.timers.reset();

});
