import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { addDays, todayVietnam } from "../lesson/time.js";
import { pidAlive, STALE_AFTER_MS } from "../watch/watchState.js";
import type { Health } from "../types/index.js";
import type { SlotRecord } from "./decide.js";

/**
 * Những gì `bot:total` để lại trên đĩa, để người (hoặc agent) biết nó còn sống không và hai đợt hôm nay ra sao:
 *  - `data/.total-state.json`        nhịp tim, trạng thái hiện tại
 *  - `data/.total-slots.json`        kết quả từng đợt (khoá `<ngày>|<morning|afternoon>`), nhờ đó khởi động lại không xuất trùng
 *  - `data/.total-report-files.json` tên file `-auto` mới nhất của từng (ngày, đợt, tiêu đề), để xoá đúng bản cũ của đợt đó
 */
export type TotalPhase = "idle" | "waiting" | "running" | "stopped";

export interface TotalState {
    pid: number;
    startedAt: number;
    lastBeat: number;
    state: TotalPhase;
}

export interface TotalFiles {
    state: string;
    slots: string;
    tracker: string;
}

export const DEFAULT_TOTAL_FILES: TotalFiles = {
    state: path.join(config.dataDir, ".total-state.json"),
    slots: path.join(config.dataDir, ".total-slots.json"),
    tracker: path.join(config.dataDir, ".total-report-files.json"),
};

const PHASES: TotalPhase[] = ["idle", "waiting", "running", "stopped"];

function writeAtomic(file: string, value: unknown): void {
    writeFileAtomic(file, JSON.stringify(value, null, 2));
}

/** File thiếu, hỏng hoặc sai dạng đều đọc ra null. */
export function readTotalState(file: string = DEFAULT_TOTAL_FILES.state): TotalState | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<TotalState>;
        const ok = typeof v.pid === "number" && typeof v.startedAt === "number" && typeof v.lastBeat === "number" && PHASES.includes(v.state as TotalPhase);
        return ok ? (v as TotalState) : null;
    } catch {
        return null;
    }
}

/** Từ chối (không đổi gì) khi một `bot:total` khác chắc chắn còn sống; ngược lại ghi trạng thái `idle` mới. */
export function startTotal(
    now: number,
    pid: number,
    file: string = DEFAULT_TOTAL_FILES.state,
    isAlive: (pid: number) => boolean = pidAlive,
): { anotherInstanceAlive: boolean; crashed: boolean } {
    const prev = readTotalState(file);
    if (prev && prev.state !== "stopped" && prev.pid !== pid && now - prev.lastBeat < STALE_AFTER_MS && isAlive(prev.pid)) {
        return { anotherInstanceAlive: true, crashed: false };
    }
    writeAtomic(file, { pid, startedAt: now, lastBeat: now, state: "idle" } satisfies TotalState);
    return { anotherInstanceAlive: false, crashed: !!prev && prev.state !== "stopped" };
}

/** Chỉ ghi nhịp tim, giữ nguyên trạng thái. */
export function beatTotal(now: number, file: string = DEFAULT_TOTAL_FILES.state): void {
    const s = readTotalState(file);
    if (!s) return;
    s.lastBeat = now;
    writeAtomic(file, s);
}

export function setTotalPhase(now: number, phase: TotalPhase, file: string = DEFAULT_TOTAL_FILES.state): void {
    const s = readTotalState(file);
    if (!s) return;
    s.state = phase;
    s.lastBeat = now;
    writeAtomic(file, s);
}

export function stopTotal(now: number, file: string = DEFAULT_TOTAL_FILES.state): void {
    setTotalPhase(now, "stopped", file);
}

export function totalHealth(state: TotalState | null, now: number): Health {
    if (!state) return "none";
    if (state.state === "stopped") return "stopped";
    if (now - state.lastBeat > STALE_AFTER_MS) return "dead";
    return "alive";
}

export type SlotMap = Record<string, SlotRecord>;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function isSlotRecord(v: unknown): v is SlotRecord {
    if (typeof v !== "object" || v === null) return false;
    const r = v as Record<string, unknown>;
    return (
        typeof r.firstRunAt === "number" &&
        typeof r.lastRunAt === "number" &&
        typeof r.complete === "boolean" &&
        typeof r.final === "boolean" &&
        typeof r.failures === "number" &&
        isStringArray(r.pending) &&
        isStringArray(r.files) &&
        isStringArray(r.warnings) &&
        (r.printedAt === undefined || typeof r.printedAt === "number") &&
        (r.printed === undefined || isStringArray(r.printed))
    );
}

/** File thiếu hoặc hỏng đọc ra rỗng; mục sai dạng bị bỏ (mất nhớ chỉ khiến một đợt được xuất lại, không hỏng gì). */
export function readSlots(file: string = DEFAULT_TOTAL_FILES.slots): SlotMap {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
        return Object.fromEntries(Object.entries(v).filter(([, record]) => isSlotRecord(record))) as SlotMap;
    } catch {
        return {};
    }
}

export function writeSlots(slots: SlotMap, file: string = DEFAULT_TOTAL_FILES.slots): void {
    writeAtomic(file, slots);
}

/** Giữ các đợt trong `keepDays` ngày gần nhất (theo ngày ở đầu khoá), bỏ phần cũ hơn. */
export function pruneSlots(slots: SlotMap, now: number, keepDays = 3): SlotMap {
    const oldest = addDays(todayVietnam(now), -keepDays);
    return Object.fromEntries(Object.entries(slots).filter(([key]) => key.split("|")[0] >= oldest));
}

/** Thêm hoặc thay kết quả của một đợt, dọn các đợt cũ trong cùng lần ghi. */
export function saveSlot(key: string, record: SlotRecord, now: number, file: string = DEFAULT_TOTAL_FILES.slots): void {
    const slots = pruneSlots(readSlots(file), now);
    slots[key] = record;
    writeSlots(slots, file);
}
