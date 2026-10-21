import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunnerManager, readRunnerConfig } from "../services/runnerManager.js";

const silent = { info() {}, warn() {}, error() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fake ECS: tasks become RUNNING after `bootPolls` DescribeTasks calls. */
function fakeEcs({ bootPolls = 1, runFails = false } = {}) {
    const tasks = new Map();
    let counter = 0;
    const calls = { run: 0, stop: [], list: 0, runInputs: [] };

    return {
        calls,
        tasks,
        async send(command) {
            const name = command.constructor.name;
            const input = command.input;
            if (name === "RunTaskCommand") {
                calls.run += 1;
                calls.runInputs.push(input);
                if (runFails) return { tasks: [], failures: [{ reason: "RESOURCE:CPU" }] };
                const taskArn = `arn:task/${++counter}`;
                tasks.set(taskArn, { taskArn, polls: 0, lastStatus: "PROVISIONING", startedBy: input.startedBy, ip: `10.0.0.${counter}` });
                return { tasks: [{ taskArn }] };
            }
            if (name === "DescribeTasksCommand") {
                return {
                    tasks: input.tasks.map((arn) => {
                        const t = tasks.get(arn);
                        t.polls += 1;
                        if (t.lastStatus !== "STOPPED" && t.polls > bootPolls) t.lastStatus = "RUNNING";
                        return {
                            taskArn: arn,
                            lastStatus: t.lastStatus,
                            desiredStatus: t.lastStatus === "STOPPED" ? "STOPPED" : "RUNNING",
                            startedBy: t.startedBy,
                            attachments: [{ details: [{ name: "privateIPv4Address", value: t.ip }] }],
                        };
                    }),
                };
            }
            if (name === "StopTaskCommand") {
                calls.stop.push(input.task);
                const t = tasks.get(input.task);
                if (t) t.lastStatus = "STOPPED";
                return {};
            }
            if (name === "ListTasksCommand") {
                calls.list += 1;
                const arns = [...tasks.values()]
                    .filter((t) => t.lastStatus !== "STOPPED")
                    .filter((t) => !input.startedBy || t.startedBy === input.startedBy)
                    .map((t) => t.taskArn);
                return { taskArns: arns };
            }
            throw new Error(`unexpected ${name}`);
        },
    };
}

const fakeHttp = () => ({
    pings: 0,
    async get() {
        return { data: { ok: true } };
    },
    async post() {
        this.pings += 1;
        return { data: { ok: true } };
    },
});

const config = (overrides = {}) => ({
    ...readRunnerConfig({
        RUNNER_MODE: "ecs",
        ECS_SUBNET_IDS: "subnet-a,subnet-b",
        ECS_SECURITY_GROUP_ID: "sg-runner",
    }),
    pollIntervalMs: 1,
    idleTimeoutMs: 10_000,
    releaseGraceMs: 10_000,
    ...overrides,
});

test("static mode always returns the configured URL", async () => {
    const mgr = createRunnerManager({
        config: readRunnerConfig({ EXECUTION_SERVICE_URL: "http://runner:5001/execute" }),
    });
    assert.equal(mgr.mode, "static");
    assert.equal(await mgr.acquire("u1", { waitMs: 10 }), "http://runner:5001");
});

test("ecs mode refuses to start without network config", () => {
    assert.throws(() => createRunnerManager({ config: readRunnerConfig({ RUNNER_MODE: "ecs" }) }), /ECS_SUBNET_IDS/);
});

test("concurrent requests for one user launch exactly one task", async () => {
    const ecs = fakeEcs({ bootPolls: 3 });
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });

    assert.equal(mgr.ensure("u1"), "starting"); // heartbeat (login pre-warm)
    const urls = await Promise.all([
        mgr.acquire("u1", { waitMs: 1000 }), // Run click
        mgr.acquire("u1", { waitMs: 1000 }), // Submit click
    ]);

    assert.equal(ecs.calls.run, 1);
    assert.deepEqual(urls, ["http://10.0.0.1:5001", "http://10.0.0.1:5001"]);
    assert.equal(mgr.status("u1"), "ready");
    await mgr.shutdown();
});

test("runners launch on FARGATE by default and on Spot when configured", async () => {
    const ecs = fakeEcs();
    const onDemand = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    await onDemand.acquire("u1", { waitMs: 1000 });
    assert.equal(ecs.calls.runInputs[0].launchType, "FARGATE");
    assert.equal(ecs.calls.runInputs[0].capacityProviderStrategy, undefined);
    await onDemand.shutdown();

    const spotConfig = config({ capacityProvider: "FARGATE_SPOT" });
    const spot = createRunnerManager({ config: spotConfig, ecs, http: fakeHttp(), log: silent });
    await spot.acquire("u2", { waitMs: 1000 });
    assert.equal(ecs.calls.runInputs[1].launchType, undefined);
    assert.deepEqual(ecs.calls.runInputs[1].capacityProviderStrategy, [{ capacityProvider: "FARGATE_SPOT", weight: 1 }]);
    await spot.shutdown();
});

test("different users get different runners", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    const [a, b] = await Promise.all([
        mgr.acquire("a", { waitMs: 1000 }),
        mgr.acquire("b", { waitMs: 1000 }),
    ]);
    assert.notEqual(a, b);
    assert.equal(mgr.stats().active, 2);
    await mgr.shutdown();
    assert.equal(ecs.calls.stop.length, 2);
});

test("a slow cold start returns RUNNER_STARTING instead of hanging", async () => {
    const ecs = fakeEcs({ bootPolls: 10_000 });
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    await assert.rejects(mgr.acquire("u1", { waitMs: 20 }), { code: "RUNNER_STARTING", status: 503 });
    assert.equal(mgr.status("u1"), "starting"); // still booting in the background
    await mgr.shutdown();
});

test("idle timeout stops the task", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config({ idleTimeoutMs: 30 }), ecs, http: fakeHttp(), log: silent });
    await mgr.acquire("u1", { waitMs: 1000 });
    await wait(80);
    assert.equal(mgr.status("u1"), "stopped");
    assert.deepEqual(ecs.calls.stop, ["arn:task/1"]);
});

test("heartbeats keep the runner alive past the idle timeout", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config({ idleTimeoutMs: 40 }), ecs, http: fakeHttp(), log: silent });
    await mgr.acquire("u1", { waitMs: 1000 });
    for (let i = 0; i < 4; i += 1) {
        await wait(20);
        mgr.ensure("u1");
    }
    assert.equal(mgr.status("u1"), "ready");
    assert.equal(ecs.calls.stop.length, 0);
    await mgr.shutdown();
});

test("tab close waits for the grace period and a refresh cancels it", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config({ releaseGraceMs: 40 }), ecs, http: fakeHttp(), log: silent });
    await mgr.acquire("u1", { waitMs: 1000 });

    mgr.release("u1"); // tab closed / refreshed
    await wait(10);
    mgr.ensure("u1"); // the reloaded page sends a heartbeat
    await wait(60);
    assert.equal(mgr.status("u1"), "ready");

    mgr.release("u1"); // closed for real
    await wait(60);
    assert.equal(mgr.status("u1"), "stopped");
});

test("logout stops immediately, even while the task is still booting", async () => {
    const ecs = fakeEcs({ bootPolls: 10_000 });
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    mgr.ensure("u1");
    await wait(10);
    mgr.release("u1", { immediate: true });
    await wait(20);
    assert.equal(mgr.status("u1"), "stopped");
    assert.deepEqual(ecs.calls.stop.slice(0, 1), ["arn:task/1"]);
});

test("RunTask failure surfaces as RUNNER_START_FAILED and frees the slot", async () => {
    const mgr = createRunnerManager({ config: config(), ecs: fakeEcs({ runFails: true }), http: fakeHttp(), log: silent });
    await assert.rejects(mgr.acquire("u1", { waitMs: 1000 }), { code: "RUNNER_START_FAILED" });
    assert.equal(mgr.status("u1"), "stopped");
});

test("capacity limit protects the AWS bill", async () => {
    const mgr = createRunnerManager({ config: config({ maxRunners: 1 }), ecs: fakeEcs(), http: fakeHttp(), log: silent });
    mgr.ensure("a");
    assert.throws(() => mgr.ensure("b"), { code: "RUNNER_CAPACITY" });
    await mgr.shutdown();
});

test("markBroken forgets the runner so the next request starts a new one", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    const url = await mgr.acquire("u1", { waitMs: 1000 });
    mgr.markBroken("u1", url);
    assert.equal(mgr.status("u1"), "stopped");
    const next = await mgr.acquire("u1", { waitMs: 1000 });
    assert.notEqual(next, url);
    assert.equal(ecs.calls.run, 2);
    await mgr.shutdown();
});

test("init stops runners left behind by a previous backend instance", async () => {
    const ecs = fakeEcs();
    ecs.tasks.set("arn:old", { taskArn: "arn:old", polls: 0, lastStatus: "RUNNING", startedBy: "tc-runner-dead0000" });
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    await mgr.init();
    assert.deepEqual(ecs.calls.stop, ["arn:old"]);
    await mgr.shutdown();
});

test("reconcile drops crashed runners and stops untracked ones", async () => {
    const ecs = fakeEcs();
    const mgr = createRunnerManager({ config: config(), ecs, http: fakeHttp(), log: silent });
    await mgr.acquire("u1", { waitMs: 1000 });
    ecs.tasks.get("arn:task/1").lastStatus = "STOPPED"; // runner crashed

    await mgr._reconcile();
    assert.equal(mgr.status("u1"), "stopped");
});
