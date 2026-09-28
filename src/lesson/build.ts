import { computerGrade, FIELD_KEYS, isValidFacilityGrade, parseCount, parseGrade, parseLines, parseNote, parseRoom } from "./parseReport.js";
import { config } from "../../config.js";
import { parseGroupName } from "./schoolArea.js";
import type { CoSoVatChat, FieldKey, LoaiBaoCao, RawFields, Report, SourceMessage, Sua } from "../types/index.js";

/**
 * `aliases` (default `config.groupAliases`) maps a test group's name to the name of a real school group: the school and area are
 * read from that name instead, so a report sent to the test group gets a room like a real one. Nothing else about the message changes.
 */
export function extractRaw(content: string, groupName: string, aliases: Record<string, string> = config.groupAliases): RawFields {
    const { values, unknownLabels } = parseLines(content);
    const room = parseRoom(values.phongMay);
    const { truong, khuVuc } = parseGroupName(aliases[groupName] ?? groupName);
    return {
        phongMay: room.phongMay,
        coSoPhong: room.coSo,
        giaoVien: values.giaoVien ?? null,
        thieu: parseCount(values.thieu),
        loi: parseCount(values.loi),
        ghiChuLoi: parseNote(values.loi),
        thieuText: values.thieu ?? null,
        loiText: values.loi ?? null,
        amThanh: parseGrade(values.amThanh),
        netSupport: parseGrade(values.netSupport),
        mayLanh: parseGrade(values.mayLanh),
        internet: parseGrade(values.internet),
        truong,
        khuVuc,
        missing: FIELD_KEYS.filter((k) => values[k] === undefined),
        unknownLabels,
    };
}

const OVERRIDE_TO_FIELD: Partial<Record<keyof Sua, FieldKey>> = {
    phongMay: "phongMay",
    giaoVien: "giaoVien",
    thieu: "thieu",
    loi: "loi",
    amThanh: "amThanh",
    netSupport: "netSupport",
    mayLanh: "mayLanh",
    internet: "internet",
};

/** Applies the raw-field corrections an agent wrote to overrides.json. */
export function applyOverride(raw: RawFields, sua: Sua | undefined): RawFields {
    if (!sua) return raw;
    const out: RawFields = { ...raw };
    for (const key of Object.keys(sua) as Array<keyof Sua>) {
        const field = OVERRIDE_TO_FIELD[key];
        if (field) out.missing = out.missing.filter((k) => k !== field);
    }
    if ("phongMay" in sua) out.phongMay = sua.phongMay ?? null;
    if ("giaoVien" in sua) out.giaoVien = sua.giaoVien ?? null;
    if ("truong" in sua) out.truong = sua.truong ?? null;
    if ("khuVuc" in sua) out.khuVuc = sua.khuVuc ?? null;
    if ("thieu" in sua) {
        out.thieu = sua.thieu ?? null;
        out.thieuText = out.thieu === null ? "" : String(out.thieu);
    }
    if ("loi" in sua) {
        out.loi = sua.loi ?? null;
        out.loiText = out.loi === null ? "" : String(out.loi);
    }
    if ("ghiChuLoi" in sua) out.ghiChuLoi = sua.ghiChuLoi ?? null;
    if ("amThanh" in sua) out.amThanh = sua.amThanh ?? null;
    if ("netSupport" in sua) out.netSupport = sua.netSupport ?? null;
    if ("mayLanh" in sua) out.mayLanh = sua.mayLanh ?? null;
    if ("internet" in sua) out.internet = sua.internet ?? null;
    return out;
}

/** Computes grades and the status (1 = complete, 2 = something missing/invalid). `maPhong` is filled in later by the room lookup. */
export function deriveReport(msg: SourceMessage, loaiBaoCao: LoaiBaoCao, raw: RawFields): Report {
    let maTrangThai = 1;
    if (!raw.phongMay) maTrangThai = 2;
    if (!raw.giaoVien) maTrangThai = 2;

    const grades: CoSoVatChat[] = [
        { loai: "AmThanh", xepLoai: raw.amThanh },
        { loai: "NetSupport", xepLoai: raw.netSupport },
        { loai: "MayLanh", xepLoai: raw.mayLanh },
        { loai: "Internet", xepLoai: raw.internet },
    ];
    for (const g of grades) if (!isValidFacilityGrade(g.xepLoai)) maTrangThai = 2;

    const mayTinhGrade = computerGrade(raw.thieu, raw.loi);
    if (mayTinhGrade === null) maTrangThai = 2;

    return {
        maTinNhan: msg.msgId,
        maNguoiGui: msg.senderId,
        maNhom: msg.groupId,
        thoiGian: msg.ts,
        loaiBaoCao,
        data: {
            maTrangThai,
            maPhong: null,
            truong: raw.truong && raw.coSoPhong ? { ...raw.truong, coSo: raw.coSoPhong } : raw.truong,
            khuVuc: raw.khuVuc,
            phongMay: raw.phongMay,
            giaoVien: raw.giaoVien,
            coSoVatChat: [
                ...grades,
                {
                    loai: "MayTinh",
                    xepLoai: mayTinhGrade,
                    soLuong: [
                        { loai: "Thieu", so: raw.thieu },
                        { loai: "Loi", so: raw.loi, ghiChu: raw.ghiChuLoi },
                    ],
                },
            ],
        },
    };
}
