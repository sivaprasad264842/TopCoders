import { randomUUID } from "node:crypto";
import Problem from "../models/Problem.js";
import { HttpError } from "../utils/httpError.js";
import { LIMITS, parseHints, parseTestCases } from "../utils/validation.js";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

/**
 * What a viewer may see. Authors get every test case; everyone else only
 * the visible (sample) ones, plus a count of the hidden ones.
 */
const toPublicProblem = (problem, viewerId) => {
    const isAuthor = Boolean(viewerId) && String(problem.createdBy) === String(viewerId);
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
        createdBy: problem.createdBy,
        createdAt: problem.createdAt,
        hints: problem.hints || [],
        testCases: isAuthor ? all : visible,
        testCaseCount: all.length,
        hiddenTestCount: all.length - visible.length,
    };
};

const readProblemFields = (body, { partial }) => {
    const { title, statement, difficulty, testCases, hints } = body || {};
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

    return fields;
};

export const createProblem = async (req, res) => {
    const problem = await Problem.create({
        ...readProblemFields(req.body, { partial: false }),
        problemId: randomUUID(),
        createdBy: req.user._id,
    });

    res.status(201).json(toPublicProblem(problem.toObject(), req.user._id));
};

/** List view: no test case bodies (they can be large), just counts. */
export const getAllProblems = async (req, res) => {
    const problems = await Problem.aggregate([
        { $sort: { createdAt: 1 } },
        {
            $project: {
                problemId: 1,
                title: 1,
                statement: 1,
                difficulty: 1,
                createdBy: 1,
                createdAt: 1,
                testCaseCount: { $size: { $ifNull: ["$testCases", []] } },
            },
        },
    ]);

    res.json(problems);
};

export const getProblemById = async (req, res) => {
    const problem = await Problem.findOne({ problemId: req.params.id }).lean();
    if (!problem) {
        return res.status(404).json({ error: "Problem not found" });
    }

    res.json(toPublicProblem(problem, req.userId));
};

// isOwner middleware has already loaded req.problem and checked authorship.
export const updateProblem = async (req, res) => {
    const updated = await Problem.findOneAndUpdate(
        { problemId: req.problem.problemId },
        readProblemFields(req.body, { partial: true }),
        { returnDocument: "after", runValidators: true },
    ).lean();

    res.json(toPublicProblem(updated, req.user._id));
};

export const deleteProblem = async (req, res) => {
    await Problem.deleteOne({ problemId: req.problem.problemId });
    res.json({ message: "Deleted" });
};
