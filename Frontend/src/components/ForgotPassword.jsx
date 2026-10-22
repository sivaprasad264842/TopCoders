import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword, getErrorMessage } from "../api";
import Icon from "../ui/Icon";
import AuthLayout from "./auth/AuthLayout";

function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await forgotPassword(email.trim());
            setSent(data.message);
        } catch (err) {
            setError(getErrorMessage(err, "Could not send the reset email."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={sent ? "Check your inbox" : "Reset your password"}
            subtitle={sent ? "" : "Enter your account email and we'll send a link to choose a new password."}
            footer={
                <>
                    Remembered it? <Link to="/login">Back to log in</Link>
                </>
            }
        >
            {sent ? (
                <>
                    <div className="sent-card">
                        <span className="sent-icon">
                            <Icon name="mail" size={22} />
                        </span>
                        <p>{sent}</p>
                    </div>
                    <div className="auth-actions">
                        <button className="btn btn-ghost" onClick={() => setSent("")}>
                            Try another email
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {error && (
                        <div className="notice error" role="alert">
                            {error}
                        </div>
                    )}
                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="field">
                            <label htmlFor="forgot-email">Email</label>
                            <input
                                id="forgot-email"
                                type="email"
                                autoComplete="email"
                                required
                                autoFocus
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>
                        <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="spinner" /> Sending link
                                </>
                            ) : (
                                "Send reset link"
                            )}
                        </button>
                    </form>
                </>
            )}
        </AuthLayout>
    );
}

export default ForgotPassword;
