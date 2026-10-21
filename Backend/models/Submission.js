import mongoose from "mongoose";

export const VERDICTS = ["Accepted", "Wrong Answer", "TLE", "Runtime Error", "Compilation Error"];

const submissionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        problemId: { type: String, required: true },
        code: { type: String, required: true },
        language: { type: String, enum: ["cpp", "java", "python", "javascript"], required: true },
        verdict: { type: String, enum: VERDICTS, required: true },
        // Sum of run times across executed tests (compile time excluded), in ms.
        executionTime: Number,
        passedTestCases: { type: Number, default: 0 },
        totalTestCases: { type: Number, default: 0 },
        failedTestCase: {
            index: Number, // 1-based; null for compilation errors
            hidden: Boolean, // true -> input/expected are intentionally not stored
            input: String,
            expectedOutput: String,
            actualOutput: String,
            error: String,
        },
    },
    { timestamps: true },
);

// "My submissions for this problem", newest first.
submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
// "My submissions", newest first.
submissionSchema.index({ userId: 1, createdAt: -1 });
// Per-problem leaderboard aggregation.
submissionSchema.index({ problemId: 1 });

export default mongoose.model("Submission", submissionSchema);
