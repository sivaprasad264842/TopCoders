// HTTP-level tests that need no database: routing, auth guards, validation, errors.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.RUNNER_MODE = "static";

const { createApp } = await import("../app.js");

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const call = async (path, { method = "GET", body, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : body && JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};

test("GET /health reports service, db and runner mode", async () => {
    const res = await call("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.db, "disconnected");
    assert.equal(res.body.runners.mode, "static");
});

test("security headers are set", async () => {
    const res = await call("/health");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
});

test("unknown routes return JSON 404", async () => {
    const res = await call("/api/nope");
    assert.equal(res.status, 404);
    assert.match(res.body.error, /Route not found/);
});

test("malformed JSON returns 400, not a crash", async () => {
    const res = await call("/api/auth/login", { method: "POST", body: "{bad json" });
    assert.equal(res.status, 400);
});

test("run requires login", async () => {
    const res = await call("/api/code/run", { method: "POST", body: { code: "print(1)", language: "python" } });
    assert.equal(res.status, 401);
});

test("register validates input before touching the database", async () => {
    const bad = await call("/api/auth/register", { method: "POST", body: { email: "nope", password: "123456" } });
    assert.equal(bad.status, 400);
    const shortPw = await call("/api/auth/register", { method: "POST", body: { email: "a@b.co", password: "123" } });
    assert.equal(shortPw.status, 400);
});

test("register rejects passwords without a letter and a number", async () => {
    const res = await call("/api/auth/register", { method: "POST", body: { email: "a@b.co", password: "abcdefgh" } });
    assert.equal(res.status, 400);
});

test("recovery endpoints validate input before touching the database", async () => {
    const forgot = await call("/api/auth/forgot-password", { method: "POST", body: { email: "nope" } });
    assert.equal(forgot.status, 400);
    const resend = await call("/api/auth/resend-verification", { method: "POST", body: { email: "nope" } });
    assert.equal(resend.status, 400);
    const reset = await call("/api/auth/reset-password", { method: "POST", body: { token: "x", password: "short" } });
    assert.equal(reset.status, 400);
});

test("password change and sign-out-everywhere require login", async () => {
    const change = await call("/api/auth/password", { method: "PUT", body: { currentPassword: "a", newPassword: "b" } });
    assert.equal(change.status, 401);
    const all = await call("/api/auth/logout-all", { method: "POST" });
    assert.equal(all.status, 401);
});

test("login answers 503 (not 500) while the database is down", async () => {
    const res = await call("/api/auth/login", { method: "POST", body: { email: "a@b.co", password: "secret1" } });
    assert.equal(res.status, 503);
});

test("session/end accepts a text/plain beacon body and rejects bad tokens", async () => {
    const token = jwt.sign({ id: "64b000000000000000000001" }, process.env.JWT_SECRET);
    const ok = await call("/api/session/end", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ token }),
    });
    assert.equal(ok.status, 204);

    const bad = await call("/api/session/end", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ token: "forged" }),
    });
    assert.equal(bad.status, 401);
});

test("CORS allows the local frontend and ignores unknown origins", async () => {
    const allowed = await call("/health", { headers: { origin: "http://localhost:5173" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const blocked = await call("/health", { headers: { origin: "https://evil.example" } });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
});

test("avatar of an unknown user is a JSON 404", async () => {
    const res = await call("/api/auth/avatar/not-an-id");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "No uploaded photo.");
});
