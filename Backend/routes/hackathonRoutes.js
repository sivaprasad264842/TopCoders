import express from "express";
import {
    createHackathon,
    deleteHackathon,
    getHackathon,
    getStandings,
    listHackathons,
    register,
    unregister,
    updateHackathon,
} from "../controllers/hackathonController.js";
import { authMiddleware, optionalAuth } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../utils/roles.js";

const router = express.Router();

router.get("/", optionalAuth, listHackathons);
router.get("/:slug", optionalAuth, getHackathon);
router.get("/:slug/standings", getStandings);

router.post("/:slug/register", authMiddleware, register);
router.delete("/:slug/register", authMiddleware, unregister);

router.post("/", authMiddleware, requireAdmin, createHackathon);
router.put("/:slug", authMiddleware, requireAdmin, updateHackathon);
router.delete("/:slug", authMiddleware, requireAdmin, deleteHackathon);

export default router;
