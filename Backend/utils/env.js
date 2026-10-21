/**
 * Reads an optional setting. Empty or "disabled" (the placeholder the deploy
 * scripts store for features you do not use) both mean "not configured".
 */
export const optionalEnv = (name) => {
    const value = process.env[name]?.trim();
    return value && value.toLowerCase() !== "disabled" ? value : "";
};
