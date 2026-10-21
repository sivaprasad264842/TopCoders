/**
 * Output comparison used by every online judge: ignore Windows line endings,
 * trailing spaces on each line, and leading/trailing blank lines.
 */
export const normalizeOutput = (value) =>
    String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim();

export const outputsMatch = (actual, expected) =>
    normalizeOutput(actual) === normalizeOutput(expected);
