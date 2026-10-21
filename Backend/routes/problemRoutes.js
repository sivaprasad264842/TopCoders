import express from "express";
import {
    createProblem,
    deleteProblem,
    getAllProblems,
    getProblemById,
    updateProblem,
} from "../controllers/problemController.js";
import { authMiddleware, optionalAuth } from "../middleware/authMiddleware.js";
import { isOwner } from "../middleware/isOwner.js";

const router = express.Router();

router.get("/all", getAllProblems);
// optionalAuth: the author also sees hidden test cases.
router.get("/:id", optionalAuth, getProblemById);

router.post("/create", authMiddleware, createProblem);
router.put("/:id", authMiddleware, isOwner, updateProblem);
router.delete("/:id", authMiddleware, isOwner, deleteProblem);

export default router;
