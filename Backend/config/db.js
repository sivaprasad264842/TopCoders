import mongoose from "mongoose";

// Fail fast instead of queueing queries while the database is down.
mongoose.set("bufferCommands", false);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connects to MongoDB, retrying with exponential backoff (max 30 s) until it
 * succeeds. After the first connection the driver reconnects by itself.
 */
const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.error("MongoDB: MONGO_URI is not configured");
        return false;
    }

    for (let attempt = 1; ; attempt += 1) {
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 10_000,
                maxPoolSize: 20,
            });
            console.log("MongoDB connected");
            return true;
        } catch (err) {
            const delay = Math.min(30_000, 1000 * 2 ** attempt);
            console.error(`MongoDB connection failed (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s`);
            await sleep(delay);
        }
    }
};

export default connectDB;
