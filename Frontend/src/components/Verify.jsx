import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../api";

function Verify() {
    const { token } = useParams();
    const navigate = useNavigate();
    // The link is single-use; make sure we only spend it once
    // (React StrictMode runs effects twice in development).
    const requestedRef = useRef(false);

    useEffect(() => {
        if (requestedRef.current) return;
        requestedRef.current = true;

        API.get(`/auth/verify/${token}`)
            .then(() => navigate("/login?verified=true", { replace: true }))
            .catch((err) => {
                const code = err.response?.data?.code;
                navigate(
                    code === "ALREADY_VERIFIED" ? "/login?already=true" : "/login?error=verification_failed",
                    { replace: true },
                );
            });
    }, [token, navigate]);

    return <h2 style={{ textAlign: "center", marginTop: "20vh" }}>Verifying your email...</h2>;
}

export default Verify;
