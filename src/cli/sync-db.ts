import { MessageStore } from "../store/messageStore.js";
import { toCrawlMessageRow, type MappingWarning } from "../store/dbMapping.js";
import { randomUUID } from "node:crypto";
import { connectDb, sql } from "../store/db.js";
import type { CrawlMessageRow } from "../types/index.js";

/**
 * Pushes the scraped `data/<groupId>.json` files into the `Zalo_CrawlMessage`
 * table (see Zalo_CrawlMessage.md). By default it is a dry run: it reads every
 * thread, maps each message to the table's columns and prints what would be
 * written, without connecting to the database. `--apply` connects (settings
 * from .env) and writes for real.
 */
// The table has no column defaults (checked against the live DB), so the
// script fills these itself. HasRead/StatusId values follow Zalo_CrawlMessage.md:
// not yet read by the downstream bot, and "not classified yet".
const DEFAULT_HAS_READ = false;
const DEFAULT_STATUS_ID = -1;

/** `Created` is a plain `datetime` in +07:00: shift the instant so its UTC clock reads Vietnam time (the driver sends UTC components). */
function vietnamNow(): Date {
    return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/**
 * Inserts each row unless a row with the same (GroupId, MessageId) already
 * exists — the table has no unique index on that pair, so re-running must not
 * duplicate. If it already exists, only `MessageType`/`Url` are refreshed (a
 * photo row can gain its image path after the first sync). Everything runs in
 * one transaction: any failure rolls the whole batch back.
 */
async function applyRows(rows: CrawlMessageRow[]): Promise<{ inserted: number; updated: number }> {
    const pool = await connectDb();
    const tx = new sql.Transaction(pool);
    let inserted = 0;
    let updated = 0;
    try {
        await tx.begin();
        for (const r of rows) {
            const req = new sql.Request(tx);
            req.input("Id", sql.UniqueIdentifier, randomUUID());
            req.input("MessageId", sql.VarChar(64), r.MessageId);
            req.input("MessageType", sql.VarChar(32), r.MessageType);
            req.input("IsSelf", sql.Bit, r.IsSelf);
            req.input("SenderId", sql.VarChar(64), r.SenderId);
            req.input("SenderName", sql.NVarChar(256), r.SenderName);
            req.input("GroupId", sql.VarChar(64), r.GroupId);
            req.input("GroupName", sql.NVarChar(50), r.GroupName);
            req.input("Timestamp", sql.BigInt, r.Timestamp);
            req.input("TextContent", sql.NText, r.TextContent);
            req.input("Url", sql.NVarChar(sql.MAX), r.Url);
            req.input("MessageStatus", sql.Int, r.MessageStatus);
            req.input("StatusId", sql.Int, DEFAULT_STATUS_ID);
            req.input("HasRead", sql.Bit, DEFAULT_HAS_READ);
            req.input("Created", sql.DateTime, vietnamNow());

            const result = await req.query(`
                IF EXISTS (SELECT 1 FROM Zalo_CrawlMessage WHERE GroupId = @GroupId AND MessageId = @MessageId)
                BEGIN
                    UPDATE Zalo_CrawlMessage
                       SET MessageType = @MessageType, Url = @Url
                     WHERE GroupId = @GroupId AND MessageId = @MessageId
                       AND (ISNULL(MessageType, '') <> @MessageType OR ISNULL(Url, '') <> ISNULL(@Url, ''));
                    SELECT 'updated' AS action, @@ROWCOUNT AS n;
                END
                ELSE
                BEGIN
                    INSERT INTO Zalo_CrawlMessage
                        (Id, MessageId, MessageType, IsSelf, SenderId, SenderName, GroupId, GroupName,
                         Timestamp, TextContent, Url, MessageStatus, StatusId, HasRead, Created)
                    VALUES
                        (@Id, @MessageId, @MessageType, @IsSelf, @SenderId, @SenderName, @GroupId, @GroupName,
                         @Timestamp, @TextContent, @Url, @MessageStatus, @StatusId, @HasRead, @Created);
                    SELECT 'inserted' AS action, 1 AS n;
                END`);
            const { action, n } = result.recordset[0] as { action: string; n: number };
            if (action === "inserted") inserted++;
            else updated += n;
        }
        await tx.commit();
    } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
    } finally {
        await pool.close();
    }
    return { inserted, updated };
}

async function main() {
    const apply = process.argv.includes("--apply");

    const store = new MessageStore();
    const rows: CrawlMessageRow[] = [];
    const warningCounts = new Map<MappingWarning, number>();
    const perThread: Array<{ groupId: string; total: number }> = [];

    for (const groupId of store.listThreads()) {
        const messages = await store.readThread(groupId);
        for (const m of messages) {
            const { row, warnings } = toCrawlMessageRow(m);
            rows.push(row);
            for (const w of warnings) warningCounts.set(w, (warningCounts.get(w) ?? 0) + 1);
        }
        perThread.push({ groupId, total: messages.length });
    }

    console.log(`[sync] ${apply ? "APPLY" : "DRY RUN"} — ${rows.length} row(s) from ${perThread.length} thread(s)${apply ? "" : "; nothing is written anywhere"}.\n`);
    for (const t of perThread) console.log(`  ${t.groupId}: ${t.total} message(s)`);

    const byType = { text: 0, image: 0 };
    for (const r of rows) byType[r.MessageType]++;
    console.log(`\nMessageType: text=${byType.text}, image=${byType.image}`);

    const ids = new Map<string, number>();
    for (const r of rows) {
        const key = `${r.GroupId}|${r.MessageId}`;
        ids.set(key, (ids.get(key) ?? 0) + 1);
    }
    const dupes = [...ids.entries()].filter(([, n]) => n > 1);
    console.log(`Duplicate (GroupId, MessageId) pairs: ${dupes.length}`);

    if (warningCounts.size === 0) {
        console.log("\nNo mapping warnings.");
    } else {
        console.log("\nWarnings (rows still included unless noted):");
        for (const [w, n] of warningCounts) console.log(`  ${w}: ${n}`);
    }

    console.log("\nSample rows:");
    const sampleText = rows.find((r) => r.MessageType === "text" && r.TextContent);
    const sampleImage = rows.find((r) => r.MessageType === "image");
    for (const r of [sampleText, sampleImage]) if (r) console.log(JSON.stringify(r, null, 2));

    if (!apply) {
        console.log("\nDry run only. To write to the database run: npm run sync:db -- --apply");
        return;
    }

    // Empty-content text rows are leftovers of unsupported message types
    // (video, sticker...) saved before the type filter existed — not worth a DB row.
    const toWrite = rows.filter((r) => !(r.MessageType === "text" && !r.TextContent));
    console.log(`\nWriting ${toWrite.length} row(s) (skipping ${rows.length - toWrite.length} empty text row(s))...`);
    const { inserted, updated } = await applyRows(toWrite);
    console.log(`Done: ${inserted} inserted, ${updated} updated, ${toWrite.length - inserted - updated} already up to date.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
