import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clearAuth, getErrorMessage, resetPassword } from "../api";
import AuthLayout from "./auth/AuthLayout";
import { PasswordField, PasswordStrength, passwordProblem } from "./auth/PasswordField";

function ResetPassword() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [expired, setExpired] = useState(false);

    const mismatch = confirm.length > 0 && confirm !== password;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        const problem = passwordProblem(password);
        if (problem) return setError(problem);
        if (password !== confirm) return setError("Passwords don't match.");

        setLoading(true);
        try {
            await resetPassword(token, password);
            clearAuth({ silent: true }); // every old session is now invalid
            navigate("/login?reset=1", { replace: true });
        } catch (err) {
            setExpired(err.response?.data?.code === "INVALID_TOKEN");
            setError(getErrorMessage(err, "Could not update the password."));
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Choose a new password"
            subtitle="After this, you'll be signed out on every device."
            footer={
                <>
                    <Link to="/login">Back to log in</Link>
                </>
            }
        >
            {error && (
                <div className="notice error" role="alert">
                    {error} {expired && <Link to="/forgot-password">Request a new link</Link>}
                </div>
            )}
            <form className="auth-form" onSubmit={handleSubmit}>
                <div>
                    <PasswordField
                        label="New password"
                        value={password}
                        onChange={setPassword}
                        autoComplete="new-password"
                        autoFocus
                        hint="At least 8 characters, with a letter and a number."
                    />
                    <PasswordStrength password={password} />
                </div>
                <PasswordField
                    label="Confirm new password"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                    invalid={mismatch}
                    hint={mismatch ? "Passwords don't match yet." : undefined}
                />
                <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
                    {loading ? (
                        <>
                            <span className="spinner" /> Saving
                        </>
                    ) : (
                        "Save new password"
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}

export default ResetPassword;
