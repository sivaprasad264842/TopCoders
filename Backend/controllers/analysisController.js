import OpenAI from "openai";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_CODE_CHARS = 30000;
const MAX_STATEMENT_CHARS = 8000;

const SYSTEM_INSTRUCTION =
    "You are a concise online judge code reviewer. Explain Question and analyze code and give hints not answers , complexity, edge cases, and one next improvement. Do not provide a full replacement solution unless the user asks.";

const trimForPrompt = (value, maxLength) => {
    if (typeof value !== "string") return "";

    const trimmed = value.trim();
    if (trimmed.length <= maxLength) return trimmed;

    return `${trimmed.slice(0, maxLength)}\n\n[Content truncated for AI analysis.]`;
};

const getOpenAIKey = () => process.env.OPENAI_API_KEY?.trim();

const hasConfiguredOpenAIKey = () => {
    const key = getOpenAIKey();
    return Boolean(key && !key.includes("replace_me"));
};

const getStatusPayload = () => {
    const hasKey = hasConfiguredOpenAIKey();

    return {
        enabled: hasKey,
        provider: "openai",
        model: OPENAI_MODEL,
        message: hasKey
            ? "AI analysis is available."
            : "AI analysis needs OPENAI_API_KEY.",
    };
};

const buildPrompt = ({ code, language, problemTitle, statement, verdict }) => `
Problem: ${trimForPrompt(problemTitle, 200) || "Unknown"}

Statement:
${trimForPrompt(statement, MAX_STATEMENT_CHARS) || "No statement provided."}

Language: ${trimForPrompt(language, 80)}
Verdict: ${trimForPrompt(verdict, 120) || "Not submitted yet"}

Code:
${trimForPrompt(code, MAX_CODE_CHARS)}

Review this online judge solution concisely. Explain likely bugs, complexity, edge cases, and one next improvement.
`;

const getOpenAIErrorMessage = (error) => {
    const status = error.status || error.response?.status || 500;
    const providerMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        error.error?.message ||
        error.message ||
        "";

    if (status === 401) {
        return {
            status,
            error: "OpenAI API key is invalid or expired. Update OPENAI_API_KEY and restart the backend.",
        };
    }

    if (status === 403) {
        return {
            status,
            error: "OpenAI does not allow this key to use the selected model. Check OPENAI_MODEL and project access.",
        };
    }

    if (status === 404) {
        return {
            status,
            error: "OpenAI model was not found. Check OPENAI_MODEL.",
        };
    }

    if (status === 429) {
        return {
            status,
            error: "OpenAI rate limit or quota reached. Try again later or increase your quota.",
        };
    }

    if (status === 400 && providerMessage) {
        return { status, error: providerMessage };
    }

    return {
        status: 500,
        error: "Failed to analyze code with OpenAI. Please try again later.",
    };
};

const runOpenAIAnalysis = async (prompt) => {
    const client = new OpenAI({
        apiKey: getOpenAIKey(),
        timeout: 60000,
    });

    const response = await client.responses.create({
        model: OPENAI_MODEL,
        instructions: SYSTEM_INSTRUCTION,
        input: prompt,
        max_output_tokens: 700,
    });

    return response.output_text?.trim() || "No analysis was returned by OpenAI.";
};

export const getAnalysisStatus = (req, res) => {
    res.json(getStatusPayload());
};

export const analyzeCode = async (req, res) => {
    const { code, language, problemTitle, statement, verdict } = req.body || {};

    if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ error: "Code is required." });
    }

    if (!language || typeof language !== "string" || !language.trim()) {
        return res.status(400).json({ error: "Language is required." });
    }

    const status = getStatusPayload();
    if (!status.enabled) {
        return res.status(503).json({ error: status.message });
    }

    const prompt = buildPrompt({
        code,
        language,
        problemTitle,
        statement,
        verdict,
    });

    try {
        const analysis = await runOpenAIAnalysis(prompt);
        return res.json({ analysis });
    } catch (error) {
        const safeError = getOpenAIErrorMessage(error);

        console.error("OpenAI analysis error:", {
            status: safeError.status,
            message: error.message,
        });

        return res.status(safeError.status).json({ error: safeError.error });
    }
};
