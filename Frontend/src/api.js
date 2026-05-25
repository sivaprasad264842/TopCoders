import axios from "axios";

const getApiBaseUrl = () => {
    const configuredUrl = import.meta.env.VITE_API_URL?.trim();

    if (configuredUrl && /^https?:\/\//i.test(configuredUrl)) {
        return configuredUrl;
    }

    if (configuredUrl) {
        console.warn(
            `Ignoring invalid VITE_API_URL "${configuredUrl}". Expected http:// or https://.`,
        );
    }

    const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

    return isLocalhost
        ? "http://localhost:5000/api"
        : "https://api.topcoders.online/api";
};

const API = axios.create({
    baseURL: getApiBaseUrl(),
});

API.interceptors.request.use((req) => {
    const token = localStorage.getItem("token");

    if (token) {
        req.headers.Authorization = `Bearer ${token}`;
    }

    return req;
});

API.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            console.log("Token expired or unauthorized");
            localStorage.removeItem("token");
            localStorage.removeItem("userId");
            localStorage.removeItem("email");
        }
        return Promise.reject(err);
    },
);

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
export const getMyProblemSubmissions = (problemId) =>
    API.get(`/code/submissions/problem/${problemId}`);
export const getProblemLeaderboard = (problemId) =>
    API.get(`/code/leaderboard/problem/${problemId}`);

export default API;
