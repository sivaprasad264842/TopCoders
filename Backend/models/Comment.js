import mongoose from "mongoose";

/**
 * Discussion on a problem. Replies are one level deep (parent = a top-level
 * comment). Votes are stored as the set of users who upvoted.
 */
const commentSchema = new mongoose.Schema(
    {
        problemId: { type: String, required: true },
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        parent: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
        body: { type: String, required: true, trim: true, maxlength: 2000 },
        upvoters: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        editedAt: { type: Date, default: null },
        // A comment with replies is blanked instead of removed, so the thread stays readable.
        deleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

commentSchema.index({ problemId: 1, parent: 1, createdAt: -1 });

export default mongoose.model("Comment", commentSchema);
