import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll } from "../src/lesson/extract.js";
import { todayVietnam } from "../src/lesson/time.js";
import { repoRoot, srcDir } from "../src/core/paths.js";
import { completeSnapshot, enqueueTarget, takeSnapshot } from "../src/scrape/scrapeQueue.js";
import { MessageStore } from "../src/store/messageStore.js";
import type { NormalizedMessage, Report, SourceMessage } from "../src/types/index.js";

/**
 * Load simulation, offline: N synthetic groups in a temp directory. It never touches `data/` (except the one
 * real subprocess call in mục 6 — xem ghi chú ở đó, dùng ngày giả 2099-01-01 để không đè dữ liệu thật), the
 * database or Zalo Desktop. Measures the parts of the pipeline that do not need the Zalo UI — KHÔNG đo được
 * tốc độ cào thật (phụ thuộc Zalo Desktop/DOM/mạng, chỉ đo được bằng cào thật — xem `npm run runner:timing`
 * cho số liệu thật đã ghi lại từ các lần chạy thật). Mục 8 (mô hình chu kỳ) ghép số cào thật đó với số đo
 * được ở đây.
 *
 *   npx tsx scripts/benchLoad.ts [--groups 300] [--history 3000] [--scrape-seconds 8,15,30]
 */
const self = fileURLToPath(import.meta.url);
const arg = (name: string, fallback: string): string => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
};

const DAY_MS = 86_400_000;
const groupIdOf = (i: number) => `g${1000000000000000000n + BigInt(i)}`;
const groupNameOf = (i: number) => `LC_Nhom${String(i).padStart(3, "0")}_Q${(i % 12) + 1}`;

function pct(values: number[], p: number): number {
    const s = [...values].sort((a, b) => a - b);
    return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const fmt = (n: number, d = 1) => n.toFixed(d);
const mb = (bytes: number) => fmt(bytes / 1024 / 1024);
const timed = async <T>(fn: () => T | Promise<T>): Promise<[T, number]> => {
    const t = performance.now();
    const r = await fn();
    return [r, performance.now() - t];
};
function line(label: string, value: string): void {
    console.log(`  ${label.padEnd(44)} ${value}`);
}

const REPORT = (kind: string, i: number) =>
    [
        `BÁO CÁO ${kind} BUỔI DẠY`,
        `- Tên Giáo Viên: Giáo Viên ${i}`,
        `- Tên Trợ Giảng: Trợ Giảng ${i}`,
        `- Phòng Máy: PM${(i % 6) + 1}`,
        "- Tổng số máy: 36",
        `- Tổng số máy bị lỗi: ${i % 5 === 0 ? 2 : 0}`,
        "- Số máy còn thiếu cho HS: 0",
        "- Tình trạng Netsupport: T",
        "- Tình trạng Internet:T",
        "- Tình trạng Loa, Âm ly: B",
        "- Tình trạng máy lạnh, máy quạt: K",
    ].join("\n");
const CHATTER = ["ok anh", "đã nhận", "em cảm ơn ạ", "phòng 3 hôm nay dùng máy chiếu nhé mọi người", "vâng ạ", "cho em hỏi lịch tuần sau có đổi không ạ, em cần xếp phòng"];

/** Messages of one group: `history` spread over the last 60 days plus `today` in the current Vietnam day. */
function makeMessages(gi: number, history: number, today: number, now: number): NormalizedMessage[] {
    const out: NormalizedMessage[] = [];
    const startOfToday = Date.parse(`${todayVietnam(now)}T00:00:00+07:00`);
    for (let k = 0; k < history + today; k++) {
        const isToday = k >= history;
        const ts = isToday ? startOfToday + Math.floor(((k - history) / Math.max(today, 1)) * 10 * 3_600_000) : now - 2 * DAY_MS - Math.floor(Math.random() * 58 * DAY_MS);
        const report = k % 7 === 0;
        out.push({
            msgId: `${gi}-${k}`,
            groupId: groupIdOf(gi),
            groupName: groupNameOf(gi),
            threadType: "group",
            senderId: `u${gi}_${k % 9}`,
            senderName: `Người ${k % 9}`,
            isSelf: false,
            ts,
            msgType: "desktop.text",
            content: report ? REPORT(k % 2 ? "ĐẦU" : "CUỐI", gi + k) : CHATTER[k % CHATTER.length] + " ".repeat(k % 40),
        });
    }
    return out;
}

async function childProducer(): Promise<void> {
    const queueFile = arg("--queue", "");
    const groups = Number(arg("--groups", "100"));
    for (let i = 0; i < groups; i++) {
        enqueueTarget(groupNameOf(i), queueFile);
        await new Promise((r) => setTimeout(r, Math.random() * 40));
    }
}

async function raceTrial(dir: string, groups: number): Promise<number> {
    const queueFile = path.join(dir, `.q-${Math.random().toString(36).slice(2)}.jsonl`);
    const producer = spawn(process.execPath, ["--import", "tsx", self, "--child-producer", "--queue", queueFile, "--groups", String(groups)], { stdio: "ignore" });
    let done = false;
    producer.on("close", () => (done = true));
    const handledEver = new Set<string>();
    const drain = () => {
        const snapshot = takeSnapshot(queueFile);
        for (const t of snapshot.targets) handledEver.add(t);
        completeSnapshot(snapshot, { file: queueFile });
    };
    while (!done) {
        drain();
        await new Promise((r) => setTimeout(r, 15));
    }
    drain();
    return groups - handledEver.size;
}

async function main(): Promise<void> {
    if (process.argv.includes("--child-producer")) return childProducer();

    const groups = Number(arg("--groups", "300"));
    const history = Number(arg("--history", "3000"));
    const todayPer = 40;
    const scrapeSeconds = arg("--scrape-seconds", "8,15,30").split(",").map(Number);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zalo-bench-"));
    const now = Date.now();
    console.log(`Giả lập ${groups} nhóm x ${history} tin lịch sử + ${todayPer} tin hôm nay, thư mục tạm ${dir}\n`);

    try {
        // 1. Build the data set.
        console.log("1) Dựng dữ liệu (ghi qua MessageStore.saveMany)");
        const store = new MessageStore(dir);
        const [, buildMs] = await timed(() => {
            for (let g = 0; g < groups; g++) store.saveMany(makeMessages(g, history, todayPer, now));
        });
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("."));
        const totalBytes = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
        line("Tổng số tin", String(groups * (history + todayPer)));
        line("Dung lượng data/ (JSON)", `${mb(totalBytes)} MB, mỗi nhóm ${mb(totalBytes / groups)} MB`);
        line("Ghi lần đầu toàn bộ", `${fmt(buildMs / 1000)} s`);

        // 2. Cold load, as bot:runner and every extract/sync child does each cycle.
        console.log("\n2) Nạp toàn bộ tin (loadMessages của mỗi chu kỳ; extract và sync cũng tự nạp lại)");
        const cold = new MessageStore(dir);
        const [all, loadMs] = await timed(async () => {
            const acc: SourceMessage[] = [];
            for (const id of cold.listThreads()) acc.push(...(await cold.readThread(id)));
            return acc;
        });
        global.gc?.();
        line("Thời gian nạp", `${fmt(loadMs / 1000, 2)} s cho ${all.length} tin`);
        line("Bộ nhớ tiến trình (rss / heap)", `${mb(process.memoryUsage().rss)} / ${mb(process.memoryUsage().heapUsed)} MB (store giữ cache mãi)`);

        // 3. Single-message save = whole-file rewrite.
        console.log("\n3) Lưu 1 tin mới (ghi lại nguyên file nhóm, đây là đường bot:scrape/watch đi qua)");
        const saveMs: number[] = [];
        for (let k = 0; k < 300; k++) {
            const gi = k % groups;
            const [, ms] = await timed(() => cold.save({ ...makeMessages(gi, 0, 1, now)[0], msgId: `new-${k}`, ts: now + k }));
            saveMs.push(ms);
        }
        line("save() p50 / p95 / max", `${fmt(pct(saveMs, 50))} / ${fmt(pct(saveMs, 95))} / ${fmt(Math.max(...saveMs))} ms`);

        // 4. Queue write cost and race between watch (adds) and runner (removes).
        console.log("\n4) Hàng chờ");
        const qFile = path.join(dir, ".scrape-events.jsonl");
        const enqMs: number[] = [];
        for (let k = 0; k < 2000; k++) {
            const [, ms] = await timed(() => enqueueTarget(groupNameOf(k % groups), qFile, now + k));
            enqMs.push(ms);
        }
        line("enqueueTarget p50 / p95 / max (100 nhóm trong hàng)", `${fmt(pct(enqMs, 50), 2)} / ${fmt(pct(enqMs, 95), 2)} / ${fmt(Math.max(...enqMs), 2)} ms`);
        const lost: number[] = [];
        for (let t = 0; t < 5; t++) lost.push(await raceTrial(dir, groups));
        line(`Mất cập nhật khi watch thêm, runner xoá đồng thời (5 lượt x ${groups} nhóm)`, `${lost.join(", ")} nhóm bị mất mỗi lượt`);

        // 5. Extraction over the whole store, one phase.
        console.log("\n5) Trích xuất báo cáo một giai đoạn (extractAll, không tra DB)");
        const day = todayVietnam(now);
        const buoi = "morningstart" as const;
        const [extracted, extractMs] = await timed(() => extractAll(all, { day, buoi }));
        line(`extractAll giai đoạn ${buoi}`, `${fmt(extractMs)} ms, xét ${extracted.summary.xet} tin, ${extracted.summary.baoCao} báo cáo`);

        // 6. fill-status-reports THẬT (mở PowerShell + Excel COM thật, đúng script buildSession() dùng) — dùng
        // ngày giả 2099-01-01 nên KHÔNG ghi đè bất kỳ báo cáo thật nào của hôm nay; xoá đúng thư mục vừa tạo
        // và bỏ các mục 2099 trong data/.status-report-files.json (file nhớ tên bản mới nhất của từng giai đoạn).
        console.log("\n6) Xuất 5 file trạng thái thiết bị THẬT (fill-status-reports.ts, Excel COM thật — ngày giả 2099-01-01, tự dọn sau khi đo)");
        const outputJsonPath = path.join(dir, "bench-output.json");
        fs.writeFileSync(outputJsonPath, JSON.stringify(extracted.reports satisfies Report[]), "utf8");
        const [fillRun, fillMs] = await timed(
            () =>
                new Promise<{ code: number; output: string }>((resolve) => {
                    const child = spawn(process.execPath, ["--import", "tsx", path.join(srcDir, "cli", "fill-status-reports.ts"), outputJsonPath, "--day", "2099-01-01", "--buoi", buoi], { cwd: repoRoot });
                    let output = "";
                    child.stdout.on("data", (d) => (output += d));
                    child.stderr.on("data", (d) => (output += d));
                    child.on("close", (code) => resolve({ code: code ?? 1, output }));
                }),
        );
        fs.rmSync(path.join(repoRoot, "data", "export", "trang-thai", "9901"), { recursive: true, force: true });
        const trackerFile = path.join(repoRoot, "data", ".status-report-files.json");
        if (fs.existsSync(trackerFile)) {
            const tracker = JSON.parse(fs.readFileSync(trackerFile, "utf8")) as Record<string, string>;
            for (const k of Object.keys(tracker)) if (k.startsWith("2099-")) delete tracker[k];
            fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2), "utf8");
        }
        line("fill-status-reports (5 file, Excel COM thật)", `${fmt(fillMs / 1000, 1)} s cho ${extracted.reports.length} báo cáo (mã thoát ${fillRun.code})`);
        if (fillRun.code !== 0) console.log("  " + fillRun.output.trim().split(/\r?\n/).slice(-6).join("\n  "));

        // 7. Cold-start cost of a child process (extract-reports, fill-status-reports, mark-messages mỗi phiên).
        console.log("\n7) Chi phí khởi động tiến trình con");
        const spawnMs: number[] = [];
        for (let k = 0; k < 3; k++) {
            const t = performance.now();
            spawnSync(process.execPath, ["--import", "tsx", "-e", "0"], { stdio: "ignore" });
            spawnMs.push(performance.now() - t);
        }
        line("Khởi động 1 tiến trình con (node + tsx)", `${fmt(pct(spawnMs, 50) / 1000, 2)} s x 3 lần mỗi phiên (extract-reports, fill-status-reports, mark-messages)`);

        // 8. Cycle model: fixed cost đo THẬT ở trên (load, spawn, fill Excel) ghép với giây/nhóm THẬT từ
        // `npm run runner:timing` (không đoán nữa — xem ghi chú đầu file, cào không đo được offline).
        console.log("\n8) Mô hình thời gian một chu kỳ (giữ khoá Zalo; chat phải chờ khoá này)");
        console.log("  Lấy \"Xs/nhóm\" thật từ `npm run runner:timing` (p50/p95/max đã ghi từ các lần chạy thật), thay --scrape-seconds bằng số đó.");
        console.log(`  Chi phí cố định đo thật cho ${groups} nhóm: nạp tin ${fmt(loadMs / 1000, 2)} s + fill-status-reports ${fmt(fillMs / 1000, 1)} s + 3 x khởi động tiến trình + sync DB (giả định 15 s, chưa đo — cần DB thật).`);
        const fixed = loadMs / 1000 + 15 + 3 * (pct(spawnMs, 50) / 1000) + fillMs / 1000;
        console.log("  Số nhóm trong hàng | " + scrapeSeconds.map((s) => `${s}s/nhóm`.padStart(10)).join(" | "));
        for (const k of [1, 5, 20, 50, 100, 300]) {
            console.log("  " + String(k).padStart(18) + " | " + scrapeSeconds.map((s) => `${fmt((k * s + fixed) / 60)} phút`.padStart(10)).join(" | "));
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
