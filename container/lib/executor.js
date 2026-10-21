import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LANGUAGES } from "./languages.js";
import { outputsMatch } from "./judge.js";
import { runProcess } from "./runProcess.js";

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/** Map a raw process result to the public run status. */
const toRunResult = (run, limits) => {
    if (run.outputLimitExceeded) {
        return {
            status: "runtime_error",
            stdout: run.stdout,
            stderr: `${run.stderr}\nOutput limit exceeded (${kb(limits.maxOutputBytes)}).`.trim(),
            timeMs: run.timeMs,
        };
    }
    if (run.timedOut) {
        return { status: "timeout", stdout: run.stdout, stderr: run.stderr, timeMs: run.timeMs };
    }
    if (run.exitCode !== 0 || run.signal) {
        const killedHint =
            run.signal === "SIGKILL" ? "\nProcess was killed (possibly out of memory)." : "";
        return {
            status: "runtime_error",
            stdout: run.stdout,
            stderr: `${run.stderr}${killedHint}`.trim(),
            timeMs: run.timeMs,
        };
    }
    return { status: "success", stdout: run.stdout, stderr: run.stderr, timeMs: run.timeMs };
};

/**
 * Creates a temp job directory, writes + compiles the source, hands the
 * directory to `work`, and always deletes it afterwards.
 */
async function withCompiledJob({ code, language, tempRoot, limits }, work) {
    const spec = LANGUAGES[language];
    const jobDir = path.join(tempRoot, randomUUID());
    await fs.mkdir(jobDir, { recursive: true });

    try {
        await fs.writeFile(path.join(jobDir, spec.sourceFile), code, "utf8");

        if (spec.compile) {
            const [command, args] = spec.compile(jobDir);
            const compile = await runProcess({
                command,
                args,
                cwd: jobDir,
                timeoutMs: limits.compileTimeoutMs,
                maxOutputBytes: limits.maxOutputBytes,
            });
            if (compile.timedOut || compile.exitCode !== 0 || compile.signal) {
                const reason = compile.timedOut ? "Compilation timed out." : "";
                return {
                    compileError: `${compile.stderr || compile.stdout}\n${reason}`.trim() || "Compilation failed.",
                };
            }
        }

        const [command, args] = spec.run(jobDir);
        const run = (input) =>
            runProcess({
                command,
                args,
                cwd: jobDir,
                input,
                timeoutMs: limits.runTimeoutMs,
                maxOutputBytes: limits.maxOutputBytes,
            }).then((result) => toRunResult(result, limits));

        return await work(run);
    } finally {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
}

/** "Run" button: one input, raw output back. */
export async function executeOnce({ code, language, input = "" }, ctx) {
    const result = await withCompiledJob({ code, language, ...ctx }, async (run) => run(input));

    if (result.compileError) {
        return { status: "compilation_error", stdout: "", stderr: result.compileError, time: "0ms" };
    }
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        time: `${result.timeMs}ms`,
    };
}

/**
 * "Submit" button: compile once, run every test, stop at the first failure.
 * Returns only what the backend needs to build a verdict.
 */
export async function executeBatch({ code, language, tests }, ctx) {
    return withCompiledJob({ code, language, ...ctx }, async (run) => {
        let totalTimeMs = 0;

        for (const [index, test] of tests.entries()) {
            const result = await run(test.input ?? "");
            totalTimeMs += result.timeMs;

            let status = result.status;
            if (status === "success") {
                status = outputsMatch(result.stdout, test.expectedOutput) ? "passed" : "wrong_answer";
            }

            if (status !== "passed") {
                return {
                    status,
                    passed: index,
                    total: tests.length,
                    totalTimeMs,
                    failed: {
                        index,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        timeMs: result.timeMs,
                    },
                };
            }
        }

        return { status: "accepted", passed: tests.length, total: tests.length, totalTimeMs, failed: null };
    }).then((result) =>
        result.compileError
            ? {
                  status: "compilation_error",
                  passed: 0,
                  total: tests.length,
                  totalTimeMs: 0,
                  failed: { index: null, stdout: "", stderr: result.compileError, timeMs: 0 },
              }
            : result,
    );
}
