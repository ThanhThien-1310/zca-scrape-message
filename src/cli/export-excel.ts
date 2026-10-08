import { MessageStore } from "../store/messageStore.js";
import { exportThreadExcel, normalizeSenderName } from "../export/exportExcel.js";

/**
 * CLI: npx tsx src/cli/export-excel.ts <groupId> [senderName]
 * Reads already-scraped messages for <groupId> from the JSON store and
 * writes them to a .xlsx file under data/export, optionally filtered to one
 * sender's messages. Find groupId via the MCP server's list_threads tool or
 * by checking the data/ directory's .json filenames.
 */
async function main() {
    const [groupId, senderName] = process.argv.slice(2);
    if (!groupId) {
        console.error("Usage: npx tsx src/cli/export-excel.ts <groupId> [senderName]");
        process.exit(1);
    }

    const store = new MessageStore();
    const messages = await store.readThread(groupId);
    if (messages.length === 0) {
        console.error(`[export] no stored messages found for group "${groupId}" — run a scrape first.`);
        process.exit(1);
    }

    const filePath = exportThreadExcel(groupId, messages, {
        senderName,
        fileSuffix: senderName ? senderName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_") : undefined,
    });

    const kept = senderName ? messages.filter((m) => normalizeSenderName(m.senderName) === normalizeSenderName(senderName)).length : messages.length;
    console.log(`[export] "${groupId}": ${kept}/${messages.length} messages${senderName ? ` from "${senderName}"` : ""} -> ${filePath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
