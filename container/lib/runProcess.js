import { spawn } from "node:child_process";
import fs from "node:fs";

// prlimit (util-linux) caps file size and disables core dumps for user code.
const PRLIMIT = ["/usr/bin/prlimit", "/bin/prlimit"].find((p) => fs.existsSync(p));
const MAX_FILE_BYTES = 16 * 1024 * 1024;

// User code never sees the runner's own environment (it holds the service token).
const sandboxEnv = (cwd) => ({
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: cwd,
    TMPDIR: cwd,
    LANG: "C.UTF-8",
});

const killGroup = (child) => {
    try {
        // Negative pid = whole process group, so forked grandchildren die too.
        process.kill(-child.pid, "SIGKILL");
    } catch {
        try {
            child.kill("SIGKILL");
        } catch {
            /* already gone */
        }
    }
};

/**
 * Run one process with a wall-clock timeout and an output cap.
 * Never rejects: every failure is reported in the result object.
 */
export function runProcess({
    command,
    args = [],
    cwd,
    input = "",
    timeoutMs,
    maxOutputBytes,
}) {
    return new Promise((resolve) => {
        const startedAt = process.hrtime.bigint();
        const out = [];
        const err = [];
        let outBytes = 0;
        let errBytes = 0;
        let timedOut = false;
        let outputLimitExceeded = false;
        let settled = false;
        let child;

        const elapsedMs = () =>
            Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

        const finish = (extra) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({
                stdout: Buffer.concat(out).toString("utf8"),
                stderr: Buffer.concat(err).toString("utf8"),
                timedOut,
                outputLimitExceeded,
                timeMs: elapsedMs(),
                ...extra,
            });
        };

        const [cmd, cmdArgs] = PRLIMIT
            ? [PRLIMIT, [`--fsize=${MAX_FILE_BYTES}`, "--core=0", "--", command, ...args]]
            : [command, args];

        try {
            child = spawn(cmd, cmdArgs, {
                cwd,
                env: sandboxEnv(cwd),
                detached: true, // own process group -> killGroup works
                stdio: ["pipe", "pipe", "pipe"],
            });
        } catch (spawnError) {
            resolve({
                stdout: "",
                stderr: spawnError.message,
                exitCode: 1,
                signal: null,
                timedOut,
                outputLimitExceeded,
                timeMs: 0,
            });
            return;
        }

        const timer = setTimeout(() => {
            timedOut = true;
            killGroup(child);
        }, timeoutMs);

        const collect = (chunks, isStdout) => (chunk) => {
            const size = isStdout ? (outBytes += chunk.length) : (errBytes += chunk.length);
            if (size > maxOutputBytes) {
                if (!outputLimitExceeded) {
                    outputLimitExceeded = true;
                    killGroup(child);
                }
                return;
            }
            chunks.push(chunk);
        };

        child.stdout.on("data", collect(out, true));
        child.stderr.on("data", collect(err, false));

        child.on("error", (error) => {
            err.push(Buffer.from(error.message));
            finish({ exitCode: 1, signal: null });
        });

        // When the program itself exits, kill anything it left running in the
        // background; otherwise an orphan holding stdout open would look like a TLE.
        let exitTimeMs = null;
        child.on("exit", () => {
            exitTimeMs = elapsedMs();
            killGroup(child);
        });

        child.on("close", (exitCode, signal) => {
            finish({ exitCode, signal, ...(exitTimeMs !== null && { timeMs: exitTimeMs }) });
        });

        // The program may exit without reading stdin; ignore the resulting EPIPE.
        child.stdin.on("error", () => {});
        child.stdin.end(input);
    });
}
