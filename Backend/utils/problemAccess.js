import Hackathon from "../models/Hackathon.js";
import HackathonRegistration from "../models/HackathonRegistration.js";
import { isAdmin } from "./roles.js";

export const hackathonStatus = (h, now = Date.now()) =>
    now < new Date(h.startsAt).getTime() ? "upcoming" : now < new Date(h.endsAt).getTime() ? "live" : "ended";

/** Public problems: no hiddenUntil, or it has passed. */
export const publicProblemFilter = () => ({
    $or: [{ hiddenUntil: null }, { hiddenUntil: { $exists: false } }, { hiddenUntil: { $lte: new Date() } }],
});

/**
 * Can this user open the problem?
 * Hidden hackathon problems: the author and admins always; registered users
 * while the hackathon is live. Everyone once it has ended.
 */
export async function canViewProblem(problem, user) {
    if (!problem.hiddenUntil || new Date(problem.hiddenUntil).getTime() <= Date.now()) return true;
    if (!user) return false;
    if (String(problem.createdBy) === String(user._id) || isAdmin(user)) return true;
    if (!problem.hackathon) return false;

    const hackathon = await Hackathon.findById(problem.hackathon).select("startsAt endsAt").lean();
    if (!hackathon || hackathonStatus(hackathon) !== "live") return false;
    return Boolean(await HackathonRegistration.exists({ hackathon: hackathon._id, user: user._id }));
}
