import { useEffect, useState } from "react";
import { createProblem, getErrorMessage, getProblemById, getToken, updateProblem } from "../api";
import { useFeedback } from "../ui/Feedback";
import Icon from "../ui/Icon";
import Segmented from "../ui/Segmented";
import TagInput from "../ui/TagInput";
import "../styles/forms.css";

const emptyCase = () => ({ input: "", output: "", hidden: false });
const defaultHints = () => [
    { title: "Hint 1", body: "" },
    { title: "Hint 2", body: "" },
];

/**
 * Create a problem (no problemId) or edit one (problemId given).
 * In edit mode the full problem, including hidden test cases, is loaded
 * fresh from the API so nothing is lost on save.
 */
function ProblemFormModal({ problemId, close, refresh }) {
    const isEdit = Boolean(problemId);
    const { toast } = useFeedback();
    const [form, setForm] = useState({
        title: "",
        statement: "",
        difficulty: "Easy",
        testCases: [emptyCase()],
        hints: defaultHints(),
        tags: [],
        editorial: "",
    });
    const [loadingProblem, setLoadingProblem] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isEdit) return;
        let cancelled = false;

        getProblemById(problemId)
            .then(({ data }) => {
                if (cancelled) return;
                setForm({
                    title: data.title || "",
                    statement: data.statement || "",
                    difficulty: data.difficulty || "Easy",
                    testCases: data.testCases?.length
                        ? data.testCases.map((tc) => ({
                              input: tc.input || "",
                              output: tc.output || "",
                              hidden: Boolean(tc.hidden),
                          }))
                        : [emptyCase()],
                    hints: data.hints?.length ? data.hints : defaultHints(),
                    tags: data.tags || [],
                    editorial: data.editorial || "",
                });
            })
            .catch((err) => !cancelled && setError(getErrorMessage(err, "Could not load the problem.")))
            .finally(() => !cancelled && setLoadingProblem(false));

        return () => {
            cancelled = true;
        };
    }, [isEdit, problemId]);

    const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

    const updateItem = (list, index, field, value) =>
        setForm((f) => ({
            ...f,
            [list]: f[list].map((item, i) => (i === index ? { ...item, [field]: value } : item)),
        }));

    const addItem = (list, item) => setForm((f) => ({ ...f, [list]: [...f[list], item] }));

    const removeItem = (list, index, keepOne = false) =>
        setForm((f) => ({
            ...f,
            [list]: keepOne && f[list].length === 1 ? f[list] : f[list].filter((_, i) => i !== index),
        }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.title.trim() || !form.statement.trim()) {
            setError("Title and statement are required.");
            return;
        }
        if (form.testCases.some((tc) => !tc.output.trim())) {
            setError("Every test case needs an expected output.");
            return;
        }
        if (form.testCases.every((tc) => tc.hidden)) {
            setError("Keep at least one visible test case as an example.");
            return;
        }
        if (!getToken()) {
            setError("Please log in first.");
            return;
        }

        const payload = {
            title: form.title.trim(),
            statement: form.statement.trim(),
            difficulty: form.difficulty,
            testCases: form.testCases,
            hints: form.hints.filter((hint) => hint.body.trim()),
            tags: form.tags,
            editorial: form.editorial.trim(),
        };

        try {
            setSaving(true);
            if (isEdit) await updateProblem(problemId, payload);
            else await createProblem(payload);
            toast(isEdit ? "Changes saved" : "Problem published");
            refresh();
            close();
        } catch (err) {
            setError(getErrorMessage(err, isEdit ? "Update failed." : "Failed to create problem."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <form className="sheet" onSubmit={handleSubmit} aria-labelledby="problem-form-title">
                <div className="sheet-head">
                    <h2 id="problem-form-title">{isEdit ? "Edit problem" : "New problem"}</h2>
                    <button type="button" className="icon-btn" onClick={close} aria-label="Close">
                        <Icon name="x" />
                    </button>
                </div>

                <div className="sheet-body">
                    {error && <div className="notice error">{error}</div>}

                    {loadingProblem ? (
                        <div className="skeleton" style={{ height: 240 }} />
                    ) : (
                        <>
                            <div className="form-grid">
                                <label className="field">
                                    Title
                                    <input
                                        placeholder="Two Sum"
                                        value={form.title}
                                        maxLength={150}
                                        onChange={(e) => setField("title", e.target.value)}
                                        autoFocus
                                    />
                                </label>
                                <div className="field">
                                    Difficulty
                                    <Segmented
                                        options={[
                                            { value: "Easy", label: "Easy" },
                                            { value: "Medium", label: "Medium" },
                                            { value: "Hard", label: "Hard" },
                                        ]}
                                        value={form.difficulty}
                                        onChange={(v) => setField("difficulty", v)}
                                        label="Difficulty"
                                    />
                                </div>
                            </div>

                            <div className="field">
                                Topics <span className="field-hint">up to 8, shown in the problem list and used for filters</span>
                                <TagInput value={form.tags} onChange={(tags) => setField("tags", tags)} />
                            </div>

                            <label className="field">
                                Statement
                                <textarea
                                    className="statement-input"
                                    placeholder="Describe the task, input format, output format and constraints."
                                    value={form.statement}
                                    onChange={(e) => setField("statement", e.target.value)}
                                />
                            </label>

                            <section className="form-section">
                                <div className="form-section-head">
                                    <div>
                                        <h3>Test cases</h3>
                                        <p>
                                            Visible cases appear as examples. Hidden cases are only used for judging, so
                                            solutions can't be hard-coded.
                                        </p>
                                    </div>
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem("testCases", emptyCase())}>
                                        <Icon name="plus" size={14} /> Add case
                                    </button>
                                </div>

                                {form.testCases.map((tc, index) => (
                                    <div className={`case-editor ${tc.hidden ? "is-hidden" : ""}`} key={index}>
                                        <div className="case-editor-head">
                                            <strong>Case {index + 1}</strong>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={tc.hidden}
                                                    onChange={(e) => updateItem("testCases", index, "hidden", e.target.checked)}
                                                />
                                                Hidden
                                            </label>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                onClick={() => removeItem("testCases", index, true)}
                                                disabled={form.testCases.length === 1}
                                                aria-label={`Remove case ${index + 1}`}
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        </div>
                                        <div className="case-io">
                                            <textarea
                                                placeholder="Input (can be empty)"
                                                value={tc.input}
                                                onChange={(e) => updateItem("testCases", index, "input", e.target.value)}
                                            />
                                            <textarea
                                                placeholder="Expected output"
                                                value={tc.output}
                                                onChange={(e) => updateItem("testCases", index, "output", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </section>

                            <section className="form-section">
                                <div className="form-section-head">
                                    <div>
                                        <h3>Editorial</h3>
                                        <p>Optional. Explain the intended approach and its complexity. Solvers see it in the Editorial tab.</p>
                                    </div>
                                </div>
                                <textarea
                                    className="input editorial-input"
                                    placeholder="Approach, step by step, then time and space complexity."
                                    value={form.editorial}
                                    maxLength={20000}
                                    onChange={(e) => setField("editorial", e.target.value)}
                                />
                            </section>

                            <section className="form-section">
                                <div className="form-section-head">
                                    <div>
                                        <h3>Hints</h3>
                                        <p>Small nudges people can open one at a time. Empty hints are skipped.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => addItem("hints", { title: `Hint ${form.hints.length + 1}`, body: "" })}
                                    >
                                        <Icon name="plus" size={14} /> Add hint
                                    </button>
                                </div>

                                {form.hints.map((hint, index) => (
                                    <div className="case-editor" key={index}>
                                        <div className="case-editor-head">
                                            <input
                                                className="input hint-title"
                                                placeholder={`Hint ${index + 1}`}
                                                value={hint.title}
                                                onChange={(e) => updateItem("hints", index, "title", e.target.value)}
                                                aria-label={`Hint ${index + 1} title`}
                                            />
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                onClick={() => removeItem("hints", index)}
                                                aria-label={`Remove hint ${index + 1}`}
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        </div>
                                        <textarea
                                            className="input"
                                            placeholder="A nudge that doesn't give away the full solution"
                                            value={hint.body}
                                            onChange={(e) => updateItem("hints", index, "body", e.target.value)}
                                        />
                                    </div>
                                ))}
                            </section>
                        </>
                    )}
                </div>

                <div className="sheet-foot">
                    <button type="button" className="btn btn-quiet" onClick={close}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving || loadingProblem}>
                        {saving && <span className="spinner" />}
                        {isEdit ? "Save changes" : "Publish problem"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ProblemFormModal;
