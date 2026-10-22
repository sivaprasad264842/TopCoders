import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AUTH_EVENT } from "./api";
import { MeProvider } from "./hooks/useMe";
import { FeedbackProvider } from "./ui/Feedback";
import AppHeader from "./components/AppHeader";
import Register from "./components/Register";
import Login from "./components/Login";
import Verify from "./components/Verify";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import ProblemsPage from "./pages/ProblemsPage";
import ProblemPage from "./pages/ProblemPage";
import HackathonsPage from "./pages/HackathonsPage";
import HackathonPage from "./pages/HackathonPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import "./styles/layout.css";

/** When the API reports an expired or revoked session, go to login and come back after. */
function SessionWatcher() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const onAuth = (e) => {
            if (e.detail?.reason !== "expired") return;
            const back = encodeURIComponent(location.pathname + location.search);
            navigate(`/login?expired=1&redirect=${back}`, { replace: true });
        };
        window.addEventListener(AUTH_EVENT, onAuth);
        return () => window.removeEventListener(AUTH_EVENT, onAuth);
    }, [navigate, location]);

    return null;
}

/** Scroll to the top when the page (not just the query string) changes. */
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        // Braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup.
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

/** Fresh page state (code, verdict, tabs) when moving between problems. */
function ProblemRoute() {
    const { id } = useParams();
    return <ProblemPage key={id} />;
}

function NotFound() {
    return (
        <div className="app">
            <AppHeader />
            <div className="page-center">
                <div className="empty">
                    <strong>This page doesn't exist</strong>
                    The link may be broken or the page was removed.
                    <Link to="/" className="btn btn-primary">
                        Go to problems
                    </Link>
                </div>
            </div>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <FeedbackProvider>
                <MeProvider>
                    <SessionWatcher />
                    <ScrollToTop />
                    <Routes>
                        <Route path="/" element={<ProblemsPage />} />
                        <Route path="/home" element={<Navigate to="/" replace />} />
                        <Route path="/problems" element={<Navigate to="/" replace />} />
                        <Route path="/problem/:id" element={<ProblemRoute />} />

                        <Route path="/hackathons" element={<HackathonsPage />} />
                        <Route path="/hackathons/:slug" element={<HackathonPage />} />
                        <Route path="/leaderboard" element={<LeaderboardPage />} />
                        <Route path="/u/:username" element={<ProfilePage />} />
                        <Route path="/settings" element={<SettingsPage />} />

                        <Route path="/register" element={<Register />} />
                        <Route path="/verify/:token" element={<Verify />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password/:token" element={<ResetPassword />} />

                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </MeProvider>
            </FeedbackProvider>
        </BrowserRouter>
    );
}

export default App;
