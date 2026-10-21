import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeBatch, executeOnce } from "./lib/executor.js";
import { isSupportedLanguage } from "./lib/languages.js";
import { createSemaphore } from "./lib/semaphore.js";

const int = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const PORT = int(process.env.PORT, 5001);
const TEMP_ROOT = process.env.TEMP_DIR || path.join(os.tmpdir(), "oj-jobs");
const TOKEN = process.env.EXECUTION_SERVICE_TOKEN?.trim() || "";
const LIMITS = {
    compileTimeoutMs: int(process.env.COMPILE_TIMEOUT_MS, 20_000),
    runTimeoutMs: int(process.env.RUN_TIMEOUT_MS, 5_000),
    maxOutputBytes: int(process.env.MAX_OUTPUT_BYTES, 1_000_000),
};
const MAX_CODE_BYTES = 100 * 1024;
const MAX_TESTS = 100;
// 0 = never exit (local docker-compose). On ECS this makes an orphaned runner
// stop itself even if the backend that started it has crashed.
const IDLE_EXIT_MS = int(process.env.IDLE_EXIT_MINUTES, 0) * 60_000;

const jobs = createSemaphore(
    Math.max(1, int(process.env.MAX_CONCURRENT_JOBS, os.availableParallelism())),
);
let lastActivityAt = Date.now();

fs.mkdirSync(TEMP_ROOT, { recursive: true });
if (!TOKEN) console.warn("EXECUTION_SERVICE_TOKEN is not set: /execute is unauthenticated.");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));

const tokensMatch = (received) => {
    if (!TOKEN) return true;
    if (typeof received !== "string") return false;
    // Hash both sides so timingSafeEqual always compares equal-length buffers.
    const a = crypto.createHash("sha256").update(TOKEN).digest();
    const b = crypto.createHash("sha256").update(received).digest();
    return crypto.timingSafeEqual(a, b);
};

const requireToken = (req, res, next) => {
    if (!tokensMatch(req.get("x-execution-service-token"))) {
        return res.status(401).json({ error: "Unauthorized execution request" });
    }
    lastActivityAt = Date.now();
    next();
};

const validateCode = (body) => {
    const { code, language } = body || {};
    if (typeof code !== "string" || !code.trim()) return "code is required";
    if (Buffer.byteLength(code) > MAX_CODE_BYTES) return "code is too large";
    if (!isSupportedLanguage(language)) return "Unsupported language";
    return null;
};

const ctx = { tempRoot: TEMP_ROOT, limits: LIMITS };

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "runner",
        pendingJobs: jobs.pending,
        timestamp: new Date().toISOString(),
    });
});

// Backend keep-alive: proves a user is still active even when not running code.
app.post("/ping", requireToken, (req, res) => res.json({ ok: true }));

app.post("/execute", requireToken, async (req, res, next) => {
    const error = validateCode(req.body);
    if (error) return res.status(400).json({ error });

    const { code, language, input } = req.body;
    try {
        const result = await jobs.run(() =>
            executeOnce({ code, language, input: typeof input === "string" ? input : "" }, ctx),
        );
        res.json(result);
    } catch (err) {
        next(err);
    } finally {
        lastActivityAt = Date.now();
    }
});

app.post("/execute-batch", requireToken, async (req, res, next) => {
    const error = validateCode(req.body);
    if (error) return res.status(400).json({ error });

    const { code, language, tests } = req.body;
    if (!Array.isArray(tests) || tests.length === 0 || tests.length > MAX_TESTS) {
        return res.status(400).json({ error: `tests must be an array of 1-${MAX_TESTS} items` });
    }

    try {
        const cleanTests = tests.map((t) => ({
            input: String(t?.input ?? ""),
            expectedOutput: String(t?.expectedOutput ?? ""),
        }));
        const result = await jobs.run(() =>
            executeBatch({ code, language, tests: cleanTests }, ctx),
        );
        res.json(result);
    } catch (err) {
        next(err);
    } finally {
        lastActivityAt = Date.now();
    }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
    console.error("Execute error:", err);
    res.status(500).json({ error: "Execution failed" });
});

const server = app.listen(PORT, () => {
    console.log(
        `Runner listening on ${PORT} (limits ${JSON.stringify(LIMITS)}, idle exit ${IDLE_EXIT_MS / 60_000} min)`,
    );
});

server.on("error", (err) => {
    console.error(`Runner failed to start: ${err.message}`);
    process.exit(1);
});

const shutdown = (reason) => {
    console.log(`Runner shutting down: ${reason}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
};

if (IDLE_EXIT_MS > 0) {
    setInterval(() => {
        if (jobs.pending === 0 && Date.now() - lastActivityAt > IDLE_EXIT_MS) {
            shutdown(`idle for ${IDLE_EXIT_MS / 60_000} minutes`);
        }
    }, 30_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
