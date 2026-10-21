import runnerManager from "../services/runnerManager.js";
import { bearerToken, userIdFromToken } from "../middleware/authMiddleware.js";

/**
 * Sent by the problem page every 30 s while the user is active (every 3 s
 * while the sandbox is starting). Starts the user's runner if needed and
 * resets its inactivity timer. Returns { status: "starting" | "ready" }.
 */
export const heartbeat = (req, res) => {
    const status = runnerManager.ensure(String(req.user._id));
    res.json({ status, mode: runnerManager.mode });
};

/**
 * Sent with navigator.sendBeacon when the tab closes, or on logout.
 * sendBeacon cannot set an Authorization header, so the token travels in a
 * text/plain body ({ token, immediate }) - never in the URL, where it would
 * end up in access logs.
 */
export const endSession = (req, res) => {
    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            body = {};
        }
    }

    const userId = userIdFromToken(bearerToken(req) || body?.token);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    runnerManager.release(userId, { immediate: body?.immediate === true });
    res.status(204).end();
};
