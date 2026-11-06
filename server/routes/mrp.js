const express = require("express");

const { authenticateToken } = require("../middleware/auth");
const { computeMrp } = require("../services/mrp");
const { LINE_GROUPS } = require("../services/qbBom");
const { dateNY } = require("../services/nyTime");

//------------------------------------------------------
// Material check (MRP bridge, Nov 6 2026). Any login.
// GET /mrp?weeks=8&group=All&holds=0&refresh=0
//   weeks   demand window: open SO lines due within N weeks
//           (1-52, default 8); past due always in
//   group   line group of the ordered item (Team A, Team B,
//           SpaceX, PCB Coating, Other) or All
//   holds   1 = include orders on HOLD
//   refresh 1 = re-read QuickBooks now (at most every 5 min)
// Data older than 1 h is re-read automatically.
//------------------------------------------------------

const FORCE_EVERY_MS = 5 * 60 * 1000;
const MAX_ORDERS = 50;

function mrpRoutes(qbBom, now = () => Date.now()) {

    const router = express.Router();
    let lastForced = 0;

    router.get("/mrp", authenticateToken, async (req, res) => {

        const weeks = Math.min(52, Math.max(1, Math.round(Number(req.query.weeks) || 8)));
        const group = LINE_GROUPS.includes(req.query.group) ? req.query.group : "All";
        const includeHolds = req.query.holds === "1";
        let force = false;
        let throttled = false;

        if (req.query.refresh === "1") {

            if (now() - lastForced >= FORCE_EVERY_MS) {

                force = true;
                lastForced = now();

            }

            else
                throttled = true;

        }

        try {

            const input = await qbBom.mrpInputs({ force });
            const groups = new Map(qbBom.assemblies().map(a => [a.sku, a.lineGroup]));
            const soLines = group === "All" ? input.soLines : input.soLines.filter(l => (groups.get(l.item) || "Other") === group);

            const today = dateNY(now());
            const horizonEnd = dateNY(now() + weeks * 7 * 86400000);

            const result = computeMrp({ soLines, poLines: input.poLines, items: input.items, linesOf: input.linesOf, today, horizonEnd, includeHolds });

            const trim = p => ({ ...p, orderCount: p.orders.length, orders: p.orders.slice(0, MAX_ORDERS) });

            res.json({
                window: { weeks, today, horizonEnd, group, includeHolds },
                asOf: input.asOf,
                error: input.error,
                throttled,
                lineGroups: LINE_GROUPS,
                demand: result.demand,
                parts: result.parts.map(trim),
                builds: result.builds.map(trim),
                warnings: result.warnings
            });

        }

        catch (err) {

            res.status(503).json({ success: false, message: err.message });

        }

    });

    return router;

}

module.exports = { mrpRoutes };
