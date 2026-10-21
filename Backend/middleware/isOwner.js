import Problem from "../models/Problem.js";

/** Loads the problem from :id and checks the logged-in user created it. Sets req.problem. */
export const isOwner = async (req, res, next) => {
    const problem = await Problem.findOne({ problemId: req.params.id }).lean();

    if (!problem) {
        return res.status(404).json({ error: "Problem not found" });
    }
    if (String(problem.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: "Only the author can change this problem" });
    }

    req.problem = problem;
    next();
};
