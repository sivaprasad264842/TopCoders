import express from "express";
import { endSession, heartbeat } from "../controllers/sessionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/heartbeat", authMiddleware, heartbeat);
// sendBeacon posts text/plain; parse it here (global express.json skips it).
router.post("/end", express.text({ type: "text/plain", limit: "8kb" }), endSession);

export default router;
