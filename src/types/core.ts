// Shared core types. Import them from "../types/index.js".

export interface LockHolder {
    pid: number;
    owner: string;
    at: number;
}

export type LockResult = { ok: true } | { ok: false; heldBy: LockHolder };
