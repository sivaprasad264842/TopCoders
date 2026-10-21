import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoutes.js";
import codeRoutes from "./routes/codeRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import runnerManager from "./services/runnerManager.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const allowedOrigins = () => {
    const configured = (process.env.CLIENT_URL || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    return new Set([...configured, "http://localhost:5173", "http://127.0.0.1:5173"]);
};

/** Builds the Express app (no network listening here, so tests can import it). */
export function createApp() {
    const app = express();
    const origins = allowedOrigins();

    // Behind the AWS load balancer: trust X-Forwarded-For so rate limits see the real client IP.
    app.set("trust proxy", 1);

    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use(
        cors({
            // Unknown origins get no CORS headers (browser blocks them) rather than a 500.
            origin: (origin, callback) => callback(null, !origin || origins.has(origin)),
            credentials: true,
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    );
    // 10 MB: problems carry test data and profiles may carry a small photo.
    app.use(express.json({ limit: "10mb" }));

    app.get("/", (req, res) => res.json({ message: "TopCoders API is running" }));
    app.get("/health", (req, res) => {
        res.json({
            ok: true,
            service: "backend",
            db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
            runners: runnerManager.stats(),
            timestamp: new Date().toISOString(),
        });
    });

    app.use("/api/auth", authRoutes);
    app.use("/api/problems", problemRoutes);
    app.use("/api/code", codeRoutes);
    app.use("/api/session", sessionRoutes);

    app.use(notFound);
    app.use(errorHandler);
    return app;
}
