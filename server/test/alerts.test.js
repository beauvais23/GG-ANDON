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

    // Close it, so RESPONDER holds no open alert in later tests (#20).
    const cancelled = await request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({});

    assert.equal(cancelled.status, 200);

});

//------------------------------------------------------
// Responder availability
//------------------------------------------------------

async function availabilityOf(name) {

    const res = await request(app).get("/response-team").set(floor);
    const list = res.body.data || res.body;

    return list.find(r => r.name === name).availability;

}

test("web acknowledge sets Responding; resolve sets Available", async () => {

    const raised = await raise("SUPERVISOR");
    const id = raised.body.alert.id;

    await acknowledge(id);

    assert.equal(await availabilityOf(RESPONDER), "Responding");

    await request(app)
        .patch(`/alerts/${id}/resolve`)
        .set(floor)
        .send({ resolvedBy: RESPONDER, resolutionNotes: "Done" });

    assert.equal(await availabilityOf(RESPONDER), "Available");

});

test("cancelling an acknowledged alert sets the responder back to Available and records cancelled_at", async () => {

    const raised = await raise("QUALITY");
    const id = raised.body.alert.id;

    await acknowledge(id);

    assert.equal(await availabilityOf(RESPONDER), "Responding");

    const cancelled = await request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({});

    assert.equal(cancelled.status, 200);
    assert.ok(cancelled.body.alert.cancelled_at > 0);
    assert.equal(await availabilityOf(RESPONDER), "Available");

});

test("responder availability is stored as one enum; unknown values rejected", async () => {

    const admin = await login("test_admin", "test-admin-pw");

    const busy = await request(app)
        .post("/response-team")
        .set(admin)
        .send({ name: "Enum Check", department: "Quality", availability: "busy" });

    assert.equal(busy.status, 201);
    assert.equal(await availabilityOf("Enum Check"), "Busy");

    const bad = await request(app)
        .post("/response-team")
        .set(admin)
        .send({ name: "Enum Check 2", department: "Quality", availability: "Sleeping" });

    assert.equal(bad.status, 400);

});

//------------------------------------------------------
// Resolution notes (#14)
//------------------------------------------------------

test("resolve requires a real note: missing, blank, or over 500 chars → 400; valid note stored trimmed", async () => {

    const raised = await raise("MAINTENANCE");
    const id = raised.body.alert.id;

    await acknowledge(id);

    for (const body of [
        { resolvedBy: RESPONDER },
        { resolvedBy: RESPONDER, resolutionNotes: "   " },
        { resolvedBy: RESPONDER, resolutionNotes: "x".repeat(501) }
    ]) {

        const res = await request(app).patch(`/alerts/${id}/resolve`).set(floor).send(body);

        assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));

    }

    const ok = await request(app)
        .patch(`/alerts/${id}/resolve`)
        .set(floor)
        .send({ resolvedBy: RESPONDER, resolutionNotes: "  Reseated drive belt  " });

    assert.equal(ok.status, 200);
    assert.equal(ok.body.alert.resolution_notes, "Reseated drive belt");

});

//------------------------------------------------------
// Cancel with a reason from /supervisor or /dashboard (#26)
//------------------------------------------------------

test("cancel with a reason stores who and why; the tablet's plain cancel still works", async () => {

    const raised = await raise("QUALITY");
    const id = raised.body.alert.id;

    await acknowledge(id);

    const cancelled = await request(app)
        .patch(`/alerts/${id}/cancel`)
        .set(floor)
        .send({ reason: "  Smoke test after release  ", cancelledBy: RESPONDER });

    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.alert.status, "CANCELLED");
    assert.equal(cancelled.body.alert.resolution_notes, `Cancelled by ${RESPONDER}: Smoke test after release`);

    // Tablet: no body, no note.
    const tablet = await raise("QUALITY");
    const plain = await request(app).patch(`/alerts/${tablet.body.alert.id}/cancel`).set(floor);

    assert.equal(plain.status, 200);
    assert.equal(plain.body.alert.status, "CANCELLED");
    assert.equal(plain.body.alert.resolution_notes, null);

});

test("cancel reason: blank or over 500 chars is rejected and the alert stays open", async () => {

    const raised = await raise("SAFETY");
    const id = raised.body.alert.id;

    for (const reason of ["   ", "", "x".repeat(501), 42]) {

        const res = await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({ reason });

        assert.equal(res.status, 400, JSON.stringify(reason));
        assert.match(res.body.message, /Cancel reason is required/);

    }

    const ok = await request(app).patch(`/alerts/${id}/cancel`).set(floor).send({ reason: "Pressed by mistake" });

    assert.equal(ok.status, 200);
    assert.equal(ok.body.alert.resolution_notes, "Cancelled: Pressed by mistake");

});
