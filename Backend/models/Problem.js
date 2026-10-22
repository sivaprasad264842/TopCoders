import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema(
    {
        input: { type: String, default: "" },
        output: { type: String, required: true },
        // Hidden cases are used for judging but never shown to solvers.
        hidden: { type: Boolean, default: false },
    },
    { _id: false },
);

const hintSchema = new mongoose.Schema(
    {
        title: { type: String, trim: true, default: "" },
        body: { type: String, trim: true, default: "" },
    },
    { _id: false },
);

const problemSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    statement: { type: String, required: true, maxlength: 20_000 },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Easy" },
    // Public, URL-safe id (UUID). Mongo's _id is never exposed in URLs.
    problemId: { type: String, required: true, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    testCases: { type: [testCaseSchema], default: [] },
    hints: { type: [hintSchema], default: [] },
    tags: { type: [String], default: [], index: true },
    // Optional write-up of the intended solution, shown in the Editorial tab.
    editorial: { type: String, default: "", maxlength: 20_000 },
    // Hackathon problems stay hidden from the public list until the event ends.
    hackathon: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", default: null },
    hiddenUntil: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("Problem", problemSchema);
