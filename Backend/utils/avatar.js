/*
 * Uploaded profile photos are stored on the user as data URLs (up to ~1.5 MB).
 * Lists such as leaderboards must not inline them (50 photos would be tens of
 * MB of JSON), so they return a small URL to GET /api/auth/avatar/:userId.
 */

const UPLOADED = "uploaded";

/** Aggregation expression: keep plain image URLs, replace data URLs with a marker. */
export const avatarField = (path) => ({
    $cond: [
        { $eq: [{ $substrCP: [{ $ifNull: [path, ""] }, 0, 5] }, "data:"] },
        UPLOADED,
        { $ifNull: [path, ""] },
    ],
});

/** Turns the marker back into an absolute, cache-busted avatar URL. */
export const avatarUrl = (req, userId, value, updatedAt) => {
    if (value !== UPLOADED) return value || "";
    const version = updatedAt ? new Date(updatedAt).getTime() : 0;
    return `${req.protocol}://${req.get("host")}/api/auth/avatar/${userId}?v=${version}`;
};

const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;

/** Splits a stored data URL into { type, bytes }, or null. */
export const decodeDataUrl = (value) => {
    const match = DATA_URL.exec(value || "");
    return match ? { type: match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") } : null;
};
