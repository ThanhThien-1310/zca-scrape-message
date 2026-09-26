import { connectDb, sql } from "../store/db.js";
import { roomKeyString } from "./roomKey.js";
import type { RoomLookup } from "../types/index.js";

interface Row {
    Room: string;
    SchoolLevel: string | null;
    SchoolBaseName: string;
    SchoolBranch: string | null;
    Area: string;
    RoomIds: string | null;
    Type: number;
}

/**
 * Resolves rooms with dbo.fn_LookupRoomIds in one round trip for the whole
 * batch. `Type = 0` means found; any other value (2 = no such room, 3 = no such
 * school) or a non-numeric `RoomIds` maps to null.
 */
export const lookupRoomIds: RoomLookup = async (keys) => {
    const pool = await connectDb();
    try {
        const table = new sql.Table("RoomSchoolArea");
        table.columns.add("Room", sql.NVarChar(200));
        table.columns.add("SchoolLevel", sql.NVarChar(50));
        table.columns.add("SchoolBaseName", sql.NVarChar(100));
        table.columns.add("SchoolBranch", sql.NVarChar(50));
        table.columns.add("Area", sql.NVarChar(50));
        for (const k of keys) table.rows.add(k.room, k.capHoc, k.tenRieng, k.coSo, k.khuVuc);

        const result = await pool
            .request()
            .input("t", table)
            .query("SELECT Room, SchoolLevel, SchoolBaseName, SchoolBranch, Area, RoomIds, Type FROM dbo.fn_LookupRoomIds(@t)");

        const found = new Map<string, number | null>();
        for (const row of result.recordset as Row[]) {
            const key = roomKeyString({ room: row.Room, capHoc: row.SchoolLevel, tenRieng: row.SchoolBaseName, coSo: row.SchoolBranch, khuVuc: row.Area });
            found.set(key, row.Type === 0 && /^\d+$/.test(String(row.RoomIds ?? "")) ? Number(row.RoomIds) : null);
        }
        return found;
    } finally {
        await pool.close();
    }
};
