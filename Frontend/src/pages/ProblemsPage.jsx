import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDailyProblem, getHackathons, getLeaderboard, getMySubmissions, getProblems, getTags } from "../api";
import AppHeader from "../components/AppHeader";
import ProblemFormModal from "../components/ProblemFormModal";
import ProblemRow from "../components/ProblemRow";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { Avatar, Countdown, Difficulty, Stars } from "../ui/bits";
import Icon from "../ui/Icon";
import Segmented from "../ui/Segmented";
import "../styles/layout.css";
import "../styles/problems.css";

const DIFFS = ["Easy", "Medium", "Hard"];
const DIFF_OPTIONS = [{ value: "All", label: "All" }, ...DIFFS.map((d) => ({ value: d, label: d }))];
const PAGE_SIZE = 20;
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const SORTS = {
    default: { label: "Default", fn: (a, b) => a.number - b.number },
    acc_desc: { label: "Acceptance high", fn: (a, b) => (b.acceptance ?? -1) - (a.acceptance ?? -1) },
    acc_asc: { label: "Acceptance low", fn: (a, b) => (a.acceptance ?? 101) - (b.acceptance ?? 101) },
    diff: { label: "Easiest first", fn: (a, b) => DIFFS.indexOf(a.difficulty) - DIFFS.indexOf(b.difficulty) || a.number - b.number },
    newest: { label: "Newest first", fn: (a, b) => b.number - a.number },
};

export default function ProblemsPage() {
    const navigate = useNavigate();
    const { isLoggedIn, userId } = useAuth();
    const { me } = useMe();
    const [problems, setProblems] = useState(null);
    const [loadError, setLoadError] = useState(false);
    const [tags, setTags] = useState([]);
    const [daily, setDaily] = useState(null);
    const [hackathons, setHackathons] = useState([]);
    const [leaders, setLeaders] = useState([]);
    const [submissions, setSubmissions] = useState([]);

    const [query, setQuery] = useState("");
    const [difficulty, setDifficulty] = useState("All");
    const [status, setStatus] = useState("all");
    const [tag, setTag] = useState("");
    const [sort, setSort] = useState("default");
    const [page, setPage] = useState(1);
    const [showAllTags, setShowAllTags] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const searchRef = useRef(null);

    const loadProblems = useCallback(
        () =>
            getProblems()
                .then((res) => {
                    setProblems(res.data);
                    setLoadError(false);
                })
                .catch(() => {
                    setLoadError(true);
                    setProblems((p) => p || []);
                }),
        [],
    );

    useEffect(() => {
        let active = true;
        getProblems()
            .then((res) => active && setProblems(res.data))
            .catch(() => {
                if (!active) return;
                setLoadError(true);
                setProblems([]);
            });
        getTags().then((res) => active && setTags(res.data)).catch(() => {});
        getDailyProblem().then((res) => active && setDaily(res.data)).catch(() => {});
        getHackathons().then((res) => active && setHackathons(res.data)).catch(() => {});
        getLeaderboard().then((res) => active && setLeaders(res.data.slice(0, 5))).catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!isLoggedIn) return;
        getMySubmissions()
            .then((res) => setSubmissions(res.data))
            .catch(() => {});
    }, [isLoggedIn]);

    // "/" focuses search from anywhere on the page.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const { solvedIds, triedIds } = useMemo(() => {
        const solved = new Set();
        const tried = new Set();
        (isLoggedIn ? submissions : []).forEach((s) => (s.verdict === "Accepted" ? solved : tried).add(s.problemId));
        return { solvedIds: solved, triedIds: tried };
    }, [submissions, isLoggedIn]);

    const list = problems || [];
    const statusOf = (p) => (solvedIds.has(p.problemId) ? "solved" : triedIds.has(p.problemId) ? "tried" : "none");

    const filtered = list
        .filter((p) => {
            if (difficulty !== "All" && p.difficulty !== difficulty) return false;
            if (tag && !(p.tags || []).includes(tag)) return false;
            if (status === "solved" && statusOf(p) !== "solved") return false;
            if (status === "tried" && statusOf(p) !== "tried") return false;
            if (status === "todo" && statusOf(p) !== "none") return false;
            const q = query.trim().toLowerCase();
            return !q || `${p.number} ${p.title} ${(p.tags || []).join(" ")}`.toLowerCase().includes(q);
        })
        .sort(SORTS[sort].fn);

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

    const resetPage = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    const pickRandom = () => {
        const pool = filtered.filter((p) => statusOf(p) !== "solved");
        const pick = randomItem(pool.length ? pool : filtered);
        if (pick) navigate(`/problem/${pick.problemId}`);
    };

    const ownerOf = (p) => p.createdBy?._id?.toString() || p.createdBy?.toString();
    const shownTags = showAllTags ? tags : tags.slice(0, 14);
    const nextHackathon =
        hackathons.find((h) => h.status === "live") ||
        [...hackathons].filter((h) => h.status === "upcoming").sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-wide">
                <div className="with-aside">
                    <div className="main-col">
                        <section className="topics card card-pad" aria-label="Topics">
                            <div className="topics-list">
                                <button type="button" className={`topic-chip ${tag === "" ? "on" : ""}`} onClick={() => resetPage(setTag)("")}>
                                    All topics
                                </button>
                                {shownTags.map((t) => (
                                    <button
                                        type="button"
                                        key={t.tag}
                                        className={`topic-chip ${tag === t.tag ? "on" : ""}`}
                                        onClick={() => resetPage(setTag)(tag === t.tag ? "" : t.tag)}
                                    >
                                        {t.tag}
                                        <span className="num">{t.count}</span>
                                    </button>
                                ))}
                                {tags.length > 14 && (
                                    <button type="button" className="topic-more" onClick={() => setShowAllTags((v) => !v)}>
                                        {showAllTags ? "Show less" : `Show all ${tags.length}`}
                                    </button>
                                )}
                                {tags.length === 0 && <span className="muted">Topic tags appear here once problems have them.</span>}
                            </div>
                        </section>

                        <div className="toolbar">
                            <label className="search">
                                <Icon name="search" size={17} />
                                <span className="visually-hidden">Search problems</span>
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={(e) => resetPage(setQuery)(e.target.value)}
                                    placeholder="Search problems"
                                />
                                <kbd>/</kbd>
                            </label>
                            <Segmented options={DIFF_OPTIONS} value={difficulty} onChange={resetPage(setDifficulty)} label="Difficulty" />
                            {isLoggedIn && (
                                <select className="select" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} aria-label="Status">
                                    <option value="all">Any status</option>
                                    <option value="todo">To do</option>
                                    <option value="tried">Attempted</option>
                                    <option value="solved">Solved</option>
                                </select>
                            )}
                            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                                {Object.entries(SORTS).map(([key, s]) => (
                                    <option key={key} value={key}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                            <span className="grow" />
                            <button className="btn btn-ghost" onClick={pickRandom} disabled={!filtered.length} title="Open a random unsolved problem">
                                <Icon name="shuffle" size={16} /> Pick one
                            </button>
                            <button className="btn btn-primary" onClick={() => (isLoggedIn ? setCreateOpen(true) : navigate("/login?redirect=/"))}>
                                <Icon name="plus" size={16} /> New problem
                            </button>
                        </div>

                        <div className="card table-card">
                            <table className="ptable">
                                <thead>
                                    <tr>
                                        <th className="col-status">Status</th>
                                        <th className="col-title">Title</th>
                                        <th className="col-tags">Topics</th>
                                        <th className="col-acc">Acceptance</th>
                                        <th className="col-diff">Difficulty</th>
                                        <th className="col-stars">Stars</th>
                                        <th className="col-actions">
                                            <span className="visually-hidden">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {problems === null &&
                                        [1, 2, 3, 4, 5, 6].map((n) => (
                                            <tr key={n}>
                                                <td colSpan={7}>
                                                    <div className="skeleton" style={{ height: 22 }} />
                                                </td>
                                            </tr>
                                        ))}
                                    {visible.map((p) => (
                                        <ProblemRow
                                            key={p.problemId}
                                            problem={p}
                                            status={statusOf(p)}
                                            canEdit={Boolean(me?.isAdmin) || (Boolean(userId) && ownerOf(p) === userId)}
                                            refresh={loadProblems}
                                            onTagClick={resetPage(setTag)}
                                        />
                                    ))}
                                </tbody>
                            </table>

                            {problems !== null && visible.length === 0 && (
                                <div className="empty">
                                    {loadError ? (
                                        <>
                                            <strong>Couldn't load problems</strong>
                                            Check your connection, then try again.
                                            <button className="btn btn-ghost" onClick={loadProblems}>
                                                Try again
                                            </button>
                                        </>
                                    ) : list.length === 0 ? (
                                        <>
                                            <strong>No problems yet</strong>
                                            Create the first one and share it.
                                        </>
                                    ) : (
                                        <>
                                            <strong>No problems match these filters</strong>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => {
                                                    setQuery("");
                                                    setDifficulty("All");
                                                    setStatus("all");
                                                    setTag("");
                                                }}
                                            >
                                                Clear filters
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {filtered.length > 0 && (
                                <div className="table-foot">
                                    <span className="muted">
                                        Showing {(current - 1) * PAGE_SIZE + 1} to {Math.min(current * PAGE_SIZE, filtered.length)} of{" "}
                                        {filtered.length}
                                    </span>
                                    <div className="pager">
                                        <button className="icon-btn" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
                                            <Icon name="left" size={16} />
                                        </button>
                                        <span className="num">
                                            {current} / {pages}
                                        </span>
                                        <button className="icon-btn" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page">
                                            <Icon name="right" size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="aside-col">
                        {daily && <DailyCard daily={daily} solved={solvedIds.has(daily.problemId)} />}
                        {isLoggedIn ? (
                            <ProgressCard list={list} solvedIds={solvedIds} me={me} />
                        ) : (
                            <div className="card card-pad join-card">
                                <h3>Track your progress</h3>
                                <p>Create a free account to save solutions, earn stars and join monthly hackathons.</p>
                                <Link to="/register" className="btn btn-primary btn-block">
                                    Create account
                                </Link>
                            </div>
                        )}
                        {nextHackathon && <HackathonCard h={nextHackathon} />}
                        {leaders.length > 0 && <LeadersCard leaders={leaders} />}
                    </aside>
                </div>
            </main>

            {createOpen && <ProblemFormModal close={() => setCreateOpen(false)} refresh={loadProblems} />}
        </div>
    );
}

function DailyCard({ daily, solved }) {
    const date = new Date(`${daily.date}T00:00:00`);
    return (
        <div className="card card-pad daily-card">
            <div className="daily-date">
                <span className="daily-day num">{date.getDate()}</span>
                <span>
                    <strong>Problem of the day</strong>
                    <small>{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</small>
                </span>
            </div>
            <Link to={`/problem/${daily.problemId}`} className="daily-title">
                {daily.title}
            </Link>
            <div className="daily-meta">
                <Difficulty level={daily.difficulty} as="tag" />
                <Stars count={daily.stars} />
                {solved && (
                    <span className="tag ok">
                        <Icon name="check" size={12} /> Solved
                    </span>
                )}
            </div>
            <Link to={`/problem/${daily.problemId}`} className="btn btn-soft btn-block">
                {solved ? "Review solution" : "Solve today's problem"}
            </Link>
        </div>
    );
}

function ProgressCard({ list, solvedIds, me }) {
    const by = DIFFS.map((d) => {
        const inLevel = list.filter((p) => p.difficulty === d);
        return { d, total: inLevel.length, solved: inLevel.filter((p) => solvedIds.has(p.problemId)).length };
    });
    const solved = by.reduce((s, x) => s + x.solved, 0);
    const total = list.length;
    const r = 40;
    const c = 2 * Math.PI * r;
    // Each difficulty gets its own arc segment of the ring, placed after the previous one.
    const arcs = by.reduce((acc, x) => {
        const prev = acc[acc.length - 1];
        acc.push({ d: x.d, len: total ? (x.solved / total) * c : 0, offset: prev ? prev.offset + prev.len : 0 });
        return acc;
    }, []);
    const stars = me?.stars || 0;
    const next = [1, 10, 25, 50, 100, 250].find((n) => n > stars);

    return (
        <div className="card card-pad progress-card">
            <div className="card-head">
                <h3>Your progress</h3>
                {me && (
                    <Link to={`/u/${encodeURIComponent(me.username)}`} className="muted small-link">
                        Profile
                    </Link>
                )}
            </div>
            <div className="progress-body">
                <div className="ring" role="img" aria-label={`${solved} of ${total} solved`}>
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={r} className="ring-track" />
                        {arcs.map((a) => (
                            <circle
                                key={a.d}
                                cx="50"
                                cy="50"
                                r={r}
                                className={`ring-arc ${a.d.toLowerCase()}`}
                                strokeDasharray={`${a.len} ${c}`}
                                strokeDashoffset={-a.offset}
                            />
                        ))}
                    </svg>
                    <span className="ring-label">
                        <strong className="num">{solved}</strong>
                        <small>/{total} solved</small>
                    </span>
                </div>
                <ul className="level-list">
                    {by.map((x) => (
                        <li key={x.d}>
                            <span className={`diff ${x.d.toLowerCase()}`}>{x.d}</span>
                            <span className="num">
                                {x.solved}
                                <span className="muted">/{x.total}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="stars-row">
                <span className="stars-total">
                    <Icon name="star" size={18} filled />
                    <strong className="num">{stars}</strong> stars
                </span>
                {next && (
                    <span className="muted">
                        {next - stars} to next badge
                    </span>
                )}
            </div>
            {next && (
                <div className="mini-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (stars / next) * 100)}%` }} />
                </div>
            )}
        </div>
    );
}

function HackathonCard({ h }) {
    const live = h.status === "live";
    return (
        <div className={`card card-pad hack-card ${live ? "live" : ""}`}>
            <div className="hack-card-top">
                <span className={`tag ${live ? "bad" : "primary"}`}>{live ? "Live now" : "Upcoming hackathon"}</span>
                <span className="muted num">
                    <Icon name="users" size={13} /> {h.registrations}
                </span>
            </div>
            <Link to={`/hackathons/${h.slug}`} className="hack-card-title">
                {h.title}
            </Link>
            <Countdown to={live ? h.endsAt : h.startsAt} prefix={live ? "Ends in " : "Starts in "} />
            <Link to={`/hackathons/${h.slug}`} className="btn btn-primary btn-block">
                {h.registered ? (live ? "Enter hackathon" : "You're registered") : "Register"}
            </Link>
        </div>
    );
}

function LeadersCard({ leaders }) {
    return (
        <div className="card card-pad">
            <div className="card-head">
                <h3>Top coders</h3>
                <Link to="/leaderboard" className="muted small-link">
                    View all
                </Link>
            </div>
            <ol className="mini-leaders">
                {leaders.map((u) => (
                    <li key={u.userId}>
                        <span className={`mini-rank num r${u.rank}`}>{u.rank}</span>
                        <Avatar name={u.username} src={u.profilePicture} size="sm" />
                        <Link to={`/u/${encodeURIComponent(u.username)}`} className="mini-name">
                            {u.username}
                        </Link>
                        <span className="mini-stars num">
                            <Icon name="star" size={13} filled /> {u.stars}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
