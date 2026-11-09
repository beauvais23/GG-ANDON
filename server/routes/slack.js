const crypto = require("crypto");
const express = require("express");

const { signingSecret, resolveModal, cancelModal, openModal, tellUser, CANCEL_REASONS } = require("../services/slack");

//------------------------------------------------------
// Slack S2 (Nov 9 2026): button presses from #andon-alerts
//
// POST /slack/interact (Slack app → Interactivity request URL).
// Every request must carry a valid Slack signature (HMAC-SHA256
// of "v0:<timestamp>:<raw body>" with this environment's signing
// secret, timestamp within 5 minutes), else 401. Production uses
// SLACK_SIGNING_SECRET, anywhere else SLACK_STAGING_SIGNING_SECRET.
//
// The Slack user must be linked to a responder (Admin →
// Responders → Slack member ID); the action is recorded under
// that responder's name, exactly like the web screens:
//   Acknowledge (ACTIVE)        → ACKNOWLEDGED, responder Responding
//   Resolve (ACKNOWLEDGED)      → box "What fixed it?" (1–500) → RESOLVED
//   Cancel (ACTIVE/ACKNOWLEDGED)→ box with the tablet's reasons →
//                                 CANCELLED "Cancelled by <name>: <reason>"
// A press that lost a race (already acknowledged, resolved,
// cancelled) gets a private answer saying so; nothing changes.
// Notifications (Slack message, Telegram, Chat) go out through the
// same queue as every other path.
//------------------------------------------------------

const MAX_AGE_S = 5 * 60;

function verified(req, raw) {

    const secret = signingSecret();
    const ts = req.get("X-Slack-Request-Timestamp");
    const sig = req.get("X-Slack-Signature") || "";

    if (!secret || !ts || !/^v0=[a-f0-9]{64}$/.test(sig))
        return false;

    if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_S)
        return false;

    const mine = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");

    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig));

}

function conflictText(alert, id) {

    if (!alert)
        return `Alert #${id} was not found.`;

    if (alert.status === "RESOLVED")
        return `Alert #${id} is already resolved by ${alert.resolved_by || "another responder"}.`;

    if (alert.status === "CANCELLED")
        return `Alert #${id} was cancelled.`;

    if (alert.status === "ACKNOWLEDGED")
        return `Alert #${id} is already acknowledged by ${alert.assigned_to || "another responder"}.`;

    return `Acknowledge alert #${id} before resolving it.`;

}

const NOT_LINKED = "Your Slack account isn't linked to a responder yet, so this wasn't recorded. Ask an admin to add your Slack member ID in ManufacturingOS → Admin → Responders (Slack profile → ⋮ → Copy member ID).";

function slackRoutes({ statements, releaseResponders, queueNotification, notifyAcknowledged, notifyResolved, notifyCancelled }) {

    const router = express.Router();

    const responderFor = slackUserId => (slackUserId ? statements.getResponderBySlack.get(slackUserId) || null : null);

    router.post("/slack/interact", express.raw({ type: "application/x-www-form-urlencoded", limit: "1mb" }), async (req, res) => {

        const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

        if (!verified(req, raw)) {

            console.warn("✗ Slack interact: signature missing or invalid (refused)");
            return res.sendStatus(401);

        }

        let payload;

        try {

            payload = JSON.parse(new URLSearchParams(raw).get("payload") || "");

        }

        catch {

            return res.sendStatus(400);

        }

        const person = responderFor(payload.user && payload.user.id);
        const now = Date.now();

        //--------------------------------------------------
        // Button presses
        //--------------------------------------------------

        if (payload.type === "block_actions") {

            const action = (payload.actions || [])[0] || {};
            const id = Number(action.value);
            const alert = id ? statements.getAlert.get(id) : null;

            if (!person) {

                res.sendStatus(200);
                return tellUser(payload.response_url, NOT_LINKED);

            }

            if (action.action_id === "ack") {

                const changed = statements.acknowledgeAlert.run(now, person.name, person.name, now, id).changes;

                res.sendStatus(200);

                if (!changed)
                    return tellUser(payload.response_url, conflictText(statements.getAlert.get(id), id));

                statements.updateResponderAvailability.run("Responding", now, person.name);

                const updated = statements.getAlert.get(id);

                console.log(`✓ Slack acknowledged Alert #${id} by ${person.name}`);
                queueNotification(id, "slack acknowledged", () => notifyAcknowledged(updated));

                return;

            }

            if (action.action_id === "resolve" || action.action_id === "cancel") {

                const open = action.action_id === "resolve" ? alert && alert.status === "ACKNOWLEDGED" : alert && (alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED");

                if (!open) {

                    res.sendStatus(200);
                    return tellUser(payload.response_url, conflictText(alert, id));

                }

                // The box must open within 3 s of the press (trigger_id).
                try {

                    await openModal(payload.trigger_id, action.action_id === "resolve" ? resolveModal(alert) : cancelModal(alert));

                }

                catch (err) {

                    console.error(`✗ Slack: could not open the ${action.action_id} box: ${err.message}`);
                    res.sendStatus(200);
                    return tellUser(payload.response_url, "Couldn't open the box in Slack. Use the Response Center instead.");

                }

                return res.sendStatus(200);

            }

            return res.sendStatus(200);

        }

        //--------------------------------------------------
        // Box submitted
        //--------------------------------------------------

        if (payload.type === "view_submission") {

            const view = payload.view || {};
            const id = Number(view.private_metadata);
            const values = view.state && view.state.values ? view.state.values : {};
            const fail = (block, message) => res.json({ response_action: "errors", errors: { [block]: message } });

            if (!person)
                return fail(view.callback_id === "resolve_alert" ? "note" : "reason", NOT_LINKED.slice(0, 150));

            if (view.callback_id === "resolve_alert") {

                const note = String((values.note && values.note.value && values.note.value.value) || "").trim();

                if (!note)
                    return fail("note", "Say what fixed it.");

                if (note.length > 500)
                    return fail("note", "500 characters at most.");

                const before = statements.getAlert.get(id);
                const changed = statements.resolveAlert.run(now, person.name, note, now, now, id).changes;

                if (!changed)
                    return fail("note", conflictText(statements.getAlert.get(id), id));

                releaseResponders([before && before.assigned_to, person.name], now);

                const updated = statements.getAlert.get(id);

                console.log(`✓ Slack resolved Alert #${id} by ${person.name}`);
                queueNotification(id, "slack resolved", () => notifyResolved(updated));

                return res.json({});

            }

            if (view.callback_id === "cancel_alert") {

                const reason = values.reason && values.reason.value && values.reason.value.selected_option ? values.reason.value.selected_option.value : "";
                const other = String((values.other && values.other.value && values.other.value.value) || "").trim();

                if (!CANCEL_REASONS.includes(reason))
                    return fail("reason", "Pick a reason.");

                if (reason === "Other" && !other)
                    return fail("other", "Say what happened.");

                const before = statements.getAlert.get(id);

                if (!before || (before.status !== "ACTIVE" && before.status !== "ACKNOWLEDGED"))
                    return fail("reason", conflictText(before, id));

                const note = `Cancelled by ${person.name}: ${reason === "Other" ? other : reason}`.slice(0, 500);

                statements.cancelAlert.run(now, now, note, id);

                if (before.status === "ACKNOWLEDGED")
                    releaseResponders([before.assigned_to], now);

                const updated = statements.getAlert.get(id);

                console.log(`✓ Slack cancelled Alert #${id} by ${person.name}`);
                queueNotification(id, "slack cancelled", () => notifyCancelled(updated));

                return res.json({});

            }

        }

        res.sendStatus(200);

    });

    return router;

}

module.exports = { slackRoutes, verified, conflictText };
