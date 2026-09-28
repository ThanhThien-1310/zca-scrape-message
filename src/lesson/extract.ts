import { applyOverride, deriveReport, extractRaw } from "./build.js";
import { classifyTitle } from "./parseReport.js";
import { roomKeyString, roomLookupName } from "./roomKey.js";
import { sessionOf, vietnamDay } from "./time.js";
import type { Buoi, LyDo, Mark, MessageKey, Override, RawFields, Report, ReviewItem, RoomKey, RoomLookup, SourceMessage } from "../types/index.js";

export interface ExtractOptions {
    /** `YYYY-MM-DD` on the Vietnam calendar; only messages sent that day are considered. */
    day: string;
    /** Only messages sent in this session of that day; omit to consider the whole day. */
    buoi?: Buoi;
    overrides?: Override[];
    /** Omit to skip the room lookup (offline runs and tests): `maPhong` stays null and is not treated as an error. */
    lookupRoomIds?: RoomLookup;
    /** Test group name -> real school group name (default `config.groupAliases`), see `extractRaw`. */
    groupAliases?: Record<string, string>;
}

export interface ExtractResult {
    reports: Report[];
    marks: Mark[];
    review: ReviewItem[];
    /** Override keys that match no scraped message at all (typos); ones for another day or session are fine. */
    unknownOverrides: MessageKey[];
    summary: { xet: number; baoCao: number; boQua: number; canXem: number; theoLyDo: Partial<Record<LyDo, number>> };
}

const keyOf = (maNhom: string, maTinNhan: string) => `${maNhom}|${maTinNhan}`;

function flagsFor(raw: RawFields): { lyDo: LyDo[]; truongCanXem: string[] } {
    const lyDo: LyDo[] = [];
    const truongCanXem: string[] = [];
    if (raw.unknownLabels.length > 0) {
        lyDo.push("khong_nhan_ra_nhan");
        truongCanXem.push(...raw.unknownLabels);
    }
    if (raw.missing.length > 0) {
        lyDo.push("thieu_dong");
        truongCanXem.push(...raw.missing);
    }
    const bad: string[] = [];
    if (raw.thieu === null && raw.thieuText !== null && raw.thieuText.trim() !== "") bad.push("thieu");
    if (raw.loi === null && raw.loiText !== null && raw.loiText.trim() !== "") bad.push("loi");
    if (bad.length > 0) {
        lyDo.push("so_khong_hop_le");
        truongCanXem.push(...bad);
    }
    if (!raw.truong || !raw.khuVuc) {
        lyDo.push("truong_khong_nhan_ra");
        truongCanXem.push(...(!raw.truong ? ["truong"] : []), ...(!raw.khuVuc ? ["khuVuc"] : []));
    }
    return { lyDo, truongCanXem };
}

interface Pending {
    msg: SourceMessage;
    report: Report;
    lyDo: LyDo[];
    truongCanXem: string[];
    roomKey: RoomKey | null;
}

export async function extractAll(messages: SourceMessage[], opts: ExtractOptions): Promise<ExtractResult> {
    const overrides = new Map((opts.overrides ?? []).map((o) => [keyOf(o.key.maNhom, o.key.maTinNhan), o]));
    const known = new Set(messages.map((m) => keyOf(m.groupId, m.msgId)));
    const unknownOverrides = (opts.overrides ?? []).filter((o) => !known.has(keyOf(o.key.maNhom, o.key.maTinNhan))).map((o) => o.key);
    const dayMessages = messages
        .filter((m) => vietnamDay(m.ts) === opts.day && (opts.buoi === undefined || sessionOf(m.ts) === opts.buoi))
        .sort((a, b) => a.ts - b.ts);

    const marks: Mark[] = [];
    const review: ReviewItem[] = [];
    const pending: Pending[] = [];
    const mark = (m: SourceMessage, maTrangThai: number) => marks.push({ maNhom: m.groupId, maTinNhan: m.msgId, maTrangThai });

    for (const m of dayMessages) {
        const key = { maNhom: m.groupId, maTinNhan: m.msgId };
        const ov = overrides.get(keyOf(m.groupId, m.msgId));
        if (m.msgType !== "desktop.text" || ov?.sua.loaiBo) {
            mark(m, -1);
            continue;
        }
        const kind = ov?.sua.loaiBaoCao ?? classifyTitle(m.content);
        if (kind === null) {
            mark(m, -1);
            continue;
        }
        if (kind === "gan_giong") {
            mark(m, -1);
            review.push({ key, lyDo: ["gan_giong_tieu_de"], raw: m.content, draft: null, truongCanXem: ["loaiBaoCao"] });
            continue;
        }

        const raw = applyOverride(extractRaw(m.content, m.groupName, opts.groupAliases), ov?.sua);
        const report = deriveReport(m, kind, raw);
        const { lyDo, truongCanXem } = flagsFor(raw);
        const roomKey: RoomKey | null =
            raw.phongMay && raw.truong && raw.khuVuc
                ? { room: roomLookupName(raw.phongMay), capHoc: raw.truong.capHoc, tenRieng: raw.truong.tenRieng, coSo: report.data.truong?.coSo ?? null, khuVuc: raw.khuVuc }
                : null;
        pending.push({ msg: m, report, lyDo, truongCanXem, roomKey });
    }

    if (opts.lookupRoomIds) {
        const keys = pending.flatMap((p) => (p.roomKey ? [p.roomKey] : []));
        const found = keys.length > 0 ? await opts.lookupRoomIds(keys) : new Map<string, number | null>();
        for (const p of pending) {
            p.report.data.maPhong = p.roomKey ? (found.get(roomKeyString(p.roomKey)) ?? null) : null;
            if (p.report.data.maPhong === null) {
                p.report.data.maTrangThai = 2;
                if (p.roomKey) {
                    p.lyDo.push("phong_khong_tim_thay");
                    p.truongCanXem.push("phongMay");
                }
            }
        }
    }

    const reports: Report[] = [];
    for (const p of pending) {
        reports.push(p.report);
        mark(p.msg, p.report.data.maTrangThai);
        if (p.lyDo.length > 0) {
            review.push({ key: { maNhom: p.msg.groupId, maTinNhan: p.msg.msgId }, lyDo: p.lyDo, raw: p.msg.content, draft: p.report, truongCanXem: p.truongCanXem });
        }
    }

    const order = new Map(dayMessages.map((m, i) => [keyOf(m.groupId, m.msgId), i]));
    marks.sort((a, b) => order.get(keyOf(a.maNhom, a.maTinNhan))! - order.get(keyOf(b.maNhom, b.maTinNhan))!);

    const theoLyDo: Partial<Record<LyDo, number>> = {};
    for (const r of review) for (const l of r.lyDo) theoLyDo[l] = (theoLyDo[l] ?? 0) + 1;
    return {
        reports,
        marks,
        review,
        unknownOverrides,
        summary: { xet: dayMessages.length, baoCao: reports.length, boQua: marks.filter((x) => x.maTrangThai === -1).length, canXem: review.length, theoLyDo },
    };
}
