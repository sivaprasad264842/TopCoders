import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMe } from "../hooks/useMe";
import Icon from "../ui/Icon";
import Logo from "../ui/Logo";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";

const NAV = [
    { to: "/", label: "Problems", icon: "list", end: true },
    { to: "/hackathons", label: "Hackathons", icon: "flag" },
    { to: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

export default function AppHeader() {
    const { isLoggedIn } = useAuth();
    const { me } = useMe();

    return (
        <header className="app-header">
            <div className="app-header-inner">
                <Link to="/" className="brand-link" aria-label="TopCoders home">
                    <Logo />
                </Link>

                <nav className="main-nav" aria-label="Main">
                    {NAV.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                            <Icon name={item.icon} size={17} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="header-actions">
                    {isLoggedIn && me && (
                        <Link to={`/u/${encodeURIComponent(me.username)}`} className="star-chip" title="Your stars">
                            <Icon name="star" size={15} filled />
                            <span className="num">{me.stars || 0}</span>
                        </Link>
                    )}
                    <ThemeToggle />
                    {isLoggedIn ? (
                        <UserMenu />
                    ) : (
                        <>
                            <Link to="/login" className="btn btn-quiet">
                                Log in
                            </Link>
                            <Link to="/register" className="btn btn-primary">
                                Sign up
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
