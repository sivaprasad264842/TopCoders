import mongoose from "mongoose";
import { HttpError } from "../utils/httpError.js";

export const notFound = (req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
};

/** Every error ends here, so clients always get JSON: { error, code? }. */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large." });
    }
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body is not valid JSON." });
    }
    if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
        return res.status(400).json({ error: err.message });
    }
    if (err.code === 11000) {
        return res.status(409).json({ error: "That value is already taken." });
    }
    if (err.name === "MongoNotConnectedError" || err.name === "MongooseServerSelectionError") {
        return res.status(503).json({ error: "Database unavailable. Try again shortly." });
    }

    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
};
