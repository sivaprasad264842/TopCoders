import { useState } from "react";
import Icon from "./Icon";

const SUGGESTED = [
    "Array", "String", "Hash Table", "Math", "Two Pointers", "Sorting", "Greedy", "Binary Search",
    "Dynamic Programming", "Stack", "Queue", "Linked List", "Tree", "Graph", "BFS", "DFS",
    "Recursion", "Bit Manipulation", "Heap", "Sliding Window", "Prefix Sum", "Matrix",
];

/** Chips input: Enter or comma adds a tag, Backspace on empty removes the last. Max 8. */
export default function TagInput({ value, onChange, max = 8 }) {
    const [draft, setDraft] = useState("");

    const add = (raw) => {
        const tag = raw.trim().replace(/\s+/g, " ").slice(0, 30);
        if (!tag || value.length >= max || value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
        onChange([...value, tag]);
        setDraft("");
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
        } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
        }
    };

    const suggestions = SUGGESTED.filter(
        (s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()) && s.toLowerCase().includes(draft.trim().toLowerCase()),
    ).slice(0, 8);

    return (
        <div className="tag-input">
            <div className="tag-box">
                {value.map((t) => (
                    <span key={t} className="tag-pill">
                        {t}
                        <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                            <Icon name="x" size={12} />
                        </button>
                    </span>
                ))}
                {value.length < max && (
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        onBlur={() => add(draft)}
                        placeholder={value.length ? "Add another" : "Type a topic and press Enter"}
                        aria-label="Add topic tag"
                    />
                )}
            </div>
            {value.length < max && suggestions.length > 0 && (
                <div className="tag-suggest">
                    {suggestions.map((s) => (
                        <button type="button" key={s} className="topic" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
                            <Icon name="plus" size={11} /> {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
