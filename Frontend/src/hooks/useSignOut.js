import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, endRunnerSession, getErrorMessage, logoutEverywhere } from "../api";
import { useFeedback } from "../ui/Feedback";

/** Sign out here, or on every device (server revokes all tokens). */
export function useSignOut() {
    const navigate = useNavigate();
    const { toast, confirm } = useFeedback();

    const signOut = useCallback(() => {
        endRunnerSession({ immediate: true }); // stop the paid sandbox right away
        clearAuth();
        toast("Signed out", "info");
        navigate("/");
    }, [navigate, toast]);

    const signOutEverywhere = useCallback(async () => {
        const ok = await confirm({
            title: "Sign out of all devices?",
            body: "Every browser and device logged in to this account is signed out, including this one.",
            confirmText: "Sign out everywhere",
            danger: true,
        });
        if (!ok) return;

        endRunnerSession({ immediate: true });
        try {
            await logoutEverywhere();
        } catch (err) {
            toast(getErrorMessage(err, "Could not sign out other devices."), "error");
            return;
        }
        clearAuth();
        toast("Signed out on all devices", "info");
        navigate("/login");
    }, [confirm, navigate, toast]);

    return { signOut, signOutEverywhere };
}
