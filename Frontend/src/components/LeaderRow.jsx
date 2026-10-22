import { Link } from "react-router-dom";
import { Avatar } from "../ui/bits";

/** One ranking row (per-problem leaderboard). */
export default function LeaderRow({ user, you, metric, detail }) {
    return (
        <li className={`lb-row ${you ? "you" : ""}`}>
            <span className={`lb-rank num r${user.rank}`}>{user.rank}</span>
            <Avatar name={user.username} src={user.profilePicture} />
            <span className="lb-name">
                <Link to={`/u/${encodeURIComponent(user.username)}`}>{user.username}</Link>
                {you && <span className="tag primary">You</span>}
                {detail && <small>{detail}</small>}
            </span>
            <span className="lb-metric num">{metric}</span>
        </li>
    );
}
