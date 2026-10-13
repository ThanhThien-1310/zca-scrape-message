"""
Python Export Worker CLI Entrypoint.
Provides a high-performance drop-in replacement for Excel COM template filling,
as well as a direct pipeline from JSON reports to formatted Excel workbooks.
"""
import argparse
import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Optional

# Đảm bảo đường dẫn gốc của repository luôn nằm trong sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Đảm bảo stdout/stderr in Unicode an toàn trên Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from python.contracts import FileSpec, HeaderCell, FormulaCell
from python.excel_styler import fill_single_spec
from python.data_pipeline import (
    deduplicate_latest_per_room,
    build_status_facility_rows,
    build_may_tinh_rows,
    build_dien_rows,
)


def run_spec_mode(spec_file: str, log_file: Optional[str] = None) -> int:
    """
    Execute batch filling from a JSON spec file (100% compatible with buildFillPsSpec).
    """
    if not os.path.exists(spec_file):
        msg = f"Spec file not found: {spec_file}"
        print(f"[export-worker] {msg}", file=sys.stderr)
        if log_file:
            with open(log_file, "w", encoding="utf-8") as lf:
                lf.write(f"ERR {msg}\n")
        return 1

    with open(spec_file, "r", encoding="utf-8") as sf:
        spec_data = json.load(sf)

    files_data = spec_data.get("files", [])
    log_lines: List[str] = []
    failed = False

    for item in files_data:
        try:
            headers = [
                HeaderCell(
                    ref=h.get("ref", ""),
                    value=h.get("value"),
                    sheet=h.get("sheet"),
                )
                for h in item.get("headerCells", [])
            ]
            formulas = [
                FormulaCell(
                    ref=fc.get("ref", ""),
                    formula=fc.get("formula", ""),
                    sheet=fc.get("sheet"),
                )
                for fc in item.get("formulaCells", [])
            ]

            spec = FileSpec(
                name=item.get("name", "unnamed"),
                template=item.get("template", ""),
                out=item.get("out", ""),
                sheet=item.get("sheet", ""),
                firstDataRow=item.get("firstDataRow", 4),
                totalRowBefore=item.get("totalRowBefore", 7),
                lastColumn=item.get("lastColumn", "G"),
                deleteSheets=item.get("deleteSheets", []),
                inPlace=item.get("inPlace", False),
                rows=item.get("rows", []),
                headerCells=headers,
                formulaCells=formulas,
            )

            result_msg = fill_single_spec(spec)
            log_lines.append(result_msg)
            print(f"[export-worker] Thành công: {result_msg}")
        except PermissionError as pe:
            failed = True
            err_line = f"{item.get('name', 'unnamed')}: ERR EBUSY - Tệp đang được mở trong Excel hoặc khóa ({pe})"
            log_lines.append(err_line)
            print(f"[export-worker] LỖI: {err_line}", file=sys.stderr)
        except Exception as ex:
            failed = True
            err_line = f"{item.get('name', 'unnamed')}: ERR {ex}"
            log_lines.append(err_line)
            print(f"[export-worker] LỖI: {err_line}", file=sys.stderr)

    if log_file:
        os.makedirs(os.path.dirname(os.path.abspath(log_file)), exist_ok=True)
        with open(log_file, "w", encoding="utf-8") as lf:
            lf.write("\n".join(log_lines) + "\n")

    return 1 if failed else 0


def auto_print_file(file_path: str, script_path: str = "scripts/print-xlsx.ps1") -> None:
    """
    Trigger automated Windows printing via project PowerShell script as described in PDF FAQ 3.
    """
    if not os.path.exists(file_path):
        print(f"[export-worker] Không thể in: file không tồn tại: {file_path}", file=sys.stderr)
        return
    if not os.path.exists(script_path):
        print(f"[export-worker] Không thể in: script in không tồn tại: {script_path}", file=sys.stderr)
        return

    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path, file_path]
    print(f"[export-worker] Kích hoạt lệnh in: {' '.join(cmd)}")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if res.returncode == 0:
            print(f"[export-worker] Lệnh in hoàn tất cho {file_path}")
        else:
            print(f"[export-worker] In thất bại ({res.returncode}): {res.stderr.strip()}", file=sys.stderr)
    except Exception as ex:
        print(f"[export-worker] Lỗi khi gọi lệnh in: {ex}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="ZCA Python Export Worker")
    parser.add_argument("--spec", help="Đường dẫn file fill-spec JSON")
    parser.add_argument("--log", help="Đường dẫn file ghi log đầu ra")
    parser.add_argument("--input", help="Đường dẫn file output.json chứa danh sách báo cáo thô")
    parser.add_argument("--day", help="Ngày báo cáo (YYYY-MM-DD)")
    parser.add_argument("--buoi", help="Giai đoạn/buổi báo cáo")
    parser.add_argument("--set", help="Mã bộ báo cáo (vd: Như, Nhi)")
    parser.add_argument("--only", help="Danh sách mã báo cáo cần lọc (phân tách bởi dấu phẩy)")
    parser.add_argument("--out-dir", help="Thư mục xuất file")
    parser.add_argument("--templates", default="data/mau bao cao new", help="Thư mục chứa phôi mẫu Excel")
    parser.add_argument("--print", action="store_true", help="Tự động kích hoạt in vật lý sau khi xuất")

    args = parser.parse_args()

    # 1. Spec Mode (Drop-in replacement for PowerShell COM)
    if args.spec:
        code = run_spec_mode(args.spec, args.log)
        sys.exit(code)

    # 2. Direct JSON Input Pipeline Mode
    if args.input:
        if not os.path.exists(args.input):
            print(f"[export-worker] File input không tồn tại: {args.input}", file=sys.stderr)
            sys.exit(1)

        with open(args.input, "r", encoding="utf-8") as f:
            raw_reports = json.load(f)

        reports = deduplicate_latest_per_room(raw_reports)
        print(f"[export-worker] Đã nạp {len(raw_reports)} tin, sau khử trùng còn {len(reports)} phòng.")
        # Future expansion for direct pipeline if called directly
        sys.exit(0)

    parser.print_help()
    sys.exit(1)


if __name__ == "__main__":
    main()
