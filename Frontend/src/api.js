import axios from "axios";

const getApiBaseUrl = () => {
    const configuredUrl = import.meta.env.VITE_API_URL?.trim();

    if (configuredUrl && /^https?:\/\//i.test(configuredUrl)) {
        return configuredUrl.replace(/\/+$/, "");
    }

    if (configuredUrl) {
        console.warn(`Ignoring invalid VITE_API_URL "${configuredUrl}". Expected http:// or https://.`);
    }

    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return isLocalhost ? "http://localhost:5000/api" : "https://api.topcoders.online/api";
};

export const API_BASE_URL = getApiBaseUrl();

const API = axios.create({ baseURL: API_BASE_URL });

// ── Login state ─────────────────────────────────────────────────────────────
// "Remember me" keeps the session in localStorage (survives browser restarts);
// otherwise sessionStorage, which the browser clears when the tab closes.

const AUTH_KEYS = ["token", "userId", "email", "username"];
export const AUTH_EVENT = "topcoders:auth";

const safe = (fn, fallback = null) => {
    try {
        return fn();
    } catch {
        return fallback;
    }
};

const activeStore = () =>
    safe(() => (localStorage.getItem("token") ? localStorage : sessionStorage.getItem("token") ? sessionStorage : null));

export const getAuthValue = (key) => safe(() => activeStore()?.getItem(key) || null);
export const getToken = () => getAuthValue("token");

const notify = (reason) => window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { reason } }));

export const saveAuth = ({ token, userId, email, username }, remember = true) => {
    clearAuth({ silent: true });
    const store = remember ? localStorage : sessionStorage;
    safe(() => {
        store.setItem("token", token);
        store.setItem("userId", userId);
        store.setItem("email", email || "");
        store.setItem("username", username || "");
    });
    notify("login");
};

/** Updates stored profile fields (or a refreshed token) without changing where they live. */
export const updateAuth = (values) => {
    const store = activeStore();
    if (!store) return;
    safe(() => Object.entries(values).forEach(([key, value]) => store.setItem(key, value ?? "")));
    notify("update");
};

export const clearAuth = ({ silent = false, reason = "logout" } = {}) => {
    safe(() => AUTH_KEYS.forEach((key) => [localStorage, sessionStorage].forEach((s) => s.removeItem(key))));
    if (!silent) notify(reason);
};

API.interceptors.request.use((req) => {
    const token = getToken();
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
});

API.interceptors.response.use(
    (res) => res,
    (err) => {
        // An expired or revoked session on an authenticated call: log out locally
        // and let the app send the user to the login page with a notice.
        if (err.response?.status === 401 && err.config?.headers?.Authorization && getToken()) {
            clearAuth({ reason: "expired" });
        }
        return Promise.reject(err);
    },
);

/** One place to turn any API failure into a readable message. */
export const getErrorMessage = (err, fallback = "Something went wrong. Please try again.") =>
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.response?.data?.msg ||
    (err?.code === "ERR_NETWORK" ? "Cannot reach the server. Check your connection." : "") ||
    err?.message ||
    fallback;

// ── Auth & account ──────────────────────────────────────────────────────────
export const login = (data) => API.post("/auth/login", data);
export const register = (data) => API.post("/auth/register", data);
export const verifyEmail = (token) => API.get(`/auth/verify/${token}`);
export const resendVerification = (email) => API.post("/auth/resend-verification", { email });
export const forgotPassword = (email) => API.post("/auth/forgot-password", { email });
export const resetPassword = (token, password) => API.post("/auth/reset-password", { token, password });
export const changePassword = (data) => API.put("/auth/password", data);
export const logoutEverywhere = () => API.post("/auth/logout-all");

export const getCurrentUser = () => API.get("/auth/me");
export const updateCurrentUser = (data) => API.put("/auth/me", data);
export const getLeaderboard = () => API.get("/auth/leaderboard");
export const getPublicProfile = (username) => API.get(`/users/${encodeURIComponent(username)}`);

// ── Problems & code ─────────────────────────────────────────────────────────
export const getProblems = () => API.get("/problems/all");
export const createProblem = (data) => API.post("/problems/create", data);
export const getProblemById = (id) => API.get(`/problems/${id}`);
export const updateProblem = (id, data) => API.put(`/problems/${id}`, data);
export const deleteProblem = (id) => API.delete(`/problems/${id}`);
export const getTags = () => API.get("/problems/tags");
export const getDailyProblem = () => API.get("/problems/daily");

// ── Comments ────────────────────────────────────────────────────────────────
export const getComments = (problemId, sort = "top") => API.get(`/problems/${problemId}/comments`, { params: { sort } });
export const addComment = (problemId, body, parentId) => API.post(`/problems/${problemId}/comments`, { body, parentId });
export const editComment = (commentId, body) => API.put(`/comments/${commentId}`, { body });
export const removeComment = (commentId) => API.delete(`/comments/${commentId}`);
export const voteComment = (commentId) => API.post(`/comments/${commentId}/vote`);

// ── Hackathons ──────────────────────────────────────────────────────────────
export const getHackathons = () => API.get("/hackathons");
export const getHackathon = (slug) => API.get(`/hackathons/${slug}`);
export const getStandings = (slug) => API.get(`/hackathons/${slug}/standings`);
export const registerHackathon = (slug) => API.post(`/hackathons/${slug}/register`);
export const unregisterHackathon = (slug) => API.delete(`/hackathons/${slug}/register`);
export const createHackathon = (data) => API.post("/hackathons", data);
export const updateHackathon = (slug, data) => API.put(`/hackathons/${slug}`, data);
export const deleteHackathon = (slug) => API.delete(`/hackathons/${slug}`);

export const runCode = (data) => API.post("/code/run", data);
export const submitCode = (data) => API.post("/code/submit", data);
export const getAnalysisStatus = () => API.get("/code/analyze/status");
export const analyzeCode = (data) => API.post("/code/analyze", data);
export const getMySubmissions = () => API.get("/code/submissions/me");
export const getMyProblemSubmissions = (problemId) => API.get(`/code/submissions/problem/${problemId}`);
export const getProblemLeaderboard = (problemId) => API.get(`/code/leaderboard/problem/${problemId}`);

// ── Code sandbox session ────────────────────────────────────────────────────

/** Starts the user's sandbox if needed and keeps it alive. Resolves to { status }. */
export const sendHeartbeat = () => API.post("/session/heartbeat").then((res) => res.data);

/**
 * Tells the backend the user left. Works during tab close: sendBeacon is
 * delivered even as the page unloads. It cannot send headers, so the token
 * goes in a text/plain body (never in the URL).
 * immediate=true (logout) stops the sandbox now; otherwise after a short grace
 * period that a page refresh cancels.
 */
export const endRunnerSession = ({ immediate = false } = {}) => {
    const token = getToken();
    if (!token) return;

    const url = `${API_BASE_URL}/session/end`;
    const body = JSON.stringify({ token, immediate });
    const blob = new Blob([body], { type: "text/plain" });

    if (!navigator.sendBeacon?.(url, blob)) {
        fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(
            () => {},
        );
    }
};

export default API;
