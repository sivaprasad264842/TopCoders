import express from "express";
import { deleteComment, toggleVote, updateComment } from "../controllers/commentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { commentLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.put("/:commentId", authMiddleware, commentLimiter, updateComment);
router.delete("/:commentId", authMiddleware, deleteComment);
router.post("/:commentId/vote", authMiddleware, toggleVote);

export default router;
