import express from "express";
import { getPublicProfile } from "../controllers/userController.js";

const router = express.Router();

router.get("/:username", getPublicProfile);

export default router;
