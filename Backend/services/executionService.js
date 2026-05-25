import axios from "axios";

const EXECUTION_SERVICE_URL =
    process.env.EXECUTION_SERVICE_URL;
const EXECUTION_SERVICE_TOKEN = process.env.EXECUTION_SERVICE_TOKEN?.trim();

const executionError = (message) => ({
    stdout: "",
    stderr: message,
    status: "runtime_error",
    time: "0ms",
});

export const executeCode = async (payload) => {
    if (EXECUTION_SERVICE_URL.includes(":5000/")) {
        const message =
            "EXECUTION_SERVICE_URL points to the backend server itself. Set it to the runner service URL (port 5001).";
        console.error("EXECUTION ERROR:", message);
        return executionError(message);
    }

    try {
        const headers = EXECUTION_SERVICE_TOKEN
            ? { "x-execution-service-token": EXECUTION_SERVICE_TOKEN }
            : {};

        const res = await axios.post(EXECUTION_SERVICE_URL, payload, {
            headers,
            timeout: 15000,
        });

        const missingRunnerScript =
            typeof res.data?.stderr === "string" &&
            res.data.stderr.includes("/app/runner.sh: No such file or directory");

        if (missingRunnerScript) {
            const message =
                "Execution service is misconfigured: runner script not found inside the container.";
            console.error("EXECUTION ERROR:", message);
            return executionError(message);
        }

        return res.data;
    } catch (err) {
        const serviceError =
            err.response?.data?.error ||
            err.code ||
            err.message ||
            "Unknown execution service error";

        const message = `Execution service failed: ${serviceError}`;
        console.error("EXECUTION ERROR:", message);

        return executionError(
            `${message}. Check EXECUTION_SERVICE_URL and make sure the runner container is running.`,
        );
    }
};
