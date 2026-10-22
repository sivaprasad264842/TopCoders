import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { verifyEmail } from "../api";
import AuthLayout from "./auth/AuthLayout";

function Verify() {
    const { token } = useParams();
    const navigate = useNavigate();
    // The link is single-use; make sure we only spend it once
    // (React StrictMode runs effects twice in development).
    const requestedRef = useRef(false);

    useEffect(() => {
        if (requestedRef.current) return;
        requestedRef.current = true;

        verifyEmail(token)
            .then(() => navigate("/login?verified=true", { replace: true }))
            .catch((err) => {
                const code = err.response?.data?.code;
                navigate(code === "ALREADY_VERIFIED" ? "/login?already=true" : "/login?error=verification_failed", {
                    replace: true,
                });
            });
    }, [token, navigate]);

    return (
        <AuthLayout title="Verifying your email">
            <div className="verify-wait">
                <span className="spinner" />
                <p>This takes a second. You'll go to the login page next.</p>
            </div>
        </AuthLayout>
    );
}

export default Verify;
