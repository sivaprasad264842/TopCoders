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
    assert.equal(perProblem.body[0].accepted, 1);
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
