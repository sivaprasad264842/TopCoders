// End-to-end check against a running runner container.
// Usage: RUNNER_URL=http://localhost:5001 RUNNER_TOKEN=local-dev-token node test/smoke.mjs
import assert from "node:assert/strict";

const BASE = process.env.RUNNER_URL || "http://localhost:5001";
const TOKEN = process.env.RUNNER_TOKEN || "local-dev-token";

const post = async (path, body, token = TOKEN) => {
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-execution-service-token": token },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
};

const cases = [
    ["health", async () => {
        const res = await fetch(`${BASE}/health`);
        assert.equal((await res.json()).ok, true);
    }],
    ["rejects a wrong token", async () => {
        const { status } = await post("/execute", { code: "print(1)", language: "python" }, "wrong");
        assert.equal(status, 401);
    }],
    ["python echo", async () => {
        const { body } = await post("/execute", { language: "python", code: "print(input()[::-1])", input: "abc\n" });
        assert.equal(body.status, "success");
        assert.equal(body.stdout.trim(), "cba");
    }],
    ["javascript", async () => {
        const { body } = await post("/execute", {
            language: "javascript",
            code: "const s=require('fs').readFileSync(0,'utf8').trim().split(' ').map(Number);console.log(s[0]+s[1])",
            input: "2 40",
        });
        assert.equal(body.stdout.trim(), "42");
    }],
    ["c++", async () => {
        const { body } = await post("/execute", {
            language: "cpp",
            code: "#include <bits/stdc++.h>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a*b;}",
            input: "6 7",
        });
        assert.equal(body.status, "success", body.stderr);
        assert.equal(body.stdout.trim(), "42");
    }],
    ["java", async () => {
        const { body } = await post("/execute", {
            language: "java",
            code: "import java.util.*;public class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+1);}}",
            input: "41",
        });
        assert.equal(body.status, "success", body.stderr);
        assert.equal(body.stdout.trim(), "42");
    }],
    ["c++ compilation error", async () => {
        const { body } = await post("/execute", { language: "cpp", code: "int main( {", input: "" });
        assert.equal(body.status, "compilation_error");
        assert.match(body.stderr, /error/);
    }],
    ["runtime error", async () => {
        const { body } = await post("/execute", { language: "python", code: "raise SystemExit(3)" });
        assert.equal(body.status, "runtime_error");
    }],
    ["infinite loop -> timeout", async () => {
        const { body } = await post("/execute", { language: "python", code: "while True: pass" });
        assert.equal(body.status, "timeout");
    }],
    ["output flood is capped", async () => {
        const { body } = await post("/execute", { language: "python", code: "while True: print('x'*1000)" });
        assert.equal(body.status, "runtime_error");
        assert.match(body.stderr, /Output limit exceeded/);
    }],
    ["user code cannot read the service token", async () => {
        const { body } = await post("/execute", {
            language: "python",
            code: "import os\nprint(os.environ.get('EXECUTION_SERVICE_TOKEN','none'))",
        });
        assert.equal(body.stdout.trim(), "none");
    }],
    ["program that ignores stdin does not crash the runner", async () => {
        const { body } = await post("/execute", { language: "python", code: "print(1)", input: "x".repeat(2_000_000) });
        assert.equal(body.status, "success");
    }],
    ["batch: accepted (c++ compiled once)", async () => {
        const { body } = await post("/execute-batch", {
            language: "cpp",
            code: "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<\"\\n\";}",
            tests: [
                { input: "1 2", expectedOutput: "3" },
                { input: "10 20", expectedOutput: "30\r\n" },
                { input: "-5 5", expectedOutput: "0" },
            ],
        });
        assert.equal(body.status, "accepted", JSON.stringify(body));
        assert.equal(body.passed, 3);
    }],
    ["batch: stops at first wrong answer", async () => {
        const { body } = await post("/execute-batch", {
            language: "python",
            code: "a,b=map(int,input().split())\nprint(a-b)",
            tests: [
                { input: "2 2", expectedOutput: "0" },
                { input: "5 1", expectedOutput: "6" },
                { input: "9 9", expectedOutput: "0" },
            ],
        });
        assert.equal(body.status, "wrong_answer");
        assert.equal(body.passed, 1);
        assert.equal(body.failed.index, 1);
        assert.equal(body.failed.stdout.trim(), "4");
    }],
    ["batch: compilation error", async () => {
        const { body } = await post("/execute-batch", {
            language: "java",
            code: "public class Main { oops }",
            tests: [{ input: "", expectedOutput: "" }],
        });
        assert.equal(body.status, "compilation_error");
        assert.equal(body.failed.index, null);
    }],
    ["rejects unsupported language", async () => {
        const { status } = await post("/execute", { language: "ruby", code: "puts 1" });
        assert.equal(status, 400);
    }],
];

let failed = 0;
for (const [name, fn] of cases) {
    try {
        await fn();
        console.log(`  ok   ${name}`);
    } catch (err) {
        failed += 1;
        console.log(`  FAIL ${name}\n       ${err.message}`);
    }
}
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
