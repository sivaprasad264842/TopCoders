import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const bearerToken = (req) => {
    const header = req.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

/** Decodes a login token. Returns { id, tv } or null. Never throws. */
export const decodeToken = (token) => {
    if (!token || !process.env.JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return typeof decoded?.id === "string" ? { id: decoded.id, tv: decoded.tv || 0 } : null;
    } catch {
        return null;
    }
};

/** Decodes a login token. Returns the user id or null. Never throws. */
export const userIdFromToken = (token) => decodeToken(token)?.id || null;

/** Signs a 7-day login token tied to the user's current session version. */
export const signToken = (user) =>
    jwt.sign({ id: String(user._id), tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "7d" });

/** Requires a valid, non-revoked token for an existing user. Sets req.user (without secrets). */
export const authMiddleware = async (req, res, next) => {
    const payload = decodeToken(bearerToken(req));
    if (!payload) {
        return res.status(401).json({ error: "Please log in again.", code: "UNAUTHORIZED" });
    }

    const user = await User.findById(payload.id).select("-password -resetTokenHash -resetExpiresAt").lean();
    if (!user) {
        return res.status(401).json({ error: "Account not found.", code: "UNAUTHORIZED" });
    }
    if ((user.tokenVersion || 0) !== payload.tv) {
        return res.status(401).json({ error: "Your session ended. Please log in again.", code: "SESSION_REVOKED" });
    }

    req.user = user;
    next();
};

/**
 * Sets req.user / req.userId when a valid, non-revoked token is present.
 * Anonymous (or stale-token) requests pass through as anonymous.
 */
export const optionalAuth = async (req, res, next) => {
    const payload = decodeToken(bearerToken(req));
    if (payload) {
        const user = await User.findById(payload.id).select("email role tokenVersion username").lean();
        if (user && (user.tokenVersion || 0) === payload.tv) {
            req.user = user;
            req.userId = String(user._id);
        }
    }
    next();
};
