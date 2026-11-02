//------------------------------------------------------
// 0006 Escalation matrix, shadow mode (Nov 2 2026)
//
// Locked decision: the admin-configurable matrix ships in
// shadow mode first. It logs who WOULD have been notified
// and sends nothing; it goes live only after thresholds are
// confirmed from shadow data.
//
// - production_lines.line_group: Team A, Team B, SpaceX
//   (CLAUDE.md plant model). Other lines: NULL (their own
//   name is their group).
// - response_team.role / line_group: a person's routing
//   role; line_group only for Production Leads (NULL = all
//   line groups).
// - escalation_rules: who to notify for which alert type,
//   at the start, after N working minutes unacknowledged,
//   or after N working minutes acknowledged but still open.
//   Starting values approved by the Director, Nov 2 2026.
// - escalation_log: one row per alert per rule that would
//   have fired (shadow), with the people it would reach.
//
// Reversible: down drops the tables and the columns.
//------------------------------------------------------

const LINE_GROUPS = [
    ["Team A", "Team A"],
    ["Team B", "Team B"],
    ["Gigabay", "SpaceX"],
    ["Gigabay - Vertical", "SpaceX"],
    ["Terabay", "SpaceX"],
    ["Deca", "SpaceX"]
];

// [alert type ("*" = every type except NEAR_MISS), step, minutes, role]
const DEFAULT_RULES = [
    ["*", "START", 0, "Production Lead"],
    ["*", "UNACK", 5, "Production Manager"],
    ["*", "UNACK", 10, "Manufacturing Manager"],
    ["*", "UNACK", 20, "Director of Manufacturing"],
    ["*", "OPEN_ACK", 30, "Production Manager"],
    ["*", "OPEN_ACK", 30, "Manufacturing Manager"],
    ["SAFETY", "START", 0, "CI and Safety Specialist"],
    ["MATERIAL", "START", 0, "Procurement"],
    ["MATERIAL", "START", 0, "Warehouse Manager"],
    ["QUALITY", "START", 0, "Engineering"],
    ["QUALITY", "START", 0, "Manufacturing Engineer"],
    ["MAINTENANCE", "START", 0, "Engineering"],
    ["MAINTENANCE", "START", 0, "Manufacturing Engineer"]
];

function up(db) {

    db.exec("ALTER TABLE production_lines ADD COLUMN line_group TEXT");
    db.exec("ALTER TABLE response_team ADD COLUMN role TEXT");
    db.exec("ALTER TABLE response_team ADD COLUMN line_group TEXT");

    const setGroup = db.prepare("UPDATE production_lines SET line_group = ? WHERE name = ?");

    for (const [line, group] of LINE_GROUPS)
        setGroup.run(group, line);

    db.exec(`
        CREATE TABLE escalation_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_type TEXT NOT NULL,
            step TEXT NOT NULL CHECK (step IN ('START', 'UNACK', 'OPEN_ACK')),
            minutes INTEGER NOT NULL DEFAULT 0,
            role TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER,
            updated_at INTEGER
        )
    `);

    db.exec(`
        CREATE TABLE escalation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id INTEGER NOT NULL,
            rule_id INTEGER NOT NULL,
            alert_type TEXT NOT NULL,
            production_line TEXT,
            step TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            role TEXT NOT NULL,
            recipients TEXT NOT NULL,
            fired_at INTEGER NOT NULL,
            UNIQUE (alert_id, rule_id)
        )
    `);

    db.exec("CREATE INDEX idx_escalation_log_fired ON escalation_log (fired_at)");

    const now = Date.now();
    const addRule = db.prepare(`
        INSERT INTO escalation_rules (alert_type, step, minutes, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    for (const [type, step, minutes, role] of DEFAULT_RULES)
        addRule.run(type, step, minutes, role, now, now);

}

function down(db) {

    db.exec("DROP TABLE IF EXISTS escalation_log");
    db.exec("DROP TABLE IF EXISTS escalation_rules");
    db.exec("ALTER TABLE response_team DROP COLUMN line_group");
    db.exec("ALTER TABLE response_team DROP COLUMN role");
    db.exec("ALTER TABLE production_lines DROP COLUMN line_group");

}

module.exports = { up, down, DEFAULT_RULES, LINE_GROUPS };
