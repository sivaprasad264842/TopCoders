import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Problem from "../models/Problem.js";
import { avatarField, avatarUrl } from "../utils/avatar.js";
import { HttpError } from "../utils/httpError.js";
import { canViewProblem } from "../utils/problemAccess.js";
import { isAdmin } from "../utils/roles.js";

const MAX_BODY = 2000;

const readBody = (raw) => {
    const body = String(raw ?? "").trim();
    if (!body) throw new HttpError(400, "Write something first.");
    if (body.length > MAX_BODY) throw new HttpError(400, `Comments can be at most ${MAX_BODY} characters.`);
    return body;
};

const loadVisibleProblem = async (problemId, user) => {
    const problem = await Problem.findOne({ problemId }).select("problemId createdBy hiddenUntil hackathon").lean();
    if (!problem || !(await canViewProblem(problem, user))) throw new HttpError(404, "Problem not found.");
    return problem;
};

/** Public shape of a comment. Deleted comments keep their place but lose their content. */
const shape = (c, req, viewerId) => ({
    _id: c._id,
    parent: c.parent,
    body: c.deleted ? "" : c.body,
    deleted: c.deleted,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    score: c.upvoters?.length || 0,
    voted: Boolean(viewerId) && (c.upvoters || []).some((id) => String(id) === viewerId),
    mine: Boolean(viewerId) && String(c.author?._id || c.author) === viewerId,
    author: c.deleted
        ? null
        : {
              userId: c.authorDoc?._id,
              username: c.authorDoc?.username || "anonymous",
              profilePicture: avatarUrl(req, c.authorDoc?._id, c.authorDoc?.profilePicture, c.authorDoc?.updatedAt),
          },
});

/** GET /api/problems/:id/comments?sort=top|new — threads with their replies. */
export const listComments = async (req, res) => {
    await loadVisibleProblem(req.params.id, req.user);
    const sortTop = req.query.sort === "top";

    const rows = await Comment.aggregate([
        { $match: { problemId: req.params.id } },
        { $addFields: { score: { $size: "$upvoters" } } },
        { $sort: { createdAt: -1 } },
        { $limit: 1000 },
        { $lookup: { from: "users", localField: "author", foreignField: "_id", as: "authorDoc" } },
        { $unwind: { path: "$authorDoc", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                parent: 1, body: 1, deleted: 1, createdAt: 1, editedAt: 1, upvoters: 1, author: 1, score: 1,
                "authorDoc._id": 1, "authorDoc.username": 1, "authorDoc.updatedAt": 1,
                "authorDoc.profilePicture": avatarField("$authorDoc.profilePicture"),
            },
        },
    ]);

    const viewerId = req.userId || null;
    const top = rows.filter((c) => !c.parent);
    const repliesByParent = new Map();
    rows.filter((c) => c.parent)
        .reverse() // replies read oldest first
        .forEach((c) => {
            const key = String(c.parent);
            if (!repliesByParent.has(key)) repliesByParent.set(key, []);
            repliesByParent.get(key).push(shape(c, req, viewerId));
        });

    if (sortTop) top.sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));

    res.json(
        top
            .map((c) => ({ ...shape(c, req, viewerId), replies: repliesByParent.get(String(c._id)) || [] }))
            // A deleted comment with no replies left has nothing to show.
            .filter((c) => !c.deleted || c.replies.length),
    );
};

/** POST /api/problems/:id/comments { body, parentId? } */
export const createComment = async (req, res) => {
    await loadVisibleProblem(req.params.id, req.user);
    const body = readBody(req.body?.body);

    let parent = null;
    if (req.body?.parentId) {
        if (!mongoose.isValidObjectId(req.body.parentId)) throw new HttpError(400, "Invalid reply target.");
        const target = await Comment.findById(req.body.parentId).select("problemId parent deleted").lean();
        if (!target || target.problemId !== req.params.id || target.deleted) {
            throw new HttpError(404, "The comment you're replying to no longer exists.");
        }
        parent = target.parent || target._id; // replies to a reply join the same thread
    }

    const comment = await Comment.create({ problemId: req.params.id, author: req.user._id, parent, body });
    const authorDoc = {
        _id: req.user._id,
        username: req.user.username,
        profilePicture: req.user.profilePicture?.startsWith("data:") ? "uploaded" : req.user.profilePicture,
        updatedAt: req.user.updatedAt,
    };
    res.status(201).json({ ...shape({ ...comment.toObject(), authorDoc }, req, String(req.user._id)), replies: [] });
};

const loadOwnComment = async (req) => {
    if (!mongoose.isValidObjectId(req.params.commentId)) throw new HttpError(404, "Comment not found.");
    const comment = await Comment.findById(req.params.commentId);
    if (!comment || comment.deleted) throw new HttpError(404, "Comment not found.");
    const mine = String(comment.author) === String(req.user._id);
    return { comment, mine };
};

/** PUT /api/comments/:commentId { body } — author only. */
export const updateComment = async (req, res) => {
    const { comment, mine } = await loadOwnComment(req);
    if (!mine) throw new HttpError(403, "You can only edit your own comments.");
    comment.body = readBody(req.body?.body);
    comment.editedAt = new Date();
    await comment.save();
    res.json({ _id: comment._id, body: comment.body, editedAt: comment.editedAt });
};

/** DELETE /api/comments/:commentId — author or admin. */
export const deleteComment = async (req, res) => {
    const { comment, mine } = await loadOwnComment(req);
    if (!mine && !isAdmin(req.user)) throw new HttpError(403, "You can only delete your own comments.");

    const hasReplies = !comment.parent && (await Comment.exists({ parent: comment._id, deleted: false }));
    if (hasReplies) {
        comment.deleted = true;
        comment.body = "[deleted]";
        await comment.save();
    } else {
        await comment.deleteOne();
    }
    res.json({ message: "Comment deleted", softDeleted: Boolean(hasReplies) });
};

/** POST /api/comments/:commentId/vote — toggles the viewer's upvote. */
export const toggleVote = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.commentId)) throw new HttpError(404, "Comment not found.");
    const userId = req.user._id;
    const comment = await Comment.findById(req.params.commentId).select("upvoters deleted author").lean();
    if (!comment || comment.deleted) throw new HttpError(404, "Comment not found.");
    if (String(comment.author) === String(userId)) throw new HttpError(400, "You can't upvote your own comment.");

    const voted = (comment.upvoters || []).some((id) => String(id) === String(userId));
    const updated = await Comment.findByIdAndUpdate(
        comment._id,
        voted ? { $pull: { upvoters: userId } } : { $addToSet: { upvoters: userId } },
        { returnDocument: "after" },
    )
        .select("upvoters")
        .lean();
    res.json({ voted: !voted, score: updated.upvoters.length });
};
