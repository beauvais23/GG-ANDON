//------------------------------------------------------
// Escalation matrix, SHADOW MODE (locked decision)
//
// Every 30 s, each open alert is checked against the
// admin-editable rules (escalation_rules, migration 0006):
//   START     notify as soon as the alert is open
//   UNACK     still not acknowledged after N working minutes
//   OPEN_ACK  acknowledged, still open N working minutes later
// Working minutes only: inside a shift, outside breaks and
// lunch (services/workingTime.js), like MTTA/MTTR.
//
// SHADOW: each step that would fire is written once to
// escalation_log with the people it would reach, and
// NOTHING IS SENT. It goes live only after the Director
// confirms thresholds from the shadow data.
//
// Near misses are logged, not answered: never escalated.
//------------------------------------------------------

const { workingMs, overtimeDatesFrom } = require("./workingTime");

const ROLES = [
    "Production Lead",
    "Production Manager",
    "Manufacturing Manager",
    "Director of Manufacturing",
    "Leadership",
    "CI and Safety Specialist",
    "Procurement",
    "Warehouse Manager",
    "Inventory and Controls",
    "Engineering",
    "Manufacturing Engineer"
];

const STEPS = ["START", "UNACK", "OPEN_ACK"];

// Line groups (CLAUDE.md plant model), used when a line has no
// line_group set (e.g. lines seeded after migration 0006 ran).
const DEFAULT_LINE_GROUPS = {
    "Team A": "Team A",
    "Team B": "Team B",
    "Gigabay": "SpaceX",
    "Gigabay - Vertical": "SpaceX",
    "Terabay": "SpaceX",
    "Deca": "SpaceX"
};

function lineGroupOf(name, set) {

    return set || DEFAULT_LINE_GROUPS[name] || name;

}

const CHECK_MS = 30 * 1000;
const OT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function isDue(rule, alert, now, ot) {

    if (rule.step === "START")
        return true;

    if (rule.step === "UNACK")
        return alert.status === "ACTIVE" &&
            workingMs(Number(alert.requested), now, ot) >= rule.minutes * MINUTE;

    if (rule.step === "OPEN_ACK")
        return alert.status === "ACKNOWLEDGED" && Boolean(alert.acknowledged) &&
            workingMs(Number(alert.acknowledged), now, ot) >= rule.minutes * MINUTE;

    return false;

}

// Production Leads are per line group; a lead with no line
// group set covers all of them.
function recipientsFor(rule, group, team) {

    return team
        .filter(p => p.active && p.role === rule.role)
        .filter(p => rule.role !== "Production Lead" || !p.line_group || p.line_group === group)
        .map(p => p.name);

}

// Returns the steps that fired now (each alert + rule once).
function evaluateEscalations(statements, now = Date.now()) {

    const open = statements.getActiveAlerts.all().filter(a => a.type !== "NEAR_MISS");

    if (!open.length)
        return [];

    const rules = statements.getActiveEscalationRules.all();
    const team = statements.getRoutingTeam.all();
    const groups = new Map(statements.getLineGroups.all().map(l => [l.name, lineGroupOf(l.name, l.line_group)]));
    const ot = overtimeDatesFrom(statements.getAlertsSince.all(now - OT_LOOKBACK_MS));

    const fired = [];

    for (const alert of open) {

        const group = groups.get(alert.production_line) || lineGroupOf(alert.production_line);

        for (const rule of rules) {

            if (rule.alert_type !== "*" && rule.alert_type !== alert.type)
                continue;

            if (!isDue(rule, alert, now, ot))
                continue;

            const recipients = recipientsFor(rule, group, team);

            const saved = statements.logEscalation.run(
                alert.id,
                rule.id,
                alert.type,
                alert.production_line,
                rule.step,
                rule.minutes,
                rule.role,
                JSON.stringify(recipients),
                now
            );

            if (!saved.changes)
                continue;

            fired.push({ alertId: alert.id, ruleId: rule.id, step: rule.step, minutes: rule.minutes, role: rule.role, recipients });

            console.log(
                `Escalation (shadow, nothing sent): alert #${alert.id} ${alert.type} [${alert.production_line}] ` +
                `${rule.step === "START" ? "at start" : `${rule.minutes} min ${rule.step === "UNACK" ? "unacknowledged" : "acknowledged, still open"}`}` +
                ` → ${rule.role}: ${recipients.length ? recipients.join(", ") : "nobody has this role"}`
            );

        }

    }

    return fired;

}

function startEscalationShadow(statements) {

    const tick = () => {

        try {

            evaluateEscalations(statements);

        } catch (err) {

            console.error("Escalation shadow check failed:", err.message);

        }

    };

    tick();

    const timer = setInterval(tick, CHECK_MS);

    timer.unref?.();

    console.log("Escalation matrix: SHADOW MODE (logs who would be notified, sends nothing), checked every 30 s");

    return timer;

}

module.exports = { ROLES, STEPS, lineGroupOf, evaluateEscalations, startEscalationShadow };
