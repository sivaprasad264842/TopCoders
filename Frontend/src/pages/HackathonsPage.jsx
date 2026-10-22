import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getErrorMessage, getHackathons, registerHackathon } from "../api";
import AppHeader from "../components/AppHeader";
import HackathonFormModal from "../components/HackathonFormModal";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { Countdown, formatDateTime } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import "../styles/layout.css";
import "../styles/hackathons.css";

const durationText = (h) => {
    const mins = Math.round((new Date(h.endsAt) - new Date(h.startsAt)) / 60000);
    return mins >= 120 ? `${Math.round((mins / 60) * 10) / 10} hours` : `${mins} minutes`;
};

export default function HackathonsPage() {
    const navigate = useNavigate();
    const { isLoggedIn } = useAuth();
    const { me } = useMe();
    const { toast } = useFeedback();
    const [list, setList] = useState(null);
    const [formOpen, setFormOpen] = useState(false);

    const load = useCallback(() => getHackathons().then((res) => setList(res.data)).catch(() => setList([])), []);

    useEffect(() => {
        let active = true;
        getHackathons()
            .then((res) => active && setList(res.data))
            .catch(() => active && setList([]));
        return () => {
            active = false;
        };
    }, []);

    const register = async (h) => {
        if (!isLoggedIn) return navigate(`/login?redirect=/hackathons/${h.slug}`);
        try {
            await registerHackathon(h.slug);
            toast(`You're registered for ${h.title}`);
            load();
        } catch (err) {
            toast(getErrorMessage(err, "Could not register."), "error");
        }
    };

    const all = list || [];
    const live = all.filter((h) => h.status === "live");
    const upcoming = all.filter((h) => h.status === "upcoming").sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const past = all.filter((h) => h.status === "ended");
    const featured = live[0] || upcoming[0];
    const others = [...live.slice(1), ...upcoming.filter((h) => h !== featured)];

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-wide">
                <section className="hk-hero">
                    <div className="hk-hero-text">
                        <h1>Monthly hackathons</h1>
                        <p>
                            One timed contest every month. Register, solve the problem set before the clock runs out, and climb the live
                            standings. Problems join the public practice list after each event.
                        </p>
                        <ul className="hk-points">
                            <li>
                                <Icon name="calendar" size={16} /> Every month, usually the first Saturday
                            </li>
                            <li>
                                <Icon name="trophy" size={16} /> Ranked by points, then penalty time
                            </li>
                            <li>
                                <Icon name="star" size={16} /> Solved problems earn stars too
                            </li>
                        </ul>
                    </div>
                    {me?.isAdmin && (
                        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
                            <Icon name="plus" size={16} /> Schedule hackathon
                        </button>
                    )}
                </section>

                {list === null && <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />}

                {featured && <FeaturedCard h={featured} onRegister={register} />}

                {list !== null && !featured && (
                    <div className="card empty">
                        <strong>No hackathon scheduled right now</strong>
                        The next monthly hackathon will be announced here. Keep practising in the meantime.
                        <Link to="/" className="btn btn-ghost">
                            Practise problems
                        </Link>
                    </div>
                )}

                {others.length > 0 && (
                    <section className="hk-section">
                        <h2>Coming up</h2>
                        <div className="hk-grid">
                            {others.map((h) => (
                                <Link key={h._id} to={`/hackathons/${h.slug}`} className="card hk-tile">
                                    <span className={`tag ${h.status === "live" ? "bad" : "primary"}`}>{h.status === "live" ? "Live" : "Upcoming"}</span>
                                    <strong>{h.title}</strong>
                                    <span className="muted">
                                        <Icon name="calendar" size={14} /> {formatDateTime(h.startsAt)}
                                    </span>
                                    <span className="hk-tile-foot">
                                        <span className="muted">
                                            <Icon name="users" size={14} /> {h.registrations} registered
                                        </span>
                                        {h.registered && <span className="tag ok">Registered</span>}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {past.length > 0 && (
                    <section className="hk-section">
                        <h2>Past hackathons</h2>
                        <div className="card table-card">
                            <table className="hk-table">
                                <thead>
                                    <tr>
                                        <th>Hackathon</th>
                                        <th>Date</th>
                                        <th>Problems</th>
                                        <th>Participants</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {past.map((h) => (
                                        <tr key={h._id}>
                                            <td>
                                                <Link to={`/hackathons/${h.slug}`} className="hk-name">
                                                    {h.title}
                                                </Link>
                                                {h.registered && <span className="tag ok">Joined</span>}
                                            </td>
                                            <td className="muted">{new Date(h.startsAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</td>
                                            <td className="num">{h.problemCount}</td>
                                            <td className="num">{h.registrations}</td>
                                            <td>
                                                <Link to={`/hackathons/${h.slug}?tab=standings`} className="btn btn-quiet btn-sm">
                                                    Standings
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </main>

            {formOpen && <HackathonFormModal close={() => setFormOpen(false)} onSaved={(h) => navigate(`/hackathons/${h.slug}`)} />}
        </div>
    );
}

function FeaturedCard({ h, onRegister }) {
    const isLive = h.status === "live";
    return (
        <section className={`card hk-featured ${isLive ? "live" : ""}`}>
            <div className="hk-featured-main">
                <span className={`tag ${isLive ? "bad" : "primary"}`}>
                    {isLive && <span className="live-dot" />}
                    {isLive ? "Live now" : "Next hackathon"}
                </span>
                <Link to={`/hackathons/${h.slug}`} className="hk-featured-title">
                    {h.title}
                </Link>
                <div className="hk-facts">
                    <span>
                        <Icon name="calendar" size={15} /> {formatDateTime(h.startsAt)}
                    </span>
                    <span>
                        <Icon name="clock" size={15} /> {durationText(h)}
                    </span>
                    <span>
                        <Icon name="list" size={15} /> {h.problemCount} problems, {h.totalPoints} points
                    </span>
                    <span>
                        <Icon name="users" size={15} /> {h.registrations} registered
                    </span>
                </div>
            </div>
            <div className="hk-featured-side">
                <span className="muted">{isLive ? "Ends in" : "Starts in"}</span>
                <Countdown to={isLive ? h.endsAt : h.startsAt} />
                {h.registered ? (
                    <Link to={`/hackathons/${h.slug}`} className="btn btn-primary btn-lg">
                        {isLive ? "Enter hackathon" : "You're registered"}
                    </Link>
                ) : (
                    <button className="btn btn-primary btn-lg" onClick={() => onRegister(h)}>
                        {isLive ? "Register and start" : "Register now"}
                    </button>
                )}
                <Link to={`/hackathons/${h.slug}`} className="small-link">
                    Details and rules
                </Link>
            </div>
        </section>
    );
}
