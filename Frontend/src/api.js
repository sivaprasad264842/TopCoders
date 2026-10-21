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

const AUTH_KEYS = ["token", "userId", "email", "username"];

export const getToken = () => localStorage.getItem("token");

export const clearAuth = () => AUTH_KEYS.forEach((key) => localStorage.removeItem(key));

API.interceptors.request.use((req) => {
    const token = getToken();
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
});

API.interceptors.response.use(
    (res) => res,
    (err) => {
        // An expired/invalid session on an authenticated call: log out locally.
        if (err.response?.status === 401 && err.config?.headers?.Authorization) {
            clearAuth();
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

export const getCurrentUser = () => API.get("/auth/me");
export const updateCurrentUser = (data) => API.put("/auth/me", data);
export const getLeaderboard = () => API.get("/auth/leaderboard");
export const getProblems = () => API.get("/problems/all");
export const createProblem = (data) => API.post("/problems/create", data);
export const getProblemById = (id) => API.get(`/problems/${id}`);
export const updateProblem = (id, data) => API.put(`/problems/${id}`, data);
export const deleteProblem = (id) => API.delete(`/problems/${id}`);

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
