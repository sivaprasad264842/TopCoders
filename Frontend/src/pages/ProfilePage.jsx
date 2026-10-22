import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getErrorMessage, getPublicProfile } from "../api";
import AppHeader from "../components/AppHeader";
import { useAuth } from "../hooks/useAuth";
import { Avatar, Difficulty, timeAgo } from "../ui/bits";
import Icon from "../ui/Icon";
import "../styles/layout.css";
import "../styles/profile.css";

const BADGES = [
    { id: "first-star", name: "First Star", stars: 1 },
    { id: "rising", name: "Rising Coder", stars: 10 },
    { id: "bronze", name: "Bronze Solver", stars: 25 },
    { id: "silver", name: "Silver Solver", stars: 50 },
    { id: "gold", name: "Gold Solver", stars: 100 },
    { id: "legend", name: "TopCoder Legend", stars: 250 },
];

const LANG = { javascript: "JavaScript", python: "Python", cpp: "C++", java: "Java" };

export default function ProfilePage() {
    const { username } = useParams();
    const { userId } = useAuth();
    const [p, setP] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        getPublicProfile(username)
            .then((res) => active && setP(res.data))
            .catch((err) => active && setError(err.response?.status === 404 ? "No coder with that username." : getErrorMessage(err)));
        return () => {
            active = false;
        };
    }, [username]);

    if (!p) {
        return (
            <div className="app">
                <AppHeader />
                <div className="page-center">
                    {error ? (
                        <div className="empty">
                            <strong>{error}</strong>
                            <Link to="/leaderboard" className="btn btn-primary">
                                Browse the leaderboard
                            </Link>
                        </div>
                    ) : (
                        <div className="loading-line">
                            <span className="spinner" /> Loading profile
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const isMe = String(p.userId) === String(userId);
    const links = [
        ["GitHub", p.socialLinks?.github, "external"],
        ["LinkedIn", p.socialLinks?.linkedin, "external"],
        ["Website", p.socialLinks?.website, "globe"],
        ["Resume", p.resume, "book"],
    ].filter(([, url]) => url);

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-wide">
                <div className="profile-layout">
                    <aside className="card card-pad profile-card">
                        <Avatar name={p.username} src={p.profilePicture} size="xl" />
                        <h1>{p.username}</h1>
                        <p className="profile-bio">{p.bio || "No bio yet."}</p>
                        <div className="profile-rank">
                            <div>
                                <span className="muted">Rank</span>
                                <strong className="num">#{p.rank}</strong>
                            </div>
                            <div>
                                <span className="muted">Stars</span>
                                <strong className="num star-text">
                                    <Icon name="star" size={16} filled /> {p.stars}
                                </strong>
                            </div>
                        </div>
                        {isMe && (
                            <Link to="/settings" className="btn btn-soft btn-block">
                                <Icon name="edit" size={15} /> Edit profile
                            </Link>
                        )}
                        <ul className="profile-facts">
                            <li>
                                <Icon name="calendar" size={15} /> Joined {new Date(p.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                            </li>
                            <li>
                                <Icon name="send" size={15} /> {p.submissions} submissions
                            </li>
                            {p.acceptanceRate != null && (
                                <li>
                                    <Icon name="check" size={15} /> {p.acceptanceRate}% acceptance
                                </li>
                            )}
                        </ul>
                        {links.length > 0 && (
                            <div className="profile-links">
                                {links.map(([label, url, icon]) => (
                                    <a key={label} href={url} target="_blank" rel="noreferrer">
                                        <Icon name={icon} size={15} /> {label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </aside>

                    <div className="profile-main">
                        <div className="profile-row">
                            <SolvedCard p={p} />
                            <BadgesCard p={p} />
                        </div>
                        <Heatmap calendar={p.calendar} />
                        <div className="profile-row">
                            <div className="card card-pad">
                                <div className="card-head">
                                    <h3>Recent accepted</h3>
                                </div>
                                {p.recentAccepted.length === 0 ? (
                                    <p className="muted">No accepted solutions yet.</p>
                                ) : (
                                    <ul className="recent-list">
                                        {p.recentAccepted.map((r) => (
                                            <li key={r.problemId}>
                                                <Link to={`/problem/${r.problemId}`}>{r.title}</Link>
                                                <Difficulty level={r.difficulty} />
                                                <span className="muted">
                                                    {LANG[r.language] || r.language}, {timeAgo(r.at)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="card card-pad">
                                <div className="card-head">
                                    <h3>Hackathons</h3>
                                </div>
                                {p.hackathons.length === 0 ? (
                                    <p className="muted">Hasn't joined a hackathon yet.</p>
                                ) : (
                                    <ul className="recent-list">
                                        {p.hackathons.map((h) => (
                                            <li key={h.slug}>
                                                <Link to={`/hackathons/${h.slug}`}>{h.title}</Link>
                                                <span className={`tag ${h.status === "live" ? "bad" : h.status === "upcoming" ? "primary" : ""}`}>{h.status}</span>
                                                <span className="muted">{new Date(h.startsAt).toLocaleDateString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function SolvedCard({ p }) {
    const r = 44;
    const c = 2 * Math.PI * r;
    const share = p.totals.total ? p.solved.total / p.totals.total : 0;
    return (
        <div className="card card-pad solved-card">
            <div className="card-head">
                <h3>Solved problems</h3>
            </div>
            <div className="solved-body">
                <div className="ring big" role="img" aria-label={`${p.solved.total} of ${p.totals.total} solved`}>
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={r} className="ring-track" />
                        <circle cx="50" cy="50" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
                    </svg>
                    <span className="ring-label">
                        <strong className="num">{p.solved.total}</strong>
                        <small>of {p.totals.total}</small>
                    </span>
                </div>
                <ul className="diff-bars">
                    {["Easy", "Medium", "Hard"].map((d) => (
                        <li key={d} className={d.toLowerCase()}>
                            <div className="diff-bars-top">
                                <span className={`diff ${d.toLowerCase()}`}>{d}</span>
                                <span className="num">
                                    {p.solved[d]}
                                    <span className="muted">/{p.totals[d]}</span>
                                </span>
                            </div>
                            <div className="bar">
                                <span style={{ width: `${p.totals[d] ? (p.solved[d] / p.totals[d]) * 100 : 0}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function BadgesCard({ p }) {
    const earned = new Set(p.badges.map((b) => b.id));
    return (
        <div className="card card-pad">
            <div className="card-head">
                <h3>Badges</h3>
                <span className="muted">
                    {earned.size}/{BADGES.length}
                </span>
            </div>
            <div className="badges-grid">
                {BADGES.map((b) => (
                    <div key={b.id} className={`badge-tile ${earned.has(b.id) ? "earned" : ""} b-${b.id}`} title={`${b.name}: ${b.stars} stars`}>
                        <span className="badge-icon">
                            <Icon name={earned.has(b.id) ? "badge" : "lock"} size={20} />
                        </span>
                        <strong>{b.name}</strong>
                        <small className="num">{b.stars} stars</small>
                    </div>
                ))}
            </div>
            {p.nextBadge && (
                <div className="next-badge">
                    <span className="muted">
                        {p.nextBadge.stars - p.stars} more {p.nextBadge.stars - p.stars === 1 ? "star" : "stars"} to <strong>{p.nextBadge.name}</strong>
                    </span>
                    <div className="mini-bar">
                        <span style={{ width: `${Math.min(100, (p.stars / p.nextBadge.stars) * 100)}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
}

/** GitHub-style activity calendar for the last 52 weeks (UTC days, like the API). */
function Heatmap({ calendar }) {
    const { weeks, total, activeDays, months } = useMemo(() => {
        const today = new Date();
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - 7 * 52 - end.getUTCDay());
        const cols = [];
        const monthLabels = [];
        let sum = 0;
        let days = 0;
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            if (d.getUTCDay() === 0) cols.push([]);
            const key = d.toISOString().slice(0, 10);
            const count = calendar[key] || 0;
            sum += count;
            if (count) days += 1;
            if (d.getUTCDate() === 1) monthLabels.push({ col: cols.length - 1, label: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
            cols[cols.length - 1].push({ key, count });
        }
        return { weeks: cols, total: sum, activeDays: days, months: monthLabels };
    }, [calendar]);

    const level = (n) => (n === 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : n < 7 ? 3 : 4);

    return (
        <div className="card card-pad heatmap-card">
            <div className="card-head">
                <h3>
                    <span className="num">{total}</span> submissions in the past year
                </h3>
                <span className="muted">
                    Active days <strong className="num">{activeDays}</strong>
                </span>
            </div>
            <div className="heatmap-scroll">
                <div className="heatmap" style={{ "--weeks": weeks.length }}>
                    <div className="heatmap-months">
                        {months.map((m) => (
                            <span key={`${m.col}-${m.label}`} style={{ gridColumn: m.col + 1 }}>
                                {m.label}
                            </span>
                        ))}
                    </div>
                    <div className="heatmap-grid">
                        {weeks.map((w, i) => (
                            <div key={i} className="heatmap-col">
                                {w.map((d) => (
                                    <span key={d.key} className={`hm l${level(d.count)}`} title={`${d.count} submission${d.count === 1 ? "" : "s"} on ${d.key}`} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="heatmap-legend muted">
                Less
                {[0, 1, 2, 3, 4].map((l) => (
                    <span key={l} className={`hm l${l}`} />
                ))}
                More
            </div>
        </div>
    );
}
