import express from "express";
import {
    getAvatar,
    getCurrentUser,
    getLeaderboard,
    loginUser,
    registerUser,
    updateCurrentUser,
    verifyUser,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.get("/verify/:token", authLimiter, verifyUser);
router.post("/login", authLimiter, loginUser);
router.get("/leaderboard", getLeaderboard);
router.get("/avatar/:userId", getAvatar);
router.get("/me", authMiddleware, getCurrentUser);
router.put("/me", authMiddleware, updateCurrentUser);

export default router;
