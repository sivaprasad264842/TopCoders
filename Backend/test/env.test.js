import { test } from "node:test";
import assert from "node:assert/strict";
import { optionalEnv } from "../utils/env.js";

test("optionalEnv treats empty and the 'disabled' placeholder as not configured", () => {
    for (const value of [undefined, "", "   ", "disabled", "DISABLED"]) {
        if (value === undefined) delete process.env.TC_TEST_VALUE;
        else process.env.TC_TEST_VALUE = value;
        assert.equal(optionalEnv("TC_TEST_VALUE"), "");
    }
    process.env.TC_TEST_VALUE = "  re_123  ";
    assert.equal(optionalEnv("TC_TEST_VALUE"), "re_123");
});
