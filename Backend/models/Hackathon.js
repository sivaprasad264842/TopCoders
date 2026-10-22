import mongoose from "mongoose";

const hackathonProblemSchema = new mongoose.Schema(
    {
        problemId: { type: String, required: true },
        points: { type: Number, min: 1, max: 10_000, default: 100 },
    },
    { _id: false },
);

/** A timed contest. Status (upcoming / live / ended) is derived from the dates. */
const hackathonSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        slug: { type: String, required: true, unique: true },
        description: { type: String, default: "", maxlength: 5000 },
        startsAt: { type: Date, required: true, index: true },
        endsAt: { type: Date, required: true },
        problems: { type: [hackathonProblemSchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

export default mongoose.model("Hackathon", hackathonSchema);
