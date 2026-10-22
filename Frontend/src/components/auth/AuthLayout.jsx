import { Link } from "react-router-dom";
import Logo from "../../ui/Logo";
import Icon from "../../ui/Icon";
import ThemeToggle from "../ThemeToggle";
import "../../styles/layout.css";
import "../../styles/forms.css";
import "../../styles/auth.css";

/**
 * Split screen for every sign-in page: a judge console on the left that plays
 * one short "run, then Accepted" sequence, and the form on the right.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
    return (
        <div className="auth-page">
            <aside className="auth-showcase" aria-hidden="true">
                <Link to="/" className="brand-link on-color" tabIndex={-1}>
                    <Logo />
                </Link>

                <div className="showcase-body">
                    <h2>Practise. Compete. Earn your stars.</h2>
                    <div className="demo-console">
                        <div className="demo-bar">
                            <span />
                            <span />
                            <span />
                            <em>two_sum.py</em>
                        </div>
                        <pre className="demo-code">
                            <code>
                                <span className="ln">def two_sum(nums, target):</span>
                                <span className="ln">    seen = {"{}"}</span>
                                <span className="ln">    for i, n in enumerate(nums):</span>
                                <span className="ln">        if target - n in seen:</span>
                                <span className="ln">            return seen[target - n], i</span>
                                <span className="ln">        seen[n] = i</span>
                            </code>
                        </pre>
                        <div className="demo-verdict">
                            <span className="verdict-chip">
                                <span className="chip-running">Running 12 tests</span>
                                <span className="chip-done">Accepted in 38 ms</span>
                            </span>
                            <span className="demo-star">
                                <Icon name="star" size={14} filled /> +1 star
                            </span>
                        </div>
                    </div>
                    <ul className="showcase-points">
                        <li>
                            <Icon name="check" size={16} /> C++, Java, Python and JavaScript
                        </li>
                        <li>
                            <Icon name="check" size={16} /> Monthly hackathons with live standings
                        </li>
                        <li>
                            <Icon name="check" size={16} /> Stars, badges and a public profile
                        </li>
                    </ul>
                </div>
            </aside>

            <main className="auth-main">
                <div className="auth-top">
                    <Link to="/" className="brand-link auth-mobile-brand">
                        <Logo />
                    </Link>
                    <ThemeToggle />
                </div>

                <div className="auth-card">
                    <h1>{title}</h1>
                    {subtitle && <p className="auth-sub">{subtitle}</p>}
                    {children}
                </div>

                {footer && <div className="auth-footer">{footer}</div>}
            </main>
        </div>
    );
}
