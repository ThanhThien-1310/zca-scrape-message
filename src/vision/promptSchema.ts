import type { FieldKind, Manifest, PhotoRule, RuleField } from "../types/index.js";

/** Tăng khi đổi cách ghép prompt/lược đồ; ghi vào `reading.json` để biết kết quả cũ do phiên bản nào đọc. */
export const PROMPT_VERSION = "2";

export const SYSTEM_PROMPT =
    'Bạn là bộ đọc ảnh báo cáo. Các ảnh được đính kèm trong tin nhắn, theo thứ tự. Không suy đoán: ô nào không nhìn rõ thì để null và độ tin cậy "thap". Trả lời đúng lược đồ JSON được yêu cầu, không thêm chữ nào khác.';

const CONFIDENCE = { type: "string", enum: ["cao", "vua", "thap"] };

function valueSchema(f: RuleField): Record<string, unknown> {
    switch (f.kieu) {
        case "so":
            return { type: ["number", "null"] };
        case "dung_sai":
            return { type: ["boolean", "null"] };
        case "danh_sach": {
            const cols = f.phanTu ?? [];
            return {
                type: "array",
                items: { type: "object", additionalProperties: false, required: cols.map((c) => c.ten), properties: Object.fromEntries(cols.map((c) => [c.ten, valueSchema(c)])) },
            };
        }
        default:
            return { type: ["string", "null"] };
    }
}

/** Lược đồ JSON của kết quả (gửi cho model làm `response_format` và chép vào prompt), sinh từ các luật. */
export function buildResultSchema(rules: PhotoRule[]): Record<string, unknown> {
    const classes = [...rules.map((r) => r.id), "khac"];
    const fieldObject = (f: RuleField) => ({
        type: "object",
        additionalProperties: false,
        required: ["value", "doTinCay"],
        properties: { value: valueSchema(f), doTinCay: CONFIDENCE },
    });
    return {
        type: "object",
        additionalProperties: false,
        required: ["images", "extracted"],
        properties: {
            images: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["seq", "loai", "doTinCay"],
                    properties: { seq: { type: "integer" }, loai: { type: "string", enum: classes }, doTinCay: CONFIDENCE },
                },
            },
            extracted: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                    rules.map((r) => [r.id, { type: "object", additionalProperties: false, required: r.truong.map((f) => f.ten), properties: Object.fromEntries(r.truong.map((f) => [f.ten, fieldObject(f)])) }]),
                ),
            },
        },
    };
}

const KIND_LABEL: Record<FieldKind, string> = {
    so: "số",
    chu: "chữ",
    ngay: "ngày dạng YYYY-MM-DD",
    dung_sai: "đúng/sai (true hoặc false)",
    danh_sach: "danh sách, mỗi phần tử có các cột",
};

function fieldLines(fields: RuleField[], indent: string): string[] {
    const lines: string[] = [];
    for (const f of fields) {
        const limits = [f.min !== undefined ? `từ ${f.min}` : "", f.max !== undefined ? `đến ${f.max}` : ""].filter(Boolean).join(" ");
        const parts = [KIND_LABEL[f.kieu], f.batBuoc ? "bắt buộc" : "", limits].filter(Boolean).join(", ");
        lines.push(`${indent}- ${f.ten} (${parts})${f.goiY ? `: ${f.goiY}` : ""}`);
        if (f.phanTu) lines.push(...fieldLines(f.phanTu, `${indent}    `));
    }
    return lines;
}

/** Prompt cho MỘT bộ ảnh. Cả hai lần đọc dùng đúng prompt này; lần hai không bao giờ được thấy kết quả lần một. */
export function buildPrompt(rules: PhotoRule[], manifest: Manifest): string {
    const lines: string[] = [];
    lines.push(`Có ${manifest.images.length} ảnh của một báo cáo, đính kèm theo đúng thứ tự (Ảnh ${manifest.images.map((i) => i.seq).join(", Ảnh ")}), mỗi ảnh có một dòng "Ảnh N:" ngay trước nó.`);
    if (manifest.texts.length > 0) {
        lines.push("", "Tin chữ đi kèm của cùng người gửi (chỉ để tham khảo, có thể không liên quan):");
        for (const t of manifest.texts) lines.push(`- ${t.content.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("", 'BƯỚC 1. Xếp từng ảnh vào đúng một loại, hoặc "khac" nếu không khớp loại nào:');
    for (const r of rules) lines.push(`- ${r.id}: ${r.nhanRa}`);
    lines.push("- khac: mọi ảnh còn lại (phòng máy, thiết bị, ảnh không liên quan). Ảnh loại khac không đọc thêm gì.");
    lines.push("", "BƯỚC 2. Với mỗi loại có ảnh, gộp thông tin của TẤT CẢ ảnh thuộc loại đó thành một kết quả theo các trường (loại không có ảnh thì bỏ qua):");
    for (const r of rules) {
        lines.push(`Loại ${r.id}:`);
        lines.push(...fieldLines(r.truong, "  "));
    }
    lines.push("", 'Không suy đoán số hay chữ không nhìn thấy: để null. doTinCay: "cao" = đọc rõ, "vua" = hơi mờ nhưng khá chắc, "thap" = đoán hoặc không rõ.');
    return lines.join("\n");
}
