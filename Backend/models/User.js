import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, trim: true },
        username: { type: String, trim: true, maxlength: 40, unique: true, sparse: true },
        bio: { type: String, trim: true, maxlength: 240 },
        profilePicture: { type: String, trim: true },
        socialLinks: {
            github: { type: String, trim: true },
            linkedin: { type: String, trim: true },
            website: { type: String, trim: true },
        },
        phone: { type: String, trim: true, maxlength: 24 },
        resume: { type: String, trim: true },
        password: { type: String, required: true }, // bcrypt hash
        solvedProblems: [{ type: String, ref: "Problem" }], // problemIds
        // Easy 1, Medium 2, Hard 3 per first solve (see utils/stars.js).
        stars: { type: Number, default: 0, index: true },
        role: { type: String, enum: ["user", "admin"], default: "user" },
        // Bumped on password change / "sign out everywhere"; tokens carrying an
        // older version are rejected, so every existing session ends at once.
        tokenVersion: { type: Number, default: 0 },
        // Password reset: SHA-256 of the emailed token (raw token never stored).
        resetTokenHash: { type: String, index: { sparse: true } },
        resetExpiresAt: { type: Date },
    },
    { timestamps: true },
);

export default mongoose.model("User", userSchema);
