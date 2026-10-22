// Full-stack flow against a real MongoDB and a real runner container.
// Skipped unless E2E_MONGO_URI and RUNNER_URL are set, e.g.:
//   docker run -d -p 27017:27017 mongo:7
//   docker run -d --init -p 5001:5001 -e EXECUTION_SERVICE_TOKEN=local-dev-token topcoders-runner
//   E2E_MONGO_URI=mongodb://localhost:27017/tc-e2e RUNNER_URL=http://localhost:5001 \
//   EXECUTION_SERVICE_TOKEN=local-dev-token npm test
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const enabled = Boolean(process.env.E2E_MONGO_URI && process.env.RUNNER_URL);

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "e2e-secret";
process.env.RUNNER_MODE = "static";
process.env.MONGO_URI = process.env.E2E_MONGO_URI || "";
process.env.ADMIN_EMAILS = "boss@x.io";

let server;
let base;
let mongoose;
let token;

const call = async (path, { method = "GET", body, auth = token, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(auth && { authorization: `Bearer ${auth}` }),
            ...headers,
        },
        body: body && JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
    if (!enabled) return;
    mongoose = (await import("mongoose")).default;
    const { createApp } = await import("../app.js");
    const connectDB = (await import("../config/db.js")).default;
    await connectDB();
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (!enabled) return;
    server.closeAllConnections();
    server.close();
    await mongoose.disconnect();
});

const opts = { skip: !enabled && "set E2E_MONGO_URI and RUNNER_URL to run" };
let problemId;

test("register stores a pending user and never stores the raw token", opts, async () => {
    const res = await call("/api/auth/register", {
        method: "POST",
        auth: null,
        body: { email: "Ada@Example.com", username: "ada", password: "secret123" },
    });
    assert.equal(res.status, 200);
    const pending = await mongoose.connection.db.collection("pendingusers").findOne({});
    assert.equal(pending.email, "ada@example.com");
    assert.match(pending.tokenHash, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(pending).includes("secret123"));
});

test("verify creates the user; the link only works once", opts, async () => {
    // We can't read the emailed token, so mint a known one.
    const raw = crypto.randomBytes(32).toString("hex");
    await mongoose.connection.db.collection("pendingusers").updateOne(
        {},
        { $set: { tokenHash: crypto.createHash("sha256").update(raw).digest("hex") } },
    );

    assert.equal((await call(`/api/auth/verify/${raw}`, { auth: null })).status, 200);
    assert.equal((await call(`/api/auth/verify/${raw}`, { auth: null })).status, 400);
    assert.equal((await call("/api/auth/verify/forged", { auth: null })).status, 400);
});

test("login works with any email casing and rejects bad passwords", opts, async () => {
    const bad = await call("/api/auth/login", { method: "POST", auth: null, body: { email: "ada@example.com", password: "nope123" } });
    assert.equal(bad.status, 401);

    const res = await call("/api/auth/login", { method: "POST", auth: null, body: { email: "ADA@example.com", password: "secret123" } });
    assert.equal(res.status, 200);
    token = res.body.token;
    assert.equal(res.body.username, "ada");
});

test("author creates a problem with a hidden test case", opts, async () => {
    const res = await call("/api/problems/create", {
        method: "POST",
        body: {
            title: "Sum",
            statement: "Print a+b.",
            difficulty: "Easy",
            testCases: [
                { input: "1 2", output: "3" },
                { input: "40 2", output: "42", hidden: true },
            ],
        },
    });
    assert.equal(res.status, 201);
    problemId = res.body.problemId;
    assert.equal(res.body.testCases.length, 2);
});

test("anonymous viewers never receive hidden test data", opts, async () => {
    const anon = await call(`/api/problems/${problemId}`, { auth: null });
    assert.equal(anon.body.testCases.length, 1);
    assert.equal(anon.body.hiddenTestCount, 1);
    assert.ok(anon.body.testCases.every((tc) => tc.output !== "42" && !tc.hidden));

    const list = await call("/api/problems/all", { auth: null });
    assert.equal(list.body[0].testCaseCount, 2);
    assert.equal(list.body[0].testCases, undefined);
});

test("run executes code on the runner", opts, async () => {
    const res = await call("/api/code/run", {
        method: "POST",
        body: { language: "python", code: "a,b=map(int,input().split())\nprint(a+b)", input: "5 6" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.stdout.trim(), "11");
});

test("a failure on a hidden test reveals nothing about it", opts, async () => {
    const res = await call("/api/code/submit", {
        method: "POST",
        body: { problemId, language: "python", code: "a,b=map(int,input().split())\nprint(3)" }, // hard-coded sample
    });
    assert.equal(res.body.verdict, "Wrong Answer");
    assert.equal(res.body.failedTestCase.hidden, true);
    assert.equal(res.body.failedTestCase.input, "");
    assert.equal(res.body.failedTestCase.expectedOutput, "");
});

test("a correct C++ solution is Accepted and counted as solved", opts, async () => {
    const res = await call("/api/code/submit", {
        method: "POST",
        body: {
            problemId,
            language: "cpp",
            code: "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}",
        },
    });
    assert.equal(res.body.verdict, "Accepted", JSON.stringify(res.body));
    assert.equal(res.body.passedTestCases, 2);

    const me = await call("/api/auth/me");
    assert.deepEqual(me.body.solvedProblems, [problemId]);
    assert.equal(res.body.starsEarned, 1); // Easy = 1 star
    assert.equal(me.body.stars, 1);
});

test("a second accepted solution earns no extra stars", opts, async () => {
    const res = await call("/api/code/submit", {
        method: "POST",
        body: { problemId, language: "python", code: "a,b=map(int,input().split())\nprint(a+b)" },
    });
    assert.equal(res.body.verdict, "Accepted");
    assert.equal(res.body.starsEarned, 0);
    assert.equal((await call("/api/auth/me")).body.stars, 1);
});

test("problem list and detail include acceptance, stars and tags", opts, async () => {
    const list = await call("/api/problems/all", { auth: null });
    const row = list.body.find((p) => p.problemId === problemId);
    assert.equal(row.stars, 1);
    assert.ok(row.submissions >= 3);
    assert.ok(row.acceptance > 0 && row.acceptance < 100);
    assert.deepEqual(row.tags, []);

    const tagged = await call(`/api/problems/${problemId}`, { method: "PUT", body: { tags: ["Math", "math", " Basics "] } });
    assert.deepEqual(tagged.body.tags, ["Math", "Basics"]);
    const tags = await call("/api/problems/tags", { auth: null });
    assert.ok(tags.body.some((t) => t.tag === "Math" && t.count === 1));
    const daily = await call("/api/problems/daily", { auth: null });
    assert.equal(daily.body.problemId, problemId);
});

test("public profile shows stars, badges and solved counts without private data", opts, async () => {
    const res = await call("/api/users/ADA", { auth: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.stars, 1);
    assert.equal(res.body.solved.Easy, 1);
    assert.ok(res.body.badges.some((b) => b.id === "first-star"));
    assert.equal(res.body.email, undefined);
    assert.equal(res.body.phone, undefined);
    assert.equal((await call("/api/users/nobody-here", { auth: null })).status, 404);
});

test("compilation errors are reported without a test index", opts, async () => {
    const res = await call("/api/code/submit", {
        method: "POST",
        body: { problemId, language: "java", code: "class Main { broken" },
    });
    assert.equal(res.body.verdict, "Compilation Error");
    assert.equal(res.body.failedTestCase.index, null);
});

test("leaderboards never expose email addresses", opts, async () => {
    const global = await call("/api/auth/leaderboard", { auth: null });
    const perProblem = await call(`/api/code/leaderboard/problem/${problemId}`, { auth: null });
    assert.equal(global.body[0].username, "ada");
    assert.equal(perProblem.body[0].accepted, 2); // C++ and Python accepted
    assert.ok(!JSON.stringify(global.body).includes("example.com"));
    assert.ok(!JSON.stringify(perProblem.body).includes("example.com"));
});

test("profile photo upload (~300 KB) is accepted", opts, async () => {
    const photo = `data:image/png;base64,${Buffer.alloc(220_000, 7).toString("base64")}`;
    const res = await call("/api/auth/me", {
        method: "PUT",
        body: { username: "ada", profilePicture: photo, phone: "+91 90000 00000" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.profilePicture.length, photo.length);
    assert.equal(res.body.phone, "+91 90000 00000"); // visible to the owner only
});

test("leaderboards link to the photo instead of inlining it, and hide phone numbers", opts, async () => {
    const global = await call("/api/auth/leaderboard", { auth: null });
    const perProblem = await call(`/api/code/leaderboard/problem/${problemId}`, { auth: null });

    for (const row of [global.body[0], perProblem.body[0]]) {
        assert.match(row.profilePicture, /\/api\/auth\/avatar\/[0-9a-f]{24}\?v=\d+$/);
        assert.equal(row.phone, undefined);
    }
    assert.ok(JSON.stringify(global.body).length < 5_000);

    const image = await fetch(global.body[0].profilePicture);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await image.arrayBuffer()).byteLength, 220_000);
});

test("heartbeat reports the sandbox as ready in static mode", opts, async () => {
    const res = await call("/api/session/heartbeat", { method: "POST" });
    assert.deepEqual(res.body, { status: "ready", mode: "static" });
});

test("only the author can edit; edits keep hidden flags", opts, async () => {
    const other = await mongoose.connection.db.collection("users").insertOne({ email: "eve@x.io", password: "x" });
    const jwt = (await import("jsonwebtoken")).default;
    const eveToken = jwt.sign({ id: String(other.insertedId) }, process.env.JWT_SECRET);

    const denied = await call(`/api/problems/${problemId}`, { method: "PUT", auth: eveToken, body: { title: "Hacked" } });
    assert.equal(denied.status, 403);

    const ok = await call(`/api/problems/${problemId}`, { method: "PUT", body: { title: "Sum v2" } });
    assert.equal(ok.body.title, "Sum v2");
    assert.equal(ok.body.hiddenTestCount, 1);
});

// ── Account recovery and session revocation (run last: they change ada's password) ──

const sha = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

test("forgot-password answers the same for unknown and known emails", opts, async () => {
    const unknown = await call("/api/auth/forgot-password", { method: "POST", auth: null, body: { email: "nobody@x.io" } });
    const known = await call("/api/auth/forgot-password", { method: "POST", auth: null, body: { email: "ADA@example.com" } });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);
    const user = await mongoose.connection.db.collection("users").findOne({ email: "ada@example.com" });
    assert.match(user.resetTokenHash, /^[a-f0-9]{64}$/);
});

test("reset link sets the password once and signs out every session", opts, async () => {
    const raw = crypto.randomBytes(32).toString("hex");
    await mongoose.connection.db.collection("users").updateOne({ email: "ada@example.com" }, { $set: { resetTokenHash: sha(raw) } });

    const weak = await call("/api/auth/reset-password", { method: "POST", auth: null, body: { token: raw, password: "short" } });
    assert.equal(weak.status, 400);
    const ok = await call("/api/auth/reset-password", { method: "POST", auth: null, body: { token: raw, password: "newpass123" } });
    assert.equal(ok.status, 200);
    const again = await call("/api/auth/reset-password", { method: "POST", auth: null, body: { token: raw, password: "other123" } });
    assert.equal(again.status, 400);

    const old = await call("/api/auth/me");
    assert.equal(old.status, 401);
    assert.equal(old.body.code, "SESSION_REVOKED");

    const login = await call("/api/auth/login", { method: "POST", auth: null, body: { email: "ada@example.com", password: "newpass123" } });
    assert.equal(login.status, 200);
    token = login.body.token;
});

test("changing the password keeps this device and revokes the old token", opts, async () => {
    const wrong = await call("/api/auth/password", { method: "PUT", body: { currentPassword: "nope1234", newPassword: "fresh1234" } });
    assert.equal(wrong.status, 400);

    const res = await call("/api/auth/password", { method: "PUT", body: { currentPassword: "newpass123", newPassword: "fresh1234" } });
    assert.equal(res.status, 200);
    assert.equal((await call("/api/auth/me")).status, 401);
    token = res.body.token;
    assert.equal((await call("/api/auth/me")).status, 200);
});

test("sign out everywhere revokes the current token", opts, async () => {
    assert.equal((await call("/api/auth/logout-all", { method: "POST" })).status, 200);
    assert.equal((await call("/api/auth/me")).status, 401);
});

test("resend-verification gives a generic answer for unknown emails", opts, async () => {
    const res = await call("/api/auth/resend-verification", { method: "POST", auth: null, body: { email: "ghost@x.io" } });
    assert.equal(res.status, 200);
});

// ── Comments and hackathons (fresh users, since ada's sessions were revoked above) ──

const makeUser = async (username, email) => {
    const jwt = (await import("jsonwebtoken")).default;
    const { insertedId } = await mongoose.connection.db
        .collection("users")
        .insertOne({ email, username, password: "x", solvedProblems: [], stars: 0, tokenVersion: 0 });
    return jwt.sign({ id: String(insertedId), tv: 0 }, process.env.JWT_SECRET);
};
let bob;
let cara;
let boss;
let commentId;

test("users comment, reply, vote and edit; others can't edit or self-vote", opts, async () => {
    bob = await makeUser("bob", "bob@x.io");
    cara = await makeUser("cara", "cara@x.io");
    boss = await makeUser("boss", "boss@x.io");

    const empty = await call(`/api/problems/${problemId}/comments`, { method: "POST", auth: bob, body: { body: "   " } });
    assert.equal(empty.status, 400);
    const anon = await call(`/api/problems/${problemId}/comments`, { method: "POST", auth: null, body: { body: "hi" } });
    assert.equal(anon.status, 401);

    const top = await call(`/api/problems/${problemId}/comments`, { method: "POST", auth: bob, body: { body: "Watch out for overflow." } });
    assert.equal(top.status, 201);
    commentId = top.body._id;
    const reply = await call(`/api/problems/${problemId}/comments`, { method: "POST", auth: cara, body: { body: "Use long long.", parentId: commentId } });
    assert.equal(reply.status, 201);

    assert.equal((await call(`/api/comments/${commentId}/vote`, { method: "POST", auth: bob })).status, 400);
    const vote = await call(`/api/comments/${commentId}/vote`, { method: "POST", auth: cara });
    assert.deepEqual(vote.body, { voted: true, score: 1 });

    assert.equal((await call(`/api/comments/${commentId}`, { method: "PUT", auth: cara, body: { body: "hacked" } })).status, 403);
    const edit = await call(`/api/comments/${commentId}`, { method: "PUT", auth: bob, body: { body: "Watch out for integer overflow." } });
    assert.equal(edit.status, 200);

    const list = await call(`/api/problems/${problemId}/comments?sort=top`, { auth: cara });
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].body, "Watch out for integer overflow.");
    assert.equal(list.body[0].voted, true);
    assert.equal(list.body[0].replies[0].author.username, "cara");
    assert.equal(JSON.stringify(list.body).includes("@x.io"), false);
});

test("deleting a comment with replies keeps the thread", opts, async () => {
    const res = await call(`/api/comments/${commentId}`, { method: "DELETE", auth: bob });
    assert.equal(res.body.softDeleted, true);
    const list = await call(`/api/problems/${problemId}/comments`, { auth: null });
    assert.equal(list.body[0].deleted, true);
    assert.equal(list.body[0].body, "");
    assert.equal(list.body[0].replies.length, 1);
});

test("only admins create hackathons; problems hide until it ends, except for registered users while live", opts, async () => {
    const body = {
        title: "Monthly Test Cup",
        description: "Rules here.",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        problems: [{ problemId, points: 300 }],
    };
    assert.equal((await call("/api/hackathons", { method: "POST", auth: bob, body })).status, 403);
    const created = await call("/api/hackathons", { method: "POST", auth: boss, body });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.slug, "monthly-test-cup");
    assert.equal(created.body.status, "live");

    const list = await call("/api/problems/all", { auth: null });
    assert.equal(list.body.some((p) => p.problemId === problemId), false);
    assert.equal((await call(`/api/problems/${problemId}`, { auth: null })).status, 404);
    assert.equal((await call(`/api/problems/${problemId}`, { auth: bob })).status, 404);

    const reg = await call("/api/hackathons/monthly-test-cup/register", { method: "POST", auth: bob });
    assert.deepEqual(reg.body, { registered: true, registrations: 1 });
    assert.equal((await call(`/api/problems/${problemId}`, { auth: bob })).status, 200);
    assert.equal((await call("/api/hackathons/monthly-test-cup/register", { method: "DELETE", auth: bob })).status, 400);

    const wrong = await call("/api/code/submit", { method: "POST", auth: bob, body: { problemId, language: "python", code: "print(0)" } });
    assert.equal(wrong.body.verdict, "Wrong Answer");
    const right = await call("/api/code/submit", {
        method: "POST",
        auth: bob,
        body: { problemId, language: "python", code: "a,b=map(int,input().split())\nprint(a+b)" },
    });
    assert.equal(right.body.verdict, "Accepted");

    const standings = await call("/api/hackathons/monthly-test-cup/standings", { auth: null });
    assert.equal(standings.body.rows[0].username, "bob");
    assert.equal(standings.body.rows[0].score, 300);
    assert.equal(standings.body.rows[0].cells[0].attempts, 2);
    assert.ok(standings.body.rows[0].penalty >= 5); // one wrong attempt = 5 minutes

    const detail = await call("/api/hackathons/monthly-test-cup", { auth: bob });
    assert.equal(detail.body.registered, true);
    assert.deepEqual(detail.body.solved, [problemId]);
    assert.equal(detail.body.problems[0].label, "A");
});

test("deleting a hackathon makes its problems public again", opts, async () => {
    assert.equal((await call("/api/hackathons/monthly-test-cup", { method: "DELETE", auth: boss })).status, 200);
    assert.equal((await call(`/api/problems/${problemId}`, { auth: null })).status, 200);
});
