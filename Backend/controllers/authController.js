import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import PendingUser from "../models/PendingUser.js";
import User from "../models/User.js";
import { avatarField, avatarUrl, decodeDataUrl } from "../utils/avatar.js";
import sendEmail from "../utils/sendEmail.js";
import { signToken } from "../middleware/authMiddleware.js";
import { isAdmin } from "../utils/roles.js";
import { badgesFor } from "../utils/stars.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL_MS = 30 * 60_000;
const RESET_TTL_MS = 30 * 60_000;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
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
    stars: user.stars || 0,
    badges: badgesFor(user.stars || 0),
    isAdmin: isAdmin(user),
    createdAt: user.createdAt,
});

/** Returns an error message, or "" when the password is acceptable. */
const checkPassword = (password) => {
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return "Password must include at least one letter and one number.";
    }
    return "";
};

/** Branded email with one call-to-action button. */
const actionEmail = ({ heading, body, buttonText, link, footer }) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:24px;color:#14213d">
  <h2 style="margin:0 0 12px">${heading}</h2>
  <p style="line-height:1.5">${body}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#b8862b;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${buttonText}</a></p>
  <p style="color:#5b6b82;font-size:13px;line-height:1.5">${footer}</p>
</div>`;

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
    const passwordError = checkPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
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
            html: actionEmail({
                heading: "Welcome to TopCoders",
                body: "Confirm your email to activate your account. The link is valid for 30 minutes.",
                buttonText: "Verify account",
                link,
                footer: "If you did not sign up, you can ignore this email.",
            }),
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

    res.json({ token: signToken(user), userId: user._id, email: user.email, username: user.username });
};

// ---------------------------------------------------------------------------
// Account recovery and security

const GENERIC_RESET_REPLY = {
    message: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).",
};

/** Emails a single-use reset link. Same reply whether or not the account exists. */
export const forgotPassword = async (req, res) => {
    const email = String(req.body?.email || "").trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

    const user = await User.findOne(emailQuery(email));
    if (!user) return res.json(GENERIC_RESET_REPLY);

    const token = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = sha256(token);
    user.resetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const link = `${appUrl()}/reset-password/${token}`;
    try {
        await sendEmail({
            to: user.email,
            subject: "Reset your TopCoders password",
            text: `Reset your TopCoders password (link valid for 30 minutes): ${link}`,
            html: actionEmail({
                heading: "Reset your password",
                body: "Someone asked to reset the password for your TopCoders account. The link is valid for 30 minutes and works once.",
                buttonText: "Choose a new password",
                link,
                footer: "If this wasn't you, ignore this email. Your password stays the same.",
            }),
        });
    } catch (err) {
        console.error("Reset email error:", err.message);
        return res.status(502).json({ error: "Could not send the reset email. Please try again." });
    }

    res.json(GENERIC_RESET_REPLY);
};

/** Sets a new password from a valid reset link and signs out every device. */
export const resetPassword = async (req, res) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");

    const passwordError = checkPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = token ? await User.findOne({ resetTokenHash: sha256(token) }) : null;
    if (!user || !user.resetExpiresAt || user.resetExpiresAt.getTime() < Date.now()) {
        return res.status(400).json({
            error: "This reset link is invalid or has expired. Request a new one.",
            code: "INVALID_TOKEN",
        });
    }

    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.resetTokenHash = undefined;
    user.resetExpiresAt = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.json({ message: "Password updated. Log in with your new password." });
};

/** Sends a fresh verification link to a sign-up that has not been verified yet. */
export const resendVerification = async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const reply = { message: "If that email is waiting for verification, a new link is on its way." };

    const pending = await PendingUser.findOne({ email });
    if (!pending) return res.json(reply);

    const token = crypto.randomBytes(32).toString("hex");
    pending.tokenHash = sha256(token);
    pending.expiresAt = new Date(Date.now() + VERIFY_TTL_MS);
    await pending.save();

    const link = `${appUrl()}/verify/${token}`;
    try {
        await sendEmail({
            to: email,
            subject: "Your new TopCoders verification link",
            text: `Verify your TopCoders account (link valid for 30 minutes): ${link}`,
            html: actionEmail({
                heading: "Verify your account",
                body: "Here is a new verification link. It is valid for 30 minutes.",
                buttonText: "Verify account",
                link,
                footer: "If you did not sign up, you can ignore this email.",
            }),
        });
    } catch (err) {
        console.error("Resend verification error:", err.message);
        return res.status(502).json({ error: "Could not send the email. Please try again." });
    }

    res.json(reply);
};

/** Changes the password (current one required). Other devices are signed out; this one gets a new token. */
export const changePassword = async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(400).json({ error: "Current password is incorrect." });
    }
    const passwordError = checkPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (await bcrypt.compare(newPassword, user.password)) {
        return res.status(400).json({ error: "Choose a password different from the current one." });
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.json({ message: "Password changed. Other devices were signed out.", token: signToken(user) });
};

/** Ends every session of this account, including the current one. */
export const logoutAll = async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.json({ message: "Signed out on all devices." });
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

/** Public: top 100 users by stars, then problems solved. Emails and phone numbers are never exposed. */
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
                stars: { $ifNull: ["$stars", 0] },
                solvedCount: { $size: { $ifNull: ["$solvedProblems", []] } },
            },
        },
        { $sort: { stars: -1, solvedCount: -1, username: 1 } },
        { $limit: 100 },
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
            stars: user.stars,
            badges: badgesFor(user.stars).map((b) => b.id),
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
