//------------------------------------------------------
// 0027 Google sign-in users (Director, Nov 11 2026)
//
// Anyone with a ggled.net Google account can sign in. One row per
// person, created at their first sign-in: role 'user' (same access as
// the old shared production login) or 'admin'; active = 0 blocks
// sign-in and ends open sessions. Emails listed in ADMIN_EMAILS are
// always admin and can't be switched off in the app.
//
// Reversible: down drops the table.
//------------------------------------------------------

function up(db) {

    db.exec(`
        CREATE TABLE users (
            email TEXT PRIMARY KEY,
            name TEXT,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            last_login_at INTEGER,
            login_count INTEGER NOT NULL DEFAULT 0,
            updated_by TEXT,
            updated_at INTEGER
        )
    `);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS users");

}

module.exports = { up, down };
