/** Numeric codes of the system's lookup table (see the design spec, "Bảng mã"). */
export const REPORT_TYPE_ID = { DauBuoi: 1, CuoiBuoi: 2 } as const;
export const FACILITY_TYPE_ID = { MayTinh: 1, NetSupport: 2, Internet: 3, AmThanh: 4, MayLanh: 5 } as const;
export const QUANTITY_TYPE_ID = { Thieu: 1, Loi: 2 } as const;

/** Header of the `data` sheet in templates/Temp_RoomFacility_rpt.xlsm, in order. */
export const DATA_SHEET_COLUMNS = [
    "Id", "MessageId", "SenderId", "GroupId", "Timestamp", "Date", "Time", "TypeId", "Employee", "RoomId",
    "School", "Area", "Room", "FacilityId", "FacilityTypeId", "FacilityGrade", "FacilityNote", "QuantityTypeId", "Quantity", "QuantityNote",
] as const;
