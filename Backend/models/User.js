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
    },
    { timestamps: true },
);

export default mongoose.model("User", userSchema);
