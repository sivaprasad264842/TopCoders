import { useState } from "react";
import { changePassword, getErrorMessage, updateAuth, updateCurrentUser } from "../api";
import { useSignOut } from "../hooks/useSignOut";
import { Avatar } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import { PasswordField, PasswordStrength, passwordProblem } from "./auth/PasswordField";

const formFrom = (p) => ({
    username: p?.username || "",
    bio: p?.bio || "",
    profilePicture: p?.profilePicture || "",
    socialLinks: {
        github: p?.socialLinks?.github || "",
        linkedin: p?.socialLinks?.linkedin || "",
        website: p?.socialLinks?.website || "",
    },
    phone: p?.phone || "",
    resume: p?.resume || "",
});

export function EditProfileForm({ profile, onSaved }) {
    const { toast } = useFeedback();
    const [form, setForm] = useState(() => formFrom(profile));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
    const setLink = (field, value) => setForm((f) => ({ ...f, socialLinks: { ...f.socialLinks, [field]: value } }));

    const pickImage = (file) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) return setError("Choose an image file (PNG, JPG or WebP).");
        if (file.size > 1_400_000) return setError("Choose an image smaller than 1.4 MB.");
        const reader = new FileReader();
        reader.onload = () => {
            set("profilePicture", reader.result || "");
            setError("");
        };
        reader.readAsDataURL(file);
    };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const { data } = await updateCurrentUser(form);
            updateAuth({ username: data.username || "" });
            toast("Profile saved");
            onSaved?.(data);
        } catch (err) {
            setError(getErrorMessage(err, "Could not save profile changes."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="drawer-form" onSubmit={save}>
            <div className="photo-row">
                <Avatar name={form.username || profile.email} src={form.profilePicture} size="xl" />
                <div className="photo-actions">
                    <label className="btn btn-ghost btn-sm">
                        Upload photo
                        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
                    </label>
                    {form.profilePicture && (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => set("profilePicture", "")}>
                            Remove
                        </button>
                    )}
                </div>
            </div>

            <div className="form-grid even">
                <label className="field">
                    Username <span className="field-hint">your public profile is /u/{form.username || "name"}</span>
                    <input value={form.username} maxLength={40} onChange={(e) => set("username", e.target.value)} />
                </label>
                <label className="field">
                    Phone <span className="field-hint">private, only you see it</span>
                    <input value={form.phone} maxLength={24} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                </label>
            </div>
            <label className="field">
                Bio <span className="field-hint">{form.bio.length}/240</span>
                <textarea value={form.bio} maxLength={240} onChange={(e) => set("bio", e.target.value)} placeholder="What are you practising for?" />
            </label>
            <div className="form-grid even">
                <label className="field">
                    GitHub
                    <input type="url" value={form.socialLinks.github} onChange={(e) => setLink("github", e.target.value)} placeholder="https://github.com/you" />
                </label>
                <label className="field">
                    LinkedIn
                    <input type="url" value={form.socialLinks.linkedin} onChange={(e) => setLink("linkedin", e.target.value)} placeholder="https://linkedin.com/in/you" />
                </label>
                <label className="field">
                    Website
                    <input type="url" value={form.socialLinks.website} onChange={(e) => setLink("website", e.target.value)} placeholder="https://" />
                </label>
                <label className="field">
                    Resume link
                    <input type="url" value={form.resume} onChange={(e) => set("resume", e.target.value)} placeholder="https://.../resume.pdf" />
                </label>
            </div>

            {error && <div className="notice error">{error}</div>}

            <div className="form-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setForm(formFrom(profile))}>
                    Reset
                </button>
                <button className="btn btn-primary" disabled={saving}>
                    {saving && <span className="spinner" />}
                    Save profile
                </button>
            </div>
        </form>
    );
}

export function SecurityPanel() {
    const { toast } = useFeedback();
    const { signOutEverywhere } = useSignOut();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const mismatch = confirm.length > 0 && confirm !== next;

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        const problem = passwordProblem(next);
        if (problem) return setError(problem);
        if (next !== confirm) return setError("New passwords don't match.");

        setSaving(true);
        try {
            const { data } = await changePassword({ currentPassword: current, newPassword: next });
            updateAuth({ token: data.token }); // this device stays signed in
            setCurrent("");
            setNext("");
            setConfirm("");
            toast(data.message);
        } catch (err) {
            setError(getErrorMessage(err, "Could not change the password."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-panel">
            <form className="card card-pad drawer-form" onSubmit={submit}>
                <h3>Change password</h3>
                <PasswordField label="Current password" value={current} onChange={setCurrent} />
                <div className="form-grid even">
                    <div>
                        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
                        <PasswordStrength password={next} />
                    </div>
                    <PasswordField
                        label="Confirm new password"
                        value={confirm}
                        onChange={setConfirm}
                        autoComplete="new-password"
                        invalid={mismatch}
                        hint={mismatch ? "Passwords don't match yet." : undefined}
                    />
                </div>
                {error && <div className="notice error">{error}</div>}
                <div className="form-actions">
                    <button className="btn btn-primary" disabled={saving}>
                        {saving && <span className="spinner" />}
                        Change password
                    </button>
                </div>
            </form>

            <div className="danger-zone">
                <div>
                    <h4>Sign out of all devices</h4>
                    <p>Use this if you logged in on a shared computer or think someone else has access.</p>
                </div>
                <button className="btn btn-danger" onClick={signOutEverywhere}>
                    Sign out everywhere
                </button>
            </div>
        </div>
    );
}
