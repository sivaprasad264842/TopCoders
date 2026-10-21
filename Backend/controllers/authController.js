import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import PendingUser from "../models/PendingUser.js";
import User from "../models/User.js";
import { avatarField, avatarUrl, decodeDataUrl } from "../utils/avatar.js";
import sendEmail from "../utils/sendEmail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_MS = 30 * 60_000;
const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so login takes the same time
// whether or not an account exists (prevents account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_ROUNDS);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// CLIENT_URL may be a comma-separated CORS list; links need exactly one origin.
const appUrl = () =>
    (process.env.APP_URL || (process.env.CLIENT_URL || "").split(",")[0] || "http://localhost:5173")
        .trim()
        .replace(/\/+$/, "");

// New accounts store lowercase emails; older ones may be mixed-case.
const emailQuery = (email) => ({ email: { $in: [...new Set([email, email.toLowerCase()])] } });

const toProfile = (user) => ({
    userId: user._id,
    email: user.email,
    username: user.username,
    bio: user.bio || "",
    profilePicture: user.profilePicture || "",
    socialLinks: user.socialLinks || {},
    phone: user.phone || "",
    resume: user.resume || "",
    solvedProblems: user.solvedProblems || [],
    createdAt: user.createdAt,
});

const uniqueUsername = async (requested) => {
    const base = String(requested || "user").trim().slice(0, 32) || "user";
    let candidate = base;
    for (let suffix = 1; await User.exists({ username: candidate }); suffix += 1) {
        candidate = `${base}${suffix}`;
    }
    return candidate;
};

// ---------------------------------------------------------------------------

export const registerUser = async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    const username = String(req.body?.username || "").trim().slice(0, 40);

    if (!EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ error: "Password must be 6 to 128 characters." });
    }
    if (await User.exists(emailQuery(email))) {
        return res.status(409).json({ error: "An account with this email already exists." });
    }

    // Only a hash of the token is stored; the raw token goes in the email.
    const token = crypto.randomBytes(32).toString("hex");
    const normalizedEmail = email.toLowerCase();

    await PendingUser.findOneAndUpdate(
        { email: normalizedEmail },
        {
            email: normalizedEmail,
            username,
            passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        },
        { upsert: true },
    );

    const link = `${appUrl()}/verify/${token}`;
    try {
        await sendEmail({
            to: normalizedEmail,
            subject: "Verify your TopCoders account",
            text: `Welcome to TopCoders! Verify your account (link valid for 30 minutes): ${link}`,
            html: `<h2>Welcome to TopCoders</h2>
                <p>Click the button below to verify your account. The link is valid for 30 minutes.</p>
                <p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Verify account</a></p>
                <p>If you did not sign up, you can ignore this email.</p>`,
        });
    } catch (err) {
        console.error("Register email error:", err.message);
        return res.status(502).json({ error: "Could not send the verification email. Please try again." });
    }

    res.json({ message: "Verification email sent. Check your inbox (and spam folder)." });
};

export const verifyUser = async (req, res) => {
    const pending = await PendingUser.findOne({ tokenHash: sha256(String(req.params.token || "")) });

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({
            error: "This verification link is invalid or has expired. Please register again.",
            code: "INVALID_TOKEN",
        });
    }

    const alreadyVerified = async () => {
        await pending.deleteOne();
        return res.status(409).json({ error: "Account already verified. Please log in.", code: "ALREADY_VERIFIED" });
    };

    if (await User.exists(emailQuery(pending.email))) return alreadyVerified();

    try {
        await User.create({
            email: pending.email,
            password: pending.passwordHash,
            username: await uniqueUsername(pending.username || pending.email.split("@")[0]),
        });
    } catch (err) {
        if (err.code === 11000 && err.keyPattern?.email) return alreadyVerified();
        throw err;
    }

    await pending.deleteOne();
    res.json({ message: "Account verified. You can now log in." });
};

export const loginUser = async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database unavailable. Try again shortly." });
    }

    const user = await User.findOne(emailQuery(email));
    const passwordOk = await bcrypt.compare(password, user?.password || DUMMY_HASH);

    if (!user || !passwordOk) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, userId: user._id, email: user.email, username: user.username });
};

// ---------------------------------------------------------------------------

export const getCurrentUser = (req, res) => {
    // authMiddleware already loaded the user (without the password hash).
    res.json(toProfile(req.user));
};

const cleanUrl = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    try {
        return ["http:", "https:"].includes(new URL(trimmed).protocol) ? trimmed : "";
    } catch {
        return "";
    }
};

const cleanImageSource = (value) => {
    const trimmed = String(value || "").trim();
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(trimmed)) {
        return trimmed.length <= 1_500_000 ? trimmed : "";
    }
    return cleanUrl(trimmed);
};

export const updateCurrentUser = async (req, res) => {
    const { username, bio, profilePicture, socialLinks, phone, resume } = req.body || {};
    const cleanUsername = String(username || "").trim().slice(0, 40);

    if (cleanUsername) {
        const taken = await User.exists({ _id: { $ne: req.user._id }, username: cleanUsername });
        if (taken) return res.status(409).json({ error: "Username already taken." });
    }

    const update = {
        bio: String(bio || "").trim().slice(0, 240),
        profilePicture: cleanImageSource(profilePicture),
        socialLinks: {
            github: cleanUrl(socialLinks?.github),
            linkedin: cleanUrl(socialLinks?.linkedin),
            website: cleanUrl(socialLinks?.website),
        },
        phone: String(phone || "").trim().slice(0, 24),
        resume: cleanUrl(resume),
    };
    if (cleanUsername) update.username = cleanUsername;

    const user = await User.findByIdAndUpdate(req.user._id, update, {
        returnDocument: "after",
        runValidators: true,
    })
        .select("-password")
        .lean();

    res.json(toProfile(user));
};

/** Public: top 50 users by solved count. Emails and phone numbers are never exposed. */
export const getLeaderboard = async (req, res) => {
    const users = await User.aggregate([
        {
            $project: {
                username: 1,
                bio: 1,
                profilePicture: avatarField("$profilePicture"),
                socialLinks: 1,
                resume: 1,
                updatedAt: 1,
                solvedCount: { $size: { $ifNull: ["$solvedProblems", []] } },
            },
        },
        { $sort: { solvedCount: -1, username: 1 } },
        { $limit: 50 },
    ]);

    res.json(
        users.map((user, index) => ({
            rank: index + 1,
            userId: user._id,
            username: user.username || "anonymous",
            bio: user.bio || "",
            profilePicture: avatarUrl(req, user._id, user.profilePicture, user.updatedAt),
            socialLinks: user.socialLinks || {},
            resume: user.resume || "",
            solvedCount: user.solvedCount,
        })),
    );
};

/** Public: serves an uploaded profile photo as a real, cacheable image. */
export const getAvatar = async (req, res) => {
    const user = mongoose.isValidObjectId(req.params.userId)
        ? await User.findById(req.params.userId).select("profilePicture").lean()
        : null;
    const image = decodeDataUrl(user?.profilePicture);
    if (!image) return res.status(404).json({ error: "No uploaded photo." });

    // The URL carries ?v=<updatedAt>, so a changed photo gets a new URL.
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.type(image.type).send(image.bytes);
};
