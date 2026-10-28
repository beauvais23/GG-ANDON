const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const { loadApp } = require("./helpers");

const { app, dir } = loadApp();
const backupDir = path.join(dir, "backups");

let admin;
let floor;

async function login(username, password) {

    const res = await request(app).post("/auth/login").send({ username, password });

    return { Authorization: `Bearer ${res.body.token}` };

}

// Binary-safe body for downloads.
function asBuffer(res, callback) {

    const chunks = [];

    res.on("data", chunk => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));

}

before(async () => {

    admin = await login("test_admin", "test-admin-pw");
    floor = await login("test_floor", "test-floor-pw");

    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "andon-20261027T165140Z-before-0001.db"), Buffer.from([0, 1, 2, 255]));
    fs.writeFileSync(path.join(backupDir, "andon-20261028T210000Z-daily-2026-10-28.db"), "daily");
    fs.writeFileSync(path.join(backupDir, "andon-20261029T210000Z-daily-2026-10-29.db.partial"), "cut off");
    fs.writeFileSync(path.join(dir, "secret.txt"), "outside the backup folder");

});

test("floor login cannot list or download backups", async () => {

    assert.equal((await request(app).get("/admin/backups").set(floor)).status, 403);

    const res = await request(app)
        .get("/admin/backups/andon-20261027T165140Z-before-0001.db")
        .set(floor);

    assert.equal(res.status, 403);

});

test("no login: 401", async () => {

    assert.equal((await request(app).get("/admin/backups")).status, 401);

});

test("admin lists backups newest first, with sizes; .partial files hidden", async () => {

    const res = await request(app).get("/admin/backups").set(admin);

    assert.equal(res.status, 200);
    assert.deepEqual(
        res.body.backups.map(b => [b.file, b.sizeBytes]),
        [
            ["andon-20261028T210000Z-daily-2026-10-28.db", 5],
            ["andon-20261027T165140Z-before-0001.db", 4]
        ]
    );

});

test("admin downloads the exact file bytes as an attachment", async () => {

    const res = await request(app)
        .get("/admin/backups/andon-20261027T165140Z-before-0001.db")
        .set(admin)
        .buffer(true)
        .parse(asBuffer);

    assert.equal(res.status, 200);
    assert.match(res.headers["content-disposition"], /attachment; filename="andon-20261027T165140Z-before-0001\.db"/);
    assert.deepEqual([...res.body], [0, 1, 2, 255]);

});

test("rejects anything that is not a backup file name", async () => {

    for (const name of ["..%2Fsecret.txt", "..%2F..%2Fandon.db", "andon.db", "secret.txt", "andon-x.db.partial"]) {

        const res = await request(app).get(`/admin/backups/${name}`).set(admin);

        assert.equal(res.status, 400, name);

    }

});

test("unknown backup name: 404", async () => {

    const res = await request(app)
        .get("/admin/backups/andon-20990101T000000Z-daily-2099-01-01.db")
        .set(admin);

    assert.equal(res.status, 404);

});

test("backup list reports off-site status: off when Google Drive is not configured (#22)", async () => {

    const res = await request(app).get("/admin/backups").set(admin);

    assert.equal(res.status, 200);
    assert.equal(res.body.offsite.enabled, false);
    assert.match(res.body.offsite.reason, /not set/);
    assert.equal(res.body.offsite.stale, false);
    assert.ok(res.body.backups.every(b => b.inDrive === false));

});
