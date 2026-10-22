import express from "express";
import {
    changePassword,
    forgotPassword,
    getAvatar,
    getCurrentUser,
    getLeaderboard,
    loginUser,
    logoutAll,
    registerUser,
    resendVerification,
    resetPassword,
    updateCurrentUser,
    verifyUser,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authLimiter, emailLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.get("/verify/:token", authLimiter, verifyUser);
router.post("/resend-verification", emailLimiter, resendVerification);
router.post("/login", authLimiter, loginUser);
router.post("/forgot-password", emailLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

router.get("/leaderboard", getLeaderboard);
router.get("/avatar/:userId", getAvatar);

router.get("/me", authMiddleware, getCurrentUser);
router.put("/me", authMiddleware, updateCurrentUser);
router.put("/password", authMiddleware, authLimiter, changePassword);
router.post("/logout-all", authMiddleware, logoutAll);

export default router;
