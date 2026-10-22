import { useEffect, useState } from "react";
import { createHackathon, getErrorMessage, getProblems, updateHackathon } from "../api";
import { Difficulty } from "../ui/bits";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import "../styles/forms.css";

// <input type="datetime-local"> works in local time without a timezone suffix.
const toLocalInput = (date) => {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** First Saturday of next month, 10:00 to 13:00 local time. */
const nextMonthSlot = () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    const end = new Date(d);
    end.setHours(13);
    return { start: d, end };
};

const monthTitle = (date) => `TopCoders Monthly, ${date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;

const DEFAULT_RULES = `Solve as many problems as you can before time runs out.

Scoring
- Each problem is worth the points shown next to it.
- Ties are broken by penalty time: minutes from the start to each accepted solution, plus 5 minutes for every wrong attempt before it.
- Only submissions made during the hackathon count.

Rules
- Register before or during the hackathon to see the problems.
- Work alone and don't share solutions until it ends.
- Problems become public practice problems after the hackathon.`;

/** Admin form to create or edit a hackathon (title, dates, rules and problems with points). */
export default function HackathonFormModal({ hackathon, close, onSaved }) {
    const isEdit = Boolean(hackathon);
    const { toast } = useFeedback();
    const slot = nextMonthSlot();
    const [form, setForm] = useState(() =>
        isEdit
            ? {
                  title: hackathon.title,
                  description: hackathon.description || "",
                  startsAt: toLocalInput(hackathon.startsAt),
                  endsAt: toLocalInput(hackathon.endsAt),
              }
            : { title: monthTitle(slot.start), description: DEFAULT_RULES, startsAt: toLocalInput(slot.start), endsAt: toLocalInput(slot.end) },
    );
    const [selected, setSelected] = useState(() => new Map((hackathon?.problems || []).map((p) => [p.problemId, p.points])));
    const [pool, setPool] = useState(() => hackathon?.problems || []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        getProblems()
            .then((res) => {
                if (!active) return;
                // Public problems plus the ones already in this hackathon (those are hidden from the public list).
                const known = new Set(res.data.map((p) => p.problemId));
                setPool([...(hackathon?.problems || []).filter((p) => !known.has(p.problemId)), ...res.data]);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [hackathon]);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && close();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [close]);

    const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
    const toggle = (p) =>
        setSelected((m) => {
            const next = new Map(m);
            if (next.has(p.problemId)) next.delete(p.problemId);
            else next.set(p.problemId, { Easy: 100, Medium: 200, Hard: 300 }[p.difficulty] || 100);
            return next;
        });
    const setPoints = (id, value) => setSelected((m) => new Map(m).set(id, Number(value)));

    const applyPreset = () => {
        const s = nextMonthSlot();
        setForm((f) => ({ ...f, title: monthTitle(s.start), startsAt: toLocalInput(s.start), endsAt: toLocalInput(s.end) }));
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!selected.size) return setError("Pick at least one problem.");
        const payload = {
            title: form.title.trim(),
            description: form.description.trim(),
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString(),
            problems: pool.filter((p) => selected.has(p.problemId)).map((p) => ({ problemId: p.problemId, points: selected.get(p.problemId) })),
        };
        setSaving(true);
        try {
            const { data } = isEdit ? await updateHackathon(hackathon.slug, payload) : await createHackathon(payload);
            toast(isEdit ? "Hackathon updated" : "Hackathon scheduled");
            onSaved(data);
            close();
        } catch (err) {
            setError(getErrorMessage(err, "Could not save the hackathon."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <form className="sheet" onSubmit={submit} aria-labelledby="hk-form-title">
                <div className="sheet-head">
                    <h2 id="hk-form-title">{isEdit ? "Edit hackathon" : "Schedule a hackathon"}</h2>
                    <button type="button" className="icon-btn" onClick={close} aria-label="Close">
                        <Icon name="x" />
                    </button>
                </div>
                <div className="sheet-body">
                    {error && <div className="notice error">{error}</div>}
                    {!isEdit && (
                        <div className="notice info">
                            Prefilled for the first Saturday of next month, 10:00 to 13:00.{" "}
                            <button type="button" className="link-inline" onClick={applyPreset}>
                                Reset to next month
                            </button>
                        </div>
                    )}
                    <label className="field">
                        Title
                        <input value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} required />
                    </label>
                    <div className="form-grid even">
                        <label className="field">
                            Starts
                            <input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />
                        </label>
                        <label className="field">
                            Ends
                            <input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} required />
                        </label>
                    </div>
                    <label className="field">
                        Description and rules
                        <textarea value={form.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} style={{ minHeight: 150 }} />
                    </label>

                    <section className="form-section">
                        <div className="form-section-head">
                            <div>
                                <h3>Problems</h3>
                                <p>Selected problems are hidden from the public list until the hackathon ends. Registered people can open them while it's live.</p>
                            </div>
                            <span className="tag primary">{selected.size} selected</span>
                        </div>
                        <div className="picker">
                            {pool.length === 0 && <p className="muted" style={{ padding: 10 }}>Create some problems first.</p>}
                            {pool.map((p) => (
                                <label className="picker-row" key={p.problemId}>
                                    <input type="checkbox" checked={selected.has(p.problemId)} onChange={() => toggle(p)} />
                                    <span>{p.title}</span>
                                    <Difficulty level={p.difficulty || "Easy"} as="tag" />
                                    {selected.has(p.problemId) ? (
                                        <input
                                            type="number"
                                            min={1}
                                            max={10000}
                                            value={selected.get(p.problemId)}
                                            onChange={(e) => setPoints(p.problemId, e.target.value)}
                                            aria-label={`Points for ${p.title}`}
                                        />
                                    ) : (
                                        <span />
                                    )}
                                </label>
                            ))}
                        </div>
                    </section>
                </div>
                <div className="sheet-foot">
                    <button type="button" className="btn btn-quiet" onClick={close}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={saving}>
                        {saving && <span className="spinner" />}
                        {isEdit ? "Save changes" : "Schedule hackathon"}
                    </button>
                </div>
            </form>
        </div>
    );
}
