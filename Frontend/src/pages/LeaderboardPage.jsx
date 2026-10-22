import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLeaderboard } from "../api";
import AppHeader from "../components/AppHeader";
import { useAuth } from "../hooks/useAuth";
import { Avatar } from "../ui/bits";
import Icon from "../ui/Icon";
import "../styles/layout.css";
import "../styles/profile.css";

const BADGE_NAMES = { "first-star": "First Star", rising: "Rising Coder", bronze: "Bronze", silver: "Silver", gold: "Gold", legend: "Legend" };

export default function LeaderboardPage() {
    const { userId } = useAuth();
    const [rows, setRows] = useState(null);
    const [query, setQuery] = useState("");

    useEffect(() => {
        let active = true;
        getLeaderboard()
            .then((res) => active && setRows(res.data))
            .catch(() => active && setRows([]));
        return () => {
            active = false;
        };
    }, []);

    const list = (rows || []).filter((r) => r.username.toLowerCase().includes(query.trim().toLowerCase()));
    const podium = query ? [] : (rows || []).slice(0, 3);
    const rest = query ? list : list.slice(3);
    const me = (rows || []).find((r) => r.userId === userId);

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-wide">
                <div className="page-head">
                    <div>
                        <h1>Leaderboard</h1>
                        <p>Ranked by stars: Easy problems give 1, Medium 2 and Hard 3. Ties go to the coder with more solved problems.</p>
                    </div>
                    {me && (
                        <span className="tag primary my-rank">
                            Your rank <strong className="num">#{me.rank}</strong>
                        </span>
                    )}
                </div>

                {rows === null && <div className="skeleton" style={{ height: 240, borderRadius: 14 }} />}

                {podium.length > 0 && (
                    <div className="podium">
                        {[podium[1], podium[0], podium[2]].filter(Boolean).map((u) => (
                            <Link key={u.userId} to={`/u/${encodeURIComponent(u.username)}`} className={`card podium-card p${u.rank}`}>
                                <span className={`podium-rank r${u.rank}`}>{u.rank}</span>
                                <Avatar name={u.username} src={u.profilePicture} size="lg" />
                                <strong>{u.username}</strong>
                                <span className="podium-stars num">
                                    <Icon name="star" size={16} filled /> {u.stars}
                                </span>
                                <span className="muted">{u.solvedCount} solved</span>
                            </Link>
                        ))}
                    </div>
                )}

                {rows !== null && (
                    <div className="card table-card">
                        <div className="table-tools">
                            <label className="search">
                                <Icon name="search" size={16} />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a coder" aria-label="Find a coder" />
                            </label>
                            <span className="muted">{rows.length} ranked coders</span>
                        </div>
                        <table className="lb-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 80 }}>Rank</th>
                                    <th>Coder</th>
                                    <th>Badges</th>
                                    <th>Solved</th>
                                    <th>Stars</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rest.map((u) => (
                                    <tr key={u.userId} className={u.userId === userId ? "me" : ""}>
                                        <td>
                                            <span className={`lb-rank num r${u.rank}`}>{u.rank}</span>
                                        </td>
                                        <td>
                                            <Link to={`/u/${encodeURIComponent(u.username)}`} className="lb-user">
                                                <Avatar name={u.username} src={u.profilePicture} />
                                                <span>
                                                    <strong>{u.username}</strong>
                                                    {u.bio && <small>{u.bio}</small>}
                                                </span>
                                            </Link>
                                        </td>
                                        <td>
                                            <div className="badge-row">
                                                {(u.badges || []).slice(-3).map((b) => (
                                                    <span key={b} className={`badge-dot b-${b}`} title={BADGE_NAMES[b]}>
                                                        <Icon name="badge" size={13} />
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="num">{u.solvedCount}</td>
                                        <td>
                                            <span className="lb-stars num">
                                                <Icon name="star" size={14} filled /> {u.stars}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {list.length === 0 && (
                            <div className="empty">
                                <strong>{rows.length ? "No coder with that name" : "No one is ranked yet"}</strong>
                                {!rows.length && "Solve a problem to take the first spot."}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
