import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MessageStore } from "../store/messageStore.js";

test("listThreads ignores dot-files such as the scrape queue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
    fs.writeFileSync(path.join(dir, "g111.json"), "[]", "utf8");
    fs.writeFileSync(path.join(dir, "222.json"), "[]", "utf8");
    fs.writeFileSync(path.join(dir, ".scrape-queue.json"), '["LC_HoaSen1_TĐ"]', "utf8");
    fs.writeFileSync(path.join(dir, "notes.txt"), "x", "utf8");

    const store = new MessageStore(dir);
    assert.deepEqual(store.listThreads().sort(), ["222", "g111"]);
});
