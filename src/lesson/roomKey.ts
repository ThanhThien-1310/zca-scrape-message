import type { RoomKey } from "../types/index.js";

/** `fn_LookupRoomIds` matches the room name as stored in the Room table, which has no "PM" prefix. */
export function roomLookupName(phongMay: string): string {
    return phongMay.replace(/^PM\s*/i, "").trim();
}

export function roomKeyString(k: RoomKey): string {
    return [k.room, k.capHoc ?? "", k.tenRieng, k.coSo ?? "", k.khuVuc].join("|");
}

