import { useState } from "react";
import { Link } from "react-router-dom";
import { deleteProblem, getErrorMessage } from "../api";
import { Difficulty, Stars } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import ProblemFormModal from "./ProblemFormModal";

const STATUS_LABEL = { solved: "Solved", tried: "Attempted", none: "Not started" };

/** One row of the problem table. The title links to the workspace. */
export default function ProblemRow({ problem, status, canEdit, refresh, onTagClick }) {
    const { toast, confirm } = useFeedback();
    const [editOpen, setEditOpen] = useState(false);
    const tags = problem.tags || [];

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Delete "${problem.title}"?`,
            body: "The problem, its test cases and its comments are removed for everyone.",
            confirmText: "Delete problem",
            danger: true,
        });
        if (!ok) return;
        try {
            await deleteProblem(problem.problemId);
            toast("Problem deleted");
            refresh();
        } catch (err) {
            toast(getErrorMessage(err, "Could not delete the problem."), "error");
        }
    };

    return (
        <>
            <tr className={`prow status-${status}`}>
                <td className="col-status">
                    <span className="status-icon" title={STATUS_LABEL[status]}>
                        {status === "solved" && <Icon name="check" size={15} />}
                        {status === "tried" && <span className="tried-dot" />}
                        <span className="visually-hidden">{STATUS_LABEL[status]}</span>
                    </span>
                </td>
                <td className="col-title">
                    <Link to={`/problem/${problem.problemId}`} className="ptitle">
                        <span className="pnum num">{problem.number}.</span> {problem.title}
                    </Link>
                    {problem.hasEditorial && (
                        <span className="ed-mark" title="Has an editorial">
                            <Icon name="book" size={13} />
                        </span>
                    )}
                </td>
                <td className="col-tags">
                    <div className="row-tags">
                        {tags.slice(0, 2).map((t) => (
                            <button key={t} type="button" className="topic" onClick={() => onTagClick?.(t)}>
                                {t}
                            </button>
                        ))}
                        {tags.length > 2 && <span className="topic more">+{tags.length - 2}</span>}
                    </div>
                </td>
                <td className="col-acc num">{problem.acceptance == null ? "–" : `${problem.acceptance}%`}</td>
                <td className="col-diff">
                    <Difficulty level={problem.difficulty || "Easy"} />
                </td>
                <td className="col-stars">
                    <Stars count={problem.stars || 1} />
                </td>
                <td className="col-actions">
                    {canEdit && (
                        <span className="row-actions">
                            <button className="icon-btn" onClick={() => setEditOpen(true)} aria-label={`Edit ${problem.title}`} title="Edit">
                                <Icon name="edit" size={16} />
                            </button>
                            <button className="icon-btn danger" onClick={handleDelete} aria-label={`Delete ${problem.title}`} title="Delete">
                                <Icon name="trash" size={16} />
                            </button>
                        </span>
                    )}
                </td>
            </tr>

            {editOpen && (
                <ProblemFormModal problemId={problem.problemId} close={() => setEditOpen(false)} refresh={refresh} />
            )}
        </>
    );
}
