import Problem from "../models/Problem.js";
import User from "../models/User.js";

/** Stars earned for the first accepted solution of a problem. */
export const STARS = { Easy: 1, Medium: 2, Hard: 3 };
export const starsFor = (difficulty) => STARS[difficulty] || 1;

/** Badge ladder by total stars (shown on profiles and the leaderboard). */
export const BADGES = [
    { id: "first-star", name: "First Star", stars: 1 },
    { id: "rising", name: "Rising Coder", stars: 10 },
    { id: "bronze", name: "Bronze Solver", stars: 25 },
    { id: "silver", name: "Silver Solver", stars: 50 },
    { id: "gold", name: "Gold Solver", stars: 100 },
    { id: "legend", name: "TopCoder Legend", stars: 250 },
];

export const badgesFor = (stars) => BADGES.filter((b) => stars >= b.stars);

/**
 * One-time backfill for accounts created before stars existed: computes stars
 * from already-solved problems. Safe to run on every boot (only touches users
 * without a stars field).
 */
export async function backfillStars() {
    const users = await User.find({ stars: { $exists: false } }).select("solvedProblems").lean();
    if (!users.length) return;

    const ids = [...new Set(users.flatMap((u) => u.solvedProblems || []))];
    const problems = await Problem.find({ problemId: { $in: ids } }).select("problemId difficulty").lean();
    const difficultyOf = new Map(problems.map((p) => [p.problemId, p.difficulty]));

    await User.bulkWrite(
        users.map((u) => ({
            updateOne: {
                filter: { _id: u._id, stars: { $exists: false } },
                update: {
                    $set: {
                        stars: (u.solvedProblems || []).reduce((sum, id) => sum + starsFor(difficultyOf.get(id)), 0),
                    },
                },
            },
        })),
    );
    console.log(`[stars] backfilled ${users.length} user(s)`);
}
