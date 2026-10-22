import { Link, useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
    analyzeCode,
    getAnalysisStatus,
    getMyProblemSubmissions,
    getProblemLeaderboard,
    getProblemById,
    deleteProblem,
    getErrorMessage,
    runCode,
    submitCode,
} from "../api";
import Comments from "../components/Comments";
import LeaderRow from "../components/LeaderRow";
import ProblemFormModal from "../components/ProblemFormModal";
import ThemeToggle from "../components/ThemeToggle";
import UserMenu from "../components/UserMenu";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { useRunnerSession } from "../hooks/useRunnerSession";
import { useTheme } from "../hooks/useTheme";
import { Difficulty, Stars, timeAgo } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import { LogoMark } from "../ui/Logo";
import Segmented from "../ui/Segmented";
import "../styles/layout.css";
import "../styles/workspace.css";

const RUNNER_LABELS = { idle: "Sandbox idle", starting: "Starting sandbox", ready: "Sandbox ready", error: "Sandbox unavailable" };

const LANGUAGES = [
    { value: "javascript", label: "JavaScript" },
    { value: "python", label: "Python" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
];

const STARTER = {
    javascript: "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n\nconsole.log(input);",
    python: "import sys\n\ndata = sys.stdin.read().strip()\nprint(data)",
    cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}",
    java: "import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n\n    }\n}",
};

const CONSOLE_TABS = [
    { value: "input", label: "Testcase" },
    { value: "result", label: "Result" },
    { value: "ai", label: "AI review" },
];

// Drafts live in this browser, per problem and language.
const draftKey = (id, lang) => `topcoders-draft:${id}:${lang}`;
const loadDraft = (id, lang) => {
    try {
        return localStorage.getItem(draftKey(id, lang));
    } catch {
        return null;
    }
};
const saveDraft = (id, lang, code) => {
    try {
        if (code === STARTER[lang]) localStorage.removeItem(draftKey(id, lang));
        else localStorage.setItem(draftKey(id, lang), code);
    } catch {
        /* drafts are a convenience only */
    }
};

const defineEditorThemes = (monaco) => {
    monaco.editor.defineTheme("tc-light", {
        base: "vs",
        inherit: true,
        rules: [
            { token: "comment", foreground: "8a93a5", fontStyle: "italic" },
            { token: "keyword", foreground: "4f5bd5" },
            { token: "string", foreground: "18946a" },
            { token: "number", foreground: "c98208" },
        ],
        colors: {
            "editor.background": "#ffffff",
            "editor.lineHighlightBackground": "#f5f6fb",
            "editorLineNumber.foreground": "#b3bac7",
            "editorLineNumber.activeForeground": "#4a5468",
            "editorCursor.foreground": "#4f5bd5",
            "editor.selectionBackground": "#dfe3fb",
        },
    });
    monaco.editor.defineTheme("tc-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "7d8697", fontStyle: "italic" },
            { token: "keyword", foreground: "929cf5" },
            { token: "string", foreground: "6fd3a8" },
            { token: "number", foreground: "f5b04a" },
        ],
        colors: {
            "editor.background": "#1a1e27",
            "editor.lineHighlightBackground": "#20242f",
            "editorLineNumber.foreground": "#4a5263",
            "editorCursor.foreground": "#7b86f0",
        },
    });
};

const TABS = [
    { value: "description", label: "Description", icon: "list" },
    { value: "editorial", label: "Editorial", icon: "book" },
    { value: "comments", label: "Comments", icon: "message" },
    { value: "submissions", label: "Submissions", icon: "clock" },
    { value: "leaderboard", label: "Leaderboard", icon: "trophy" },
];

export default function ProblemPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { userId, isLoggedIn } = useAuth();
    const { me, refreshMe } = useMe();
    const { theme } = useTheme();
    const { toast, confirm } = useFeedback();
    const runner = useRunnerSession(isLoggedIn);

    const [problem, setProblem] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [openHints, setOpenHints] = useState([]);
    const [tab, setTab] = useState("description");
    const [commentCount, setCommentCount] = useState(null);
    const [revealEditorial, setRevealEditorial] = useState(false);
    const [consoleTab, setConsoleTab] = useState("input");
    const [history, setHistory] = useState([]);
    const [leaderboard, setLeaderboard] = useState(null);
    const [analysis, setAnalysis] = useState("");
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState({ enabled: false, message: "Checking AI review..." });
    const [leftPanePercent, setLeftPanePercent] = useState(45);
    const shellRef = useRef(null);

    const [language, setLanguage] = useState("javascript");
    const [code, setCode] = useState(() => loadDraft(id, "javascript") ?? STARTER.javascript);
    const [input, setInput] = useState("");
    const [run, setRun] = useState(null);
    const [verdict, setVerdict] = useState(null);
    const [busy, setBusy] = useState("");

    const fetchProblem = useCallback(async () => {
        try {
            const res = await getProblemById(id);
            setProblem(res.data);
            setLoadError("");
            setInput((current) => current || res.data.testCases?.[0]?.input || "");
        } catch (err) {
            setLoadError(
                err.response?.status === 404
                    ? "This problem doesn't exist, was deleted, or belongs to a hackathon you haven't joined."
                    : getErrorMessage(err, "Could not load this problem."),
            );
        }
    }, [id]);

    const fetchHistory = useCallback(async () => {
        try {
            const board = await getProblemLeaderboard(id);
            setLeaderboard(board.data);
            if (isLoggedIn) setHistory((await getMyProblemSubmissions(id)).data);
        } catch {
            setLeaderboard((b) => b || []);
        }
    }, [id, isLoggedIn]);

    useEffect(() => {
        fetchProblem();
    }, [fetchProblem]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        getAnalysisStatus()
            .then((res) => setAnalysisStatus(res.data))
            .catch(() => setAnalysisStatus({ enabled: false, message: "AI review is unavailable." }));
    }, []);

    useEffect(() => {
        const t = setTimeout(() => saveDraft(id, language, code), 400);
        return () => clearTimeout(t);
    }, [id, language, code]);

    const onCommentCount = useCallback((n) => setCommentCount(n), []);

    const askLogin = useCallback(
        async (title) => {
            const ok = await confirm({
                title,
                body: "Running and judging code needs an account, so each person gets a private sandbox.",
                confirmText: "Log in",
                cancelText: "Not now",
            });
            if (ok) navigate(`/login?redirect=/problem/${id}`);
        },
        [confirm, navigate, id],
    );

    const handleRun = useCallback(async () => {
        if (!isLoggedIn) return askLogin("Log in to run code");
        if (busy) return;
        setBusy("run");
        setRun(null);
        setVerdict(null);
        setConsoleTab("result");
        try {
            const { data } = await runCode({ code, language, input });
            const { stdout, stderr, status } = data;
            const text =
                status === "compilation_error"
                    ? stderr || stdout || "Unknown error"
                    : status === "runtime_error"
                      ? [stdout, stderr].filter(Boolean).join("\n") || "Unknown runtime error"
                      : stdout || stderr || "(no output)";
            setRun({ status, text });
        } catch (err) {
            setRun({ status: "error", text: getErrorMessage(err, "Error running code") });
        } finally {
            setBusy("");
        }
    }, [isLoggedIn, askLogin, busy, code, language, input]);

    const handleSubmit = useCallback(async () => {
        if (!isLoggedIn) return askLogin("Log in to submit");
        if (busy || !problem) return;
        setBusy("submit");
        setVerdict(null);
        setRun(null);
        setConsoleTab("result");
        try {
            const { data } = await submitCode({ problemId: problem.problemId, code, language });
            setVerdict(data);
            if (data.verdict === "Accepted") {
                toast(data.starsEarned ? `Accepted. You earned ${data.starsEarned} ${data.starsEarned === 1 ? "star" : "stars"}!` : "Accepted. Nice work.");
                if (data.starsEarned) refreshMe();
            }
            fetchHistory();
        } catch (err) {
            setRun({ status: "error", text: getErrorMessage(err, "Submission failed. Please try again.") });
        } finally {
            setBusy("");
        }
    }, [isLoggedIn, askLogin, busy, problem, code, language, toast, fetchHistory, refreshMe]);

    const runRef = useRef(handleRun);
    const submitRef = useRef(handleSubmit);
    useEffect(() => {
        runRef.current = handleRun;
        submitRef.current = handleSubmit;
    }, [handleRun, handleSubmit]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && document.activeElement?.tagName !== "TEXTAREA") {
                e.preventDefault();
                (e.shiftKey ? submitRef : runRef).current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const onEditorMount = (editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => submitRef.current());
    };

    if (!problem) {
        return (
            <div className="page-center full">
                {loadError ? (
                    <div className="empty">
                        <strong>{loadError}</strong>
                        <Link to="/" className="btn btn-primary">
                            Back to problems
                        </Link>
                    </div>
                ) : (
                    <div className="loading-line">
                        <span className="spinner" /> Loading problem
                    </div>
                )}
            </div>
        );
    }

    const difficulty = problem.difficulty || "Easy";
    const accepted = verdict?.verdict === "Accepted";
    const solved = history.some((s) => s.verdict === "Accepted") || (me?.solvedProblems || []).includes(problem.problemId);
    const myRow = leaderboard?.find((row) => row.userId === userId);
    const acceptedRuns = history.filter((s) => s.verdict === "Accepted");
    const bestTime = acceptedRuns.length ? Math.min(...acceptedRuns.map((s) => s.executionTime || 0)) : null;
    const hiddenNow = problem.hiddenUntil && new Date(problem.hiddenUntil) > new Date();

    const switchLanguage = (next) => {
        saveDraft(id, language, code);
        setLanguage(next);
        setCode(loadDraft(id, next) ?? STARTER[next]);
    };

    const resetCode = async () => {
        const ok = await confirm({
            title: "Reset to the starter code?",
            body: `Your ${LANGUAGES.find((l) => l.value === language).label} draft for this problem is replaced.`,
            confirmText: "Reset code",
            danger: true,
        });
        if (ok) setCode(STARTER[language]);
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Delete "${problem.title}"?`,
            body: "The problem, its test cases and its comments are removed for everyone.",
            confirmText: "Delete problem",
            danger: true,
        });
        if (!ok) return;
        try {
            await deleteProblem(id);
            toast("Problem deleted");
            navigate("/");
        } catch (err) {
            toast(getErrorMessage(err, "Could not delete the problem."), "error");
        }
    };

    const handleAnalyze = async () => {
        if (!analysisStatus.enabled) return;
        if (!isLoggedIn) return askLogin("Log in to use AI review");
        setConsoleTab("ai");
        setAnalysis("");
        setAnalysisLoading(true);
        try {
            const { data } = await analyzeCode({ code, language, problemTitle: problem.title, statement: problem.statement, verdict: verdict?.verdict });
            setAnalysis(data.analysis);
        } catch (err) {
            setAnalysis(getErrorMessage(err, "Failed to analyze code."));
        } finally {
            setAnalysisLoading(false);
        }
    };

    const startResize = (event) => {
        event.preventDefault();
        const shell = shellRef.current;
        if (!shell) return;
        const onMove = (e) => {
            const rect = shell.getBoundingClientRect();
            setLeftPanePercent(Math.min(70, Math.max(28, ((e.clientX - rect.left) / rect.width) * 100)));
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const onResizerKey = (e) => {
        if (e.key === "ArrowLeft") setLeftPanePercent((p) => Math.max(28, p - 2));
        if (e.key === "ArrowRight") setLeftPanePercent((p) => Math.min(70, p + 2));
    };

    return (
        <div className="workspace">
            <header className="ws-bar">
                <Link to="/" className="ws-logo" aria-label="TopCoders home">
                    <LogoMark size={28} />
                </Link>
                <Link to="/" className="btn btn-quiet btn-sm">
                    <Icon name="list" size={16} /> Problem list
                </Link>
                <span className="ws-sep" />
                <div className="ws-run">
                    <button className="btn btn-ghost btn-sm" onClick={handleRun} disabled={Boolean(busy)} title="Run (Ctrl+Enter)">
                        {busy === "run" ? <span className="spinner" /> : <Icon name="play" size={14} />}
                        Run
                    </button>
                    <button
                        className={`btn btn-success btn-sm submit-btn ${busy === "submit" ? "judging" : ""}`}
                        onClick={handleSubmit}
                        disabled={Boolean(busy)}
                        title="Submit (Ctrl+Shift+Enter)"
                    >
                        {busy === "submit" ? (
                            <>
                                <span className="spinner" /> Judging
                            </>
                        ) : (
                            <>
                                <Icon name="send" size={14} /> Submit
                            </>
                        )}
                    </button>
                </div>
                <div className="ws-actions">
                    {isLoggedIn && (
                        <span className={`runner-pill ${runner.status}`} title={runner.message || "Your code runs in a private sandbox that starts when you open a problem and stops when you leave."}>
                            <span className="runner-dot" />
                            {RUNNER_LABELS[runner.status]}
                        </span>
                    )}
                    <ThemeToggle />
                    {isLoggedIn ? (
                        <UserMenu />
                    ) : (
                        <Link to={`/login?redirect=/problem/${id}`} className="btn btn-primary btn-sm">
                            Log in
                        </Link>
                    )}
                </div>
            </header>

            <div className="ws-shell" ref={shellRef} style={{ "--left-pane": `${leftPanePercent}%` }}>
                <section className="ws-panel ws-left">
                    <div className="tabs" role="tablist">
                        {TABS.map((t) => (
                            <button key={t.value} role="tab" className="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}>
                                <Icon name={t.icon} size={15} />
                                {t.label}
                                {t.value === "comments" && commentCount != null && <span className="count num">{commentCount}</span>}
                                {t.value === "submissions" && history.length > 0 && <span className="count num">{history.length}</span>}
                            </button>
                        ))}
                    </div>

                    <div className="pane-scroll">
                        {tab === "description" && (
                            <article className="statement">
                                <div className="statement-title">
                                    <h1>{problem.title}</h1>
                                    {solved && (
                                        <span className="tag ok">
                                            <Icon name="check" size={12} /> Solved
                                        </span>
                                    )}
                                </div>
                                <div className="statement-meta">
                                    <Difficulty level={difficulty} as="tag" />
                                    <span className="tag star">
                                        <Stars count={problem.stars} size={12} /> {problem.stars} {problem.stars === 1 ? "star" : "stars"}
                                    </span>
                                    {(problem.tags || []).map((t) => (
                                        <span key={t} className="topic">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                                {hiddenNow && (
                                    <div className="notice info">
                                        This is a live hackathon problem. It becomes public when the hackathon ends.
                                    </div>
                                )}
                                <div className="statement-text">{problem.statement}</div>

                                {(problem.testCases || []).map((tc, index) => (
                                    <div className={`example ${tc.hidden ? "is-hidden" : ""}`} key={index}>
                                        <div className="example-head">
                                            <strong>Example {index + 1}</strong>
                                            {tc.hidden && <span className="tag">Hidden, only editors see it</span>}
                                            <button
                                                className="btn btn-quiet btn-sm"
                                                onClick={() => {
                                                    setInput(tc.input);
                                                    setConsoleTab("input");
                                                    toast(`Example ${index + 1} loaded as test input`, "info");
                                                }}
                                            >
                                                Use as input
                                            </button>
                                        </div>
                                        <div className="example-io">
                                            <div>
                                                <span>Input</span>
                                                <pre>{tc.input || " "}</pre>
                                            </div>
                                            <div>
                                                <span>Output</span>
                                                <pre>{tc.output}</pre>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {!problem.canEdit && problem.hiddenTestCount > 0 && (
                                    <p className="hidden-note">
                                        Plus {problem.hiddenTestCount} hidden test {problem.hiddenTestCount === 1 ? "case" : "cases"} used when you
                                        submit.
                                    </p>
                                )}

                                {(problem.hints || []).length > 0 && (
                                    <div className="hints">
                                        {problem.hints.map((hint, index) => {
                                            const open = openHints.includes(index);
                                            return (
                                                <div className={`hint ${open ? "open" : ""}`} key={index}>
                                                    <button
                                                        className="hint-toggle"
                                                        aria-expanded={open}
                                                        onClick={() => setOpenHints((list) => (open ? list.filter((i) => i !== index) : [...list, index]))}
                                                    >
                                                        <span>
                                                            <Icon name="spark" size={14} /> {hint.title || `Hint ${index + 1}`}
                                                        </span>
                                                        <Icon name="chevron" size={16} />
                                                    </button>
                                                    {open && <p>{hint.body}</p>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <dl className="stat-strip">
                                    <div>
                                        <dt>Accepted</dt>
                                        <dd className="num">{problem.acceptedSubmissions ?? 0}</dd>
                                    </div>
                                    <div>
                                        <dt>Submissions</dt>
                                        <dd className="num">{problem.submissions ?? 0}</dd>
                                    </div>
                                    <div>
                                        <dt>Acceptance rate</dt>
                                        <dd className="num">{problem.acceptance == null ? "–" : `${problem.acceptance}%`}</dd>
                                    </div>
                                    <div>
                                        <dt>Solved by</dt>
                                        <dd className="num">{problem.solvers ?? 0}</dd>
                                    </div>
                                </dl>

                                {problem.canEdit && (
                                    <div className="owner-bar">
                                        <span>You can edit this problem.</span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
                                            <Icon name="edit" size={14} /> Edit
                                        </button>
                                        <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                                            <Icon name="trash" size={14} /> Delete
                                        </button>
                                    </div>
                                )}
                            </article>
                        )}

                        {tab === "editorial" && (
                            <div className="pane-section">
                                <h2>Editorial</h2>
                                {!problem.editorial ? (
                                    <div className="empty">
                                        <strong>No editorial yet</strong>
                                        The author hasn't written one. Check the comments for approaches.
                                    </div>
                                ) : solved || revealEditorial || problem.canEdit ? (
                                    <div className="editorial-text">{problem.editorial}</div>
                                ) : (
                                    <div className="editorial-locked">
                                        <div className="editorial-blur" aria-hidden="true">
                                            {problem.editorial.slice(0, 400)}
                                        </div>
                                        <div className="editorial-gate">
                                            <Icon name="lock" size={22} />
                                            <strong>Try it yourself first</strong>
                                            <p>The editorial explains the intended solution. Solve the problem to unlock it, or reveal it now.</p>
                                            <button className="btn btn-ghost" onClick={() => setRevealEditorial(true)}>
                                                Reveal editorial
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === "comments" && <Comments problemId={problem.problemId} onCountChange={onCommentCount} />}

                        {tab === "submissions" && (
                            <div className="pane-section">
                                {!isLoggedIn ? (
                                    <div className="empty">
                                        <strong>Log in to see your submissions</strong>
                                        <Link to={`/login?redirect=/problem/${id}`} className="btn btn-primary">
                                            Log in
                                        </Link>
                                    </div>
                                ) : history.length === 0 ? (
                                    <div className="empty">
                                        <strong>No submissions yet</strong>
                                        Submit a solution and it appears here with its code.
                                    </div>
                                ) : (
                                    <>
                                        <dl className="stat-strip">
                                            <div>
                                                <dt>Submissions</dt>
                                                <dd className="num">{history.length}</dd>
                                            </div>
                                            <div>
                                                <dt>Accepted</dt>
                                                <dd className="num">{acceptedRuns.length}</dd>
                                            </div>
                                            <div>
                                                <dt>Best runtime</dt>
                                                <dd className="num">{bestTime == null ? "–" : `${bestTime} ms`}</dd>
                                            </div>
                                        </dl>
                                        <table className="sub-table">
                                            <thead>
                                                <tr>
                                                    <th>Status</th>
                                                    <th>Language</th>
                                                    <th>Runtime</th>
                                                    <th>Tests</th>
                                                    <th>When</th>
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {history.map((s) => (
                                                    <tr key={s._id}>
                                                        <td className={s.verdict === "Accepted" ? "v-ok" : "v-bad"}>{s.verdict}</td>
                                                        <td>{LANGUAGES.find((l) => l.value === s.language)?.label || s.language}</td>
                                                        <td className="num">{s.executionTime || 0} ms</td>
                                                        <td className="num">
                                                            {s.passedTestCases || 0}/{s.totalTestCases || 0}
                                                        </td>
                                                        <td className="muted">{timeAgo(s.createdAt)}</td>
                                                        <td>
                                                            <button
                                                                className="btn btn-quiet btn-sm"
                                                                onClick={() => {
                                                                    switchLanguage(s.language);
                                                                    setCode(s.code);
                                                                    toast("Submission loaded into the editor", "info");
                                                                }}
                                                            >
                                                                Load code
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>
                        )}

                        {tab === "leaderboard" && (
                            <div className="pane-section">
                                <div className="pane-section-head">
                                    <h2>Fastest accepted solutions</h2>
                                    {myRow && <span className="tag primary">You are #{myRow.rank}</span>}
                                </div>
                                {!leaderboard && <div className="skeleton" style={{ height: 56 }} />}
                                {leaderboard?.length === 0 && (
                                    <div className="empty">
                                        <strong>No submissions yet</strong>
                                        Be the first to solve it.
                                    </div>
                                )}
                                <ol className="lb-list">
                                    {leaderboard?.map((row) => (
                                        <LeaderRow
                                            key={row.userId}
                                            user={row}
                                            you={row.userId === userId}
                                            metric={row.bestTime ? `${row.bestTime} ms` : "Not solved"}
                                            detail={`${row.accepted} accepted of ${row.submissions}`}
                                        />
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                </section>

                <div
                    className="ws-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panels"
                    aria-valuenow={Math.round(leftPanePercent)}
                    tabIndex={0}
                    onPointerDown={startResize}
                    onKeyDown={onResizerKey}
                />

                <section className="ws-right">
                    <div className="ws-panel editor-panel">
                        <div className="editor-bar">
                            <span className="editor-title">
                                <Icon name="spark" size={15} /> Code
                            </span>
                            <select className="select select-sm" value={language} onChange={(e) => switchLanguage(e.target.value)} aria-label="Language">
                                {LANGUAGES.map((l) => (
                                    <option key={l.value} value={l.value}>
                                        {l.label}
                                    </option>
                                ))}
                            </select>
                            <span className="grow" />
                            <span className="saved-hint muted">Saved in this browser</span>
                            <button className="icon-btn" onClick={resetCode} title="Reset to starter code" aria-label="Reset to starter code">
                                <Icon name="undo" size={16} />
                            </button>
                        </div>
                        <div className="editor-frame">
                            <Editor
                                height="100%"
                                language={language}
                                value={code}
                                onChange={(value) => setCode(value || "")}
                                theme={theme === "dark" ? "tc-dark" : "tc-light"}
                                beforeMount={defineEditorThemes}
                                onMount={onEditorMount}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                                    wordWrap: "on",
                                    scrollBeyondLastLine: false,
                                    padding: { top: 12 },
                                    smoothScrolling: true,
                                }}
                            />
                        </div>
                    </div>

                    <div className="ws-panel console">
                        <div className="console-head">
                            <Segmented options={CONSOLE_TABS} value={consoleTab} onChange={setConsoleTab} label="Console" />
                            <span className="grow" />
                            <button
                                className="btn btn-quiet btn-sm"
                                onClick={handleAnalyze}
                                disabled={analysisLoading || !analysisStatus.enabled}
                                title={analysisStatus.enabled ? "Ask AI to review this code" : analysisStatus.message}
                            >
                                <Icon name="spark" size={14} /> AI review
                            </button>
                        </div>
                        <div className="console-body">
                            {consoleTab === "input" && (
                                <textarea
                                    className="console-input"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Input passed to your program on stdin"
                                    aria-label="Test input"
                                    spellCheck={false}
                                />
                            )}
                            {consoleTab === "result" && <ResultView busy={busy} runner={runner} run={run} verdict={verdict} accepted={accepted} />}
                            {consoleTab === "ai" && (
                                <div className="ai-view">
                                    {!analysisStatus.enabled ? (
                                        <p className="muted">{analysisStatus.message}</p>
                                    ) : analysisLoading ? (
                                        <div className="loading-line">
                                            <span className="spinner" /> Reviewing your code
                                        </div>
                                    ) : analysis ? (
                                        <pre>{analysis}</pre>
                                    ) : (
                                        <p className="muted">Get feedback on correctness, complexity and edge cases for the code in the editor.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {editOpen && problem.canEdit && <ProblemFormModal problemId={problem.problemId} close={() => setEditOpen(false)} refresh={fetchProblem} />}
        </div>
    );
}

const RUN_TITLES = {
    compilation_error: "Compilation error",
    runtime_error: "Runtime error",
    timeout: "Time limit exceeded",
    error: "Couldn't run",
};

function ResultView({ busy, runner, run, verdict, accepted }) {
    if (busy) {
        return (
            <div className="loading-line">
                <span className="spinner" />
                {runner.status === "starting"
                    ? "Starting your sandbox. The first run can take up to a minute."
                    : busy === "submit"
                      ? "Judging against every test case"
                      : "Running"}
            </div>
        );
    }

    if (verdict) {
        const failed = verdict.failedTestCase;
        return (
            <div className={`verdict ${accepted ? "ok" : "bad"}`}>
                <div className="verdict-top">
                    <span className="verdict-badge">{verdict.verdict}</span>
                    <span className="num">
                        {verdict.passedTestCases || 0} / {verdict.totalTestCases || 0} test cases passed
                    </span>
                    {verdict.totalTime != null && <span className="num">Runtime {verdict.totalTime} ms</span>}
                    {verdict.starsEarned > 0 && (
                        <span className="tag star">
                            <Icon name="star" size={12} filled /> +{verdict.starsEarned}
                        </span>
                    )}
                </div>
                <div className="verdict-meter" aria-hidden="true">
                    <span style={{ width: `${verdict.totalTestCases ? (verdict.passedTestCases / verdict.totalTestCases) * 100 : 0}%` }} />
                </div>
                {failed && (
                    <div className="failed">
                        <strong>{failed.index == null ? "Compilation failed" : `Failed on ${failed.hidden ? "hidden " : ""}test case ${failed.index}`}</strong>
                        {failed.index != null && !failed.hidden && (
                            <div className="failed-grid">
                                <div>
                                    <span>Input</span>
                                    <pre>{failed.input}</pre>
                                </div>
                                <div>
                                    <span>Expected</span>
                                    <pre>{failed.expectedOutput}</pre>
                                </div>
                                <div>
                                    <span>Your output</span>
                                    <pre>{failed.actualOutput}</pre>
                                </div>
                            </div>
                        )}
                        {failed.error && <pre className="error-pre">{failed.error}</pre>}
                    </div>
                )}
            </div>
        );
    }

    if (run) {
        const title = RUN_TITLES[run.status];
        return (
            <div className={`run-output ${title ? "bad" : ""}`}>
                <strong>{title || "Output"}</strong>
                <pre>{run.text}</pre>
            </div>
        );
    }

    return <p className="muted">Run your code to see its output here, or submit to judge it against every test case.</p>;
}
