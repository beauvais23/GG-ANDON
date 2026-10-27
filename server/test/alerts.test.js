const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

const LINE = "Team A";
const WORK_CENTER = "Test Station";
const RESPONDER = "Test Responder";

let floor;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    assert.equal(res.status, 200);

    return { Authorization: `Bearer ${res.body.token}` };

}

function raise(type) {

    return request(app)
        .post("/alerts")
        .set(floor)
        .send({ productionLine: LINE, workCenter: WORK_CENTER, type });

}

function acknowledge(id) {

    return request(app)
        .patch(`/alerts/${id}/acknowledge`)
        .set(floor)
        .send({ acknowledgedBy: RESPONDER });

}

before(async () => {

    const admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    const lines = await request(app).get("/production-lines").set(admin);
    const lineList = lines.body.data || lines.body;
    const line = lineList.find(l => l.name === LINE);

    assert.ok(line, "seeded line exists");

    const wc = await request(app)
        .post("/work-centers")
        .set(admin)
        .send({
            name: WORK_CENTER,
            production_line_id: line.id,
            facility: "Malta",
            display_order: 1,
            active: 1
        });

    assert.ok(wc.status < 300, `work center created (${wc.status})`);

    const responder = await request(app)
        .post("/response-team")
        .set(admin)
        .send({ name: RESPONDER, department: "Operations" });

    assert.equal(responder.status, 201);

});

test("raise → acknowledge → resolve", async () => {

    const raised = await raise("QUALITY");

    assert.equal(raised.status, 200);
    assert.equal(raised.body.alert.status, "ACTIVE");

    const id = raised.body.alert.id;

    const acked = await acknowledge(id);

    assert.equal(acked.status, 200);
    assert.equal(acked.body.alert.status, "ACKNOWLEDGED");
    assert.equal(acked.body.alert.acknowledged_by, RESPONDER);

    const resolved = await request(app)
        .patch(`/alerts/${id}/resolve`)
        .set(floor)
        .send({ resolvedBy: RESPONDER, resolutionNotes: "Replaced fixture" });

    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.alert.status, "RESOLVED");
    assert.equal(resolved.body.alert.resolution_notes, "Replaced fixture");
    assert.ok(resolved.body.alert.resolved >= resolved.body.alert.acknowledged);

});

test("cancel an active alert; a second cancel is rejected", async () => {

    const raised = await raise("MAINTENANCE");
    const id = raised.body.alert.id;

    const cancelled = await request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({});

    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.alert.status, "CANCELLED");

    const again = await request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({});

    assert.equal(again.status, 400);

});

test("duplicate open alert returns 409 with the existing alert", async () => {

    const first = await raise("MATERIAL");

    assert.equal(first.status, 200);

    const duplicate = await raise("MATERIAL");

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.alert.id, first.body.alert.id);

});

test("acknowledge race: two acks, exactly one wins", async () => {

    const raised = await raise("SAFETY");
    const id = raised.body.alert.id;

    const results = await Promise.all([acknowledge(id), acknowledge(id)]);
    const statuses = results.map(r => r.status).sort();

    assert.deepEqual(statuses, [200, 400]);

    const winners = results.filter(r => r.status === 200);

    assert.equal(winners.length, 1);
    assert.equal(winners[0].body.alert.status, "ACKNOWLEDGED");

});
