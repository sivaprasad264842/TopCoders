import { useEffect, useRef, useState } from "react";
import { endRunnerSession, getErrorMessage, sendHeartbeat } from "../api";

const READY_INTERVAL_MS = 30_000; // keep-alive while the sandbox is up
const STARTING_INTERVAL_MS = 3_000; // poll quickly during a cold start
const ACTIVITY_WINDOW_MS = 10 * 60_000; // no input for 10 min = user is away
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];

/**
 * Keeps the user's on-demand code sandbox alive while they actively use the
 * problem page.
 *
 * - Heartbeats only while the tab is visible AND the user interacted recently,
 *   so a forgotten open tab does not keep a paid server running all day.
 * - Leaving the page / closing the tab releases the sandbox after a short
 *   grace period (a refresh sends a new heartbeat and cancels it).
 *
 * Returns { status: "idle" | "starting" | "ready" | "error", message }.
 */
export function useRunnerSession(enabled) {
    const [state, setState] = useState({ status: "idle", message: "" });
    const lastActivityRef = useRef(0);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        let timer = null;
        lastActivityRef.current = Date.now();

        const isActive = () =>
            document.visibilityState === "visible" &&
            Date.now() - lastActivityRef.current < ACTIVITY_WINDOW_MS;

        const schedule = (ms) => {
            clearTimeout(timer);
            timer = setTimeout(beat, ms);
        };

        async function beat() {
            if (cancelled) return;
            if (!isActive()) {
                setState((s) => (s.status === "ready" ? { status: "idle", message: "" } : s));
                schedule(READY_INTERVAL_MS);
                return;
            }
            try {
                const { status } = await sendHeartbeat();
                if (cancelled) return;
                setState({ status, message: "" });
                schedule(status === "starting" ? STARTING_INTERVAL_MS : READY_INTERVAL_MS);
            } catch (err) {
                if (cancelled) return;
                setState({ status: "error", message: getErrorMessage(err, "Sandbox unavailable.") });
                schedule(READY_INTERVAL_MS);
            }
        }

        const onActivity = () => {
            const wasAway = !isActive();
            lastActivityRef.current = Date.now();
            if (wasAway) beat(); // came back: wake the sandbox right away
        };

        const onVisibility = () => {
            if (document.visibilityState === "visible") onActivity();
        };

        // pagehide fires reliably on tab close, navigation and mobile app switch.
        const onPageHide = () => endRunnerSession();

        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", onPageHide);
        beat();

        return () => {
            cancelled = true;
            clearTimeout(timer);
            ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", onPageHide);
            // Leaving the problem page inside the app: release with grace, so
            // opening another problem within a minute reuses the same sandbox.
            endRunnerSession();
        };
    }, [enabled]);

    return enabled ? state : { status: "idle", message: "" };
}
