// Admins: users with role "admin" in the database, or whose email is listed in
// ADMIN_EMAILS (comma-separated). The env list lets you bootstrap the first admin.
const adminEmails = () =>
    new Set(
        String(process.env.ADMIN_EMAILS || "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
    );

export const isAdmin = (user) =>
    Boolean(user) && (user.role === "admin" || adminEmails().has(String(user.email || "").toLowerCase()));

/** Route guard: run after authMiddleware. */
export const requireAdmin = (req, res, next) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: "Only admins can do this." });
    next();
};
