//------------------------------------------------------
// Escalation matrix, shadow mode (migration 0006)
//
// Each open alert is checked against the rules; a step
// that is due is logged once with the people it would
// reach, and nothing is sent. Timers count working
// minutes only (breaks, lunch, after-shift and Fri-Sun
// without overtime don't count). Times below are New York.
//------------------------------------------------------

const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const axios = require("axios");

const { loadApp } = require("./helpers");

const { app } = loadApp();

mock.method(console, "log", () => {});

const { db, statements } = require("../database");
const { evaluateEscalations } = require("../services/escalation");

const MIN = 60 * 1000;

// Thu Oct 29 2026 is EDT (UTC-4); Mon Nov 2 2026 is EST (UTC-5).
const thu = (h, m) => Date.parse(`2026-10-29T${String(h + 4).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
const mon = (h, m) => Date.parse(`2026-11-02T${String(h + 5).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

const realPost = axios.post;
const realFetch = global.fetch;
let outbound = 0;

const addPerson = db.prepare(`
    INSERT INTO response_team (name, department, availability, active, role, line_group, created_at, updated_at)
    VALUES (?, 'Operations', 'Available', 1, ?, ?, 0, 0)
`);

const addAlert = db.prepare(`
    INSERT INTO alerts (facility, production_line, work_center, type, status, requested, acknowledged, priority, created_at, updated_at)
    VALUES ('Malta', ?, 'Assembly', ?, ?, ?, ?, 'NORMAL', ?, ?)
`);

function alertAt(type, line, requested, status = "ACTIVE", acknowledged = null) {

    return addAlert.run(line, type, status, requested, acknowledged, requested, requested).lastInsertRowid;

}

const logFor = id =>
    db.prepare("SELECT step, minutes, role, recipients FROM escalation_log WHERE alert_id = ? ORDER BY id").all(id)
        .map(r => ({ ...r, recipients: JSON.parse(r.recipients) }));

const roles = (id, step) => logFor(id).filter(r => !step || r.step === step).map(r => r.role);

let admin;
let floor;

before(async () => {

    // Anything outbound would be a bug: shadow mode sends nothing.
    process.env.APP_ENV = "production";
    axios.post = async () => { outbound += 1; return { data: {} }; };
    global.fetch = async () => { outbound += 1; return new Response("{}"); };

    addPerson.run("Lead SpaceX", "Production Lead", "SpaceX");
    addPerson.run("Lead Team A", "Production Lead", "Team A");
    addPerson.run("Lead Any", "Production Lead", null);
    addPerson.run("Prod Manager", "Production Manager", null);
    addPerson.run("Mfg Manager", "Manufacturing Manager", null);
    addPerson.run("Director", "Director of Manufacturing", null);
    addPerson.run("Eng One", "Engineering", null);
    addPerson.run("Mfg Engineer", "Manufacturing Engineer", null);

    const login = async (username, password) =>
        ({ Authorization: `Bearer ${(await request(app).post("/auth/login").send({ username, password })).body.token}` });

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

});

after(() => {

    axios.post = realPost;
    global.fetch = realFetch;
    process.env.APP_ENV = "test";

});

test("at start: line-group Production Leads plus the type's roles, logged once", () => {

    const id = alertAt("QUALITY", "Gigabay", thu(10, 0));

    evaluateEscalations(statements, thu(10, 0) + 30 * 1000);

    const start = logFor(id).filter(r => r.step === "START");

    assert.deepEqual(start.map(r => r.role).sort(), ["Engineering", "Manufacturing Engineer", "Production Lead"]);
    assert.deepEqual(start.find(r => r.role === "Production Lead").recipients, ["Lead Any", "Lead SpaceX"]);

    evaluateEscalations(statements, thu(10, 1));

    assert.equal(logFor(id).filter(r => r.step === "START").length, 3, "not logged twice");

});

test("unacknowledged 5 / 10 / 20 working minutes: Production Manager, Manufacturing Manager, Director", () => {

    const id = alertAt("DOWNTIME", "Team A", thu(10, 0));

    evaluateEscalations(statements, thu(10, 0) + 4 * MIN + 59 * 1000);
    assert.deepEqual(roles(id, "UNACK"), []);

    evaluateEscalations(statements, thu(10, 5));
    assert.deepEqual(roles(id, "UNACK"), ["Production Manager"]);

    evaluateEscalations(statements, thu(10, 20));
    assert.deepEqual(roles(id, "UNACK"), ["Production Manager", "Manufacturing Manager", "Director of Manufacturing"]);

    assert.deepEqual(logFor(id).find(r => r.role === "Production Lead").recipients, ["Lead Any", "Lead Team A"]);

});

test("breaks don't count: raised 8:58, still under 5 working minutes at 9:14, due at 9:18", () => {

    const id = alertAt("SUPERVISOR", "Team B", thu(8, 58));

    evaluateEscalations(statements, thu(9, 14));
    assert.deepEqual(roles(id, "UNACK"), []);

    evaluateEscalations(statements, thu(9, 18));
    assert.deepEqual(roles(id, "UNACK"), ["Production Manager"]);

});

test("Thu → Mon: raised Thu 4:18 PM, nothing over the weekend, due Mon 6:08 AM (2 + 3 working minutes)", () => {

    const id = alertAt("MATERIAL", "Deca", thu(16, 18));

    evaluateEscalations(statements, Date.parse("2026-10-31T16:00:00Z"));  // Saturday
    evaluateEscalations(statements, mon(6, 7));
    assert.deepEqual(roles(id, "UNACK"), []);

    evaluateEscalations(statements, mon(6, 8));
    assert.deepEqual(roles(id, "UNACK"), ["Production Manager"]);

});

test("acknowledged: unacknowledged steps stop; still open 30 working minutes after the acknowledge escalates", () => {

    const id = alertAt("MAINTENANCE", "Terabay", thu(13, 0), "ACKNOWLEDGED", thu(13, 2));

    evaluateEscalations(statements, thu(13, 31));
    assert.deepEqual(roles(id, "UNACK"), []);
    assert.deepEqual(roles(id, "OPEN_ACK"), []);

    evaluateEscalations(statements, thu(13, 32));
    assert.deepEqual(roles(id, "OPEN_ACK").sort(), ["Manufacturing Manager", "Production Manager"]);

});

test("no one in the role is still logged (that is what shadow data should show)", () => {

    const id = alertAt("SAFETY", "Team A", thu(10, 0));

    evaluateEscalations(statements, thu(10, 1));

    const ci = logFor(id).find(r => r.role === "CI and Safety Specialist");

    assert.deepEqual(ci.recipients, []);

});

test("never escalated: near misses, resolved and cancelled alerts; inactive rules don't fire", () => {

    const nm = alertAt("NEAR_MISS", "Team A", thu(10, 0));
    const done = alertAt("QUALITY", "Team A", thu(10, 0), "RESOLVED");
    const gone = alertAt("QUALITY", "Team B", thu(10, 0), "CANCELLED");

    const director = statements.getEscalationRules.all().find(r => r.role === "Director of Manufacturing");
    statements.updateEscalationRule.run(director.minutes, 0, Date.now(), director.id);

    const id = alertAt("DOWNTIME", "Gigabay", thu(10, 0));

    evaluateEscalations(statements, thu(11, 0));

    assert.deepEqual(logFor(nm), []);
    assert.deepEqual(logFor(done), []);
    assert.deepEqual(logFor(gone), []);
    assert.ok(!roles(id).includes("Director of Manufacturing"));

    statements.updateEscalationRule.run(director.minutes, 1, Date.now(), director.id);

});

test("shadow mode sends nothing: no Telegram, no Google Chat", () => {

    assert.equal(outbound, 0);

});

test("admin routes: matrix, edit minutes, add/delete a rule, set a person's role, shadow log summary; floor refused", async () => {

    const m = await request(app).get("/admin/escalation").set(admin);

    assert.equal(m.status, 200);
    assert.equal(m.body.shadow, true);
    assert.equal(m.body.rules.length, 13);
    assert.ok(m.body.roles.includes("Manufacturing Engineer"));
    assert.ok(m.body.lineGroups.includes("SpaceX"));
    assert.ok(!m.body.alertTypes.includes("NEAR_MISS"));

    assert.equal((await request(app).get("/admin/escalation").set(floor)).status, 403);

    const pm = m.body.rules.find(r => r.role === "Production Manager" && r.step === "UNACK");

    assert.equal((await request(app).put(`/admin/escalation/rules/${pm.id}`).set(admin).send({ minutes: 7 })).body.rule.minutes, 7);
    assert.equal((await request(app).put(`/admin/escalation/rules/${pm.id}`).set(admin).send({ minutes: -1 })).status, 400);
    await request(app).put(`/admin/escalation/rules/${pm.id}`).set(admin).send({ minutes: 5 });

    for (const body of [{}, { alertType: "NEAR_MISS", step: "START", role: "Engineering" }, { alertType: "*", step: "UNACK", minutes: 5, role: "Janitor" }])
        assert.equal((await request(app).post("/admin/escalation/rules").set(admin).send(body)).status, 400);

    const added = await request(app).post("/admin/escalation/rules").set(admin)
        .send({ alertType: "SAFETY", step: "UNACK", minutes: 3, role: "Director of Manufacturing" });

    assert.equal(added.status, 201);
    assert.equal((await request(app).delete(`/admin/escalation/rules/${added.body.rule.id}`).set(admin)).status, 200);

    const person = m.body.team.find(p => p.name === "Eng One");

    assert.equal((await request(app).put(`/admin/escalation/people/${person.id}`).set(admin).send({ role: "Boss" })).status, 400);
    assert.equal((await request(app).put(`/admin/escalation/people/${person.id}`).set(admin).send({ role: "Production Lead", lineGroup: "Team B" })).status, 200);

    const after = (await request(app).get("/admin/escalation").set(admin)).body.team.find(p => p.id === person.id);

    assert.equal(after.role, "Production Lead");
    assert.equal(after.line_group, "Team B");

    const log = await request(app).get("/admin/escalation/log?days=90").set(admin);

    assert.equal(log.status, 200);
    assert.ok(log.body.events.length > 0);
    assert.ok(log.body.summary.some(s => s.role === "CI and Safety Specialist" && s.nobody >= 1));

});
