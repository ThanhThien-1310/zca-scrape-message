import { readRunnerState, runnerHealth } from "../runner/runnerState.js";
import type { RunnerState } from "../types/index.js";
import type { RunnerSnapshot } from "./decide.js";

/**
 * Sức khoẻ và trạng thái của `bot:runner` tại thời điểm `now`, đọc từ `data/.runner-state.json` (không gọi vào mã của runner,
 * không đụng khoá cào). `state` chỉ truyền vào khi test.
 */
export function takeRunnerSnapshot(now: number, state: RunnerState | null = readRunnerState()): RunnerSnapshot {
    return { health: runnerHealth(state, now), phase: state?.state ?? null };
}
