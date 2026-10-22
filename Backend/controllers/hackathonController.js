import Hackathon from "../models/Hackathon.js";
import HackathonRegistration from "../models/HackathonRegistration.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import { avatarField, avatarUrl } from "../utils/avatar.js";
import { HttpError } from "../utils/httpError.js";
import { hackathonStatus } from "../utils/problemAccess.js";
import { isAdmin } from "../utils/roles.js";
import { starsFor } from "../utils/stars.js";

const PENALTY_MIN = 5; // minutes added per wrong attempt before the first accept
const MAX_DURATION_MS = 7 * 24 * 60 * 60_000;

const slugify = (text) =>
    String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "hackathon";

const uniqueSlug = async (title, excludeId) => {
    const base = slugify(title);
    let slug = base;
    for (let n = 2; await Hackathon.exists({ slug, ...(excludeId && { _id: { $ne: excludeId } }) }); n += 1) {
        slug = `${base}-${n}`;
    }
    return slug;
};

/** Validates admin input. Every listed problem must exist. */
const readFields = async (body) => {
    const title = String(body?.title || "").trim();
    if (!title || title.length > 120) throw new HttpError(400, "Title is required (max 120 characters).");

    const startsAt = new Date(body?.startsAt);
    const endsAt = new Date(body?.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new HttpError(400, "Start and end times are required.");
    }
    if (endsAt <= startsAt) throw new HttpError(400, "The hackathon must end after it starts.");
    if (endsAt - startsAt > MAX_DURATION_MS) throw new HttpError(400, "A hackathon can last at most 7 days.");

    const description = String(body?.description || "").trim();
    if (description.length > 5000) throw new HttpError(400, "Description is too long (max 5,000 characters).");

    const raw = Array.isArray(body?.problems) ? body.problems : [];
    if (raw.length > 12) throw new HttpError(400, "A hackathon can have at most 12 problems.");
    const problems = [];
    const seen = new Set();
    for (const item of raw) {
        const problemId = String(item?.problemId || "");
        if (!problemId || seen.has(problemId)) continue;
        seen.add(problemId);
        const points = Math.round(Number(item?.points) || 100);
        if (points < 1 || points > 10_000) throw new HttpError(400, "Points must be between 1 and 10,000.");
        problems.push({ problemId, points });
    }
    const found = await Problem.countDocuments({ problemId: { $in: problems.map((p) => p.problemId) } });
    if (found !== problems.length) throw new HttpError(400, "One of the selected problems no longer exists.");

    return { title, description, startsAt, endsAt, problems };
};

/**
 * Hackathon problems stay out of the public list until the event ends.
 * Problems removed from a hackathon become public again.
 */
const syncProblemVisibility = async (hackathon, previousIds = []) => {
    const ids = hackathon.problems.map((p) => p.problemId);
    await Problem.updateMany({ problemId: { $in: ids } }, { hackathon: hackathon._id, hiddenUntil: hackathon.endsAt });
    const removed = previousIds.filter((id) => !ids.includes(id));
    if (removed.length) {
        await Problem.updateMany({ problemId: { $in: removed }, hackathon: hackathon._id }, { hackathon: null, hiddenUntil: null });
    }
};

const summary = (h, { registrations = 0, registered = false } = {}) => ({
    _id: h._id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    startsAt: h.startsAt,
    endsAt: h.endsAt,
    status: hackathonStatus(h),
    problemCount: h.problems.length,
    totalPoints: h.problems.reduce((sum, p) => sum + p.points, 0),
    registrations,
    registered,
});

const loadBySlug = async (slug) => {
    const h = await Hackathon.findOne({ slug: String(slug) }).lean();
    if (!h) throw new HttpError(404, "Hackathon not found.");
    return h;
};

/** GET /api/hackathons — every hackathon, newest first, with registration counts. */
export const listHackathons = async (req, res) => {
    const hackathons = await Hackathon.find().sort({ startsAt: -1 }).limit(200).lean();
    const ids = hackathons.map((h) => h._id);
    const [counts, mine] = await Promise.all([
        HackathonRegistration.aggregate([{ $match: { hackathon: { $in: ids } } }, { $group: { _id: "$hackathon", n: { $sum: 1 } } }]),
        req.user ? HackathonRegistration.find({ user: req.user._id, hackathon: { $in: ids } }).select("hackathon").lean() : [],
    ]);
    const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
    const mineSet = new Set(mine.map((r) => String(r.hackathon)));

    res.json(
        hackathons.map((h) =>
            summary(h, { registrations: countOf.get(String(h._id)) || 0, registered: mineSet.has(String(h._id)) }),
        ),
    );
};

/** GET /api/hackathons/:slug — details; problems are listed once it's live (or for admins). */
export const getHackathon = async (req, res) => {
    const h = await loadBySlug(req.params.slug);
    const status = hackathonStatus(h);
    const admin = isAdmin(req.user);
    const [registrations, registered] = await Promise.all([
        HackathonRegistration.countDocuments({ hackathon: h._id }),
        req.user ? HackathonRegistration.exists({ hackathon: h._id, user: req.user._id }) : null,
    ]);

    let problems = [];
    if (status !== "upcoming" || admin) {
        const docs = await Problem.find({ problemId: { $in: h.problems.map((p) => p.problemId) } })
            .select("problemId title difficulty tags")
            .lean();
        const byId = new Map(docs.map((d) => [d.problemId, d]));
        problems = h.problems
            .filter((p) => byId.has(p.problemId))
            .map((p, i) => {
                const d = byId.get(p.problemId);
                return { label: String.fromCharCode(65 + i), problemId: p.problemId, title: d.title, difficulty: d.difficulty, tags: d.tags || [], points: p.points, stars: starsFor(d.difficulty) };
            });
    }

    let solved = [];
    if (req.user && problems.length) {
        const rows = await Submission.find({
            userId: req.user._id,
            problemId: { $in: problems.map((p) => p.problemId) },
            verdict: "Accepted",
            createdAt: { $gte: h.startsAt, $lte: h.endsAt },
        })
            .distinct("problemId");
        solved = rows;
    }

    res.json({
        ...summary(h, { registrations, registered: Boolean(registered) }),
        problems,
        solved,
        canManage: admin,
        penaltyMinutes: PENALTY_MIN,
    });
};

/** POST /api/hackathons/:slug/register — open until the hackathon ends. */
export const register = async (req, res) => {
    const h = await loadBySlug(req.params.slug);
    if (hackathonStatus(h) === "ended") throw new HttpError(400, "This hackathon has ended.");
    await HackathonRegistration.updateOne(
        { hackathon: h._id, user: req.user._id },
        { $setOnInsert: { hackathon: h._id, user: req.user._id } },
        { upsert: true },
    );
    res.json({ registered: true, registrations: await HackathonRegistration.countDocuments({ hackathon: h._id }) });
};

/** DELETE /api/hackathons/:slug/register — only before it starts. */
export const unregister = async (req, res) => {
    const h = await loadBySlug(req.params.slug);
    if (hackathonStatus(h) !== "upcoming") throw new HttpError(400, "You can only unregister before the hackathon starts.");
    await HackathonRegistration.deleteOne({ hackathon: h._id, user: req.user._id });
    res.json({ registered: false, registrations: await HackathonRegistration.countDocuments({ hackathon: h._id }) });
};

/**
 * GET /api/hackathons/:slug/standings
 * Score = points of problems solved during the event. Ties: lower penalty
 * (minutes from start to each first accept + 5 min per earlier wrong attempt).
 */
export const getStandings = async (req, res) => {
    const h = await loadBySlug(req.params.slug);
    if (hackathonStatus(h) === "upcoming") return res.json({ rows: [], problems: [] });

    const regs = await HackathonRegistration.find({ hackathon: h._id }).select("user").lean();
    const userIds = regs.map((r) => r.user);
    const pointsOf = new Map(h.problems.map((p) => [p.problemId, p.points]));
    const labels = h.problems.map((p, i) => ({ problemId: p.problemId, label: String.fromCharCode(65 + i), points: p.points }));

    const subs = await Submission.find({
        userId: { $in: userIds },
        problemId: { $in: [...pointsOf.keys()] },
        createdAt: { $gte: h.startsAt, $lte: h.endsAt },
    })
        .sort({ createdAt: 1 })
        .select("userId problemId verdict createdAt")
        .lean();

    const board = new Map(userIds.map((id) => [String(id), { score: 0, penalty: 0, solved: 0, cells: {} }]));
    for (const s of subs) {
        const row = board.get(String(s.userId));
        const cell = (row.cells[s.problemId] ||= { attempts: 0, solvedAtMin: null });
        if (cell.solvedAtMin !== null) continue; // only attempts up to the first accept count
        cell.attempts += 1;
        if (s.verdict === "Accepted") {
            cell.solvedAtMin = Math.floor((new Date(s.createdAt) - new Date(h.startsAt)) / 60_000);
            row.score += pointsOf.get(s.problemId);
            row.penalty += cell.solvedAtMin + PENALTY_MIN * (cell.attempts - 1);
            row.solved += 1;
        }
    }

    const users = await User.aggregate([
        { $match: { _id: { $in: userIds } } },
        { $project: { username: 1, updatedAt: 1, profilePicture: avatarField("$profilePicture") } },
    ]);
    const userOf = new Map(users.map((u) => [String(u._id), u]));

    const rows = [...board.entries()]
        .map(([id, r]) => {
            const u = userOf.get(id) || {};
            return {
                userId: id,
                username: u.username || "anonymous",
                profilePicture: avatarUrl(req, id, u.profilePicture, u.updatedAt),
                score: r.score,
                penalty: r.penalty,
                solved: r.solved,
                cells: labels.map((l) => r.cells[l.problemId] || { attempts: 0, solvedAtMin: null }),
            };
        })
        .filter((r) => r.cells.some((c) => c.attempts > 0) || hackathonStatus(h) === "live")
        .sort((a, b) => b.score - a.score || a.penalty - b.penalty || a.username.localeCompare(b.username))
        .map((r, i) => ({ ...r, rank: i + 1 }));

    res.json({ problems: labels, rows });
};

/** POST /api/hackathons — admin. */
export const createHackathon = async (req, res) => {
    const fields = await readFields(req.body);
    const h = await Hackathon.create({ ...fields, slug: await uniqueSlug(fields.title), createdBy: req.user._id });
    await syncProblemVisibility(h);
    res.status(201).json(summary(h.toObject()));
};

/** PUT /api/hackathons/:slug — admin. */
export const updateHackathon = async (req, res) => {
    const h = await Hackathon.findOne({ slug: req.params.slug });
    if (!h) throw new HttpError(404, "Hackathon not found.");
    const previousIds = h.problems.map((p) => p.problemId);
    const fields = await readFields(req.body);
    if (fields.title !== h.title) h.slug = await uniqueSlug(fields.title, h._id);
    Object.assign(h, fields);
    await h.save();
    await syncProblemVisibility(h, previousIds);
    res.json(summary(h.toObject()));
};

/** DELETE /api/hackathons/:slug — admin. Its problems become public. */
export const deleteHackathon = async (req, res) => {
    const h = await loadBySlug(req.params.slug);
    await Problem.updateMany({ hackathon: h._id }, { hackathon: null, hiddenUntil: null });
    await HackathonRegistration.deleteMany({ hackathon: h._id });
    await Hackathon.deleteOne({ _id: h._id });
    res.json({ message: "Hackathon deleted" });
};
