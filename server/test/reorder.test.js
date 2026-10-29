//------------------------------------------------------
// Reorder routes (defect #21)
//
// PUT /production-lines/order and PUT /work-centers/order
// answer 400 (not 500) on a bad body, and apply the
// whole list or nothing.
//------------------------------------------------------

const { test, before, mock } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app } = loadApp();

// Quiet: the server logs every request.
mock.method(console, "log", () => {});

let admin;
let lines;
let workCenters;

async function login(username, password) {

    const res = await request(app)
        .post("/auth/login")
        .send({ username, password });

    assert.equal(res.status, 200);

    return { Authorization: `Bearer ${res.body.token}` };

}

async function list(path) {

    const res = await request(app).get(path).set(admin);

    return (res.body.data || res.body).slice().sort((a, b) => a.id - b.id);

}

before(async () => {

    admin = await login("test_admin", "test-admin-pw");

    lines = await list("/production-lines");
    assert.ok(lines.length >= 2, "seeded lines exist");

    for (const name of ["Station 1", "Station 2"]) {

        const res = await request(app)
            .post("/work-centers")
            .set(admin)
            .send({ name, production_line_id: lines[0].id, active: 1 });

        assert.ok(res.status < 300, `work center ${name} created`);

    }

    workCenters = await list("/work-centers");
    assert.ok(workCenters.length >= 2);

});

const ROUTES = [
    { path: "/production-lines/order", items: () => lines, all: () => list("/production-lines") },
    { path: "/work-centers/order", items: () => workCenters, all: () => list("/work-centers") }
];

for (const route of ROUTES) {

    test(`${route.path}: empty or malformed body is a 400, nothing changes`, async () => {

        const before = await route.all();

        const bad = [
            undefined,                                   // no body at all
            [],
            {},
            "text",
            [null],
            [{ id: "1", display_order: 1 }],
            [{ id: before[0].id }],
            [{ id: before[0].id, display_order: -1 }],
            [{ id: before[0].id, display_order: 1.5 }]
        ];

        for (const body of bad) {

            const req = request(app).put(route.path).set(admin);
            const res = body === undefined ? await req : await req.send(body);

            assert.equal(res.status, 400, `body ${JSON.stringify(body)}`);
            assert.equal(res.body.success, false);

        }

        assert.deepEqual(await route.all(), before);

    });

    test(`${route.path}: an unknown id is a 400 and rolls back the rest of the list`, async () => {

        const before = await route.all();

        const res = await request(app)
            .put(route.path)
            .set(admin)
            .send([
                { id: before[0].id, display_order: 99 },
                { id: 999999, display_order: 1 }
            ]);

        assert.equal(res.status, 400);
        assert.match(res.body.message, /Unknown .* id: 999999\. Nothing was changed\./);

        assert.deepEqual(
            (await route.all()).map(r => r.display_order),
            before.map(r => r.display_order)
        );

    });

    test(`${route.path}: the Admin screen's payload (full rows, new order) still works`, async () => {

        const rows = route.items().slice().reverse().map((row, i) => ({ ...row, display_order: i + 1 }));

        const res = await request(app).put(route.path).set(admin).send(rows);

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);

        const after = await route.all();

        for (const row of rows) {

            assert.equal(after.find(r => r.id === row.id).display_order, row.display_order);

        }

    });

}

test("reorder still needs an admin", async () => {

    const floor = await login("test_floor", "test-floor-pw");

    const res = await request(app)
        .put("/production-lines/order")
        .set(floor)
        .send([{ id: lines[0].id, display_order: 1 }]);

    assert.equal(res.status, 403);

});
