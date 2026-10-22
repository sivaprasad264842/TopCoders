import Hackathon from "../models/Hackathon.js";
import HackathonRegistration from "../models/HackathonRegistration.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import { avatarUrl } from "../utils/avatar.js";
import { HttpError } from "../utils/httpError.js";
import { hackathonStatus } from "../utils/problemAccess.js";
import { badgesFor, BADGES } from "../utils/stars.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /api/users/:username — public profile. Never includes email or phone.
 */
export const getPublicProfile = async (req, res) => {
    const username = String(req.params.username || "").slice(0, 40);
    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(username)}$`, "i") })
        .select("username bio profilePicture socialLinks resume solvedProblems stars createdAt updatedAt")
        .lean();
    if (!user) throw new HttpError(404, "User not found.");

    const stars = user.stars || 0;
    const solvedIds = user.solvedProblems || [];
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60_000);

    const [rankAbove, totals, solvedDocs, calendar, recent, regs, totalSubs, acceptedSubs] = await Promise.all([
        User.countDocuments({ stars: { $gt: stars } }),
        // All problems (including hackathon ones), so "solved / total" never exceeds 100%.
        Problem.aggregate([{ $group: { _id: "$difficulty", n: { $sum: 1 } } }]),
        Problem.find({ problemId: { $in: solvedIds } }).select("problemId title difficulty").lean(),
        Submission.aggregate([
            { $match: { userId: user._id, createdAt: { $gte: yearAgo } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        ]),
        Submission.aggregate([
            { $match: { userId: user._id, verdict: "Accepted" } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$problemId", at: { $first: "$createdAt" }, language: { $first: "$language" } } },
            { $sort: { at: -1 } },
            { $limit: 10 },
        ]),
        HackathonRegistration.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).select("hackathon").lean(),
        Submission.countDocuments({ userId: user._id }),
        Submission.countDocuments({ userId: user._id, verdict: "Accepted" }),
    ]);

    const titleOf = new Map(solvedDocs.map((p) => [p.problemId, p]));
    const missing = recent.map((r) => r._id).filter((id) => !titleOf.has(id));
    if (missing.length) {
        (await Problem.find({ problemId: { $in: missing } }).select("problemId title difficulty").lean()).forEach((p) =>
            titleOf.set(p.problemId, p),
        );
    }

    const solvedBy = { Easy: 0, Medium: 0, Hard: 0 };
    solvedDocs.forEach((p) => (solvedBy[p.difficulty] = (solvedBy[p.difficulty] || 0) + 1));
    const totalBy = { Easy: 0, Medium: 0, Hard: 0 };
    totals.forEach((t) => (totalBy[t._id] = t.n));

    const hackathons = await Hackathon.find({ _id: { $in: regs.map((r) => r.hackathon) } })
        .select("slug title startsAt endsAt")
        .sort({ startsAt: -1 })
        .lean();

    res.json({
        userId: user._id,
        username: user.username,
        bio: user.bio || "",
        profilePicture: avatarUrl(req, user._id, user.profilePicture?.startsWith("data:") ? "uploaded" : user.profilePicture, user.updatedAt),
        socialLinks: user.socialLinks || {},
        resume: user.resume || "",
        memberSince: user.createdAt,
        rank: rankAbove + 1,
        stars,
        badges: badgesFor(stars),
        nextBadge: BADGES.find((b) => b.stars > stars) || null,
        solved: { total: solvedIds.length, ...solvedBy },
        totals: { total: totalBy.Easy + totalBy.Medium + totalBy.Hard, ...totalBy },
        submissions: totalSubs,
        acceptanceRate: totalSubs ? Math.round((acceptedSubs / totalSubs) * 1000) / 10 : null,
        calendar: Object.fromEntries(calendar.map((d) => [d._id, d.count])),
        recentAccepted: recent
            .filter((r) => titleOf.has(r._id))
            .map((r) => ({ problemId: r._id, title: titleOf.get(r._id).title, difficulty: titleOf.get(r._id).difficulty, at: r.at, language: r.language })),
        hackathons: hackathons.map((h) => ({ slug: h.slug, title: h.title, startsAt: h.startsAt, status: hackathonStatus(h) })),
    });
};
