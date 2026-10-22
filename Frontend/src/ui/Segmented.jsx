/** Segmented control; the highlighted thumb slides to the chosen option. */
export default function Segmented({ options, value, onChange, label, className = "" }) {
    const index = Math.max(
        0,
        options.findIndex((o) => o.value === value),
    );
    return (
        <div
            className={`segmented ${className}`}
            role="group"
            aria-label={label}
            style={{ "--count": options.length, "--index": index }}
        >
            {options.map((o) => (
                <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}
