const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const { loadApp } = require("./helpers");

//------------------------------------------------------
// Google sign-in (Director, Nov 11 2026): any verified ggled.net Google
// account; first sign-in creates the user (role user = old production
// access); ADMIN_EMAILS are always admin; Admin → Users switches roles
// and blocks, effective at once; the password logins stay as backup.
//------------------------------------------------------

process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.ADMIN_EMAILS = "boss@ggled.net";

const { app } = loadApp();
const { setKeyFetcher } = require("../services/googleAuth");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

setKeyFetcher(async () => ({ keys: [jwk], maxAge: 3600 }));

const idToken = (claims = {}, opts = {}) => jwt.sign({
    iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, sub: "1",
    email: "pat@ggled.net", email_verified: true, hd: "ggled.net", name: "Pat Example", ...claims
}, opts.key || privateKey, { algorithm: "RS256", keyid: opts.kid || "k1", expiresIn: opts.exp || "1h" });

const signIn = credential => request(app).post("/auth/google").send({ credential });
const bearer = t => ({ Authorization: `Bearer ${t}` });

test("config: the login page gets the public client ID and domain", async () => {

    const r = await request(app).get("/auth/config").expect(200);

    assert.equal(r.body.googleClientId, process.env.GOOGLE_CLIENT_ID);
    assert.equal(r.body.domain, "ggled.net");

});

test("sign-in: ggled.net → user (production access); other domains, unverified, wrong audience, forged or expired tokens refused", async () => {

    const ok = await signIn(idToken()).expect(200);

    assert.equal(ok.body.role, "production");
    assert.equal(ok.body.name, "Pat Example");
    assert.equal(jwt.verify(ok.body.token, process.env.AUTH_SECRET).email, "pat@ggled.net");
    await request(app).get("/backlog/rep-channels").set(bearer(ok.body.token)).expect(200);
    await request(app).get("/admin/users").set(bearer(ok.body.token)).expect(403);

    await signIn(idToken({ email: "x@gmail.com", hd: undefined })).expect(401);
    await signIn(idToken({ email: "x@other.com", hd: "other.com" })).expect(401);
    await signIn(idToken({ email_verified: false })).expect(401);
    await signIn(idToken({ aud: "someone-else" })).expect(401);
    await signIn(idToken({}, { exp: -10 })).expect(401);

    const { privateKey: other } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

    await signIn(idToken({}, { key: other })).expect(401);
    await signIn("not-a-token").expect(401);

});

test("admins: ADMIN_EMAILS is admin from the first sign-in and can't be demoted; admin promotes, demotes and blocks others at once", async () => {

    const boss = (await signIn(idToken({ email: "boss@ggled.net", name: "Boss" })).expect(200)).body;

    assert.equal(boss.role, "admin");

    const pat = (await signIn(idToken()).expect(200)).body;
    const list = await request(app).get("/admin/users").set(bearer(boss.token)).expect(200);

    assert.deepEqual(list.body.users.map(u => [u.email, u.role, u.fixedAdmin]).sort(), [["boss@ggled.net", "admin", true], ["pat@ggled.net", "user", false]]);

    await request(app).put("/admin/users/boss@ggled.net").set(bearer(boss.token)).send({ role: "user" }).expect(409);

    await request(app).put("/admin/users/pat@ggled.net").set(bearer(boss.token)).send({ role: "admin" }).expect(200);

    const patAdmin = (await signIn(idToken()).expect(200)).body;

    assert.equal(patAdmin.role, "admin");
    await request(app).get("/admin/users").set(bearer(patAdmin.token)).expect(200);
    await request(app).put("/admin/users/pat@ggled.net").set(bearer(patAdmin.token)).send({ role: "user" }).expect(409, /own admin/);

    await request(app).put("/admin/users/pat@ggled.net").set(bearer(boss.token)).send({ role: "user" }).expect(200);
    await request(app).get("/admin/users").set(bearer(patAdmin.token)).expect(403, /Administrator/, "old admin token loses admin at once");

    await request(app).put("/admin/users/pat@ggled.net").set(bearer(boss.token)).send({ active: false }).expect(200);
    await request(app).get("/backlog/rep-channels").set(bearer(pat.token)).expect(401, /blocked/);
    await signIn(idToken()).expect(403, /blocked/);

    await request(app).put("/admin/users/pat@ggled.net").set(bearer(boss.token)).send({ active: true }).expect(200);
    await signIn(idToken()).expect(200);

});

test("backup: the admin and production password logins still work", async () => {

    const r = await request(app).post("/auth/login").send({ username: "test_admin", password: "test-admin-pw" }).expect(200);

    assert.equal(r.body.role, "admin");
    await request(app).get("/admin/users").set(bearer(r.body.token)).expect(200);
    await request(app).post("/auth/login").send({ username: "test_floor", password: "test-floor-pw" }).expect(200);

});
