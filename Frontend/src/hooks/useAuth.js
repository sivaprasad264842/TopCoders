import { useEffect, useState } from "react";
import { AUTH_EVENT, getAuthValue } from "../api";

const read = () => ({
    token: getAuthValue("token"),
    userId: getAuthValue("userId"),
    email: getAuthValue("email") || "",
    username: getAuthValue("username") || "",
});

/** Current login state; re-renders on login, logout, expiry and other tabs' changes. */
export function useAuth() {
    const [auth, setAuth] = useState(read);

    useEffect(() => {
        const sync = () => setAuth(read());
        window.addEventListener(AUTH_EVENT, sync);
        window.addEventListener("storage", sync); // logout in another tab
        return () => {
            window.removeEventListener(AUTH_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);

    return { ...auth, isLoggedIn: Boolean(auth.token) };
}
