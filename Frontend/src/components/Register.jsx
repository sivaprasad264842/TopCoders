import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getErrorMessage, register, resendVerification } from "../api";
import { useAuth } from "../hooks/useAuth";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import AuthLayout from "./auth/AuthLayout";
import { PasswordField, PasswordStrength, passwordProblem } from "./auth/PasswordField";

function Register() {
    const { isLoggedIn } = useAuth();
    const { toast } = useFeedback();

    const [form, setForm] = useState({ email: "", username: "", password: "", confirm: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sentTo, setSentTo] = useState("");
    const [resending, setResending] = useState(false);

    if (isLoggedIn) return <Navigate to="/" replace />;

    const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
    const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const problem = passwordProblem(form.password);
        if (problem) return setError(problem);
        if (form.password !== form.confirm) return setError("Passwords don't match.");

        setLoading(true);
        try {
            await register({ email: form.email.trim(), username: form.username.trim(), password: form.password });
            setSentTo(form.email.trim());
        } catch (err) {
            setError(getErrorMessage(err, "Registration failed. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            const { data } = await resendVerification(sentTo);
            toast(data.message, "info");
        } catch (err) {
            toast(getErrorMessage(err, "Could not send the email."), "error");
        } finally {
            setResending(false);
        }
    };

    if (sentTo) {
        return (
            <AuthLayout
                title="Check your inbox"
                footer={
                    <>
                        Already verified? <Link to="/login">Log in</Link>
                    </>
                }
            >
                <div className="sent-card">
                    <span className="sent-icon">
                        <Icon name="mail" size={22} />
                    </span>
                    <p>
                        We sent a verification link to <strong>{sentTo}</strong>. Open it within 30 minutes to activate
                        your account. Check the spam folder if it isn't there.
                    </p>
                </div>
                <div className="auth-actions">
                    <button className="btn btn-ghost" onClick={handleResend} disabled={resending}>
                        {resending && <span className="spinner" />}
                        Resend the link
                    </button>
                    <button className="btn btn-quiet" onClick={() => setSentTo("")}>
                        Use a different email
                    </button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Create your account"
            subtitle="Free forever. Solve in JavaScript, Python, C++ or Java."
            footer={
                <>
                    Already have an account? <Link to="/login">Log in</Link>
                </>
            }
        >
            {error && (
                <div className="notice error" role="alert">
                    {error}
                </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="reg-email">Email</label>
                    <input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        required
                        autoFocus
                        value={form.email}
                        onChange={(e) => set("email")(e.target.value)}
                        placeholder="you@example.com"
                    />
                </div>

                <div className="field">
                    <label htmlFor="reg-username">
                        Username <span className="field-hint">shown on the leaderboard</span>
                    </label>
                    <input
                        id="reg-username"
                        autoComplete="username"
                        required
                        maxLength={40}
                        value={form.username}
                        onChange={(e) => set("username")(e.target.value)}
                        placeholder="ada_lovelace"
                    />
                </div>

                <div>
                    <PasswordField
                        label="Password"
                        value={form.password}
                        onChange={set("password")}
                        autoComplete="new-password"
                        hint="At least 8 characters, with a letter and a number."
                    />
                    <PasswordStrength password={form.password} />
                </div>

                <PasswordField
                    label="Confirm password"
                    value={form.confirm}
                    onChange={set("confirm")}
                    autoComplete="new-password"
                    invalid={mismatch}
                    hint={mismatch ? "Passwords don't match yet." : undefined}
                />

                <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
                    {loading ? (
                        <>
                            <span className="spinner" /> Creating account
                        </>
                    ) : (
                        "Create account"
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}

export default Register;
