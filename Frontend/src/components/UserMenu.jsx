import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import { useSignOut } from "../hooks/useSignOut";
import { Avatar } from "../ui/bits";
import Icon from "../ui/Icon";

/** Avatar button with the account menu. */
export default function UserMenu() {
    const { username, email } = useAuth();
    const { me } = useMe();
    const { signOut, signOutEverywhere } = useSignOut();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const name = me?.username || username || email || "You";
    const close = () => setOpen(false);

    return (
        <div className="user-menu" ref={rootRef}>
            <button
                className={`user-trigger ${open ? "open" : ""}`}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Account menu"
            >
                <Avatar name={name} src={me?.profilePicture} />
            </button>

            {open && (
                <div className="menu" role="menu">
                    <div className="menu-head">
                        <Avatar name={name} src={me?.profilePicture} size="lg" />
                        <div>
                            <strong>{name}</strong>
                            <span>{me?.email || email}</span>
                        </div>
                    </div>
                    <Link className="menu-item" role="menuitem" to={`/u/${encodeURIComponent(name)}`} onClick={close}>
                        <Icon name="user" /> My profile
                    </Link>
                    <Link className="menu-item" role="menuitem" to="/settings" onClick={close}>
                        <Icon name="settings" /> Settings
                    </Link>
                    <Link className="menu-item" role="menuitem" to="/settings?tab=security" onClick={close}>
                        <Icon name="shield" /> Password and security
                    </Link>
                    <div className="menu-sep" />
                    <button
                        className="menu-item"
                        role="menuitem"
                        onClick={() => {
                            close();
                            signOut();
                        }}
                    >
                        <Icon name="logout" /> Sign out
                    </button>
                    <button
                        className="menu-item danger"
                        role="menuitem"
                        onClick={() => {
                            close();
                            signOutEverywhere();
                        }}
                    >
                        <Icon name="devices" /> Sign out of all devices
                    </button>
                </div>
            )}
        </div>
    );
}
