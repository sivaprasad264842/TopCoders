/** An error that maps directly to an HTTP response: { error: message, code }. */
export class HttpError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = code;
    }
}

/** The user's code sandbox is not available (starting, failed, at capacity). */
export class RunnerUnavailableError extends HttpError {
    constructor(code, message) {
        super(503, message, code);
        this.name = "RunnerUnavailableError";
    }
}
