import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MessageStore } from "../store/messageStore.js";

/**
 * Exposes the message store (filled by realtime.ts + history/playwrightClient.ts)
 * to any MCP client — Claude Code, Claude Desktop, etc. — as read-only tools.
 * This process never touches the Zalo API itself; it only reads the JSON
 * files bot/index.ts already wrote to disk, so it can run independently of
 * whether the bot is currently logged in.
 */

const store = new MessageStore();
const server = new McpServer({ name: "zalo-read-only", version: "1.0.0" });

server.tool(
    "list_threads",
    "List every conversation (group or DM) that has stored messages, with its display name and message count each.",
    {},
    async () => {
        const groupIds = store.listThreads();
        const groups = await Promise.all(
            groupIds.map(async (groupId) => {
                const rows = await store.readThread(groupId);
                return { groupId, groupName: rows.at(-1)?.groupName ?? null, messageCount: rows.length };
            }),
        );
        return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
    },
);

server.tool(
    "get_recent_messages",
    "Get the most recent messages from one conversation, oldest first.",
    { groupId: z.string().describe("Conversation id, as returned by list_threads"), limit: z.number().int().positive().max(500).optional().describe("Max messages to return (default 50)") },
    async ({ groupId, limit }) => {
        const rows = await store.getRecent(groupId, limit ?? 50);
        return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    },
);

server.tool(
    "search_messages",
    "Full-text search message content across one or all conversations, newest first.",
    {
        query: z.string().describe("Text to search for (case-insensitive substring match)"),
        groupId: z.string().optional().describe("Restrict the search to a single conversation id"),
        limit: z.number().int().positive().max(500).optional().describe("Max results to return (default 50)"),
    },
    async ({ query, groupId, limit }) => {
        const rows = await store.search(query, { groupId, limit: limit ?? 50 });
        return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp] zalo-read-only MCP server ready on stdio");
