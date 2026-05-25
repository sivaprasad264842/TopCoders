import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuid } from "uuid";

const app = express();
const PORT = process.env.PORT || 5001;
const TEMP_ROOT = process.env.TEMP_DIR || path.join(process.cwd(), "temp");
const EXECUTION_SERVICE_TOKEN = process.env.EXECUTION_SERVICE_TOKEN?.trim();

app.use(express.json({ limit: "256kb" }));

// Wall-clock timeout for code execution (ms).
// Must be less than the axios timeout in the backend's executionService.js.
const TIMEOUT = 10000;

const tokensMatch = (receivedToken) => {
    if (!EXECUTION_SERVICE_TOKEN) return true;
    if (!receivedToken) return false;
    const expected = Buffer.from(EXECUTION_SERVICE_TOKEN);
    const received = Buffer.from(receivedToken);
    return (
        expected.length === received.length &&
        crypto.timingSafeEqual(expected, received)
    );
};

app.get("/health", (req, res) => {
    res.json({ ok: true, service: "runner", timestamp: new Date().toISOString() });
});

// Spawn a process directly (no shell wrapper), kill it after TIMEOUT ms.
// Using spawn + direct kill instead of execFile + shell avoids the
// "orphan grandchild holds pipe open" problem that causes ECONNABORTED.
const runProcess = ({ command, args, cwd, input = "" }) =>
    new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let child;

        try {
            child = spawn(command, args, { cwd, shell: false });
        } catch (err) {
            resolve({ stdout, stderr: err.message, code: 1, timedOut });
            return;
        }

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, TIMEOUT);

        child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({ stdout, stderr: stderr + err.message, code: 1, timedOut });
        });

        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, code, timedOut });
        });

        if (input) child.stdin.write(input);
        child.stdin.end();
    });

const executeForLanguage = async ({ language, jobDir, input, startedAt }) => {
    if (language === "cpp") {
        const compile = await runProcess({
            command: "g++",
            args: ["-O2", "code.cpp", "-o", "main"],
            cwd: jobDir,
        });
        if (compile.code !== 0) {
            return { stdout: compile.stdout, stderr: compile.stderr, status: "compilation_error", time: `${Date.now() - startedAt}ms` };
        }
        const run = await runProcess({
            command: path.join(jobDir, "main"),
            args: [],
            cwd: jobDir,
            input,
        });
        return buildResult(run, startedAt);

    } else if (language === "java") {
        const compile = await runProcess({
            command: "javac",
            args: [
                "-J-Xms32m", "-J-Xmx256m",
                "-J-XX:ReservedCodeCacheSize=32m",
                "-J-XX:MaxMetaspaceSize=64m",
                "Main.java",
            ],
            cwd: jobDir,
        });
        if (compile.code !== 0) {
            return { stdout: compile.stdout, stderr: compile.stderr, status: "compilation_error", time: `${Date.now() - startedAt}ms` };
        }
        const run = await runProcess({
            command: "java",
            args: [
                "-Xms32m", "-Xmx256m",
                "-XX:ReservedCodeCacheSize=32m",
                "-XX:MaxMetaspaceSize=64m",
                "Main",
            ],
            cwd: jobDir,
            input,
        });
        return buildResult(run, startedAt);

    } else if (language === "python") {
        const run = await runProcess({
            command: "python3",
            args: ["code.py"],
            cwd: jobDir,
            input,
        });
        return buildResult(run, startedAt);

    } else if (language === "javascript") {
        const run = await runProcess({
            command: "node",
            args: ["code.js"],
            cwd: jobDir,
            input,
        });
        return buildResult(run, startedAt);

    } else {
        return { stdout: "", stderr: "Unsupported language", status: "runtime_error", time: "0ms" };
    }
};

const buildResult = (run, startedAt) => {
    let status = "success";
    if (run.timedOut) status = "timeout";
    else if (run.code !== 0) status = "runtime_error";
    return { stdout: run.stdout, stderr: run.stderr, status, time: `${Date.now() - startedAt}ms` };
};

app.post("/execute", async (req, res) => {
    let jobDir;

    try {
        if (!tokensMatch(req.get("x-execution-service-token"))) {
            return res.status(401).json({ error: "Unauthorized execution request" });
        }

        const { code, input = "", language } = req.body || {};
        const jobId = req.body?.jobId || uuid();

        if (!language || !code) {
            return res.status(400).json({ error: "code and language required" });
        }

        const sourceFiles = {
            cpp:        "code.cpp",
            python:     "code.py",
            java:       "Main.java",
            javascript: "code.js",
        };

        const sourceFile = sourceFiles[language];
        if (!sourceFile) {
            return res.status(400).json({ error: "Unsupported language" });
        }

        jobDir = path.join(TEMP_ROOT, jobId);
        fs.mkdirSync(jobDir, { recursive: true });
        fs.writeFileSync(path.join(jobDir, sourceFile), code, "utf8");

        const startedAt = Date.now();
        const result = await executeForLanguage({ language, jobDir, input, startedAt });
        return res.json(result);

    } catch (err) {
        console.error("Execute error:", err.message);
        return res.status(500).json({ error: "Execution failed" });
    } finally {
        if (jobDir) {
            try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
});

const server = app.listen(PORT, () =>
    console.log(`Execution service running on ${PORT}`)
);

server.on("error", (err) => {
    console.error(`Execution service failed to start: ${err.message}`);
    process.exit(1);
});

const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(() => process.exit(0));
};

process.once("SIGINT",  () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));