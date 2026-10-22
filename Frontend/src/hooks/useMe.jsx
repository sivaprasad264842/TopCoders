import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentUser } from "../api";
import { useAuth } from "./useAuth";

const MeContext = createContext({ me: null, refreshMe: () => {}, setMe: () => {} });

/**
 * The logged-in user's profile (stars, avatar, admin flag), loaded once and
 * shared by the header, sidebars and pages. Cleared on logout.
 */
export function MeProvider({ children }) {
    const { isLoggedIn, token } = useAuth();
    const [me, setMe] = useState(null);

    const refreshMe = useCallback(() => {
        if (!token) return Promise.resolve(null);
        return getCurrentUser()
            .then((res) => {
                setMe(res.data);
                return res.data;
            })
            .catch(() => null);
    }, [token]);

    useEffect(() => {
        if (!isLoggedIn) return undefined;
        let active = true;
        getCurrentUser()
            .then((res) => active && setMe(res.data))
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [isLoggedIn, token]);

    return (
        <MeContext.Provider value={{ me: isLoggedIn ? me : null, refreshMe, setMe }}>{children}</MeContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useMe = () => useContext(MeContext);
