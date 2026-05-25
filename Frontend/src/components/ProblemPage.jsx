import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
    analyzeCode,
    getAnalysisStatus,
    getMyProblemSubmissions,
    getMySubmissions,
    getProblemLeaderboard,
    getProblemById,
    getProblems,
    deleteProblem,
    runCode,
    submitCode,
} from "../api";
import EditProblemModal from "./EditProblemModal";
import "../CSS/Problem.css";

function ProblemPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [problem, setProblem] = useState(null);
    const [editOpen, setEditOpen] = useState(false);
    const [loginPrompt, setLoginPrompt] = useState("");
    const [revealedHints, setRevealedHints] = useState([]);
    const [activeTab, setActiveTab] = useState("statement");
    const [submissionsOpen, setSubmissionsOpen] = useState(false);
    const [problemSubmissions, setProblemSubmissions] = useState([]);
    const [problemLeaderboard, setProblemLeaderboard] = useState([]);
    const [allSubmissions, setAllSubmissions] = useState([]);
    const [allProblems, setAllProblems] = useState([]);
    const [analysis, setAnalysis] = useState("");
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState({
        enabled: false,
        provider: "disabled",
        message: "Checking AI analysis...",
    });
    const [leftPanePercent, setLeftPanePercent] = useState(48);
    const shellRef = useRef(null);

    const userId = localStorage.getItem("userId");
    const token = localStorage.getItem("token");

    const defaultCode = {
        javascript:
            "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n\nconsole.log(input);",
        python: "import sys\n\ndata = sys.stdin.read().strip()\nprint(data)",
        cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}",
        java: "import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n\n    }\n}",
    };

    const [language, setLanguage] = useState("javascript");
    const [code, setCode] = useState(defaultCode.javascript);
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [verdict, setVerdict] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchProblem = useCallback(async () => {
        try {
            const res = await getProblemById(id);
            setProblem(res.data);
            setInput((current) => current || res.data.testCases?.[0]?.input || "");
        } catch (err) {
            console.error(err);
        }
    }, [id]);

    useEffect(() => {
        fetchProblem();
    }, [fetchProblem]);

    const fetchSubmissionData = useCallback(async () => {
        try {
            const [leaderboard, problemList] = await Promise.all([
                getProblemLeaderboard(id),
                getProblems(),
            ]);
            setProblemLeaderboard(leaderboard.data);
            setAllProblems(problemList.data);

            if (!token) return;

            const [problemHistory, allHistory] = await Promise.all([
                getMyProblemSubmissions(id),
                getMySubmissions(),
            ]);
            setProblemSubmissions(problemHistory.data);
            setAllSubmissions(allHistory.data);
        } catch (err) {
            console.error(err);
        }
    }, [id, token]);

    useEffect(() => {
        fetchSubmissionData();
    }, [fetchSubmissionData]);

    useEffect(() => {
        getAnalysisStatus()
            .then((res) => setAnalysisStatus(res.data))
            .catch(() =>
                setAnalysisStatus({
                    enabled: false,
                    provider: "disabled",
                    message: "AI analysis is unavailable.",
                }),
            );
    }, []);

    if (!problem) return <div className="page-loading">Loading problem...</div>;

    const ownerId =
        problem.createdBy?._id?.toString() || problem.createdBy?.toString();
    const isOwner = ownerId === userId;
    const difficulty = problem.difficulty || "Easy";

    const askLogin = (reason) => {
        setLoginPrompt(reason);
    };

    const handleDelete = async () => {
        if (!token) {
            askLogin("Please login before deleting a problem.");
            return;
        }

        if (!window.confirm("Are you sure you want to delete this problem?")) {
            return;
        }

        try {
            await deleteProblem(id);
            navigate("/");
        } catch (err) {
            console.error("Error:", err);
        }
    };

    const handleRun = async () => {
        if (!token) {
            askLogin("Please login to run code on the judge.");
            return;
        }

        setLoading(true);
        setOutput("");
        setVerdict(null);

        try {
            const res = await runCode({ code, language, input });
            const { stdout, stderr, status } = res.data;
            if (status === "compilation_error") {
                setOutput("[Compilation Error]\n" + (stderr || stdout || "Unknown error"));
            } else if (status === "timeout") {
                setOutput("[Time Limit Exceeded]\n" + (stdout || ""));
            } else if (status === "runtime_error") {
                const body = [stdout, stderr].filter(Boolean).join("\n");
                setOutput("[Runtime Error]\n" + (body || "Unknown runtime error"));
            } else {
                setOutput(stdout || stderr || "No output");
            }
        } catch (err) {
            console.error(err);
            const message =
                err.response?.data?.error ||
                err.response?.data?.message ||
                err.message ||
                "Error running code";
            setOutput(message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!token) {
            askLogin("Please login before submitting your solution.");
            return;
        }

        setLoading(true);
        setVerdict(null);

        try {
            const res = await submitCode({
                problemId: problem.problemId,
                code,
                language,
            });

            setVerdict(res.data);
            fetchSubmissionData();
        } catch (err) {
            console.error(err);
            setVerdict({ verdict: "Submission failed" });
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!analysisStatus.enabled) {
            setAnalysis(analysisStatus.message);
            return;
        }

        if (!token) {
            askLogin("Please login before using AI code analysis.");
            return;
        }

        setAnalysis("");
        setAnalysisLoading(true);

        try {
            const res = await analyzeCode({
                code,
                language,
                problemTitle: problem.title,
                statement: problem.statement,
                verdict: verdict?.verdict,
            });
            setAnalysis(res.data.analysis);
        } catch (err) {
            const message =
                err.response?.data?.error ||
                err.message ||
                "Failed to analyze code.";
            setAnalysis(message);
        } finally {
            setAnalysisLoading(false);
        }
    };

    const toggleHint = (index) => {
        setRevealedHints((current) =>
            current.includes(index)
                ? current.filter((item) => item !== index)
                : [...current, index],
        );
    };

    const submittedProblemIds = new Set(allSubmissions.map((item) => item.problemId));
    const solvedProblemIds = new Set(
        allSubmissions
            .filter((item) => item.verdict === "Accepted")
            .map((item) => item.problemId),
    );
    const submittedProblems = allProblems.filter((item) =>
        submittedProblemIds.has(item.problemId),
    );
    const solvedProblems = allProblems.filter((item) =>
        solvedProblemIds.has(item.problemId),
    );
    const unsolvedProblems = allProblems.filter(
        (item) => !solvedProblemIds.has(item.problemId),
    );
    const latestVerdict = verdict || null;
    const passedAll =
        latestVerdict?.verdict === "Accepted" &&
        latestVerdict?.passedTestCases === latestVerdict?.totalTestCases;
    const myLeaderboardRow = problemLeaderboard.find(
        (item) => item.userId === userId,
    );
    const submissionSummary = (
        <div className="submission-summary-grid">
            <div>
                <span>Total</span>
                <strong>{problemSubmissions.length}</strong>
            </div>
            <div>
                <span>Accepted</span>
                <strong>
                    {
                        problemSubmissions.filter(
                            (item) => item.verdict === "Accepted",
                        ).length
                    }
                </strong>
            </div>
            <div>
                <span>Languages</span>
                <strong>
                    {new Set(problemSubmissions.map((item) => item.language)).size}
                </strong>
            </div>
        </div>
    );
    const renderSubmissionHistory = (compact = false) => (
        <div className={compact ? "submission-history compact" : "submission-history"}>
            {!token && (
                <div className="empty-state">Login to view your submission code.</div>
            )}
            {token && problemSubmissions.length === 0 && (
                <div className="empty-state">
                    No submissions for this problem yet.
                </div>
            )}
            {problemSubmissions.map((item, index) => (
                <details className="submission-card" key={item._id}>
                    <summary>
                        <span className="submission-left">
                            <span className="submission-index">
                                #{problemSubmissions.length - index}
                            </span>
                            <span
                                className={`submission-verdict ${
                                    item.verdict === "Accepted"
                                        ? "accepted"
                                        : "failed"
                                }`}
                            >
                                {item.verdict}
                            </span>
                        </span>
                        <small>
                            {item.language} |{" "}
                            {new Date(item.createdAt).toLocaleString()}
                        </small>
                    </summary>
                    <div className="submission-details">
                        <span>
                            Passed {item.passedTestCases || 0}/
                            {item.totalTestCases || 0}
                        </span>
                        <span>{item.executionTime || 0} ms</span>
                    </div>
                    <pre>{item.code}</pre>
                </details>
            ))}
        </div>
    );
    const startResize = (event) => {
        event.preventDefault();
        const shell = shellRef.current;
        if (!shell) return;

        const onPointerMove = (moveEvent) => {
            const rect = shell.getBoundingClientRect();
            const nextPercent =
                ((moveEvent.clientX - rect.left) / rect.width) * 100;
            setLeftPanePercent(Math.min(68, Math.max(32, nextPercent)));
        };

        const onPointerUp = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
    };

    return (
        <div className="problem-page">
            <div
                className="problem-shell"
                ref={shellRef}
                style={{ "--left-pane": `${leftPanePercent}%` }}
            >
                <section className="statement-panel">
                    <div className="problem-topbar">
                        <button className="back-link" onClick={() => navigate("/")}>
                            Problems
                        </button>
                        <div className="problem-tabs" role="tablist">
                            <button
                                className={
                                    activeTab === "statement" ? "active" : ""
                                }
                                onClick={() => setActiveTab("statement")}
                                type="button"
                            >
                                Description
                            </button>
                            <button
                                className={
                                    activeTab === "leaderboard" ? "active" : ""
                                }
                                onClick={() => setActiveTab("leaderboard")}
                                type="button"
                            >
                                Leaderboard
                            </button>
                        </div>
                        <button
                            className="submission-window-btn"
                            onClick={() => setSubmissionsOpen(true)}
                            type="button"
                        >
                            Submissions
                            <span>{problemSubmissions.length}</span>
                        </button>
                    </div>

                    {activeTab === "statement" && (
                        <>
                            <div className="statement-head">
                                <div>
                                    <h1>{problem.title}</h1>
                                </div>
                                <span
                                    className={`difficulty-pill ${difficulty.toLowerCase()}`}
                                >
                                    {difficulty}
                                </span>
                            </div>

                            <article className="problemStatement">
                                {problem.statement}
                            </article>

                            <div className="sample-section">
                                <h2>Test Cases</h2>
                                {(problem.testCases || []).map((tc, index) => (
                                    <div className="sample-card" key={index}>
                                        <div className="case-title">
                                            <strong>Case {index + 1}</strong>
                                            <button
                                                onClick={() => setInput(tc.input)}
                                                type="button"
                                            >
                                                Use Input
                                            </button>
                                        </div>
                                        <div className="sample-grid">
                                            <div>
                                                <span>Input</span>
                                                <pre>{tc.input}</pre>
                                            </div>
                                            <div>
                                                <span>Expected Output</span>
                                                <pre>{tc.output}</pre>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {(problem.hints || []).length > 0 && (
                                <div className="hint-section">
                                    <h2>Hints</h2>
                                    <div className="hint-buttons">
                                        {problem.hints.map((hint, index) => (
                                            <button
                                                type="button"
                                                key={index}
                                                onClick={() => toggleHint(index)}
                                            >
                                                {hint.title || `Hint ${index + 1}`}
                                            </button>
                                        ))}
                                    </div>
                                    {problem.hints.map(
                                        (hint, index) =>
                                            revealedHints.includes(index) && (
                                                <div
                                                    className="hint-card"
                                                    key={index}
                                                >
                                                    <strong>
                                                        {hint.title ||
                                                            `Hint ${index + 1}`}
                                                    </strong>
                                                    <p>{hint.body}</p>
                                                </div>
                                            ),
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === "leaderboard" && (
                        <div className="tab-panel">
                            <div className="tab-panel-head">
                                <div>
                                    <p className="eyebrow">Problem ranking</p>
                                    <h2>Leaderboard</h2>
                                </div>
                                {myLeaderboardRow && (
                                    <span className="your-rank">
                                        You: #{myLeaderboardRow.rank}
                                    </span>
                                )}
                            </div>
                            <div className="leaderboard-list problem-leaderboard">
                                {problemLeaderboard.map((user) => {
                                    const isCurrent = user.userId === userId;
                                    return (
                                        <details
                                            className={`leaderboard-row ${
                                                isCurrent ? "current-user" : ""
                                            }`}
                                            key={user.userId}
                                        >
                                            <summary>
                                                <span className="leaderboard-rank">
                                                    #{user.rank}
                                                </span>
                                                <span className="leaderboard-avatar">
                                                    {user.profilePicture ? (
                                                        <img
                                                            src={user.profilePicture}
                                                            alt=""
                                                        />
                                                    ) : (
                                                        (
                                                            user.username ||
                                                            user.email ||
                                                            "U"
                                                        )
                                                            .charAt(0)
                                                            .toUpperCase()
                                                    )}
                                                </span>
                                                <span className="leaderboard-user">
                                                    <strong>
                                                        {user.username || user.email}
                                                    </strong>
                                                    <small>
                                                        {user.accepted > 0
                                                            ? `${user.accepted} accepted | ${user.submissions} submissions`
                                                            : `${user.submissions} submissions`}
                                                    </small>
                                                </span>
                                                <strong>
                                                    {user.bestTime
                                                        ? `${user.bestTime} ms`
                                                        : "-"}
                                                </strong>
                                            </summary>
                                            <div className="leaderboard-profile">
                                                <p>{user.bio || "No description added."}</p>
                                                <div>
                                                    <span>{user.email}</span>
                                                    {user.phone && <span>{user.phone}</span>}
                                                </div>
                                                <div className="profile-links compact-links">
                                                    {user.socialLinks?.github && (
                                                        <a
                                                            href={user.socialLinks.github}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            GitHub
                                                        </a>
                                                    )}
                                                    {user.socialLinks?.linkedin && (
                                                        <a
                                                            href={user.socialLinks.linkedin}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            LinkedIn
                                                        </a>
                                                    )}
                                                    {user.socialLinks?.website && (
                                                        <a
                                                            href={user.socialLinks.website}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Website
                                                        </a>
                                                    )}
                                                    {user.resume && (
                                                        <a
                                                            href={user.resume}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Resume
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </details>
                                    );
                                })}
                                {problemLeaderboard.length === 0 && (
                                    <div className="empty-state">
                                        No submissions on this problem yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isOwner && activeTab === "statement" && (
                        <div className="owner-actions">
                            <button
                                className="secondary-btn"
                                onClick={() => setEditOpen(true)}
                            >
                                Edit
                            </button>
                            <button className="danger-btn" onClick={handleDelete}>
                                Delete
                            </button>
                        </div>
                    )}
                </section>

                <button
                    className="pane-resizer"
                    type="button"
                    onPointerDown={startResize}
                    aria-label="Resize statement and editor panels"
                />

                <section className="editor-panel">
                    <div className="editor-controls">
                        <select
                            value={language}
                            onChange={(e) => {
                                setLanguage(e.target.value);
                                setCode(defaultCode[e.target.value]);
                            }}
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                            <option value="java">Java</option>
                        </select>

                        <button onClick={handleRun} disabled={loading}>
                            Run
                        </button>
                        <button
                            className="primary-btn"
                            onClick={handleSubmit}
                            disabled={loading}
                        >
                            Submit
                        </button>
                        <button
                            onClick={handleAnalyze}
                            disabled={analysisLoading || !analysisStatus.enabled}
                            title={analysisStatus.message}
                        >
                            AI Analyze
                        </button>
                    </div>

                    <div className="editor-frame">
                        <Editor
                            height="100%"
                            language={language}
                            value={code}
                            onChange={(value) => setCode(value || "")}
                            theme="vs-dark"
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                wordWrap: "on",
                                scrollBeyondLastLine: false,
                            }}
                        />
                    </div>

                    <label className="io-label">
                        Custom Input
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                    </label>

                    <div className="output">
                        {loading && <p>Running...</p>}

                        {output && (
                            <>
                                <h4>Output</h4>
                                <pre>{output}</pre>
                            </>
                        )}
                    </div>

                    {latestVerdict && (
                        <div
                            className={`verdict-panel ${
                                passedAll ? "accepted" : "failed"
                            }`}
                        >
                            <h4>Verdict Evaluation</h4>
                            <>
                                <div className="verdict-line">
                                    <span className="status-mark">
                                        {passedAll ? "" : ""}
                                    </span>
                                    <div>
                                        <strong>{latestVerdict.verdict}</strong>
                                        <p>
                                            {passedAll
                                                ? "All test cases passed."
                                                : `Passed ${latestVerdict.passedTestCases || 0} of ${latestVerdict.totalTestCases || 0} test cases.`}
                                        </p>
                                    </div>
                                </div>
                                {latestVerdict.failedTestCase && (
                                    <div className="failed-case">
                                        <strong>
                                            Failed test case{" "}
                                            {latestVerdict.failedTestCase.index}
                                        </strong>
                                        <span>Input</span>
                                        <pre>{latestVerdict.failedTestCase.input}</pre>
                                        <span>Expected</span>
                                        <pre>
                                            {
                                                latestVerdict.failedTestCase
                                                    .expectedOutput
                                            }
                                        </pre>
                                        <span>Your Output</span>
                                        <pre>
                                            {
                                                latestVerdict.failedTestCase
                                                    .actualOutput
                                            }
                                        </pre>
                                        {latestVerdict.failedTestCase.error && (
                                            <>
                                                <span>Error</span>
                                                <pre>
                                                    {
                                                        latestVerdict.failedTestCase
                                                            .error
                                                    }
                                                </pre>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        </div>
                    )}

                    <div className="analysis-panel">
                        <div className="analysis-head">
                            <h4>AI Code Analysis</h4>
                            <span
                                className={
                                    analysisStatus.enabled
                                        ? "ai-status enabled"
                                        : "ai-status disabled"
                                }
                            >
                                {analysisStatus.enabled ? "Enabled" : "Off"}
                            </span>
                        </div>
                        {analysisLoading && <p>Analyzing...</p>}
                        {analysis ? (
                            <pre>{analysis}</pre>
                        ) : (
                            <p>
                                {analysisStatus.enabled
                                    ? "Run analysis after writing code."
                                    : analysisStatus.message}
                            </p>
                        )}
                    </div>

                </section>
            </div>

            {loginPrompt && (
                <div className="modal">
                    <div className="modal-content login-prompt">
                        <h2>Login required</h2>
                        <p>{loginPrompt}</p>
                        <div className="modal-actions">
                            <button
                                className="secondary-btn"
                                onClick={() => setLoginPrompt("")}
                            >
                                Cancel
                            </button>
                            <button
                                className="primary-btn"
                                onClick={() => navigate("/login")}
                            >
                                Login
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {submissionsOpen && (
                <div
                    className="modal submission-modal"
                    onClick={() => setSubmissionsOpen(false)}
                >
                    <div
                        className="modal-content submission-window"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-head">
                            <div>
                                <p className="eyebrow">Submission history</p>
                                <h2>Your Submissions</h2>
                            </div>
                            <button
                                className="secondary-btn compact-btn"
                                onClick={() => setSubmissionsOpen(false)}
                                type="button"
                            >
                                Close
                            </button>
                        </div>
                        {submissionSummary}
                        {renderSubmissionHistory()}
                        <div className="problem-progress-lists">
                            <div>
                                <strong>Submitted</strong>
                                <span>{submittedProblems.length}</span>
                                <ul>
                                    {submittedProblems.slice(0, 4).map((item) => (
                                        <li key={item.problemId}>{item.title}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <strong>Solved</strong>
                                <span>{solvedProblems.length}</span>
                                <ul>
                                    {solvedProblems.slice(0, 4).map((item) => (
                                        <li key={item.problemId}>{item.title}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <strong>Unsolved</strong>
                                <span>{unsolvedProblems.length}</span>
                                <ul>
                                    {unsolvedProblems.slice(0, 4).map((item) => (
                                        <li key={item.problemId}>{item.title}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {editOpen && isOwner && (
                <EditProblemModal
                    problem={problem}
                    close={() => setEditOpen(false)}
                    refresh={fetchProblem}
                />
            )}
        </div>
    );
}

export default ProblemPage;
