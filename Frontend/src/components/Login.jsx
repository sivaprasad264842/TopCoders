import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import API, { getErrorMessage } from "../api";
import "../CSS/Register.css";
import "../CSS/Login.css";

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: "", type: "" });

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        if (searchParams.get("verified") === "true") {
            setMessage({
                text: "Email verified! You can now log in.",
                type: "success",
            });
        }

        if (searchParams.get("already") === "true") {
            setMessage({
                text: "Email already verified. Please log in.",
                type: "success",
            });
        }

        
        if (searchParams.get("error")) {
            setMessage({
                text: "Verification failed or expired",
                type: "error",
            });
        }
    }, [searchParams]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: "", type: "" });
        setLoading(true);

        try {
            const res = await API.post("/auth/login", {
                email,
                password,
            });


            localStorage.setItem("token", res.data.token);
            localStorage.setItem("userId", res.data.userId);
            localStorage.setItem("email", res.data.email);
            localStorage.setItem("username", res.data.username || "");


            navigate("/");
        } catch (err) {
            setMessage({
                text: getErrorMessage(err, "Login failed. Please try again."),
                type: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <h2>Welcome Back</h2>

                {message.text && (
                    <div className={`message ${message.type}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-box">
                        <input
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder=" "
                        />
                        <label>Email</label>
                    </div>

                    <div className="input-box">
                        <input
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder=" "
                        />
                        <label>Password</label>
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                    </button>
                </form>

                <div className="auth-link">
                    <p>
                        Don't have an account?{" "}
                        <Link to="/register">Register</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Login;
