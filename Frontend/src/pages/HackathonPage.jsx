import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteHackathon, getErrorMessage, getHackathon, getStandings, registerHackathon, unregisterHackathon } from "../api";
import AppHeader from "../components/AppHeader";
import HackathonFormModal from "../components/HackathonFormModal";
import { useAuth } from "../hooks/useAuth";
import { Avatar, Countdown, Difficulty, formatDateTime, Stars } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import "../styles/layout.css";
import "../styles/hackathons.css";

const TABS = [
    { value: "overview", label: "Overview" },
    { value: "problems", label: "Problems" },
    { value: "standings", label: "Standings" },
];

export default function HackathonPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { isLoggedIn, userId } = useAuth();
    const { toast, confirm } = useFeedback();
    const [h, setH] = useState(null);
    const [error, setError] = useState("");
    const [standings, setStandings] = useState(null);
    const [busy, setBusy] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "overview";

    const load = useCallback(
        () =>
            getHackathon(slug)
                .then((res) => setH(res.data))
                .catch((err) => setError(err.response?.status === 404 ? "This hackathon doesn't exist." : getErrorMessage(err))),
        [slug],
    );

    useEffect(() => {
        let active = true;
        getHackathon(slug)
            .then((res) => active && setH(res.data))
            .catch((err) => active && setError(err.response?.status === 404 ? "This hackathon doesn't exist." : getErrorMessage(err)));
        return () => {
            active = false;
        };
    }, [slug]);

    // Standings refresh every 30 seconds while the hackathon is live.
    useEffect(() => {
        if (tab !== "standings" || !h || h.status === "upcoming") return undefined;
        let active = true;
        const fetchRows = () => getStandings(slug).then((res) => active && setStandings(res.data)).catch(() => {});
        fetchRows();
        const t = h.status === "live" ? setInterval(fetchRows, 30_000) : null;
        return () => {
            active = false;
            if (t) clearInterval(t);
        };
    }, [tab, h, slug]);

    const setTab = (value) => setParams(value === "overview" ? {} : { tab: value }, { replace: true });

    const register = async () => {
        if (!isLoggedIn) return navigate(`/login?redirect=/hackathons/${slug}`);
        setBusy(true);
        try {
            await registerHackathon(slug);
            toast(h.status === "live" ? "Registered. The problems are open, good luck!" : "You're registered. We'll see you there.");
            await load();
            if (h.status === "live") setTab("problems");
        } catch (err) {
            toast(getErrorMessage(err, "Could not register."), "error");
        } finally {
            setBusy(false);
        }
    };

    const unregister = async () => {
        const ok = await confirm({ title: "Cancel your registration?", body: "You can register again any time before it ends.", confirmText: "Unregister" });
        if (!ok) return;
        setBusy(true);
        try {
            await unregisterHackathon(slug);
            toast("Registration cancelled", "info");
            await load();
        } catch (err) {
            toast(getErrorMessage(err, "Could not unregister."), "error");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        const ok = await confirm({
            title: `Delete "${h.title}"?`,
            body: "Registrations are removed and its problems become public practice problems.",
            confirmText: "Delete hackathon",
            danger: true,
        });
        if (!ok) return;
        try {
            await deleteHackathon(slug);
            toast("Hackathon deleted");
            navigate("/hackathons");
        } catch (err) {
            toast(getErrorMessage(err, "Could not delete."), "error");
        }
    };

    if (!h) {
        return (
            <div className="app">
                <AppHeader />
                <div className="page-center">
                    {error ? (
                        <div className="empty">
                            <strong>{error}</strong>
                            <Link to="/hackathons" className="btn btn-primary">
                                All hackathons
                            </Link>
                        </div>
                    ) : (
                        <div className="loading-line">
                            <span className="spinner" /> Loading hackathon
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const live = h.status === "live";
    const ended = h.status === "ended";
    const solvedSet = new Set(h.solved || []);
    const myScore = h.problems.filter((p) => solvedSet.has(p.problemId)).reduce((s, p) => s + p.points, 0);

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-wide">
                <Link to="/hackathons" className="back-link">
                    <Icon name="left" size={15} /> All hackathons
                </Link>

                <section className={`card hk-header ${h.status}`}>
                    <div className="hk-header-main">
                        <span className={`tag ${live ? "bad" : ended ? "" : "primary"}`}>
                            {live && <span className="live-dot" />}
                            {live ? "Live now" : ended ? "Ended" : "Upcoming"}
                        </span>
                        <h1>{h.title}</h1>
                        <div className="hk-facts">
                            <span>
                                <Icon name="calendar" size={15} /> {formatDateTime(h.startsAt)} to {formatDateTime(h.endsAt)}
                            </span>
                            <span>
                                <Icon name="list" size={15} /> {h.problemCount} problems, {h.totalPoints} points
                            </span>
                            <span>
                                <Icon name="users" size={15} /> {h.registrations} registered
                            </span>
                        </div>
                    </div>
                    <div className="hk-header-side">
                        {!ended && (
                            <>
                                <span className="muted">{live ? "Ends in" : "Starts in"}</span>
                                <Countdown to={live ? h.endsAt : h.startsAt} />
                            </>
                        )}
                        {ended ? (
                            <button className="btn btn-ghost" onClick={() => setTab("standings")}>
                                <Icon name="trophy" size={16} /> Final standings
                            </button>
                        ) : h.registered ? (
                            <div className="hk-registered">
                                <span className="tag ok">
                                    <Icon name="check" size={12} /> Registered
                                </span>
                                {live ? (
                                    <button className="btn btn-primary" onClick={() => setTab("problems")}>
                                        Go to problems
                                    </button>
                                ) : (
                                    <button className="btn btn-quiet btn-sm" onClick={unregister} disabled={busy}>
                                        Unregister
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button className="btn btn-primary btn-lg" onClick={register} disabled={busy}>
                                {busy && <span className="spinner" />}
                                {!isLoggedIn ? "Log in to register" : live ? "Register and start" : "Register"}
                            </button>
                        )}
                        {h.canManage && (
                            <div className="hk-admin">
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
                                    <Icon name="edit" size={14} /> Edit
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={remove}>
                                    <Icon name="trash" size={14} /> Delete
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                <div className="tabs hk-tabs" role="tablist">
                    {TABS.map((t) => (
                        <button key={t.value} role="tab" className="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === "overview" && (
                    <div className="hk-overview">
                        <div className="card card-pad hk-rules">
                            <h2>About this hackathon</h2>
                            <div className="hk-desc">{h.description || "No description yet."}</div>
                        </div>
                        <div className="card card-pad hk-scoring">
                            <h3>How scoring works</h3>
                            <ol>
                                <li>Each solved problem adds its points to your score.</li>
                                <li>Ties are broken by penalty: minutes from the start to each accepted solution.</li>
                                <li>Every wrong attempt before acceptance adds {h.penaltyMinutes} minutes.</li>
                                <li>Only submissions made during the hackathon count.</li>
                            </ol>
                            {h.registered && h.problems.length > 0 && (
                                <div className="hk-myscore">
                                    <span className="muted">Your score</span>
                                    <strong className="num">{myScore}</strong>
                                    <span className="muted">
                                        {solvedSet.size} of {h.problems.length} solved
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === "problems" &&
                    (h.problems.length === 0 ? (
                        <div className="card empty">
                            <Icon name="lock" size={24} />
                            <strong>{h.status === "upcoming" ? "Problems unlock when the hackathon starts" : "No problems in this hackathon"}</strong>
                            {h.status === "upcoming" && (
                                <>
                                    Starts {formatDateTime(h.startsAt)}. {h.registered ? "You're registered." : "Register now so you can start right away."}
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {live && !h.registered && !h.canManage && (
                                <div className="notice info">Register to open these problems while the hackathon is live.</div>
                            )}
                            <div className="card table-card">
                                <table className="hk-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 56 }}>#</th>
                                            <th>Problem</th>
                                            <th>Difficulty</th>
                                            <th>Stars</th>
                                            <th>Points</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {h.problems.map((p) => (
                                            <tr key={p.problemId}>
                                                <td className="hk-label num">{p.label}</td>
                                                <td>
                                                    {live && !h.registered && !h.canManage ? (
                                                        <span>{p.title}</span>
                                                    ) : (
                                                        <Link to={`/problem/${p.problemId}`} className="hk-name">
                                                            {p.title}
                                                        </Link>
                                                    )}
                                                </td>
                                                <td>
                                                    <Difficulty level={p.difficulty} />
                                                </td>
                                                <td>
                                                    <Stars count={p.stars} />
                                                </td>
                                                <td className="num">{p.points}</td>
                                                <td>
                                                    {solvedSet.has(p.problemId) ? (
                                                        <span className="tag ok">
                                                            <Icon name="check" size={12} /> Solved
                                                        </span>
                                                    ) : (
                                                        <span className="muted">Not solved</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ))}

                {tab === "standings" &&
                    (h.status === "upcoming" ? (
                        <div className="card empty">
                            <strong>Standings appear once the hackathon starts</strong>
                        </div>
                    ) : !standings ? (
                        <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
                    ) : standings.rows.length === 0 ? (
                        <div className="card empty">
                            <strong>No one has submitted yet</strong>
                        </div>
                    ) : (
                        <div className="card table-card standings-wrap">
                            {live && <p className="standings-note muted">Updates every 30 seconds.</p>}
                            <table className="hk-table standings">
                                <thead>
                                    <tr>
                                        <th style={{ width: 64 }}>Rank</th>
                                        <th>Coder</th>
                                        <th>Score</th>
                                        <th>Penalty</th>
                                        {standings.problems.map((p) => (
                                            <th key={p.problemId} className="cell-col" title={`${p.points} points`}>
                                                {p.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {standings.rows.map((r) => (
                                        <tr key={r.userId} className={r.userId === userId ? "me" : ""}>
                                            <td>
                                                <span className={`lb-rank num r${r.rank}`}>{r.rank}</span>
                                            </td>
                                            <td>
                                                <span className="standings-user">
                                                    <Avatar name={r.username} src={r.profilePicture} size="sm" />
                                                    <Link to={`/u/${encodeURIComponent(r.username)}`}>{r.username}</Link>
                                                </span>
                                            </td>
                                            <td className="num strong">{r.score}</td>
                                            <td className="num muted">{r.penalty}</td>
                                            {r.cells.map((c, i) => (
                                                <td key={i} className="cell-col">
                                                    {c.solvedAtMin != null ? (
                                                        <span className="cell ok" title={`Solved at minute ${c.solvedAtMin}`}>
                                                            {c.solvedAtMin}'
                                                            {c.attempts > 1 && <small>+{c.attempts - 1}</small>}
                                                        </span>
                                                    ) : c.attempts > 0 ? (
                                                        <span className="cell bad" title={`${c.attempts} wrong attempts`}>
                                                            -{c.attempts}
                                                        </span>
                                                    ) : (
                                                        <span className="cell" />
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
            </main>

            {editOpen && <HackathonFormModal hackathon={h} close={() => setEditOpen(false)} onSaved={(saved) => (saved.slug !== slug ? navigate(`/hackathons/${saved.slug}`) : load())} />}
        </div>
    );
}
