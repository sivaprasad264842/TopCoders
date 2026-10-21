import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import { judgeSubmission } from "../services/executionService.js";
import { avatarField, avatarUrl } from "../utils/avatar.js";
import { HttpError } from "../utils/httpError.js";
import { parseCodeRequest } from "../utils/validation.js";

const VERDICT_BY_STATUS = {
    accepted: "Accepted",
    wrong_answer: "Wrong Answer",
    timeout: "TLE",
    runtime_error: "Runtime Error",
    compilation_error: "Compilation Error",
};

const clip = (text, max = 4000) => {
    const value = String(text ?? "");
    return value.length > max ? `${value.slice(0, max)}\n... (truncated)` : value;
};

/**
 * What the solver learns about the failing test. Hidden tests reveal nothing
 * (not even stderr, which could echo the hidden input).
 */
const describeFailure = (result, testCases) => {
    const failed = result.failed;
    if (!failed) return null;

    if (failed.index === null) {
        return { index: null, input: "", expectedOutput: "", actualOutput: "", error: clip(failed.stderr) };
    }

    const tc = testCases[failed.index];
    const errorByStatus = {
        timeout: "Time limit exceeded",
        runtime_error: clip(failed.stderr) || "Runtime error",
        wrong_answer: "",
    };

    if (tc.hidden) {
        return {
            index: failed.index + 1,
            hidden: true,
            input: "",
            expectedOutput: "",
            actualOutput: "",
            error: result.status === "runtime_error" ? "Runtime error on a hidden test case" : errorByStatus[result.status],
        };
    }

    return {
        index: failed.index + 1,
        input: clip(tc.input),
        expectedOutput: clip(tc.output),
        actualOutput: clip(failed.stdout),
        error: errorByStatus[result.status] ?? "",
    };
};

export const submitCode = async (req, res) => {
    const problemId = req.body?.problemId;
    if (typeof problemId !== "string" || !problemId) {
        throw new HttpError(400, "problemId is required.");
    }
    const { code, language } = parseCodeRequest(req.body);

    const problem = await Problem.findOne({ problemId }).lean();
    if (!problem) throw new HttpError(404, "Problem not found.");
    if (!problem.testCases?.length) throw new HttpError(400, "This problem has no test cases yet.");

    const userId = req.user._id;

    // If the sandbox is unavailable this throws a 503 and NOTHING is saved,
    // so infrastructure problems never show up as the user's "Runtime Error".
    const result = await judgeSubmission(String(userId), {
        code,
        language,
        tests: problem.testCases.map((tc) => ({ input: tc.input ?? "", expectedOutput: tc.output })),
    });

    const verdict = VERDICT_BY_STATUS[result?.status];
    if (!verdict) throw new HttpError(502, "Unexpected response from the code runner.");

    const failedTestCase = describeFailure(result, problem.testCases);
    const submission = await Submission.create({
        userId,
        problemId,
        code,
        language,
        verdict,
        executionTime: result.totalTimeMs,
        passedTestCases: result.passed,
        totalTestCases: problem.testCases.length,
        failedTestCase,
    });

    if (verdict === "Accepted") {
        await User.updateOne({ _id: userId }, { $addToSet: { solvedProblems: problemId } });
    }

    res.json({
        verdict,
        totalTime: result.totalTimeMs,
        passedTestCases: result.passed,
        totalTestCases: problem.testCases.length,
        failedTestCase,
        submissionId: submission._id,
    });
};

export const getMySubmissions = async (req, res) => {
    const submissions = await Submission.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(500)
        .select("-code")
        .lean();
    res.json(submissions);
};

export const getMyProblemSubmissions = async (req, res) => {
    const submissions = await Submission.find({ userId: req.user._id, problemId: req.params.problemId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    res.json(submissions);
};

/** Public per-problem ranking: most accepted, then fastest. Emails and phone numbers are never exposed. */
export const getProblemLeaderboard = async (req, res) => {
    const NO_TIME = 999_999_999;
    const rows = await Submission.aggregate([
        { $match: { problemId: req.params.problemId } },
        {
            $group: {
                _id: "$userId",
                submissions: { $sum: 1 },
                accepted: { $sum: { $cond: [{ $eq: ["$verdict", "Accepted"] }, 1, 0] } },
                bestTime: {
                    $min: { $cond: [{ $eq: ["$verdict", "Accepted"] }, "$executionTime", NO_TIME] },
                },
                lastSubmittedAt: { $max: "$createdAt" },
            },
        },
        { $sort: { accepted: -1, bestTime: 1, submissions: 1, lastSubmittedAt: 1 } },
        { $limit: 50 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        {
            $project: {
                _id: 0,
                userId: "$_id",
                submissions: 1,
                accepted: 1,
                bestTime: 1,
                lastSubmittedAt: 1,
                username: "$user.username",
                bio: "$user.bio",
                profilePicture: avatarField("$user.profilePicture"),
                profileUpdatedAt: "$user.updatedAt",
                socialLinks: "$user.socialLinks",
                resume: "$user.resume",
                solvedCount: { $size: { $ifNull: ["$user.solvedProblems", []] } },
            },
        },
    ]);

    res.json(
        rows.map(({ profileUpdatedAt, ...row }, index) => ({
            ...row,
            rank: index + 1,
            profilePicture: avatarUrl(req, row.userId, row.profilePicture, profileUpdatedAt),
            socialLinks: row.socialLinks || {},
            resume: row.resume || "",
            bestTime: row.bestTime === NO_TIME ? null : row.bestTime,
        })),
    );
};
