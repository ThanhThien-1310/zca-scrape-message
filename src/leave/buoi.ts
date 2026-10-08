import { config } from "../../config.js";
import { compareYmd, dmyOf, type Ymd } from "./dates.js";

export interface LeavePeriod {
    tu: Ymd;
    /** Giờ bắt đầu, số thập phân (13:30 là 13,5). */
    tuGio: number;
    den: Ymd;
    denGio: number;
}

/**
 * Cột BUỔI. Mốc là `noonHour` (mặc định `config.sessions.chieuFromHour`, 12:00).
 *  - cùng ngày: bắt đầu từ mốc trở đi là "Chiều"; bắt đầu trước mốc và kết thúc từ mốc trở xuống là "Sáng"; còn lại "Cả ngày";
 *  - nhiều ngày: ngày đầu "Cả ngày" nếu bắt đầu trước mốc, còn lại "Chiều"; ngày cuối "Cả ngày" nếu kết thúc sau mốc, còn lại "Sáng";
 *    ghi "<đầu> - <cuối>", riêng khi cả hai đều "Cả ngày" thì chỉ ghi "Cả ngày".
 */
export function buoiNghi(p: LeavePeriod, noonHour: number = config.sessions.chieuFromHour): string {
    if (compareYmd(p.den, p.tu) === 0) {
        if (p.tuGio >= noonHour) return "Chiều";
        return p.denGio <= noonHour ? "Sáng" : "Cả ngày";
    }
    const first = p.tuGio < noonHour ? "Cả ngày" : "Chiều";
    const last = p.denGio > noonHour ? "Cả ngày" : "Sáng";
    return first === "Cả ngày" && last === "Cả ngày" ? "Cả ngày" : `${first} - ${last}`;
}

/** Cột NGÀY (chữ): một ngày là `dd/MM/yyyy`, nhiều ngày là `dd/MM/yyyy - dd/MM/yyyy` (đúng dạng công thức SỐ NGÀY và K/C của file mẫu đọc được). */
export function ngayText(tu: Ymd, den: Ymd): string {
    return compareYmd(den, tu) === 0 ? dmyOf(tu) : `${dmyOf(tu)} - ${dmyOf(den)}`;
}
