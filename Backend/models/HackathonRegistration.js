import mongoose from "mongoose";

/** One row per (hackathon, user). The unique index makes registering idempotent. */
const registrationSchema = new mongoose.Schema(
    {
        hackathon: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

registrationSchema.index({ hackathon: 1, user: 1 }, { unique: true });
registrationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("HackathonRegistration", registrationSchema);
