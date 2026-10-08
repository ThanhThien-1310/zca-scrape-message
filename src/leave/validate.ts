import { compareYmd, countNonSundays, dmyOf, parseHour, parseIso, weekdayExcel, type Ymd } from "./dates.js";

/** Một dòng nghỉ phép đã đọc xong thành giá trị dùng được. `soNgay` và `lyDo` có thể thiếu. */
export interface ParsedLeave {
    hoTen: string;
    tu: Ymd;
    den: Ymd;
    /** Giờ bắt đầu và kết thúc, số thập phân (13:30 là 13,5). */
    tuGio: number;
    denGio: number;
    soNgay: number | null;
    lyDo: string | null;
}

export interface RowVerdict {
    /** Không có luật cứng nào trượt. */
    ok: boolean;
    /** Luật cứng trượt: dòng này `can_xem`. */
    hard: string[];
    /** Cảnh báo không chặn. */
    warnings: string[];
    /** Có khi đọc được tên, ngày, giờ và ngày kết thúc không trước ngày bắt đầu, kể cả khi luật cứng khác trượt (để người đã xác nhận dòng vẫn dùng được). */
    parsed: ParsedLeave | null;
}

export interface ValidateCtx {
    /** Ngày gửi ảnh, `YYYY-MM-DD` giờ Việt Nam. */
    sendDay: string;
    maxPastDays: number;
    maxFutureDays: number;
}

/**
 * Review lớp 1 của MỘT dòng nghỉ phép (không tốn token).
 * Luật cứng: có họ tên; ngày và giờ đọc được; ngày kết thúc không trước ngày bắt đầu (cùng ngày thì giờ kết thúc sau giờ bắt đầu); ngày bắt đầu không
 * sớm hơn ngày gửi quá `maxPastDays` hay muộn hơn quá `maxFutureDays` ngày; và KIỂM CHỨNG CHÉO: THỨ bắt đầu, THỨ kết thúc, SỐ NGÀY (không tính Chủ nhật)
 * phải khớp với ngày; lệch từ hai phép trở lên là luật cứng (nhiều khả năng đọc sai ngày). Lệch đúng một phép chỉ là cảnh báo, vì thường là lỗi gõ của người
 * lập bảng. Ô THỨ hoặc SỐ NGÀY để trống thì phép đó không được xét.
 */
export function validateLeaveRow(raw: Record<string, unknown>, ctx: ValidateCtx): RowVerdict {
    const hard: string[] = [];
    const warnings: string[] = [];
    const hoTen = typeof raw.hoTen === "string" ? raw.hoTen.trim().replace(/\s+/g, " ") : "";
    if (hoTen === "") hard.push("thiếu họ tên");
    const tu = parseIso(raw.tuNgay);
    const den = parseIso(raw.denNgay);
    const tuGio = parseHour(raw.tuGio);
    const denGio = parseHour(raw.denGio);
    if (!tu) hard.push(`ngày bắt đầu không đọc được: ${JSON.stringify(raw.tuNgay ?? null)}`);
    if (!den) hard.push(`ngày kết thúc không đọc được: ${JSON.stringify(raw.denNgay ?? null)}`);
    if (tuGio === null) hard.push(`giờ bắt đầu không đọc được: ${JSON.stringify(raw.tuGio ?? null)}`);
    if (denGio === null) hard.push(`giờ kết thúc không đọc được: ${JSON.stringify(raw.denGio ?? null)}`);

    let ordered = false;
    if (tu && den) {
        const span = compareYmd(den, tu);
        if (span < 0) hard.push("ngày kết thúc trước ngày bắt đầu");
        else {
            ordered = true;
            if (span === 0 && tuGio !== null && denGio !== null && denGio <= tuGio) hard.push("cùng ngày nhưng giờ kết thúc không sau giờ bắt đầu");
        }
    }

    const send = parseIso(ctx.sendDay);
    if (tu && send) {
        const off = compareYmd(tu, send);
        if (off < -ctx.maxPastDays) hard.push(`ngày bắt đầu ${dmyOf(tu)} sớm hơn ngày gửi ảnh quá ${ctx.maxPastDays} ngày`);
        if (off > ctx.maxFutureDays) hard.push(`ngày bắt đầu ${dmyOf(tu)} muộn hơn ngày gửi ảnh quá ${ctx.maxFutureDays} ngày`);
    }

    if (tu && den && ordered) {
        const fails: string[] = [];
        if (typeof raw.tuThu === "number" && raw.tuThu !== weekdayExcel(tu)) fails.push(`THỨ bắt đầu ghi ${raw.tuThu}, ngày ${dmyOf(tu)} là thứ ${weekdayExcel(tu)}`);
        if (typeof raw.denThu === "number" && raw.denThu !== weekdayExcel(den)) fails.push(`THỨ kết thúc ghi ${raw.denThu}, ngày ${dmyOf(den)} là thứ ${weekdayExcel(den)}`);
        const n = countNonSundays(tu, den);
        if (typeof raw.soNgay === "number" && raw.soNgay !== n) fails.push(`SỐ NGÀY ghi ${raw.soNgay}, tính ra ${n} (không tính Chủ nhật)`);
        if (fails.length >= 2) hard.push(`lệch ${fails.length} phép kiểm chứng chéo: ${fails.join("; ")}`);
        else warnings.push(...fails);
    }

    const parsed: ParsedLeave | null =
        hoTen !== "" && tu && den && tuGio !== null && denGio !== null && ordered
            ? {
                  hoTen,
                  tu,
                  den,
                  tuGio,
                  denGio,
                  soNgay: typeof raw.soNgay === "number" ? raw.soNgay : null,
                  lyDo: typeof raw.lyDo === "string" && raw.lyDo.trim() !== "" ? raw.lyDo.trim() : null,
              }
            : null;
    return { ok: hard.length === 0, hard, warnings, parsed };
}
