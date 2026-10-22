import { useId } from "react";

/**
 * TopCoders mark: a T and an open C that wraps toward the T's stem on an
 * indigo tile, with an apricot star (the stars you earn) above the C.
 */
export function LogoMark({ size = 32, title = "TopCoders" }) {
    const id = useId().replace(/:/g, "");
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title} className="logo-mark">
            <defs>
                <linearGradient id={`tc-g-${id}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#5b67e8" />
                    <stop offset="1" stopColor="#7a58e0" />
                </linearGradient>
            </defs>
            <rect width="40" height="40" rx="11" fill={`url(#tc-g-${id})`} />
            <path d="M8.5 12.5h13.5M15.25 12.5v16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
            <path d="M29.6 16.1A7 7 0 1 0 29.6 27.9" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
            <path d="M31.6 5.6l1.2 2.7 2.7 1.2-2.7 1.2-1.2 2.7-1.2-2.7-2.7-1.2 2.7-1.2z" fill="#f5b04a" />
        </svg>
    );
}

export default function Logo({ size = 30, showName = true }) {
    return (
        <span className="logo">
            <LogoMark size={size} />
            {showName && (
                <span className="logo-word">
                    Top<span>Coders</span>
                </span>
            )}
        </span>
    );
}
