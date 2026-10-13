"""
Data Contracts and Schema definitions for Python Export Worker.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class HeaderCell:
    ref: str
    value: Any
    sheet: Optional[str] = None


@dataclass
class FormulaCell:
    ref: str
    formula: str
    sheet: Optional[str] = None


@dataclass
class FileSpec:
    name: str
    template: str
    out: str
    sheet: str
    firstDataRow: int
    totalRowBefore: int
    lastColumn: str
    deleteSheets: List[str] = field(default_factory=list)
    inPlace: bool = False
    rows: List[Dict[str, Any]] = field(default_factory=list)
    headerCells: List[HeaderCell] = field(default_factory=list)
    formulaCells: List[FormulaCell] = field(default_factory=list)


@dataclass
class FillBatchSpec:
    files: List[FileSpec] = field(default_factory=list)
