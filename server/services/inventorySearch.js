//------------------------------------------------------
// Inventory search + where used (Director, Nov 10 2026). Pure
// functions over the cached QuickBooks item list and BOM table.
//
// Search (fuzzy, no library): the query is split into words and
// EVERY word must match the item somewhere. Per word, the best of:
//   part number exact (hyphens / spaces ignored)        1000
//   part number starts with                               500
//   part number contains                                  300
//   a description word starts with it                     150
//   manufacturer P/N or vendor contains                   120
//   description contains                                  100
//   one typo (2 for words of 8+ letters) vs a word of
//   the description or a part-number segment               60
//   letters in order inside the part number (3+ letters)   30
// A word of 1-2 characters must match a whole word (200).
// Active items first by default; inactive only when asked.
//
// Where used: walks up the BOM from the item to every top-level
// assembly (one no other assembly uses), multiplying qty per
// along each path; several paths into the same top add up. A
// loop is cut where an assembly repeats on the path. Inactive
// assemblies are skipped unless asked for.
//------------------------------------------------------

const squash = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = s => String(s || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

function editDistanceAtMost(a, b, max) {

    if (Math.abs(a.length - b.length) > max)
        return false;

    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

    for (let i = 1; i <= a.length; i++) {

        const cur = [i];
        let best = i;

        for (let j = 1; j <= b.length; j++) {

            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            best = Math.min(best, cur[j]);

        }

        if (best > max)
            return false;

        prev = cur;

    }

    return prev[b.length] <= max;

}

function inOrder(needle, hay) {

    let i = 0;

    for (const c of hay)
        if (c === needle[i] && ++i === needle.length)
            return true;

    return false;

}

// Prepared once per item list (cached by the caller).
function indexItems(items) {

    return items.map(it => ({
        it,
        name: squash(it.full_name),
        nameParts: words(it.full_name),
        desc: String(it.description || "").toUpperCase() + " " + String(it.purchase_description || "").toUpperCase(),
        descWords: [...new Set([...words(it.description), ...words(it.purchase_description)])],
        extra: squash(it.part_number) + " " + squash(it.preferred_vendor)
    }));

}

function wordScore(w, x) {

    const sq = squash(w);

    if (!sq)
        return 0;

    // 1-2 characters ("2" in "wago 2 pos"): whole words only, or
    // every part number starting with 2 would match.
    if (sq.length <= 2)
        return x.name === sq ? 1000 : x.nameParts.includes(sq) || x.descWords.includes(sq) ? 200 : 0;

    if (x.name === sq) return 1000;
    if (x.name.startsWith(sq)) return 500;
    if (x.name.includes(sq)) return 300;
    if (x.descWords.some(d => d.startsWith(sq))) return 150;
    if (sq.length >= 3 && x.extra.includes(sq)) return 120;
    if (x.desc.includes(w.toUpperCase())) return 100;

    if (sq.length >= 4) {

        const max = sq.length >= 8 ? 2 : 1;

        if (x.descWords.some(d => editDistanceAtMost(sq, d, max)) || x.nameParts.some(p => editDistanceAtMost(sq, p, max)))
            return 60;

    }

    if (sq.length >= 3 && inOrder(sq, x.name)) return 30;

    return 0;

}

function searchItems(index, q, { includeInactive = false, limit = 50 } = {}) {

    const qWords = String(q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8);

    if (!qWords.length)
        return { items: [], total: 0 };

    const hits = [];

    for (const x of index) {

        if (!includeInactive && !x.it.active)
            continue;

        let score = 0;
        let all = true;

        for (const w of qWords) {

            const s = wordScore(w, x);

            if (!s) { all = false; break; }

            score += s;

        }

        if (all)
            hits.push({ x, score: score - (x.it.active ? 0 : 50) });

    }

    hits.sort((a, b) => b.score - a.score || a.x.it.full_name.localeCompare(b.x.it.full_name));

    return { items: hits.slice(0, limit).map(h => ({ ...h.x.it, score: h.score })), total: hits.length };

}

// parentsOf(component) → [{ assembly, qty }]; itemOf(name) → item row or null.
function whereUsed(start, parentsOf, itemOf, { includeInactive = false, maxDepth = 12, maxPaths = 5, maxSteps = 20000 } = {}) {

    const usable = a => includeInactive || (itemOf(a)?.active ?? 0) === 1;

    const direct = parentsOf(start).filter(p => usable(p.assembly));
    const tops = new Map();
    let loops = 0;
    let steps = 0;
    let truncated = false;

    function walk(node, qty, path) {

        if (++steps > maxSteps) {

            truncated = true;
            return;

        }

        const parents = parentsOf(node).filter(p => usable(p.assembly));

        if (!parents.length || path.length > maxDepth) {

            if (node === start)
                return;

            const t = tops.get(node) || { assembly: node, qty: 0, paths: [], pathCount: 0 };

            t.qty += qty;
            t.pathCount++;

            if (t.paths.length < maxPaths)
                t.paths.push(path);

            tops.set(node, t);
            return;

        }

        for (const p of parents) {

            if (path.includes(p.assembly)) {

                loops++;
                continue;

            }

            walk(p.assembly, qty * (Number(p.qty) || 0), [...path, p.assembly]);

        }

    }

    walk(start, 1, [start]);

    return {
        direct: direct.map(p => ({ assembly: p.assembly, qty: p.qty })),
        tops: [...tops.values()].sort((a, b) => a.assembly.localeCompare(b.assembly)),
        loops,
        truncated
    };

}

module.exports = { indexItems, searchItems, whereUsed, editDistanceAtMost, squash };
