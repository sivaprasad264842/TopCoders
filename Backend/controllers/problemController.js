import { randomUUID } from "node:crypto";
import Comment from "../models/Comment.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import { HttpError } from "../utils/httpError.js";
import { canViewProblem, publicProblemFilter } from "../utils/problemAccess.js";
import { isAdmin } from "../utils/roles.js";
import { starsFor } from "../utils/stars.js";
import { LIMITS, parseHints, parseTags, parseTestCases } from "../utils/validation.js";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

/**
 * What a viewer may see. Authors and admins get every test case; everyone
 * else only the visible (sample) ones, plus a count of the hidden ones.
 */
const toPublicProblem = (problem, viewer, extra = {}) => {
    const canEdit = Boolean(viewer) && (String(problem.createdBy) === String(viewer._id) || isAdmin(viewer));
    const all = (problem.testCases || []).map(({ input, output, hidden }) => ({
        input,
        output,
        hidden: Boolean(hidden),
    }));
    const visible = all.filter((tc) => !tc.hidden);

    return {
        _id: problem._id,
        problemId: problem.problemId,
        title: problem.title,
        statement: problem.statement,
        difficulty: problem.difficulty,
        stars: starsFor(problem.difficulty),
        tags: problem.tags || [],
        editorial: problem.editorial || "",
        createdBy: problem.createdBy,
        createdAt: problem.createdAt,
        hints: problem.hints || [],
        hackathon: problem.hackathon || null,
        hiddenUntil: problem.hiddenUntil || null,
        testCases: canEdit ? all : visible,
        testCaseCount: all.length,
        hiddenTestCount: all.length - visible.length,
        canEdit,
        ...extra,
    };
};

const readProblemFields = (body, { partial }) => {
    const { title, statement, difficulty, testCases, hints, tags, editorial } = body || {};
    const fields = {};

    if (typeof title === "string" || !partial) {
        fields.title = String(title || "").trim();
        if (!fields.title || fields.title.length > LIMITS.titleChars) {
            throw new HttpError(400, `Title is required (max ${LIMITS.titleChars} characters).`);
        }
    }
    if (typeof statement === "string" || !partial) {
        fields.statement = String(statement || "").trim();
        if (!fields.statement || fields.statement.length > LIMITS.statementChars) {
            throw new HttpError(400, "Statement is required (max 20,000 characters).");
        }
    }
    if (DIFFICULTIES.includes(difficulty)) fields.difficulty = difficulty;
    else if (!partial) fields.difficulty = "Easy";

    if (testCases !== undefined || !partial) fields.testCases = parseTestCases(testCases ?? []);
    if (hints !== undefined || !partial) fields.hints = parseHints(hints);
    if (tags !== undefined || !partial) fields.tags = parseTags(tags);
    if (editorial !== undefined || !partial) {
        fields.editorial = String(editorial ?? "").trim();
        if (fields.editorial.length > LIMITS.editorialChars) {
            throw new HttpError(400, "Editorial is too long (max 20,000 characters).");
        }
    }

    return fields;
};

export const createProblem = async (req, res) => {
    const problem = await Problem.create({
        ...readProblemFields(req.body, { partial: false }),
        problemId: randomUUID(),
        createdBy: req.user._id,
    });

    res.status(201).json(toPublicProblem(problem.toObject(), req.user));
};

/** Accepted / total submissions per problem, for acceptance rates. */
const submissionStats = async (problemIds) => {
    const rows = await Submission.aggregate([
        { $match: { problemId: { $in: problemIds } } },
        {
            $group: {
                _id: "$problemId",
                total: { $sum: 1 },
                accepted: { $sum: { $cond: [{ $eq: ["$verdict", "Accepted"] }, 1, 0] } },
                solvers: { $addToSet: { $cond: [{ $eq: ["$verdict", "Accepted"] }, "$userId", "$$REMOVE"] } },
            },
        },
    ]);
    return new Map(rows.map((r) => [r._id, { total: r.total, accepted: r.accepted, solvers: r.solvers.length }]));
};

/** List view: public problems only, no test case bodies, plus acceptance stats. */
export const getAllProblems = async (req, res) => {
    const problems = await Problem.aggregate([
        { $match: publicProblemFilter() },
        { $sort: { createdAt: 1 } },
        {
            $project: {
                problemId: 1,
                title: 1,
                difficulty: 1,
                tags: 1,
                createdBy: 1,
                createdAt: 1,
                testCaseCount: { $size: { $ifNull: ["$testCases", []] } },
                hasEditorial: { $gt: [{ $strLenCP: { $ifNull: ["$editorial", ""] } }, 0] },
            },
        },
    ]);

    const stats = await submissionStats(problems.map((p) => p.problemId));
    res.json(
        problems.map((p, index) => {
            const s = stats.get(p.problemId) || { total: 0, accepted: 0, solvers: 0 };
            return {
                ...p,
                number: index + 1,
                tags: p.tags || [],
                stars: starsFor(p.difficulty),
                submissions: s.total,
                acceptedSubmissions: s.accepted,
                solvers: s.solvers,
                acceptance: s.total ? Math.round((s.accepted / s.total) * 1000) / 10 : null,
            };
        }),
    );
};

/** All tags in use with their problem counts, most used first. */
export const getTags = async (req, res) => {
    const rows = await Problem.aggregate([
        { $match: publicProblemFilter() },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 100 },
    ]);
    res.json(rows.map((r) => ({ tag: r._id, count: r.count })));
};

/** Problem of the day: the same public problem for everyone on a given UTC date. */
export const getDailyProblem = async (req, res) => {
    const problems = await Problem.find(publicProblemFilter())
        .sort({ createdAt: 1 })
        .select("problemId title difficulty tags")
        .lean();
    if (!problems.length) return res.json(null);

    const day = new Date().toISOString().slice(0, 10);
    let hash = 0;
    for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const p = problems[hash % problems.length];
    res.json({ date: day, problemId: p.problemId, title: p.title, difficulty: p.difficulty, tags: p.tags || [], stars: starsFor(p.difficulty) });
};

export const getProblemById = async (req, res) => {
    const problem = await Problem.findOne({ problemId: req.params.id }).lean();
    if (!problem || !(await canViewProblem(problem, req.user))) {
        return res.status(404).json({ error: "Problem not found" });
    }

    const [stats, commentCount] = await Promise.all([
        submissionStats([problem.problemId]),
        Comment.countDocuments({ problemId: problem.problemId, deleted: false }),
    ]);
    const s = stats.get(problem.problemId) || { total: 0, accepted: 0, solvers: 0 };

    res.json(
        toPublicProblem(problem, req.user, {
            submissions: s.total,
            acceptedSubmissions: s.accepted,
            solvers: s.solvers,
            acceptance: s.total ? Math.round((s.accepted / s.total) * 1000) / 10 : null,
            commentCount,
        }),
    );
};

// isOwner middleware has already loaded req.problem and checked authorship.
export const updateProblem = async (req, res) => {
    const updated = await Problem.findOneAndUpdate(
        { problemId: req.problem.problemId },
        readProblemFields(req.body, { partial: true }),
        { returnDocument: "after", runValidators: true },
    ).lean();

    res.json(toPublicProblem(updated, req.user));
};

export const deleteProblem = async (req, res) => {
    await Problem.deleteOne({ problemId: req.problem.problemId });
    await Comment.deleteMany({ problemId: req.problem.problemId });
    res.json({ message: "Deleted" });
};
