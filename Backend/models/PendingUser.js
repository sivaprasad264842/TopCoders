import mongoose from "mongoose";

/**
 * A registration waiting for email verification. The real User is only created
 * once the emailed link is opened. MongoDB deletes expired documents itself
 * (TTL index on expiresAt), so abandoned sign-ups never pile up.
 */
const pendingUserSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true },
        username: { type: String, trim: true, maxlength: 40 },
        passwordHash: { type: String, required: true },
        // SHA-256 of the emailed token; the raw token is never stored.
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true },
);

pendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PendingUser", pendingUserSchema);
