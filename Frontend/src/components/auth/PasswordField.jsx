import { useId, useState } from "react";
import Icon from "../../ui/Icon";

/** Password input with show/hide toggle and a Caps Lock warning. */
export function PasswordField({ label, value, onChange, autoComplete = "current-password", invalid, hint, ...rest }) {
    const id = useId();
    const [visible, setVisible] = useState(false);
    const [capsOn, setCapsOn] = useState(false);

    const checkCaps = (e) => setCapsOn(Boolean(e.getModifierState?.("CapsLock")));

    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <div className="password-wrap">
                <input
                    id={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyUp={checkCaps}
                    onKeyDown={checkCaps}
                    onBlur={() => setCapsOn(false)}
                    autoComplete={autoComplete}
                    aria-invalid={invalid ? "true" : undefined}
                    required
                    {...rest}
                />
                <button
                    type="button"
                    className={`reveal-btn ${visible ? "on" : ""}`}
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                >
                    <Icon name={visible ? "eyeOff" : "eye"} size={17} />
                </button>
            </div>
            {capsOn && <span className="field-warn">Caps Lock is on</span>}
            {hint && !capsOn && <span className="field-hint">{hint}</span>}
        </div>
    );
}

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

/** Same minimum rule as the API: 8+ characters with a letter and a number. */
// eslint-disable-next-line react-refresh/only-export-components
export const passwordProblem = (password) => {
    if (password.length < 8) return "Use at least 8 characters.";
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
    return "";
};

const scorePassword = (pw) => {
    if (pw.length < 8) return 0;
    let score = 1;
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score += 1;
    return Math.min(score, 4);
};

/** Four-segment strength meter shown under a new-password field. */
export function PasswordStrength({ password }) {
    if (!password) return null;
    const score = scorePassword(password);
    return (
        <div className={`strength s${score}`} aria-live="polite">
            <div className="strength-bars" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={n <= score ? "filled" : ""} />
                ))}
            </div>
            <span>{LABELS[score]}</span>
        </div>
    );
}
