import { Navigate, useSearchParams } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import { EditProfileForm, SecurityPanel } from "../components/AccountForms";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import Icon from "../ui/Icon";
import "../styles/layout.css";
import "../styles/forms.css";

const SECTIONS = [
    { value: "profile", label: "Profile", icon: "user" },
    { value: "security", label: "Password and security", icon: "shield" },
];

export default function SettingsPage() {
    const { isLoggedIn } = useAuth();
    const { me, setMe } = useMe();
    const [params, setParams] = useSearchParams();
    const tab = params.get("tab") === "security" ? "security" : "profile";

    if (!isLoggedIn) return <Navigate to="/login?redirect=/settings" replace />;

    return (
        <div className="app">
            <AppHeader />
            <main className="page page-narrow">
                <div className="page-head">
                    <div>
                        <h1>Settings</h1>
                        <p>Manage your public profile and account security.</p>
                    </div>
                </div>
                <div className="settings-layout">
                    <nav className="settings-nav" aria-label="Settings sections">
                        {SECTIONS.map((s) => (
                            <button key={s.value} aria-current={tab === s.value} onClick={() => setParams(s.value === "profile" ? {} : { tab: s.value })}>
                                <Icon name={s.icon} size={17} /> {s.label}
                            </button>
                        ))}
                    </nav>
                    <section>
                        {tab === "profile" &&
                            (me ? (
                                <div className="card card-pad">
                                    <EditProfileForm key={me.updatedAt || me.userId} profile={me} onSaved={(data) => setMe((m) => ({ ...m, ...data }))} />
                                </div>
                            ) : (
                                <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
                            ))}
                        {tab === "security" && <SecurityPanel />}
                    </section>
                </div>
            </main>
        </div>
    );
}
