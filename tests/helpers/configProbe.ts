import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Chạy `body` trong một tiến trình Node riêng, SAU khi đổi giá trị của `config` (mã trong `mutate`), rồi trả về
 * giá trị `body` trả ra. Cần vì các hằng số của module được tính một lần lúc nạp: đây là cách kiểm chúng thật sự lấy từ config.
 * Trong `mutate` và `body`, `config` đã có sẵn; nạp module bằng `await import("../src/watch/watchState.js")` (đường dẫn tính từ thư mục tests/).
 */
export function probe(mutate: string, body: string): unknown {
    const file = path.join(testsDir, `.config-probe-${process.pid}-${Date.now()}.ts`);
    const code = `import { config } from "../config.js";\n${mutate}\nconst result = await (async () => {\n${body}\n})();\nconsole.log("__PROBE__" + JSON.stringify(result));\n`;
    fs.writeFileSync(file, code, "utf8");
    try {
        const r = spawnSync(process.execPath, ["--import", "tsx", file], { encoding: "utf8", cwd: path.resolve(testsDir, "..") });
        const line = r.stdout.split("\n").find((l) => l.startsWith("__PROBE__"));
        if (!line) throw new Error(`probe failed (exit ${r.status}): ${r.stderr.slice(0, 600)}`);
        return JSON.parse(line.slice("__PROBE__".length));
    } finally {
        fs.rmSync(file, { force: true });
    }
}
