import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOutput, outputsMatch } from "../lib/judge.js";
import { createSemaphore } from "../lib/semaphore.js";

test("outputsMatch ignores CRLF, trailing spaces and blank edges", () => {
    assert.ok(outputsMatch("1 2 \r\n3\r\n\r\n", "1 2\n3"));
    assert.ok(outputsMatch("\nhello\n", "hello"));
    assert.equal(normalizeOutput(null), "");
});

test("outputsMatch still catches real differences", () => {
    assert.ok(!outputsMatch("1 2", "12"));
    assert.ok(!outputsMatch("a\nb", "a b"));
    assert.ok(!outputsMatch("  x", "x\ny"));
});

test("semaphore never exceeds its limit", async () => {
    const sem = createSemaphore(2);
    let running = 0;
    let peak = 0;
    const task = () =>
        sem.run(async () => {
            running += 1;
            peak = Math.max(peak, running);
            await new Promise((r) => setTimeout(r, 5));
            running -= 1;
        });

    await Promise.all(Array.from({ length: 10 }, task));
    assert.equal(peak, 2);
    assert.equal(sem.pending, 0);
});

test("semaphore releases the slot when a task throws", async () => {
    const sem = createSemaphore(1);
    await assert.rejects(sem.run(async () => { throw new Error("boom"); }));
    assert.equal(await sem.run(async () => "ok"), "ok");
});
