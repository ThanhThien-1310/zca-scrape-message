"""
Unit tests for python/data_pipeline.py
"""
import unittest
import pandas as pd
from python.data_pipeline import (
    filter_by_shift,
    clean_string_series,
    may_tinh_grade,
    deduplicate_latest_per_room,
    group_by_school,
    apply_row_numbers,
    build_status_facility_rows,
    build_may_tinh_rows,
    build_dien_rows,
)


class TestDataPipeline(unittest.TestCase):

    def test_may_tinh_grade(self):
        self.assertIsNone(may_tinh_grade(None))
        self.assertEqual(may_tinh_grade(0), "A")
        self.assertEqual(may_tinh_grade(2), "A")
        self.assertEqual(may_tinh_grade(3), "B")
        self.assertEqual(may_tinh_grade(4), "B")
        self.assertEqual(may_tinh_grade(5), "C")
        self.assertEqual(may_tinh_grade(6), "C")
        self.assertEqual(may_tinh_grade(7), "D")
        self.assertEqual(may_tinh_grade(8), "D")
        self.assertEqual(may_tinh_grade(9), "E")

    def test_filter_by_shift(self):
        # 2026-10-13 07:00:00 VN = 00:00:00 UTC (1760313600000 approx)
        # We can test with direct timestamps or ISO
        ts_in_morning = pd.Timestamp("2026-10-13 07:30:00+07:00").timestamp() * 1000
        ts_early = pd.Timestamp("2026-10-13 05:30:00+07:00").timestamp() * 1000
        ts_afternoon = pd.Timestamp("2026-10-13 14:00:00+07:00").timestamp() * 1000

        df = pd.DataFrame({
            "thoiGian": [ts_early, ts_in_morning, ts_afternoon],
            "val": [1, 2, 3]
        })

        # Morning shift: 06:30 -> 09:00
        df_morning = filter_by_shift(df, "06:30", "09:00", "thoiGian")
        self.assertEqual(len(df_morning), 1)
        self.assertEqual(df_morning.iloc[0]["val"], 2)

        # Full day / afternoon shift: 06:30 -> 15:00
        df_afternoon = filter_by_shift(df, "06:30", "15:00", "thoiGian")
        self.assertEqual(len(df_afternoon), 2)
        self.assertListEqual(df_afternoon["val"].tolist(), [2, 3])

    def test_deduplicate_latest_per_room(self):
        reports = [
            {"maNhom": "g1", "thoiGian": 100, "data": {"phongMay": "PM1", "note": "early"}},
            {"maNhom": "g1", "thoiGian": 200, "data": {"phongMay": "PM1", "note": "latest"}},
            {"maNhom": "g1", "thoiGian": 150, "data": {"phongMay": "PM2", "note": "pm2"}},
        ]
        result = deduplicate_latest_per_room(reports)
        self.assertEqual(len(result), 2)
        pm1 = next(r for r in result if r["data"]["phongMay"] == "PM1")
        self.assertEqual(pm1["data"]["note"], "latest")

    def test_group_by_school_and_numbering(self):
        entries = [
            {"school": "TH Chu Van An", "row": {"B": "TH Chu Van An", "D": "PM1", "F": "T"}},
            {"school": "TH Chu Van An", "row": {"B": "TH Chu Van An", "D": "PM2", "F": "T"}},
            {"school": "TH Hoa Sen", "row": {"B": "TH Hoa Sen", "D": "PM1", "F": "B"}},
        ]
        grouped = group_by_school(entries, "school", "B")
        numbered = apply_row_numbers(grouped, "A")

        self.assertEqual(len(numbered), 3)
        self.assertEqual(numbered[0]["A"], 1)
        self.assertEqual(numbered[0]["B"], "TH Chu Van An")
        self.assertEqual(numbered[1]["A"], 2)
        # Second row of same school should NOT have 'B'
        self.assertNotIn("B", numbered[1])
        self.assertEqual(numbered[1]["D"], "PM2")
        # Next school
        self.assertEqual(numbered[2]["A"], 3)
        self.assertEqual(numbered[2]["B"], "TH Hoa Sen")

    def test_build_status_facility_rows(self):
        reports = [
            {
                "data": {
                    "phongMay": "PM1",
                    "truong": {"tenRieng": "Hoa Sen"},
                    "khuVuc": "Quan 1",
                    "coSoVatChat": [{"loai": "AmThanh", "xepLoai": "B"}]
                }
            },
            {
                "data": {
                    "phongMay": "PM2",
                    "truong": {"tenRieng": "Hoa Sen"},
                    "khuVuc": "Quan 1",
                    "coSoVatChat": [{"loai": "AmThanh", "xepLoai": "T"}]
                }
            }
        ]
        rows = build_status_facility_rows(reports, "AmThanh")
        self.assertEqual(len(rows), 2)
        # Sorted by grade T -> B: PM2 (T) comes first
        self.assertEqual(rows[0]["D"], "PM2")
        self.assertEqual(rows[0]["F"], "T")
        self.assertEqual(rows[1]["D"], "PM1")
        self.assertEqual(rows[1]["F"], "B")


if __name__ == "__main__":
    unittest.main()
