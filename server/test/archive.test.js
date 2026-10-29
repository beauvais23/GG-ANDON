//------------------------------------------------------
// Archive instead of delete (defect #15)
//
// DELETE on a production line or responder archives it:
// hidden everywhere, history kept, restorable from Admin.
// Refused while it still has open alerts.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

// Quiet: the server logs every request.
mock.method(console, "log", () => {});

let admin;
let floor;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

const get = async (path, who = admin) => {

    const res = await request(app).get(path).set(who);

    return res.body.data || res.body;

};

async function newLine(name) {

    const res = await request(app).post("/production-lines").set(admin)
        .send({ name, facility: "Malta", display_order: 50 });

    assert.equal(res.status, 200, res.text);

    return (await get("/production-lines")).find(l => l.name === name);

}

async function newWorkCenter(line, name, active = 1) {

    const res = await request(app).post("/work-centers").set(admin)
        .send({ name, production_line_id: line.id, facility: "Malta", display_order: 1, active });

    assert.ok(res.status < 300, res.text);

}

async function newResponder(name) {

    const res = await request(app).post("/response-team").set(admin)
        .send({ name, department: "Operations" });

    assert.equal(res.status, 201, res.text);

    return res.body.responder;

}

const raise = (line, workCenter, type = "QUALITY") =>
    request(app).post("/alerts").set(floor).send({ productionLine: line, workCenter, type });

before(async () => {

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

});

test("archiving a line hides it and its work centers everywhere; restore brings both back unchanged", async () => {

    const line = await newLine("Archive Line");

    await newWorkCenter(line, "Bench 1");
    await newWorkCenter(line, "Bench 2", 0);   // inactive before archiving

    // An alert in its history (cancelled, so the line has none open).
    const raised = await raise("Archive Line", "Bench 1");
    assert.equal(raised.status, 200);
    await request(app).patch(`/alerts/${raised.body.alert.id}/cancel`).set(floor);

    const res = await request(app).delete(`/production-lines/${line.id}`).set(admin);

    assert.equal(res.status, 200, res.text);
    assert.match(res.body.message, /archived/);

    assert.ok(!(await get("/production-lines")).some(l => l.id === line.id));
    assert.ok(!(await get("/work-centers")).some(w => w.production_line_id === line.id));
    assert.deepEqual(await get("/work-centers/line/Archive%20Line", floor), []);

    const archived = (await get("/production-lines/archived")).find(l => l.id === line.id);

    assert.ok(archived.archived_at > 0);
    assert.equal(archived.active, 0);

    // The tablet can't raise on it; its history is still there.
    assert.equal((await raise("Archive Line", "Bench 1")).status, 400);
    const { db } = require("../database");

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE production_line='Archive Line'").get().n, 1);

    const restored = await request(app).post(`/production-lines/${line.id}/restore`).set(admin);

    assert.equal(restored.status, 200, restored.text);

    const back = (await get("/production-lines")).find(l => l.id === line.id);

    assert.equal(back.active, 1);
    assert.equal(back.archived_at, null);

    const benches = (await get("/work-centers"))
        .filter(w => w.production_line_id === line.id)
        .map(w => [w.name, w.active]);

    assert.deepEqual(benches.sort(), [["Bench 1", 1], ["Bench 2", 0]]);
    assert.equal((await raise("Archive Line", "Bench 1", "SAFETY")).status, 200);

});

test("a line with an open alert can't be archived", async () => {

    const line = await newLine("Busy Line");

    await newWorkCenter(line, "Bench");

    const raised = await raise("Busy Line", "Bench");

    const res = await request(app).delete(`/production-lines/${line.id}`).set(admin);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Busy Line has 1 open alert\(s\)/);
    assert.ok((await get("/production-lines")).some(l => l.id === line.id));

    // Cancelled: now it can.
    await request(app).patch(`/alerts/${raised.body.alert.id}/cancel`).set(floor);

    assert.equal((await request(app).delete(`/production-lines/${line.id}`).set(admin)).status, 200);

});

test("a new line can't take an archived line's name; the message says to restore it", async () => {

    const line = await newLine("Old Line");

    await request(app).delete(`/production-lines/${line.id}`).set(admin);

    const res = await request(app).post("/production-lines").set(admin)
        .send({ name: "Old Line", facility: "Malta" });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /archived line is named Old Line\. Restore it/);

    const dup = await request(app).post("/production-lines").set(admin)
        .send({ name: "Team A", facility: "Malta" });

    assert.equal(dup.status, 409);
    assert.match(dup.body.message, /already exists/);

});

test("archiving a responder hides them from pickers; restore brings them back", async () => {

    const responder = await newResponder("Archive Responder");

    const res = await request(app).delete(`/response-team/${responder.id}`).set(admin);

    assert.equal(res.status, 200, res.text);
    assert.ok(!(await get("/response-team", floor)).some(r => r.id === responder.id));
    assert.ok((await get("/response-team/archived")).some(r => r.id === responder.id));

    // Same name again while archived: told to restore instead.
    const dup = await request(app).post("/response-team").set(admin)
        .send({ name: "Archive Responder", department: "Operations" });

    assert.equal(dup.status, 409);
    assert.match(dup.body.message, /archived responder has this name/);

    assert.equal((await request(app).post(`/response-team/${responder.id}/restore`).set(admin)).status, 200);

    const back = (await get("/response-team", floor)).find(r => r.id === responder.id);

    assert.equal(back.active, 1);
    assert.equal(back.archived_at, null);

});

test("a responder holding an acknowledged alert can't be archived", async () => {

    const line = await newLine("Ack Line");

    await newWorkCenter(line, "Bench");

    const responder = await newResponder("Busy Responder");
    const raised = await raise("Ack Line", "Bench");

    await request(app).patch(`/alerts/${raised.body.alert.id}/acknowledge`).set(floor)
        .send({ acknowledgedBy: "Busy Responder" });

    const res = await request(app).delete(`/response-team/${responder.id}`).set(admin);

    assert.equal(res.status, 409);
    assert.match(res.body.message, /responding to 1 open alert/);
    assert.ok((await get("/response-team", floor)).some(r => r.id === responder.id));

});

test("not found, already archived, not archived: 404; nothing is ever deleted", async () => {

    const line = await newLine("Twice Line");
    const responder = await newResponder("Twice Responder");

    for (const [path, restore] of [
        [`/production-lines/${line.id}`, `/production-lines/${line.id}/restore`],
        [`/response-team/${responder.id}`, `/response-team/${responder.id}/restore`]
    ]) {

        assert.equal((await request(app).post(restore).set(admin)).status, 404);   // not archived
        assert.equal((await request(app).delete(path).set(admin)).status, 200);
        assert.equal((await request(app).delete(path).set(admin)).status, 404);    // already archived

    }

    assert.equal((await request(app).delete("/production-lines/999999").set(admin)).status, 404);
    assert.equal((await request(app).delete("/response-team/999999").set(admin)).status, 404);

    const { db } = require("../database");

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM production_lines WHERE name='Twice Line'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM response_team WHERE name='Twice Responder'").get().n, 1);

});

test("archive lists and restore are admin only", async () => {

    for (const path of ["/production-lines/archived", "/response-team/archived"]) {

        assert.equal((await request(app).get(path).set(floor)).status, 403);

    }

    assert.equal((await request(app).post("/production-lines/1/restore").set(floor)).status, 403);
    assert.equal((await request(app).post("/response-team/1/restore").set(floor)).status, 403);

});
