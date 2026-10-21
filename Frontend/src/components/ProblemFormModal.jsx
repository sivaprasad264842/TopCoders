import { useEffect, useState } from "react";
import { createProblem, getErrorMessage, getProblemById, getToken, updateProblem } from "../api";
import "../CSS/Problem.css";

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
    const [form, setForm] = useState({
        title: "",
        statement: "",
        difficulty: "Easy",
        testCases: [emptyCase()],
        hints: defaultHints(),
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
        };

        try {
            setSaving(true);
            if (isEdit) await updateProblem(problemId, payload);
            else await createProblem(payload);
            refresh();
            close();
        } catch (err) {
            setError(getErrorMessage(err, isEdit ? "Update failed." : "Failed to create problem."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && close()}>
            <form className="modal-content problem-form" onSubmit={handleSubmit}>
                <div className="modal-head">
                    <div>
                        <p className="eyebrow">Problem Builder</p>
                        <h2>{isEdit ? "Edit Problem" : "Create Problem"}</h2>
                    </div>
                    <button type="button" className="drawer-close" onClick={close} aria-label="Close">
                        x
                    </button>
                </div>

                {error && <div className="form-error">{error}</div>}

                {loadingProblem ? (
                    <div className="empty-state">Loading problem...</div>
                ) : (
                    <>
                        <label>
                            Title
                            <input
                                placeholder="Two Sum"
                                value={form.title}
                                maxLength={150}
                                onChange={(e) => setField("title", e.target.value)}
                            />
                        </label>

                        <label>
                            Difficulty
                            <select value={form.difficulty} onChange={(e) => setField("difficulty", e.target.value)}>
                                <option value="Easy">Easy</option>
                                <option value="Medium">Medium</option>
                                <option value="Hard">Hard</option>
                            </select>
                        </label>

                        <label>
                            Statement
                            <textarea
                                placeholder="Describe the task, input format, output format, and constraints."
                                value={form.statement}
                                onChange={(e) => setField("statement", e.target.value)}
                            />
                        </label>

                        <div className="testcase-form-head">
                            <h3>Test Cases</h3>
                            <button type="button" onClick={() => addItem("testCases", emptyCase())}>
                                Add Case
                            </button>
                        </div>
                        <p className="form-help">
                            Visible cases are shown as examples. Hidden cases are only used for judging, so
                            solutions can't be hard-coded.
                        </p>

                        <div className="testcase-form-list">
                            {form.testCases.map((tc, index) => (
                                <div className="testcase-editor" key={index}>
                                    <div className="case-title">
                                        <strong>Case {index + 1}</strong>
                                        <label className="hidden-toggle">
                                            <input
                                                type="checkbox"
                                                checked={tc.hidden}
                                                onChange={(e) =>
                                                    updateItem("testCases", index, "hidden", e.target.checked)
                                                }
                                            />
                                            Hidden
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => removeItem("testCases", index, true)}
                                            disabled={form.testCases.length === 1}
                                        >
                                            Remove
                                        </button>
                                    </div>
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
                            ))}
                        </div>

                        <div className="testcase-form-head">
                            <h3>Hints</h3>
                            <button
                                type="button"
                                onClick={() =>
                                    addItem("hints", { title: `Hint ${form.hints.length + 1}`, body: "" })
                                }
                            >
                                Add Hint
                            </button>
                        </div>

                        <div className="testcase-form-list">
                            {form.hints.map((hint, index) => (
                                <div className="testcase-editor" key={index}>
                                    <div className="case-title">
                                        <strong>{hint.title || `Hint ${index + 1}`}</strong>
                                        <button type="button" onClick={() => removeItem("hints", index)}>
                                            Remove
                                        </button>
                                    </div>
                                    <input
                                        placeholder={`Hint ${index + 1}`}
                                        value={hint.title}
                                        onChange={(e) => updateItem("hints", index, "title", e.target.value)}
                                    />
                                    <textarea
                                        placeholder="Small nudge without giving away the full solution"
                                        value={hint.body}
                                        onChange={(e) => updateItem("hints", index, "body", e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="modal-actions">
                    <button type="button" className="secondary-btn" onClick={close}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-btn" disabled={saving || loadingProblem}>
                        {saving ? "Saving..." : isEdit ? "Update" : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ProblemFormModal;
