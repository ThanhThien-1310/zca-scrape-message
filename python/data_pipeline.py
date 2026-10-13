"""
Data Pipeline Module (Pandas Engine) for ZCA Scrape Message.
Handles time filtering, data normalization, deduplication, and status aggregation.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
import pandas as pd

VN_TZ = timezone(timedelta(hours=7))


def to_vietnam_datetime(series: pd.Series) -> pd.Series:
    """
    Convert epoch ms or datetime strings to Vietnam timezone (UTC+7) DatetimeIndex/Series.
    """
    if pd.api.types.is_numeric_dtype(series):
        # Assume epoch ms if large numbers
        sample = series.dropna().iloc[0] if not series.dropna().empty else 0
        unit = "ms" if sample > 1e11 else "s"
        dt = pd.to_datetime(series, unit=unit, utc=True)
    else:
        dt = pd.to_datetime(series, utc=True)
    return dt.dt.tz_convert(VN_TZ)


def filter_by_shift(
    df: pd.DataFrame,
    start_hhmm: str = "06:30",
    end_hhmm: str = "09:00",
    time_col: str = "thoiGian",
) -> pd.DataFrame:
    """
    Filter records within a specific time shift (e.g. 06:30 -> 09:00 for morning, 06:30 -> 15:00 for afternoon).
    """
    if df.empty or time_col not in df.columns:
        return df

    df_copy = df.copy()
    vn_dt = to_vietnam_datetime(df_copy[time_col])
    time_str = vn_dt.dt.strftime("%H:%M")
    mask = (time_str >= start_hhmm) & (time_str <= end_hhmm)
    return df_copy[mask].copy()


def clean_string_series(series: pd.Series, to_upper: bool = False) -> pd.Series:
    """
    Strip whitespace and normalize string series.
    """
    cleaned = series.fillna("").astype(str).str.strip()
    return cleaned.str.upper() if to_upper else cleaned


def may_tinh_grade(thieu: Optional[Union[int, float]]) -> Optional[str]:
    """
    Grade calculation for computer lab according to missing machines:
    <= 2: A, <= 4: B, <= 6: C, <= 8: D, > 8: E. None if thieu is None/NaN.
    """
    if thieu is None or pd.isna(thieu):
        return None
    val = float(thieu)
    if val <= 2:
        return "A"
    if val <= 4:
        return "B"
    if val <= 6:
        return "C"
    if val <= 8:
        return "D"
    return "E"


def deduplicate_latest_per_room(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Keep only the latest report per (maNhom, phongMay) in the session.
    Matches TypeScript latestPerRoom() logic.
    """
    if not reports:
        return []

    latest_map: Dict[str, Dict[str, Any]] = {}
    no_room: List[Dict[str, Any]] = []

    for r in reports:
        data = r.get("data", {})
        phong = data.get("phongMay")
        if not phong:
            no_room.append(r)
            continue

        ma_nhom = r.get("maNhom", "")
        key = f"{ma_nhom}|{str(phong).strip().upper()}"
        cur = latest_map.get(key)
        thoi_gian = r.get("thoiGian", 0)

        if cur is None or thoi_gian > cur.get("thoiGian", 0):
            latest_map[key] = r

    return list(latest_map.values()) + no_room


def group_by_school(
    entries: List[Dict[str, Any]], school_key: str = "school", name_col: str = "B"
) -> List[Dict[str, Any]]:
    """
    Group entries of the same school together.
    The first row displays the school name (column 'B'), subsequent rows omit the school name.
    """
    groups: Dict[str, List[Dict[str, Any]]] = {}
    order: List[str] = []
    anonymous: List[Dict[str, Any]] = []

    for item in entries:
        school = str(item.get(school_key, "")).strip()
        if not school:
            anonymous.append(item.get("row", {}))
            continue
        if school not in groups:
            groups[school] = []
            order.append(school)
        groups[school].append(item.get("row", {}))

    result_rows: List[Dict[str, Any]] = []
    for school in order:
        group_rows = groups[school]
        for idx, row in enumerate(group_rows):
            row_copy = dict(row)
            if idx > 0:
                row_copy.pop(name_col, None)
            result_rows.append(row_copy)

    result_rows.extend(anonymous)
    return result_rows


def apply_row_numbers(rows: List[Dict[str, Any]], stt_col: str = "A") -> List[Dict[str, Any]]:
    """
    Add 1-based STT in column A.
    """
    numbered: List[Dict[str, Any]] = []
    for idx, row in enumerate(rows, start=1):
        item = {stt_col: idx}
        item.update(row)
        numbered.append(item)
    return numbered


# Facility row builders
GRADE_ORDER = {"T": 0, "B": 1, "K": 2}


def sort_by_grade(entries: List[Dict[str, Any]], grade_key: str = "grade") -> List[Dict[str, Any]]:
    """
    Sort entries by grade order: T (0) -> B (1) -> K (2) -> Others (3).
    """
    return sorted(entries, key=lambda x: GRADE_ORDER.get(str(x.get(grade_key, "")).upper(), 3))


def extract_facility(report: Dict[str, Any], loai: str) -> Optional[Dict[str, Any]]:
    """
    Find facility entry in report.data.coSoVatChat by loai.
    """
    co_so = report.get("data", {}).get("coSoVatChat", [])
    for f in co_so:
        if f.get("loai") == loai:
            return f
    return None


def extract_quantity(facility: Optional[Dict[str, Any]], loai: str) -> Tuple[Optional[int], Optional[str]]:
    """
    Extract (so, ghiChu) from facility.soLuong for 'Thieu' or 'Loi'.
    """
    if not facility:
        return None, None
    for item in facility.get("soLuong", []):
        if item.get("loai") == loai:
            return item.get("so"), item.get("ghiChu")
    return None, None


def build_status_facility_rows(reports: List[Dict[str, Any]], facility_loai: str) -> List[Dict[str, Any]]:
    """
    Build rows for Loa, NetSupport, Internet:
    Columns: A: STT, B: Tên trường, C: Khu vực, D: Phòng máy, F: Xếp loại (T/B/K).
    """
    entries: List[Dict[str, Any]] = []
    for r in reports:
        data = r.get("data", {})
        phong = data.get("phongMay")
        if not phong:
            continue
        facility = extract_facility(r, facility_loai)
        if not facility or facility.get("xepLoai") is None:
            continue

        grade = str(facility.get("xepLoai", "")).strip().upper()
        truong = data.get("truong", {})
        school_name = truong.get("tenRieng", "") if truong else ""
        khu_vuc = data.get("khuVuc", "")

        row = {
            "B": school_name,
            "C": khu_vuc,
            "D": phong,
            "F": grade,
        }
        entries.append({"grade": grade, "school": school_name, "row": row})

    sorted_entries = sort_by_grade(entries)
    grouped_rows = group_by_school(sorted_entries, school_key="school", name_col="B")
    return apply_row_numbers(grouped_rows)


def build_may_tinh_rows(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build rows for Máy Tính (12 columns):
    A: STT, B: Tên trường, C: Khu vực, D: PM, E: Tổng SM, F: SM Lỗi, G: SM Thiếu,
    I: Hiện trạng (ghi chú lỗi), J: Xếp loại (A-E theo SM thiếu).
    """
    entries: List[Dict[str, Any]] = []
    for r in reports:
        data = r.get("data", {})
        phong = data.get("phongMay")
        if not phong:
            continue
        may_tinh = extract_facility(r, "MayTinh")
        if not may_tinh:
            continue

        so_loi, ghi_chu_loi = extract_quantity(may_tinh, "Loi")
        so_thieu, _ = extract_quantity(may_tinh, "Thieu")
        grade = may_tinh_grade(so_thieu)

        truong = data.get("truong", {})
        school_name = truong.get("tenRieng", "") if truong else ""
        khu_vuc = data.get("khuVuc", "")
        tong_so_may = data.get("tongSoMay")

        row = {
            "B": school_name,
            "C": khu_vuc,
            "D": phong,
            "E": tong_so_may,
            "F": so_loi,
            "G": so_thieu,
            "I": ghi_chu_loi,
            "J": grade,
        }
        entries.append({"school": school_name, "row": row})

    grouped_rows = group_by_school(entries, school_key="school", name_col="B")
    return apply_row_numbers(grouped_rows)


def build_dien_rows(electric_entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build rows for Lỗi Điện:
    A: STT, B: Tên trường, C: Khu vực, D: PM, E: Hiện trạng, F: Xếp loại (T/B/K).
    """
    entries: List[Dict[str, Any]] = []
    for e in electric_entries:
        text = str(e.get("tinhTrang", "")).strip()
        grade = text.upper() if text.lower() in ("t", "b", "k") else ""
        truong = str(e.get("tenTruong", "")).strip()
        khu_vuc = str(e.get("khuVuc", "")).strip()
        phong = str(e.get("phongMay", "")).strip()

        row: Dict[str, Any] = {"B": truong, "C": khu_vuc, "D": phong}
        if grade:
            row["F"] = grade
        elif text:
            row["E"] = text

        entries.append({"grade": grade, "school": truong, "row": row})

    sorted_entries = sort_by_grade(entries)
    grouped_rows = group_by_school(sorted_entries, school_key="school", name_col="B")
    return apply_row_numbers(grouped_rows)
