import { useTheme } from "../hooks/useTheme";
import Icon from "../ui/Icon";

export default function ThemeToggle() {
    const { theme, toggle } = useTheme();
    const next = theme === "dark" ? "light" : "dark";
    return (
        <button className="icon-btn theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
    );
}
