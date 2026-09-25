import type { RoomKey } from "./types.js";

/** `fn_LookupRoomIds` matches the room name as stored in the Room table, which has no "PM" prefix. */
export function roomLookupName(phongMay: string): string {
    return phongMay.replace(/^PM\s*/i, "").trim();
}

export function roomKeyString(k: RoomKey): string {
    return [k.room, k.capHoc ?? "", k.tenRieng, k.coSo ?? "", k.khuVuc].join("|");
}

/** Resolves a batch of rooms to Room.Id; a key that does not match a room maps to null. */
export type RoomLookup = (keys: RoomKey[]) => Promise<Map<string, number | null>>;
