import crypto from "node:crypto";
import axios from "axios";
import {
    DescribeTasksCommand,
    ECSClient,
    ListTasksCommand,
    RunTaskCommand,
    StopTaskCommand,
} from "@aws-sdk/client-ecs";
import { RunnerUnavailableError } from "../utils/httpError.js";

/*
 * Runner manager: decides WHERE a user's code runs.
 *
 *  static mode  one shared runner at RUNNER_URL (local docker-compose).
 *  ecs mode     one Fargate task per active user, started on demand and
 *               stopped after inactivity, tab close or logout.
 *
 * Session state (ecs mode) lives in memory, so run ONE backend instance.
 * Safety nets for crashes: on boot we stop runners left by previous backend
 * instances, a periodic reconcile stops untracked tasks, and every runner
 * exits by itself after IDLE_EXIT_MINUTES without traffic.
 */

const list = (value) =>
    String(value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

const num = (value, fallback) => {
    const parsed = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function readRunnerConfig(env = process.env) {
    // Older .env files used the full /execute URL; accept both.
    const legacyUrl = env.EXECUTION_SERVICE_URL?.trim().replace(/\/execute\/?$/, "");

    return {
        mode: (env.RUNNER_MODE || "static").trim().toLowerCase(),
        staticUrl: (env.RUNNER_URL || legacyUrl || "http://localhost:5001").replace(/\/+$/, ""),
        token: env.EXECUTION_SERVICE_TOKEN?.trim() || "",
        region: env.AWS_REGION || "ap-south-1",
        cluster: env.ECS_CLUSTER_NAME || "topcoders",
        taskDefinition: env.ECS_RUNNER_TASK_DEF || "topcoders-runner",
        subnets: list(env.ECS_SUBNET_IDS),
        securityGroups: list(env.ECS_SECURITY_GROUP_ID),
        assignPublicIp: (env.RUNNER_ASSIGN_PUBLIC_IP || "ENABLED").toUpperCase(),
        // FARGATE_SPOT is ~70% cheaper; a reclaimed runner is detected and replaced.
        capacityProvider: (env.RUNNER_CAPACITY_PROVIDER || "FARGATE").trim().toUpperCase(),
        port: num(env.RUNNER_PORT, 5001),
        idleTimeoutMs: num(env.SESSION_IDLE_TIMEOUT_MIN, 10) * 60_000,
        releaseGraceMs: num(env.RUNNER_RELEASE_GRACE_SEC, 60) * 1000,
        startTimeoutMs: num(env.RUNNER_START_TIMEOUT_SEC, 180) * 1000,
        maxRunners: num(env.MAX_ACTIVE_RUNNERS, 20),
        pollIntervalMs: 2000,
        pingIntervalMs: 60_000,
        reconcileIntervalMs: 5 * 60_000,
    };
}

class Cancelled extends Error {}

function createStaticManager(config) {
    return {
        mode: "static",
        status: () => "ready",
        ensure: () => "ready",
        acquire: async () => config.staticUrl,
        release() {},
        markBroken() {},
        async init() {},
        async shutdown() {},
        stats: () => ({ mode: "static" }),
    };
}

function createEcsManager(config, { ecs, http, log }) {
    if (!config.subnets.length || !config.securityGroups.length) {
        throw new Error("RUNNER_MODE=ecs requires ECS_SUBNET_IDS and ECS_SECURITY_GROUP_ID.");
    }

    // Tags every task this backend process launches (ECS limit: 36 chars).
    const startedBy = `tc-runner-${crypto.randomBytes(4).toString("hex")}`;
    const family = config.taskDefinition.split(":")[0];
    const authHeaders = config.token ? { "x-execution-service-token": config.token } : {};

    /** userId -> session */
    const sessions = new Map();
    let launching = 0;
    let reconcileTimer = null;

    const clearTimers = (s) => {
        clearTimeout(s.idleTimer);
        clearTimeout(s.releaseTimer);
        s.idleTimer = null;
        s.releaseTimer = null;
    };

    const stopTask = async (taskArn, reason) => {
        try {
            await ecs.send(
                new StopTaskCommand({ cluster: config.cluster, task: taskArn, reason: reason.slice(0, 255) }),
            );
        } catch (err) {
            log.warn(`[runner] StopTask failed for ${taskArn}: ${err.message}`);
        }
    };

    const stop = (userId, reason) => {
        const s = sessions.get(userId);
        if (!s) return Promise.resolve();
        sessions.delete(userId);
        s.cancelled = true;
        clearTimers(s);
        log.info(`[runner] stopping runner for user ${userId}: ${reason}`);
        // Still inside RunTask? launch() sees `cancelled` and stops the task itself.
        return s.taskArn ? stopTask(s.taskArn, reason) : Promise.resolve();
    };

    const armIdleTimer = (s) => {
        clearTimeout(s.idleTimer);
        s.idleTimer = setTimeout(() => stop(s.userId, "inactive"), config.idleTimeoutMs);
        s.idleTimer.unref?.();
    };

    /** Mark the user active: reset the idle timer, cancel a pending tab-close stop. */
    const touch = (s) => {
        clearTimeout(s.releaseTimer);
        s.releaseTimer = null;
        armIdleTimer(s);

        // Tell the runner we're alive so its own idle-exit doesn't fire.
        if (s.status === "ready" && Date.now() - s.lastPingAt > config.pingIntervalMs) {
            s.lastPingAt = Date.now();
            http.post(`${s.baseUrl}/ping`, {}, { headers: authHeaders, timeout: 3000 }).catch(() => {
                if (sessions.get(s.userId) === s) stop(s.userId, "runner unreachable");
            });
        }
    };

    const describeTask = async (taskArn) => {
        const res = await ecs.send(new DescribeTasksCommand({ cluster: config.cluster, tasks: [taskArn] }));
        return res.tasks?.[0];
    };

    const privateIpOf = (task) =>
        task.attachments
            ?.flatMap((a) => a.details ?? [])
            .find((d) => d.name === "privateIPv4Address")?.value ||
        task.containers?.[0]?.networkInterfaces?.[0]?.privateIpv4Address;

    const launch = async (s) => {
        launching += 1;
        try {
            const res = await ecs.send(
                new RunTaskCommand({
                    cluster: config.cluster,
                    taskDefinition: config.taskDefinition,
                    ...(config.capacityProvider === "FARGATE"
                        ? { launchType: "FARGATE" }
                        : { capacityProviderStrategy: [{ capacityProvider: config.capacityProvider, weight: 1 }] }),
                    count: 1,
                    startedBy,
                    networkConfiguration: {
                        awsvpcConfiguration: {
                            subnets: config.subnets,
                            securityGroups: config.securityGroups,
                            assignPublicIp: config.assignPublicIp,
                        },
                    },
                }),
            );
            const taskArn = res.tasks?.[0]?.taskArn;
            if (!taskArn) {
                const failure = res.failures?.[0];
                throw new Error(
                    failure ? `${failure.reason}${failure.detail ? `: ${failure.detail}` : ""}` : "RunTask returned no task",
                );
            }
            s.taskArn = taskArn;
        } finally {
            launching -= 1;
        }

        const deadline = Date.now() + config.startTimeoutMs;

        // 1. Wait for the task to be RUNNING and get its private IP.
        for (;;) {
            if (s.cancelled) throw new Cancelled();
            const task = await describeTask(s.taskArn);
            if (!task || task.lastStatus === "STOPPED" || task.desiredStatus === "STOPPED") {
                const why = task?.stoppedReason || task?.containers?.[0]?.reason || "unknown reason";
                throw new Error(`runner task stopped (${why})`);
            }
            const ip = task.lastStatus === "RUNNING" && privateIpOf(task);
            if (ip) {
                s.baseUrl = `http://${ip}:${config.port}`;
                break;
            }
            if (Date.now() > deadline) throw new Error("runner task did not start in time");
            await sleep(config.pollIntervalMs);
        }

        // 2. RUNNING != listening. Wait until the HTTP server answers.
        for (;;) {
            if (s.cancelled) throw new Cancelled();
            try {
                const res = await http.get(`${s.baseUrl}/health`, { timeout: 2000 });
                if (res.data?.ok) return;
            } catch {
                /* not up yet */
            }
            if (Date.now() > deadline) throw new Error("runner did not become healthy in time");
            await sleep(Math.min(1000, config.pollIntervalMs));
        }
    };

    const start = (userId) => {
        if (sessions.size >= config.maxRunners) {
            throw new RunnerUnavailableError(
                "RUNNER_CAPACITY",
                "All code sandboxes are busy right now. Please try again in a minute.",
            );
        }

        const s = {
            userId,
            status: "starting",
            taskArn: null,
            baseUrl: null,
            cancelled: false,
            idleTimer: null,
            releaseTimer: null,
            lastPingAt: 0,
        };
        sessions.set(userId, s);
        armIdleTimer(s);
        log.info(`[runner] starting runner for user ${userId}`);
        const startedAt = Date.now();

        s.ready = launch(s).then(
            () => {
                s.status = "ready";
                s.lastPingAt = Date.now();
                log.info(`[runner] user ${userId} ready at ${s.baseUrl} in ${Date.now() - startedAt} ms`);
                return s.baseUrl;
            },
            async (err) => {
                if (sessions.get(userId) === s) {
                    sessions.delete(userId);
                    clearTimers(s);
                }
                if (s.taskArn) await stopTask(s.taskArn, "runner start aborted");
                if (err instanceof Cancelled) {
                    throw new RunnerUnavailableError("RUNNER_STOPPED", "Your code sandbox was stopped. Please try again.");
                }
                log.error(`[runner] start failed for user ${userId}: ${err.message}`);
                throw new RunnerUnavailableError(
                    "RUNNER_START_FAILED",
                    "Could not start your code sandbox. Please try again in a moment.",
                );
            },
        );
        s.ready.catch(() => {}); // a heartbeat-triggered start may have no awaiter
        return s;
    };

    const listOwnTasks = async (filter) => {
        const arns = [];
        let nextToken;
        do {
            const res = await ecs.send(
                new ListTasksCommand({ cluster: config.cluster, desiredStatus: "RUNNING", nextToken, ...filter }),
            );
            arns.push(...(res.taskArns ?? []));
            nextToken = res.nextToken;
        } while (nextToken);
        return arns;
    };

    /** Stop runners started by earlier (crashed / replaced) backend instances. */
    const stopLeftoverRunners = async () => {
        const arns = await listOwnTasks({ family });
        for (let i = 0; i < arns.length; i += 100) {
            const res = await ecs.send(
                new DescribeTasksCommand({ cluster: config.cluster, tasks: arns.slice(i, i + 100) }),
            );
            for (const task of res.tasks ?? []) {
                if (task.startedBy !== startedBy) await stopTask(task.taskArn, "backend restarted");
            }
        }
    };

    /** Drop sessions whose task died; stop tasks no session knows about. */
    const reconcile = async () => {
        const running = new Set(await listOwnTasks({ startedBy }));

        for (const s of [...sessions.values()]) {
            if (s.status === "ready" && !running.has(s.taskArn)) {
                log.warn(`[runner] runner for user ${s.userId} disappeared; forgetting it`);
                sessions.delete(s.userId);
                clearTimers(s);
            }
        }

        if (launching > 0) return; // an in-flight RunTask has no ARN recorded yet
        const tracked = new Set([...sessions.values()].map((s) => s.taskArn));
        for (const arn of running) {
            if (!tracked.has(arn)) await stopTask(arn, "orphaned runner");
        }
    };

    return {
        mode: "ecs",

        status: (userId) => sessions.get(userId)?.status ?? "stopped",

        /** Heartbeat: make sure a runner exists (starting it if needed) and keep it alive. */
        ensure(userId) {
            const s = sessions.get(userId) ?? start(userId);
            touch(s);
            return s.status;
        },

        /** Run/Submit: get the runner URL, waiting up to `waitMs` for a cold start. */
        async acquire(userId, { waitMs }) {
            const s = sessions.get(userId) ?? start(userId);
            touch(s);
            if (s.status === "ready") return s.baseUrl;

            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new RunnerUnavailableError(
                                "RUNNER_STARTING",
                                "Your code sandbox is still starting (about a minute on first use). Please try again shortly.",
                            ),
                        ),
                    waitMs,
                );
            });
            try {
                return await Promise.race([s.ready, timeout]);
            } finally {
                clearTimeout(timer);
            }
        },

        /** Tab closed (grace period, a refresh cancels it) or logout (immediate). */
        release(userId, { immediate = false } = {}) {
            const s = sessions.get(userId);
            if (!s) return;
            if (immediate) {
                stop(userId, "logout");
                return;
            }
            clearTimeout(s.releaseTimer);
            s.releaseTimer = setTimeout(() => stop(userId, "tab closed"), config.releaseGraceMs);
            s.releaseTimer.unref?.();
        },

        /** The runner stopped answering: forget it so the next request starts a fresh one. */
        markBroken(userId, baseUrl) {
            if (sessions.get(userId)?.baseUrl === baseUrl) stop(userId, "runner unreachable");
        },

        async init() {
            try {
                await stopLeftoverRunners();
            } catch (err) {
                log.warn(`[runner] leftover cleanup failed: ${err.message}`);
            }
            reconcileTimer = setInterval(() => {
                reconcile().catch((err) => log.warn(`[runner] reconcile failed: ${err.message}`));
            }, config.reconcileIntervalMs);
            reconcileTimer.unref?.();
            log.info(`[runner] ecs mode ready (startedBy=${startedBy}, max ${config.maxRunners} runners)`);
        },

        async shutdown() {
            clearInterval(reconcileTimer);
            await Promise.allSettled([...sessions.keys()].map((id) => stop(id, "backend shutting down")));
        },

        stats() {
            const all = [...sessions.values()];
            return {
                mode: "ecs",
                active: all.length,
                starting: all.filter((s) => s.status === "starting").length,
                max: config.maxRunners,
            };
        },

        // exposed for tests
        _reconcile: reconcile,
    };
}

export function createRunnerManager({
    config = readRunnerConfig(),
    ecs,
    http = axios,
    log = console,
} = {}) {
    if (config.mode === "static") return createStaticManager(config);
    if (config.mode === "ecs") {
        return createEcsManager(config, {
            ecs: ecs ?? new ECSClient({ region: config.region }),
            http,
            log,
        });
    }
    throw new Error(`Unknown RUNNER_MODE "${config.mode}" (use "static" or "ecs").`);
}

const runnerManager = createRunnerManager();
export default runnerManager;
