import { runCode as runOnRunner } from "../services/executionService.js";
import { parseCodeRequest } from "../utils/validation.js";

/** "Run": execute code against custom input. Nothing is stored. */
export const runCode = async (req, res) => {
    const { code, language, input } = parseCodeRequest(req.body);
    const result = await runOnRunner(String(req.user._id), { code, language, input });
    res.json(result);
};
