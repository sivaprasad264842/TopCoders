import rateLimit from "express-rate-limit";

const limiter = (windowMs, limit, message, byUser = false) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { error: message, code: "RATE_LIMITED" },
        // Per-user limits run after authMiddleware, so req.user is set.
        ...(byUser && { keyGenerator: (req) => String(req.user._id) }),
        skip: () => process.env.NODE_ENV === "test",
    });

export const authLimiter = limiter(15 * 60_000, 30, "Too many attempts. Try again in 15 minutes.");
// Endpoints that send email: tight, so they cannot be used to spam an inbox.
export const emailLimiter = limiter(15 * 60_000, 5, "Too many email requests. Try again in 15 minutes.");
export const codeLimiter = limiter(60_000, 30, "Too many runs. Slow down for a minute.", true);
export const commentLimiter = limiter(60_000, 10, "You're commenting too fast. Wait a minute.", true);
export const aiLimiter = limiter(60_000, 5, "AI analysis limit reached. Try again in a minute.", true);
