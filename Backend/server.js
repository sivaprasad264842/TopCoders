import "dotenv/config";
import { createApp } from "./app.js";
import connectDB from "./config/db.js";
import runnerManager from "./services/runnerManager.js";

const PORT = Number(process.env.PORT) || 5000;

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set. Refusing to start.");
    process.exit(1);
}

const app = createApp();
const server = app.listen(PORT, () => {
    console.log(`API listening on ${PORT} (runner mode: ${runnerManager.mode})`);
});

server.on("error", (err) => {
    console.error(`Server failed to start: ${err.message}`);
    process.exit(1);
});

// Long submissions can exceed Node's defaults; keep these above the ALB idle timeout.
server.requestTimeout = 5 * 60_000;
server.keepAliveTimeout = 65_000;

// Don't block startup on these: /health answers immediately so the load balancer is happy.
connectDB();
runnerManager.init().catch((err) => console.error("Runner manager init failed:", err.message));

let shuttingDown = false;
const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Shutting down...`);

    setTimeout(() => process.exit(1), 10_000).unref(); // hard stop if something hangs
    await runnerManager.shutdown(); // don't leave paid runner tasks behind
    server.close(() => process.exit(0));
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
