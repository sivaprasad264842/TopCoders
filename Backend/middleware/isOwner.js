import Problem from "../models/Problem.js";
import { isAdmin } from "../utils/roles.js";

/** Loads the problem from :id and checks the user created it (or is an admin). Sets req.problem. */
export const isOwner = async (req, res, next) => {
    const problem = await Problem.findOne({ problemId: req.params.id }).lean();

    if (!problem) {
        return res.status(404).json({ error: "Problem not found" });
    }
    if (String(problem.createdBy) !== String(req.user._id) && !isAdmin(req.user)) {
        return res.status(403).json({ error: "Only the author can change this problem" });
    }

    req.problem = problem;
    next();
};
