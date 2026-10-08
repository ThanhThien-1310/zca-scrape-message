import fs from "node:fs";
import { connectDb, sql } from "../store/db.js";

/**
 * Marks messages as read by the bot: for every `{ maNhom, maTinNhan, maTrangThai }`
 * in the input file, sets `StatusId = maTrangThai` and `HasRead = 1` on the
 * matching `Zalo_CrawlMessage` row (GroupId + MessageId). One transaction:
 * any failure rolls everything back. A pair with no matching row only warns.
 *
 *   npm run mark:messages -- output/marks.json [--dry-run]
 */
interface Mark {
    maNhom: string;
    maTinNhan: string;
    maTrangThai: number;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const inputPath = args.find((a) => !a.startsWith("--"));
    if (!inputPath) {
        console.error("Usage: npm run mark:messages -- <marks.json> [--dry-run]");
        process.exit(1);
    }

    const marks = JSON.parse(fs.readFileSync(inputPath, "utf8")) as Mark[];
    if (!Array.isArray(marks) || marks.length === 0) {
        console.log("No marks in input, nothing to update.");
        return;
    }

    if (dryRun) {
        const byStatus = new Map<number, number>();
        for (const m of marks) byStatus.set(m.maTrangThai, (byStatus.get(m.maTrangThai) ?? 0) + 1);
        console.log(`[dry-run] would update ${marks.length} message(s):`);
        for (const [status, count] of [...byStatus].sort((a, b) => a[0] - b[0])) console.log(`  StatusId=${status}: ${count}`);
        return;
    }

    const pool = await connectDb();
    const tx = new sql.Transaction(pool);
    let updated = 0;
    const missing: Mark[] = [];
    try {
        await tx.begin();
        for (const m of marks) {
            const result = await new sql.Request(tx)
                .input("GroupId", sql.VarChar(128), m.maNhom)
                .input("MessageId", sql.VarChar(128), m.maTinNhan)
                .input("StatusId", sql.Int, m.maTrangThai)
                .query("UPDATE Zalo_CrawlMessage SET StatusId = @StatusId, HasRead = 1 WHERE GroupId = @GroupId AND MessageId = @MessageId");
            if (result.rowsAffected[0] === 0) missing.push(m);
            else updated += result.rowsAffected[0];
        }
        await tx.commit();
    } catch (err) {
        await tx.rollback().catch(() => undefined);
        throw err;
    } finally {
        await pool.close();
    }

    console.log(`Updated ${updated} row(s).`);
    for (const m of missing) console.warn(`Warning: no row for GroupId=${m.maNhom} MessageId=${m.maTinNhan}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
