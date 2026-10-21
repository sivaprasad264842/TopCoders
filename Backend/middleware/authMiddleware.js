import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const bearerToken = (req) => {
    const header = req.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

/** Decodes a login token. Returns the user id or null. Never throws. */
export const userIdFromToken = (token) => {
    if (!token || !process.env.JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return typeof decoded?.id === "string" ? decoded.id : null;
    } catch {
        return null;
    }
};

/** Requires a valid token for an existing user. Sets req.user (without password). */
export const authMiddleware = async (req, res, next) => {
    const userId = userIdFromToken(bearerToken(req));
    if (!userId) {
        return res.status(401).json({ error: "Please log in again.", code: "UNAUTHORIZED" });
    }

    const user = await User.findById(userId).select("-password").lean();
    if (!user) {
        return res.status(401).json({ error: "Account not found.", code: "UNAUTHORIZED" });
    }

    req.user = user;
    next();
};

/** Sets req.userId when a valid token is present; anonymous requests pass through. */
export const optionalAuth = (req, res, next) => {
    req.userId = userIdFromToken(bearerToken(req));
    next();
};
