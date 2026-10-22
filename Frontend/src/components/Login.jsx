import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage, login, resendVerification, saveAuth } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useFeedback } from "../ui/Feedback";
import AuthLayout from "./auth/AuthLayout";
import { PasswordField } from "./auth/PasswordField";

// Messages for links that land on /login (?verified=true, ?expired=1, ...).
const NOTICES = {
    verified: { text: "Email verified. Log in to start solving.", type: "success" },
    already: { text: "This email is already verified. Log in below.", type: "success" },
    error: { text: "That verification link is invalid or expired. Register again or request a new link below.", type: "error" },
    expired: { text: "Your session ended. Log in again to continue.", type: "info" },
    reset: { text: "Password updated. Log in with your new password.", type: "success" },
};

const noticeFrom = (params) => {
    const key = Object.keys(NOTICES).find((k) => params.get(k));
    return key ? NOTICES[key] : null;
};

// Only allow in-app redirects after login (never an outside URL).
const safeRedirect = (value) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

function Login() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { isLoggedIn } = useAuth();
    const { toast } = useFeedback();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [resendOpen, setResendOpen] = useState(params.get("error") != null);
    const [resending, setResending] = useState(false);

    const notice = noticeFrom(params);
    const redirectTo = safeRedirect(params.get("redirect"));

    if (isLoggedIn && !loading) return <Navigate to={redirectTo} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await login({ email: email.trim(), password });
            saveAuth(data, remember);
            toast(`Welcome back${data.username ? `, ${data.username}` : ""}`);
            navigate(redirectTo, { replace: true });
        } catch (err) {
            setError(getErrorMessage(err, "Login failed. Please try again."));
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!email.trim()) {
            setError("Enter your email above, then request a new link.");
            return;
        }
        setResending(true);
        try {
            const { data } = await resendVerification(email.trim());
            toast(data.message, "info");
        } catch (err) {
            toast(getErrorMessage(err, "Could not send the email."), "error");
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Log in to run code, submit solutions and track your progress."
            footer={
                <>
                    New to TopCoders? <Link to="/register">Create an account</Link>
                </>
            }
        >
            {notice && !error && <div className={`notice ${notice.type}`}>{notice.text}</div>}
            {error && (
                <div className="notice error" role="alert">
                    {error}
                </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate={false}>
                <div className="field">
                    <label htmlFor="login-email">Email</label>
                    <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                    />
                </div>

                <PasswordField label="Password" value={password} onChange={setPassword} />

                <div className="auth-row">
                    <label className="switch">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        Keep me logged in
                    </label>
                    <Link to="/forgot-password" className="quiet-link">
                        Forgot password?
                    </Link>
                </div>

                <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
                    {loading ? (
                        <>
                            <span className="spinner" /> Logging in
                        </>
                    ) : (
                        "Log in"
                    )}
                </button>
            </form>

            <div className={`disclosure ${resendOpen ? "open" : ""}`}>
                <button type="button" className="disclosure-toggle" onClick={() => setResendOpen((v) => !v)} aria-expanded={resendOpen}>
                    Didn't get the verification email?
                </button>
                {resendOpen && (
                    <div className="disclosure-body">
                        <p>Enter your email above and we'll send a new link. It's valid for 30 minutes.</p>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleResend} disabled={resending}>
                            {resending ? <span className="spinner" /> : null}
                            Send a new link
                        </button>
                    </div>
                )}
            </div>
        </AuthLayout>
    );
}

export default Login;
