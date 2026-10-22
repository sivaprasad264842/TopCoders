import { HttpError } from "./httpError.js";

export const SUPPORTED_LANGUAGES = ["cpp", "java", "python", "javascript"];

export const LIMITS = {
    codeBytes: 100 * 1024,
    inputBytes: 1024 * 1024,
    testCases: 50,
    testCaseBytes: 256 * 1024,
    hints: 10,
    titleChars: 150,
    statementChars: 20_000,
    tags: 8,
    tagChars: 30,
    editorialChars: 20_000,
};

const bytes = (value) => Buffer.byteLength(value, "utf8");

/** Validates { code, language, input } coming from Run / Submit. */
export function parseCodeRequest(body) {
    const { code, language, input = "" } = body || {};

    if (typeof code !== "string" || !code.trim()) {
        throw new HttpError(400, "Code is required.");
    }
    if (bytes(code) > LIMITS.codeBytes) {
        throw new HttpError(400, "Code is too large (max 100 KB).");
    }
    if (!SUPPORTED_LANGUAGES.includes(language)) {
        throw new HttpError(400, `Language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}.`);
    }
    if (typeof input !== "string" || bytes(input) > LIMITS.inputBytes) {
        throw new HttpError(400, "Input must be text under 1 MB.");
    }

    return { code, language, input };
}

/** Validates problem test cases: [{ input, output, hidden }]. */
export function parseTestCases(raw) {
    if (!Array.isArray(raw)) {
        throw new HttpError(400, "testCases must be an array.");
    }
    if (raw.length > LIMITS.testCases) {
        throw new HttpError(400, `A problem can have at most ${LIMITS.testCases} test cases.`);
    }

    return raw.map((tc, index) => {
        const input = String(tc?.input ?? "");
        const output = String(tc?.output ?? "");
        if (!output.trim()) {
            throw new HttpError(400, `Test case ${index + 1} needs an expected output.`);
        }
        if (bytes(input) > LIMITS.testCaseBytes || bytes(output) > LIMITS.testCaseBytes) {
            throw new HttpError(400, `Test case ${index + 1} is too large (max 256 KB each side).`);
        }
        return { input, output, hidden: Boolean(tc?.hidden) };
    });
}

export function parseHints(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, LIMITS.hints)
        .map((hint, index) => ({
            title: String(hint?.title || `Hint ${index + 1}`).trim().slice(0, 80),
            body: String(hint?.body || "").trim().slice(0, 2000),
        }))
        .filter((hint) => hint.body);
}

/** Topic tags: up to 8, trimmed, de-duplicated case-insensitively. */
export function parseTags(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const tags = [];
    for (const value of raw) {
        const tag = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, LIMITS.tagChars);
        if (!tag || seen.has(tag.toLowerCase())) continue;
        seen.add(tag.toLowerCase());
        tags.push(tag);
        if (tags.length === LIMITS.tags) break;
    }
    return tags;
}
