import { useCallback, useEffect, useState } from "react";

const KEY = "topcoders-theme";
const EVENT = "topcoders:theme";

// index.html sets data-theme before React loads (no flash); read it back here.
const current = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Light/dark theme, applied as <html data-theme>. Every component using it stays in sync. */
export function useTheme() {
    const [theme, setTheme] = useState(current);

    useEffect(() => {
        const sync = () => setTheme(current());
        window.addEventListener(EVENT, sync);
        return () => window.removeEventListener(EVENT, sync);
    }, []);

    const toggle = useCallback(() => {
        const next = current() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(KEY, next);
        } catch {
            /* storage blocked: theme still applies for this visit */
        }
        window.dispatchEvent(new Event(EVENT));
    }, []);

    return { theme, toggle };
}
