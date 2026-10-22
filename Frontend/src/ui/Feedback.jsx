import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const FeedbackContext = createContext(null);

/**
 * App-wide toasts and confirm dialogs, replacing window.alert / window.confirm.
 *   const { toast, confirm } = useFeedback();
 *   toast("Profile saved");                       // or toast(msg, "error")
 *   if (await confirm({ title, body, confirmText, danger: true })) { ... }
 */
export function FeedbackProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [dialog, setDialog] = useState(null);
    const idRef = useRef(0);

    const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

    const toast = useCallback(
        (message, tone = "success") => {
            const id = ++idRef.current;
            setToasts((list) => [...list.slice(-2), { id, message, tone }]);
            setTimeout(() => dismiss(id), 4200);
        },
        [dismiss],
    );

    const confirm = useCallback(
        (options) => new Promise((resolve) => setDialog({ ...options, resolve })),
        [],
    );

    const closeDialog = (answer) => {
        dialog?.resolve(answer);
        setDialog(null);
    };

    return (
        <FeedbackContext.Provider value={{ toast, confirm }}>
            {children}

            <div className="toast-stack" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <button key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
                        <span className="toast-mark" aria-hidden="true" />
                        {t.message}
                    </button>
                ))}
            </div>

            {dialog && <ConfirmDialog dialog={dialog} onClose={closeDialog} />}
        </FeedbackContext.Provider>
    );
}

function ConfirmDialog({ dialog, onClose }) {
    const confirmRef = useRef(null);

    useEffect(() => {
        confirmRef.current?.focus();
        const onKey = (e) => e.key === "Escape" && onClose(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
                <h2 id="dialog-title">{dialog.title}</h2>
                {dialog.body && <p>{dialog.body}</p>}
                <div className="dialog-actions">
                    <button className="btn btn-ghost" onClick={() => onClose(false)}>
                        {dialog.cancelText || "Cancel"}
                    </button>
                    <button
                        ref={confirmRef}
                        className={`btn ${dialog.danger ? "btn-danger" : "btn-primary"}`}
                        onClick={() => onClose(true)}
                    >
                        {dialog.confirmText || "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFeedback = () => useContext(FeedbackContext);
