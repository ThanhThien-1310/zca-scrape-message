"""
Excel Styler & Template Filler Module (Openpyxl Engine) for ZCA Scrape Message.
Handles template preservation, row insertion/deletion, style cloning, visual alerts,
page setup for A4 printing, and atomic saving.
"""
import os
import shutil
from copy import copy
from typing import Any, Dict, List, Optional, Tuple, Union

import openpyxl
from openpyxl.cell.cell import Cell
from openpyxl.formula.translate import Translator
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet

from python.contracts import FileSpec, HeaderCell, FormulaCell

# Standard border style
THIN_GRAY = Side(style="thin", color="D9D9D9")
THIN_BORDER = Border(left=THIN_GRAY, right=THIN_GRAY, top=THIN_GRAY, bottom=THIN_GRAY)

# Visual Alert Fills (standard Excel conditional formatting colors)
# Red alert for hardware error / broken PC / grade K (Kém)
ALERT_RED_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
ALERT_RED_FONT = Font(color="9C0006", bold=True)

# Yellow warning for network latency / attention / grade B (Bình thường)
ALERT_YELLOW_FILL = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
ALERT_YELLOW_FONT = Font(color="9C6500")


def copy_cell_style(source_cell: Cell, target_cell: Cell) -> None:
    """
    Safely clone styles (font, border, fill, alignment, number_format) from source to target.
    """
    if source_cell.has_style:
        target_cell.font = copy(source_cell.font)
        target_cell.border = copy(source_cell.border)
        target_cell.fill = copy(source_cell.fill)
        target_cell.number_format = copy(source_cell.number_format)
        target_cell.alignment = copy(source_cell.alignment)


def scan_anchor_header(
    ws: Worksheet,
    keywords: Optional[List[str]] = None,
    max_scan_rows: int = 10,
) -> Optional[int]:
    """
    Scan top rows to find header row containing any of the anchor keywords.
    Returns 1-based row index if found, else None.
    """
    if keywords is None:
        keywords = ["stt", "phòng", "tình trạng", "tên trường"]
    keywords_lower = [k.lower() for k in keywords]

    for row_idx in range(1, max_scan_rows + 1):
        for col_idx in range(1, 20):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val and any(k in str(val).lower() for k in keywords_lower):
                return row_idx
    return None


def clean_broken_conditional_formatting(ws: Worksheet) -> None:
    """
    Clean conditional formatting rules with broken #REF! formulas that cause crashes.
    """
    try:
        cf_rules = list(ws.conditional_formatting)
        ws.conditional_formatting = openpyxl.formatting.rule.Rule()  # reset
        for cf in cf_rules:
            # Keep rules that don't have broken #REF!
            has_ref = False
            for rule in cf.rules:
                for f in getattr(rule, "formula", []):
                    if "#REF!" in str(f):
                        has_ref = True
                        break
            if not has_ref:
                ws.conditional_formatting.add(cf.sqref, cf.rules[0] if cf.rules else None)
    except Exception:
        # If openpyxl structure differs, safely pass
        pass


def apply_visual_alerts(cell: Cell, col_name: str, val: Any) -> None:
    """
    Apply visual alert colors (Red / Yellow) based on cell value:
    - Grade 'K' (Kém) or broken / hỏng -> Red alert fill.
    - Grade 'B' (Bình thường) -> Yellow warning fill.
    - Numbers > 0 in error/missing columns -> Red alert.
    """
    if val is None:
        return

    val_str = str(val).strip().upper()

    # Red alert conditions
    if val_str in ("K", "E") or any(kw in str(val).lower() for kw in ("hỏng", "lỗi", "cháy", "đứt", "mất kết nối")):
        cell.fill = ALERT_RED_FILL
        return

    # Numeric errors in error count column (F: SM Lỗi, G: SM Thiếu)
    if col_name in ("F", "G"):
        try:
            num = float(val)
            if num > 0:
                cell.fill = ALERT_RED_FILL
                return
        except ValueError:
            pass

    # Yellow alert conditions
    if val_str in ("B", "C", "D") or any(kw in str(val).lower() for kw in ("chậm", "chờ thay", "theo dõi")):
        cell.fill = ALERT_YELLOW_FILL


def setup_a4_page_printing(ws: Worksheet) -> None:
    """
    Calibrate physical print setup: A4 Landscape, fit to 1 page width.
    """
    try:
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
    except Exception:
        pass


def auto_fit_columns(ws: Worksheet, min_width: int = 10, max_width: int = 50) -> None:
    """
    Auto-adjust column widths based on cell content length.
    """
    for col in ws.columns:
        first_cell = col[0]
        if not first_cell.column_letter:
            continue
        col_letter = first_cell.column_letter
        max_len = 0
        for cell in col:
            val = cell.value
            if val is not None:
                # ignore formulas starting with =
                s = str(val)
                if not s.startswith("="):
                    max_len = max(max_len, len(s))
        width = max(min(max_len + 3, max_width), min_width)
        ws.column_dimensions[col_letter].width = width


def fill_single_spec(f: FileSpec) -> str:
    """
    Fill a single FileSpec into its Excel template using Openpyxl:
    1. Load template with keep_vba=True
    2. Delete specified unused sheets
    3. Adjust rows (insert / delete) to match data rows
    4. Populate rows, apply styles & visual alerts
    5. Write headerCells and formulaCells
    6. Calibrate A4 landscape print setup
    7. Atomically save output file
    """
    if not os.path.exists(f.template):
        raise FileNotFoundError(f"Template không tồn tại: {f.template}")

    # 1. Load template (keep_vba=True đối với tệp .xlsm)
    is_xlsm = f.template.lower().endswith(".xlsm")
    wb = openpyxl.load_workbook(f.template, keep_vba=is_xlsm, data_only=False)

    # 2. Delete unwanted sheets
    for sheet_name in f.deleteSheets:
        if sheet_name in wb.sheetnames:
            del wb[sheet_name]

    if f.sheet not in wb.sheetnames:
        raise KeyError(f"Sheet '{f.sheet}' không tồn tại trong template '{f.template}'")

    ws = wb[f.sheet]

    # Clean broken CF
    clean_broken_conditional_formatting(ws)

    # 3. Calculate and adjust rows
    need = len(f.rows)
    have = f.totalRowBefore - f.firstDataRow
    target_rows = have if f.inPlace else max(need, 1)

    if target_rows > have:
        diff = target_rows - have
        ws.insert_rows(idx=f.totalRowBefore, amount=diff)
        # Copy formatting & translate formulas for newly inserted rows
        template_row_idx = f.firstDataRow
        for ins_idx in range(f.totalRowBefore, f.totalRowBefore + diff):
            for col_idx in range(1, ws.max_column + 1):
                src_cell = ws.cell(row=template_row_idx, column=col_idx)
                dst_cell = ws.cell(row=ins_idx, column=col_idx)
                copy_cell_style(src_cell, dst_cell)
    elif target_rows < have:
        diff = have - target_rows
        ws.delete_rows(idx=f.firstDataRow + target_rows, amount=diff)

    # 4. Populate rows
    if need > 0:
        for r_idx, row_dict in enumerate(f.rows):
            target_row = f.firstDataRow + r_idx
            for col_letter, val in row_dict.items():
                cell = ws[f"{col_letter}{target_row}"]
                cell.value = val

                # Ensure thin border
                if not cell.border or not cell.border.left or not cell.border.left.style:
                    cell.border = THIN_BORDER

                # Apply visual alerts
                apply_visual_alerts(cell, col_letter, val)

    # 5. Populate headerCells
    for hc in f.headerCells:
        target_ws = wb[hc.sheet] if hc.sheet and hc.sheet in wb.sheetnames else ws
        c = target_ws[hc.ref]
        c.value = hc.value
        # If numberFormat provided
        if getattr(hc, "numberFormat", None):
            c.number_format = hc.numberFormat

    # 6. Populate formulaCells
    for fc in f.formulaCells:
        target_ws = wb[fc.sheet] if fc.sheet and fc.sheet in wb.sheetnames else ws
        formula_val = fc.formula
        if not formula_val.startswith("="):
            formula_val = "=" + formula_val
        target_ws[fc.ref].value = formula_val

    # 7. Print Calibration
    setup_a4_page_printing(ws)

    # 8. Save
    os.makedirs(os.path.dirname(os.path.abspath(f.out)), exist_ok=True)
    wb.save(f.out)

    return f"{f.name}: {need} dòng -> {f.out}"
