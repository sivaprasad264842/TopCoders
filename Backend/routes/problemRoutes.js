import express from "express";
import { createComment, listComments } from "../controllers/commentController.js";
import {
    createProblem,
    deleteProblem,
    getAllProblems,
    getDailyProblem,
    getProblemById,
    getTags,
    updateProblem,
} from "../controllers/problemController.js";
import { authMiddleware, optionalAuth } from "../middleware/authMiddleware.js";
import { isOwner } from "../middleware/isOwner.js";
import { commentLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.get("/all", getAllProblems);
router.get("/tags", getTags);
router.get("/daily", getDailyProblem);
// optionalAuth: authors/admins also see hidden test cases; registered users see live hackathon problems.
router.get("/:id", optionalAuth, getProblemById);

router.post("/create", authMiddleware, createProblem);
router.put("/:id", authMiddleware, isOwner, updateProblem);
router.delete("/:id", authMiddleware, isOwner, deleteProblem);

router.get("/:id/comments", optionalAuth, listComments);
router.post("/:id/comments", authMiddleware, commentLimiter, createComment);

export default router;
