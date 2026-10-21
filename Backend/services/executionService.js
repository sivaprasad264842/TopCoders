import axios from "axios";
import runnerManager from "./runnerManager.js";
import { HttpError, RunnerUnavailableError } from "../utils/httpError.js";

const TOKEN = process.env.EXECUTION_SERVICE_TOKEN?.trim();
const HEADERS = TOKEN ? { "x-execution-service-token": TOKEN } : {};

// How long a Run/Submit request waits for a cold-starting sandbox.
// Kept below the load balancer's request timeout.
const RUNNER_WAIT_MS = 45_000;

async function callRunner(userId, path, body, timeoutMs) {
    const baseUrl = await runnerManager.acquire(userId, { waitMs: RUNNER_WAIT_MS });

    try {
        const res = await axios.post(`${baseUrl}${path}`, body, { headers: HEADERS, timeout: timeoutMs });
        return res.data;
    } catch (err) {
        const status = err.response?.status;

        if (status === 400 || status === 413) {
            throw new HttpError(400, err.response.data?.error || "The code runner rejected this request.");
        }
        if (status === 401) {
            console.error("[exec] runner rejected the service token (EXECUTION_SERVICE_TOKEN mismatch)");
            throw new RunnerUnavailableError("RUNNER_MISCONFIGURED", "The code runner is misconfigured. Please try later.");
        }
        if (status) {
            console.error(`[exec] runner returned HTTP ${status}`);
            throw new RunnerUnavailableError("RUNNER_ERROR", "The code runner failed. Please try again.");
        }

        // No response at all: the runner is gone or hung.
        console.error(`[exec] runner unreachable at ${baseUrl}: ${err.code || err.message}`);
        runnerManager.markBroken(userId, baseUrl);
        throw new RunnerUnavailableError(
            "RUNNER_UNREACHABLE",
            runnerManager.mode === "ecs"
                ? "Lost connection to your code sandbox. A new one will start; please try again."
                : "The code runner is not reachable. Is the runner container running?",
        );
    }
}

/** "Run" button. Returns { status, stdout, stderr, time }. */
export const runCode = (userId, { code, language, input }) =>
    callRunner(userId, "/execute", { code, language, input }, 60_000);

/**
 * "Submit" button. Compiles once and runs every test on the runner.
 * Returns { status, passed, total, totalTimeMs, failed }.
 */
export const judgeSubmission = (userId, { code, language, tests }) =>
    callRunner(userId, "/execute-batch", { code, language, tests }, 30_000 + tests.length * 7_000);
