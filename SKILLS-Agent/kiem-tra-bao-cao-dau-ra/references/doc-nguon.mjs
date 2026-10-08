// CHỈ ĐỌC. Chạy từ thư mục gốc dự án: npx tsx SKILLS-Agent/kiem-tra-bao-cao-dau-ra/references/doc-nguon.mjs <id> <ngày> <giaiDoan|morning|afternoon> [<mã> <file.xlsx>]
// In các tin báo cáo của (ngày, giai đoạn hoặc đợt), dòng Excel MONG ĐỢI tính bằng chính code của bot, và (nếu có <mã> + <file>) so với file.
import path from "node:path";
import { pathToFileURL } from "node:url";
import XLSX from "xlsx";

const [setId, day, when, ma, file] = process.argv.slice(2);
if (!setId || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || !when) throw new Error("Cần: <id> <YYYY-MM-DD> <morningstart|morningend|afternoonstart|afternoonend|morning|afternoon> [<mã> <file.xlsx>]");
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const [{ MessageStore }, { readOverrides }, { extractAll }, rows, win, slots, time] = await Promise.all([
    load("src/store/messageStore.ts"), load("src/lesson/overrides.ts"), load("src/lesson/extract.ts"), load("src/lesson/statusRows.ts"),
    load("src/total/windowReports.ts"), load("src/total/slots.ts"), load("src/lesson/time.ts"),
]);

const store = new MessageStore();
const messages = [];
for (const g of store.listThreads()) messages.push(...(await store.readThread(g)));
const nameOf = new Map(messages.map((m) => [m.groupId, m.groupName]));
const overrides = readOverrides(path.join("output", setId, "overrides.json"));
const isSlot = when === "morning" || when === "afternoon";

let reports, kept, review = [];
if (isSlot) {
    reports = win.reportsInWindow(messages, overrides, slots.slotsOfDay(day).find((s) => s.name === when));
    kept = win.latestGradedPerRoom(reports);
} else {
    const r = await extractAll(messages, { day, buoi: when, overrides });
    reports = r.reports;
    kept = rows.latestPerRoom(reports);
    review = r.review;
    console.log(`xet ${r.summary.xet} tin, ${r.summary.baoCao} báo cáo, ${r.summary.canXem} mục cần xem (tính trong bộ nhớ, không tra DB)`);
}
const keptIds = new Set(kept.map((x) => x.maTinNhan));
for (const x of reports) {
    const d = x.data;
    const xl = Object.fromEntries(d.coSoVatChat.map((f) => [f.loai, f.loai === "MayTinh" ? (f.soLuong ?? []).map((q) => `${q.loai}=${q.so}`).join("/") : f.xepLoai]));
    console.log(JSON.stringify({ tin: "TIN", gio: time.hhmmVietnam(x.thoiGian), nhom: nameOf.get(x.maNhom), loai: x.loaiBaoCao, truong: d.truong?.tenRieng, kv: d.khuVuc, phong: d.phongMay, xl, giuLai: keptIds.has(x.maTinNhan) }));
}

const tsOf = new Map(messages.map((m) => [m.msgId, m.ts]));
for (const v of review) console.log(JSON.stringify({ tin: "CẦN XEM", gio: time.hhmmVietnam(tsOf.get(v.key.maTinNhan) ?? 0), nhom: nameOf.get(v.key.maNhom), lyDo: v.lyDo, truongCanXem: v.truongCanXem, dong1: v.raw.split(/\r?\n/)[0] }));

const BUILD = { netsupport: rows.buildNetSupportRows, loa: rows.buildLoaRows, internet: rows.buildInternetRows, mayTinh: rows.buildMayTinhRows };
const GRADE_COLS = { netsupport: ["F"], loa: ["F"], internet: ["F"], mayTinh: ["F", "G", "J"] };
const fillDown = (list) => { let s = ""; return list.map((r) => { if (String(r.B ?? "").trim()) s = r.B; return { ...r, B: s }; }); };
const norm = (v) => String(v ?? "").normalize("NFC").trim().toUpperCase();
const keyOf = (r) => [r.B, r.C, r.D].map(norm).join(" | ");
const toRow = (r, cols) => ({ key: keyOf(r), vals: cols.map((c) => `${c}=${norm(r[c])}`).join(","), grade: norm(r[cols[cols.length - 1]]) });

if (ma) {
    if (!BUILD[ma]) throw new Error(`<mã> phải là một trong: ${Object.keys(BUILD).join(", ")}`);
    const expected = fillDown(BUILD[ma](kept)).map((r) => toRow(r, GRADE_COLS[ma]));
    console.log(`MONG ĐỢI (${ma}): ${expected.length} dòng`);
    expected.forEach((e) => console.log(`  ${e.key} -> ${e.vals}`));
    if (file) {
        const wb = XLSX.readFile(file);
        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "", raw: false });
        const start = sheet.findIndex((r) => r.A === "STT");
        const end = sheet.findIndex((r) => r.A === "TỔNG");
        const actual = fillDown(sheet.slice(start + 1, end < 0 ? undefined : end)).filter((r) => norm(r.D) !== "").map((r) => toRow(r, GRADE_COLS[ma]));
        console.log(`TRONG FILE: ${actual.length} dòng`);
        const count = (list) => list.reduce((m, e) => m.set(e.key, [...(m.get(e.key) ?? []), e.vals]), new Map());
        const exp = count(expected), act = count(actual);
        let problems = 0;
        const say = (m) => { problems++; console.log(m); };
        const validGrade = ma === "mayTinh" ? /^[A-E]?$/ : /^[TBK]$/;
        for (const e of actual) if (!validGrade.test(e.grade)) say(`XẾP LOẠI NGOÀI TẬP HỢP LỆ: ${e.key} ${e.vals}`);
        for (const [k, v] of exp) if (!act.has(k)) say(`THIẾU TRONG FILE: ${k} (tin có, file không có)`);
        for (const [k, v] of act) {
            if (!exp.has(k)) say(`THỪA TRONG FILE: ${k} (file có, không có tin nguồn)`);
            else {
                if (v.length > 1) say(`TRÙNG: ${k} xuất hiện ${v.length} lần`);
                if (v[0] !== exp.get(k)[0]) say(`KHÁC GIÁ TRỊ: ${k} file ${v[0]} / mong đợi ${exp.get(k)[0]}`);
            }
        }
        console.log(problems === 0 ? "KHỚP: không có bất thường" : `CÓ ${problems} BẤT THƯỜNG (xem các dòng trên)`);
    }
}
