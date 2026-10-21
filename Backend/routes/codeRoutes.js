import express from "express";
import { analyzeCode, getAnalysisStatus } from "../controllers/analysisController.js";
import { runCode } from "../controllers/runController.js";
import {
    getMyProblemSubmissions,
    getMySubmissions,
    getProblemLeaderboard,
    submitCode,
} from "../controllers/submitController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { aiLimiter, codeLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/run", authMiddleware, codeLimiter, runCode);
router.post("/submit", authMiddleware, codeLimiter, submitCode);

router.get("/analyze/status", getAnalysisStatus);
router.post("/analyze", authMiddleware, aiLimiter, analyzeCode);

router.get("/submissions/me", authMiddleware, getMySubmissions);
router.get("/submissions/problem/:problemId", authMiddleware, getMyProblemSubmissions);
router.get("/leaderboard/problem/:problemId", getProblemLeaderboard);

export default router;
