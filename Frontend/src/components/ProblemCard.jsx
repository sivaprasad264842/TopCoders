import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { deleteProblem, getErrorMessage } from "../api";
import ProblemFormModal from "./ProblemFormModal";

function ProblemCard({ problem, refresh, isLoggedIn, onLoginRequired }) {
    const navigate = useNavigate();
    const [editOpen, setEditOpen] = useState(false);

    const userId = localStorage.getItem("userId");
    const ownerId = problem.createdBy?._id?.toString() || problem.createdBy?.toString();
    const isOwner = Boolean(userId) && ownerId === userId;
    const difficulty = problem.difficulty || "Easy";
    const caseCount = problem.testCaseCount ?? problem.testCases?.length ?? 0;
    const openProblem = () => navigate(`/problem/${problem.problemId}`);

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!isLoggedIn) return onLoginRequired();
        if (!window.confirm("Delete this problem?")) return;

        try {
            await deleteProblem(problem.problemId);
            refresh();
        } catch (err) {
            window.alert(getErrorMessage(err, "Could not delete the problem."));
        }
    };

    const handleEdit = (e) => {
        e.stopPropagation();
        if (!isLoggedIn) return onLoginRequired();
        setEditOpen(true);
    };

    return (
        <>
            <article className="problem-card">
                <button className="card-main" onClick={openProblem}>
                    <span className="problem-index">{String(problem.index).padStart(2, "0")}</span>
                    <span>
                        <strong>{problem.title}</strong>
                        <small>{caseCount} test cases</small>
                    </span>
                </button>

                <div className="card-meta">
                    <span className={`difficulty-pill ${difficulty.toLowerCase()}`}>{difficulty}</span>
                    <button className="code-button" onClick={openProblem}>
                        Code Editor
                    </button>
                    {isOwner && (
                        <>
                            <button className="icon-btn" onClick={handleEdit}>
                                Edit
                            </button>
                            <button className="icon-btn danger" onClick={handleDelete}>
                                Delete
                            </button>
                        </>
                    )}
                </div>
            </article>

            {editOpen && isOwner && (
                <ProblemFormModal problemId={problem.problemId} close={() => setEditOpen(false)} refresh={refresh} />
            )}
        </>
    );
}

export default ProblemCard;
