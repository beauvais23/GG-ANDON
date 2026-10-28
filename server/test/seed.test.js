const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadApp } = require("./helpers");

loadApp();

const { db } = require("../database");

test("fresh database: no responders seeded (hard rule 4); lines and work centers still seeded", () => {

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM response_team").get().n, 0);

    const lines = db.prepare("SELECT name FROM production_lines ORDER BY display_order").all().map(r => r.name);

    assert.deepEqual(lines, ["Team A", "Team B", "Gigabay", "Terabay"]);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM work_centers").get().n > 0);

});
