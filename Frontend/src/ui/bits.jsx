import { useEffect, useState } from "react";
import Icon from "./Icon";

export function Avatar({ name = "", src, size = "" }) {
    return (
        <span className={`avatar ${size}`} aria-hidden="true">
            {src ? <img src={src} alt="" loading="lazy" /> : (name || "?").charAt(0).toUpperCase()}
        </span>
    );
}

/** Filled stars for a problem's reward (Easy 1, Medium 2, Hard 3). */
export function Stars({ count = 1, max = 3, size = 13, label }) {
    return (
        <span className="stars" title={label || `${count} star${count === 1 ? "" : "s"}`} aria-label={label || `${count} stars`}>
            {Array.from({ length: max }, (_, i) => (
                <Icon key={i} name="star" size={size} className={i < count ? "" : "off"} filled />
            ))}
        </span>
    );
}

export function Difficulty({ level = "Easy", as = "text" }) {
    const cls = level.toLowerCase();
    return as === "tag" ? <span className={`tag ${cls}`}>{level}</span> : <span className={`diff ${cls}`}>{level}</span>;
}

const pad = (n) => String(n).padStart(2, "0");

/** Splits milliseconds into a readable countdown. */
// eslint-disable-next-line react-refresh/only-export-components
export const formatCountdown = (ms) => {
    if (ms <= 0) return "0s";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
    return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
};

/** Re-renders every second and returns ms left until `target` (0 when passed). */
// eslint-disable-next-line react-refresh/only-export-components
export function useCountdown(target) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    return Math.max(0, new Date(target).getTime() - now);
}

export function Countdown({ to, prefix }) {
    const left = useCountdown(to);
    return (
        <span className="countdown num">
            {prefix && <span className="countdown-label">{prefix}</span>}
            {formatCountdown(left)}
        </span>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const formatDateTime = (value) =>
    new Date(value).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// eslint-disable-next-line react-refresh/only-export-components
export const timeAgo = (value) => {
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 30 * 86400) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(value).toLocaleDateString();
};
