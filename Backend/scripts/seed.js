/**
 * Fills a LOCAL database with demo data: users, tagged problems with
 * editorials, a year of submissions, comments and three hackathons
 * (live, upcoming, ended).
 *
 *   cd Backend && npm run seed          # uses MONGO_URI from .env
 *
 * Refuses to touch Atlas or production databases unless you pass --force.
 * Every demo account's password is: demo1234
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Hackathon from "../models/Hackathon.js";
import HackathonRegistration from "../models/HackathonRegistration.js";
import Problem from "../models/Problem.js";
import Submission from "../models/Submission.js";
import User from "../models/User.js";
import { starsFor } from "../utils/stars.js";

const uri = process.env.MONGO_URI || "";
const force = process.argv.includes("--force");
if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
}
if (!force && (process.env.NODE_ENV === "production" || uri.includes("mongodb.net"))) {
    console.error("Refusing to seed a production/Atlas database. Use a local MongoDB, or pass --force if you really mean it.");
    process.exit(1);
}

const PROBLEMS = [
    ["Two Sum", "Easy", ["Array", "Hash Table"], "Given n integers and a target, print the indices of the two numbers that add up to the target.\n\nInput: n and target on the first line, then n integers.\nOutput: the two indices separated by a space.", [["4 9\n2 7 11 15", "0 1"], ["3 6\n3 2 4", "1 2"]]],
    ["Reverse Words", "Easy", ["String", "Two Pointers"], "Print the words of the sentence in reverse order.", [["hello world", "world hello"], ["a b c", "c b a"]]],
    ["Valid Brackets", "Easy", ["String", "Stack"], "Print YES if the brackets are balanced, otherwise NO.", [["([]){}", "YES"], ["(]", "NO"]]],
    ["Maximum Subarray", "Medium", ["Array", "Dynamic Programming"], "Print the largest sum of a contiguous subarray.", [["9\n-2 1 -3 4 -1 2 1 -5 4", "6"]]],
    ["Merge Intervals", "Medium", ["Array", "Sorting"], "Merge all overlapping intervals and print them in order.", [["3\n1 3\n2 6\n8 10", "1 6\n8 10"]]],
    ["Longest Unique Substring", "Medium", ["String", "Sliding Window", "Hash Table"], "Print the length of the longest substring without repeating characters.", [["abcabcbb", "3"]]],
    ["Coin Change", "Medium", ["Dynamic Programming"], "Print the fewest coins needed to make the amount, or -1.", [["3 11\n1 2 5", "3"]]],
    ["Number of Islands", "Medium", ["Graph", "BFS", "Matrix"], "Count groups of connected 1s in the grid.", [["3 3\n110\n010\n001", "2"]]],
    ["Binary Search", "Easy", ["Array", "Binary Search"], "Print the index of the target in the sorted array, or -1.", [["5 9\n-1 0 3 5 9", "4"]]],
    ["Word Ladder", "Hard", ["Graph", "BFS", "String"], "Print the length of the shortest transformation sequence.", [["hit cog\n6\nhot dot dog lot log cog", "5"]]],
    ["Median of Two Sorted Arrays", "Hard", ["Array", "Binary Search"], "Print the median of the two sorted arrays with one decimal.", [["2 1\n1 3\n2", "2.0"]]],
    ["Trapping Rain Water", "Hard", ["Array", "Two Pointers", "Stack"], "Print how much water is trapped after raining.", [["12\n0 1 0 2 1 0 1 3 2 1 2 1", "6"]]],
];

const PEOPLE = [
    ["ada", "ada@topcoders.dev", "Competitive programmer. ICPC regional finalist."],
    ["linus", "linus@topcoders.dev", "Systems, C and coffee."],
    ["grace", "grace@topcoders.dev", "Compilers and clean code."],
    ["alan", "alan@topcoders.dev", "Graphs all day."],
    ["katherine", "katherine@topcoders.dev", "Numbers person."],
    ["dennis", "dennis@topcoders.dev", ""],
    ["admin", "admin@topcoders.dev", "Runs the monthly hackathons."],
];

const day = 24 * 60 * 60_000;
const rand = (n) => Math.floor(Math.random() * n);

await mongoose.connect(uri);
console.log(`Seeding ${mongoose.connection.name}...`);
await Promise.all([User, Problem, Submission, Comment, Hackathon, HackathonRegistration].map((m) => m.deleteMany({})));
await mongoose.connection.db.collection("pendingusers").deleteMany({});

const password = await bcrypt.hash("demo1234", 10);
const users = await User.insertMany(
    PEOPLE.map(([username, email, bio]) => ({ username, email, bio, password, role: username === "admin" ? "admin" : "user", stars: 0, solvedProblems: [] })),
);
const admin = users.find((u) => u.username === "admin");

const problems = await Problem.insertMany(
    PROBLEMS.map(([title, difficulty, tags, statement, cases], i) => ({
        title,
        difficulty,
        tags,
        statement,
        problemId: randomUUID(),
        createdBy: admin._id,
        createdAt: new Date(Date.now() - (PROBLEMS.length - i) * day),
        // The hidden test repeats the first example, so correct demo solutions pass.
        testCases: [...cases.map(([input, output]) => ({ input, output })), { input: cases[0][0], output: cases[0][1], hidden: true }],
        hints: [{ title: "Hint 1", body: "Start with a brute-force solution, then look for repeated work." }],
        editorial: i % 3 === 2 ? "" : `Approach\n\nWalk through the input once and keep the state you need.\n\nComplexity: O(n) time and O(n) extra space.`,
    })),
);

// Submissions spread over the past year so profiles have activity calendars.
const langs = ["python", "cpp", "javascript", "java"];
const subs = [];
const solved = new Map(users.map((u) => [String(u._id), new Set()]));
users.slice(0, 6).forEach((u, ui) => {
    const skill = 1 - ui * 0.13;
    for (let k = 0; k < 120 - ui * 15; k += 1) {
        const p = problems[rand(problems.length)];
        const ok = Math.random() < skill * (p.difficulty === "Hard" ? 0.45 : p.difficulty === "Medium" ? 0.65 : 0.85);
        subs.push({
            userId: u._id,
            problemId: p.problemId,
            code: "// demo",
            language: langs[rand(4)],
            verdict: ok ? "Accepted" : ["Wrong Answer", "TLE", "Runtime Error"][rand(3)],
            executionTime: 20 + rand(300),
            passedTestCases: ok ? p.testCases.length : rand(p.testCases.length),
            totalTestCases: p.testCases.length,
            createdAt: new Date(Date.now() - rand(360) * day - rand(day)),
        });
        if (ok) solved.get(String(u._id)).add(p.problemId);
    }
});
await Submission.insertMany(subs);

const difficultyOf = new Map(problems.map((p) => [p.problemId, p.difficulty]));
await User.bulkWrite(
    users.map((u) => {
        const ids = [...solved.get(String(u._id))];
        return { updateOne: { filter: { _id: u._id }, update: { solvedProblems: ids, stars: ids.reduce((s, id) => s + starsFor(difficultyOf.get(id)), 0) } } };
    }),
);

// Comments on the first problem.
const first = problems[0].problemId;
const top = await Comment.create({ problemId: first, author: users[1]._id, body: "A hash map from value to index makes this a single pass. Check the complement before inserting the current number.", upvoters: [users[0]._id, users[2]._id, users[3]._id] });
await Comment.create({ problemId: first, author: users[2]._id, parent: top._id, body: "And insert after the check, otherwise 2 + 2 = 4 with a single 2 passes by mistake." });
await Comment.create({ problemId: first, author: users[3]._id, body: "Sorting plus two pointers also works, but you lose the original indices unless you keep them.", upvoters: [users[1]._id] });

// Hackathons: one live now, one next month, one last month.
const hackProblems = problems.slice(9, 12);
const live = await Hackathon.create({
    title: "TopCoders Monthly, Live Demo",
    slug: "topcoders-monthly-live-demo",
    description: "Three hard problems, 90 minutes.\n\nScoring: points per problem, ties broken by penalty time (5 minutes per wrong attempt).",
    startsAt: new Date(Date.now() - 20 * 60_000),
    endsAt: new Date(Date.now() + 70 * 60_000),
    problems: hackProblems.map((p, i) => ({ problemId: p.problemId, points: 300 + i * 100 })),
    createdBy: admin._id,
});
await Problem.updateMany({ problemId: { $in: hackProblems.map((p) => p.problemId) } }, { hackathon: live._id, hiddenUntil: live.endsAt });
const nextStart = new Date(Date.now() + 9 * day);
nextStart.setHours(10, 0, 0, 0);
await Hackathon.create({
    title: "TopCoders Monthly, Next Round",
    slug: "topcoders-monthly-next-round",
    description: "Our next monthly hackathon. Register now and we'll see you there.",
    startsAt: nextStart,
    endsAt: new Date(nextStart.getTime() + 3 * 60 * 60_000),
    problems: [{ problemId: problems[3].problemId, points: 200 }],
    createdBy: admin._id,
});
const past = await Hackathon.create({
    title: "TopCoders Monthly, Last Month",
    slug: "topcoders-monthly-last-month",
    description: "Last month's hackathon.",
    startsAt: new Date(Date.now() - 30 * day),
    endsAt: new Date(Date.now() - 30 * day + 3 * 60 * 60_000),
    problems: problems.slice(4, 7).map((p) => ({ problemId: p.problemId, points: 200 })),
    createdBy: admin._id,
});
await HackathonRegistration.insertMany([
    ...users.slice(0, 5).map((u) => ({ hackathon: live._id, user: u._id })),
    ...users.slice(0, 6).map((u) => ({ hackathon: past._id, user: u._id })),
]);
// Live-hackathon activity for the standings table.
const liveSubs = [];
users.slice(0, 4).forEach((u, ui) =>
    hackProblems.slice(0, 3 - (ui > 1 ? 1 : 0)).forEach((p, pi) => {
        const t = live.startsAt.getTime() + (5 + ui * 3 + pi * 4) * 60_000;
        if (ui % 2) liveSubs.push({ userId: u._id, problemId: p.problemId, code: "//", language: "cpp", verdict: "Wrong Answer", passedTestCases: 1, totalTestCases: 3, createdAt: new Date(t - 60_000) });
        if (!(ui === 3 && pi === 1)) liveSubs.push({ userId: u._id, problemId: p.problemId, code: "//", language: "cpp", verdict: "Accepted", executionTime: 40, passedTestCases: 3, totalTestCases: 3, createdAt: new Date(t) });
    }),
);
await Submission.insertMany(liveSubs);

console.log(`Done: ${users.length} users, ${problems.length} problems, ${subs.length + liveSubs.length} submissions, 3 hackathons.`);
console.log("Log in as admin@topcoders.dev (or ada@topcoders.dev) with password demo1234.");
await mongoose.disconnect();
