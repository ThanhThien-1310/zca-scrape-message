// Shared report types. Import them from "../types/index.js".

/** Everything read straight from one message, before any derived value (grades, status) is computed. */
export interface RawFields {
    phongMay: string | null;
    coSoPhong: string | null;
    giaoVien: string | null;
    thieu: number | null;
    loi: number | null;
    ghiChuLoi: string | null;
    thieuText: string | null;
    loiText: string | null;
    amThanh: string | null;
    netSupport: string | null;
    mayLanh: string | null;
    internet: string | null;
    truong: Truong | null;
    khuVuc: string | null;
    missing: FieldKey[];
    unknownLabels: string[];
}

export type TitleKind = LoaiBaoCao | "gan_giong" | null;

export type FieldKey = "giaoVien" | "phongMay" | "loi" | "thieu" | "netSupport" | "internet" | "amThanh" | "mayLanh";

export interface ParsedLines {
    values: Partial<Record<FieldKey, string>>;
    unknownLabels: string[];
}

export interface RoomInfo {
    phongMay: string | null;
    coSo: string | null;
}

/** Resolves a batch of rooms to Room.Id; a key that does not match a room maps to null. */
export type RoomLookup = (keys: RoomKey[]) => Promise<Map<string, number | null>>;

export type Cell = string | number | null;

export type SheetRow = Cell[];

export interface SchoolArea {
    truong: Truong | null;
    khuVuc: string | null;
}

export type LoaiBaoCao = "DauBuoi" | "CuoiBuoi";

export interface Truong {
    capHoc: string | null;
    tenRieng: string;
    coSo: string | null;
}

export interface SoLuong {
    loai: "Thieu" | "Loi";
    so: number | null;
    ghiChu?: string | null;
}

export interface CoSoVatChat {
    loai: "AmThanh" | "NetSupport" | "MayLanh" | "Internet" | "MayTinh";
    xepLoai: string | null;
    soLuong?: SoLuong[];
}

export interface Report {
    maTinNhan: string;
    maNguoiGui: string;
    maNhom: string;
    thoiGian: number;
    loaiBaoCao: LoaiBaoCao;
    data: {
        maTrangThai: number;
        maPhong: number | null;
        truong: Truong | null;
        khuVuc: string | null;
        phongMay: string | null;
        giaoVien: string | null;
        coSoVatChat: CoSoVatChat[];
    };
}

export interface Mark {
    maNhom: string;
    maTinNhan: string;
    maTrangThai: number;
}

export type LyDo = "khong_nhan_ra_nhan" | "thieu_dong" | "gan_giong_tieu_de" | "phong_khong_tim_thay" | "truong_khong_nhan_ra" | "so_khong_hop_le";

export interface MessageKey {
    maNhom: string;
    maTinNhan: string;
}

export interface ReviewItem {
    key: MessageKey;
    lyDo: LyDo[];
    raw: string;
    draft: Report | null;
    truongCanXem: string[];
}

/** Raw fields an agent may overwrite; every derived value (computer xepLoai, maTrangThai) is recomputed. */
export interface Sua {
    loaiBo?: boolean;
    loaiBaoCao?: LoaiBaoCao;
    phongMay?: string | null;
    giaoVien?: string | null;
    truong?: Truong | null;
    khuVuc?: string | null;
    thieu?: number | null;
    loi?: number | null;
    ghiChuLoi?: string | null;
    amThanh?: string | null;
    netSupport?: string | null;
    mayLanh?: string | null;
    internet?: string | null;
}

export interface Override {
    key: MessageKey;
    sua: Sua;
}

export interface RoomKey {
    room: string;
    capHoc: string | null;
    tenRieng: string;
    coSo: string | null;
    khuVuc: string;
}
