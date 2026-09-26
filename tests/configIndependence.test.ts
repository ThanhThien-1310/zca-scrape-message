import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Tests of the logic must not depend on what the user typed in config.ts. Each file below is run in its own process
 * with a preload that changes session hours, quiet period, warm-up, blind spell, chat back-off/echo/ledger and
 * recovery margin away from the defaults. A test that hard-codes a default value fails here; the fix is to use the
 * exported constant (QUIET_MS...) or an explicit parameter.
 */
const FILES = [
    "time",
    "recovery",
    "extract",
    "sessions",
    "schedule",
    "watchState",
    "watchStatusReport",
    "runnerState",
    "chatCycle",
    "chatState",
    "recoveryPlan",
    "affectedSessions",
    "builtReports",
];

for (const [name, direction] of FILES.flatMap((n) => [[n, "down"], [n, "up"]] as const)) {
    test(`tests/${name}.test.ts still passes when config.ts holds non-default values (${direction})`, () => {
        const r = spawnSync(process.execPath, ["--import", "tsx", "--import", "./tests/helpers/mutateConfig.ts", `tests/${name}.test.ts`], { cwd: repoRoot, encoding: "utf8", timeout: 60_000, env: { ...process.env, CONFIG_MUTATION: direction } });
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        const failed = out.split("\n").filter((l) => l.startsWith("✖") || l.includes("AssertionError"));
        assert.equal(r.status, 0, `exit ${r.status}: ${failed.slice(0, 6).join(" | ")}`);
    });
}
