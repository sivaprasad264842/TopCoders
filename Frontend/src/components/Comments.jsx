import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addComment, editComment, getComments, getErrorMessage, removeComment, voteComment } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { Avatar, timeAgo } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import Segmented from "../ui/Segmented";

const MAX = 2000;

/** Discussion for one problem: threads with one level of replies, upvotes, edit and delete. */
export default function Comments({ problemId, onCountChange }) {
    const { isLoggedIn } = useAuth();
    const { me } = useMe();
    const { toast, confirm } = useFeedback();
    const [sort, setSort] = useState("top");
    const [threads, setThreads] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [editing, setEditing] = useState(null);

    const load = useCallback(
        () =>
            getComments(problemId, sort)
                .then((res) => {
                    setThreads(res.data);
                    onCountChange?.(res.data.reduce((n, t) => n + (t.deleted ? 0 : 1) + t.replies.length, 0));
                })
                .catch(() => setThreads([])),
        [problemId, sort, onCountChange],
    );

    useEffect(() => {
        let active = true;
        getComments(problemId, sort)
            .then((res) => {
                if (!active) return;
                setThreads(res.data);
                onCountChange?.(res.data.reduce((n, t) => n + (t.deleted ? 0 : 1) + t.replies.length, 0));
            })
            .catch(() => active && setThreads([]));
        return () => {
            active = false;
        };
    }, [problemId, sort, onCountChange]);

    const post = async (body, parentId) => {
        try {
            await addComment(problemId, body, parentId);
            setReplyTo(null);
            await load();
            return true;
        } catch (err) {
            toast(getErrorMessage(err, "Could not post the comment."), "error");
            return false;
        }
    };

    const save = async (commentId, body) => {
        try {
            await editComment(commentId, body);
            setEditing(null);
            await load();
            return true;
        } catch (err) {
            toast(getErrorMessage(err, "Could not save the comment."), "error");
            return false;
        }
    };

    const remove = async (commentId) => {
        const ok = await confirm({ title: "Delete this comment?", body: "This can't be undone.", confirmText: "Delete", danger: true });
        if (!ok) return;
        try {
            await removeComment(commentId);
            toast("Comment deleted");
            load();
        } catch (err) {
            toast(getErrorMessage(err, "Could not delete the comment."), "error");
        }
    };

    const vote = async (commentId) => {
        if (!isLoggedIn) return toast("Log in to upvote comments.", "info");
        try {
            const { data } = await voteComment(commentId);
            const patch = (c) => (c._id === commentId ? { ...c, voted: data.voted, score: data.score } : c);
            setThreads((list) => list.map((t) => ({ ...patch(t), replies: t.replies.map(patch) })));
        } catch (err) {
            toast(getErrorMessage(err, "Could not vote."), "error");
        }
    };

    const renderComment = (c, isReply = false) => {
        const isEditing = editing === c._id;
        return (
            <div className={`comment ${isReply ? "reply" : ""}`} key={c._id}>
                <Avatar name={c.author?.username || "?"} src={c.author?.profilePicture} size={isReply ? "sm" : ""} />
                <div className="comment-main">
                    <div className="comment-meta">
                        {c.deleted ? (
                            <span className="muted">Deleted comment</span>
                        ) : (
                            <Link to={`/u/${encodeURIComponent(c.author.username)}`} className="comment-author">
                                {c.author.username}
                            </Link>
                        )}
                        <span className="muted">{timeAgo(c.createdAt)}</span>
                        {c.editedAt && !c.deleted && <span className="muted">(edited)</span>}
                    </div>

                    {isEditing ? (
                        <Composer initial={c.body} submitLabel="Save" onSubmit={(body) => save(c._id, body)} onCancel={() => setEditing(null)} autoFocus />
                    ) : (
                        !c.deleted && <p className="comment-body">{c.body}</p>
                    )}

                    {!c.deleted && !isEditing && (
                        <div className="comment-actions">
                            <button
                                className={`vote-btn ${c.voted ? "on" : ""}`}
                                onClick={() => vote(c._id)}
                                disabled={c.mine}
                                aria-pressed={c.voted}
                                title={c.mine ? "You can't upvote your own comment" : "Upvote"}
                            >
                                <Icon name="up" size={14} /> <span className="num">{c.score}</span>
                            </button>
                            {isLoggedIn && !isReply && (
                                <button className="link-btn" onClick={() => setReplyTo(replyTo === c._id ? null : c._id)}>
                                    <Icon name="reply" size={14} /> Reply
                                </button>
                            )}
                            {c.mine && (
                                <button className="link-btn" onClick={() => setEditing(c._id)}>
                                    <Icon name="edit" size={14} /> Edit
                                </button>
                            )}
                            {(c.mine || me?.isAdmin) && (
                                <button className="link-btn danger" onClick={() => remove(c._id)}>
                                    <Icon name="trash" size={14} /> Delete
                                </button>
                            )}
                        </div>
                    )}

                    {!isReply && (
                        <>
                            {c.replies?.length > 0 && <div className="replies">{c.replies.map((r) => renderComment(r, true))}</div>}
                            {replyTo === c._id && (
                                <div className="reply-box">
                                    <Composer
                                        placeholder={`Reply to ${c.author?.username || "this comment"}`}
                                        submitLabel="Reply"
                                        onSubmit={(body) => post(body, c._id)}
                                        onCancel={() => setReplyTo(null)}
                                        autoFocus
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="comments">
            {isLoggedIn ? (
                <Composer placeholder="Share an approach, ask a question or suggest an improvement" submitLabel="Comment" onSubmit={(body) => post(body)} />
            ) : (
                <div className="notice info">
                    <Link to="/login">Log in</Link> to join the discussion.
                </div>
            )}

            <div className="comments-head">
                <strong>{threads ? `${threads.length} ${threads.length === 1 ? "thread" : "threads"}` : "Comments"}</strong>
                <Segmented
                    options={[
                        { value: "top", label: "Top" },
                        { value: "new", label: "Newest" },
                    ]}
                    value={sort}
                    onChange={setSort}
                    label="Sort comments"
                />
            </div>

            {!threads && [1, 2].map((n) => <div key={n} className="skeleton" style={{ height: 70 }} />)}
            {threads?.length === 0 && (
                <div className="empty">
                    <strong>No comments yet</strong>
                    Start the discussion: share a hint, an edge case or a cleaner approach.
                </div>
            )}
            {threads?.map((c) => renderComment(c))}
        </div>
    );
}

function Composer({ initial = "", placeholder, submitLabel, onSubmit, onCancel, autoFocus }) {
    const [body, setBody] = useState(initial);
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        const ok = await onSubmit(body.trim());
        setBusy(false);
        if (ok && !initial) setBody("");
    };

    return (
        <form className="composer" onSubmit={submit}>
            <textarea
                className="input"
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX))}
                placeholder={placeholder}
                autoFocus={autoFocus}
                rows={3}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(e);
                }}
            />
            <div className="composer-foot">
                <span className="muted num">
                    {body.length}/{MAX}
                </span>
                {onCancel && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>
                        Cancel
                    </button>
                )}
                <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
                    {busy && <span className="spinner" />}
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
