import { useState } from "react";
import { Link } from "react-router-dom";
import API, { getErrorMessage } from "../api";
import "../CSS/Register.css";

function Register() {
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: "", type: "" });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: "", type: "" });

        
        if (password !== confirmPassword) {
            setMessage({ text: "Passwords do not match", type: "error" });
            return;
        }

        if (password.length < 6) {
            setMessage({
                text: "Password must be at least 6 characters",
                type: "error",
            });
            return;
        }

        setLoading(true);

        try {
            const res = await API.post("/auth/register", {
                email,
                username,
                password,
            });

            setMessage({
                text: res.data.message || "Verification email sent",
                type: "success",
            });

            // clear fields
            setEmail("");
            setUsername("");
            setPassword("");
            setConfirmPassword("");
        } catch (err) {
            setMessage({
                text: getErrorMessage(err, "Registration failed. Please try again."),
                type: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <h2>Create Account</h2>

                {message.text && (
                    <div className={`message ${message.type}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-box">
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder=" "
                        />
                        <label>Email</label>
                    </div>

                    <div className="input-box">
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder=" "
                        />
                        <label>User name</label>
                    </div>

                    <div className="input-box">
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder=" "
                        />
                        <label>Password</label>
                    </div>

                    <div className="input-box">
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder=" "
                        />
                        <label>Confirm Password</label>
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? "Sending..." : "Register"}
                    </button>
                </form>

                <div className="auth-link">
                    <p>
                        Already have an account? <Link to="/login">Login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Register;
