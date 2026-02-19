import re
from typing import Dict, List, Tuple

import pandas as pd


ROLL_COL = "Roll No"


def _find_header_row(df: pd.DataFrame) -> int:
    max_scan = min(10, len(df))
    for i in range(max_scan):
        row = df.iloc[i].fillna("").astype(str)
        if any(cell.strip().lower() == ROLL_COL.lower() for cell in row):
            return i
    return -1


def _normalize_co_col(name: str) -> Tuple[bool, int]:
    if not name:
        return False, -1
    s = str(name).strip().lower()
    if s in {"tot", "total"}:
        return False, -1
    match = re.search(r"co\s*-?\s*(\d+)", s)
    if not match:
        return False, -1
    return True, int(match.group(1))


def _to_number(value) -> float:
    if pd.isna(value):
        return float("nan")
    text = str(value).strip().lower()
    if text == "ab":
        return 0.0
    try:
        return float(text)
    except Exception:
        return float("nan")


def parse_marks_excel(file_path: str) -> Dict[str, object]:
    try:
        raw = pd.read_excel(file_path, header=None, engine="openpyxl")
    except Exception as exc:
        raise ValueError("Invalid format") from exc

    if raw is None or raw.empty:
        raise ValueError("Invalid format")

    header_row = _find_header_row(raw)
    if header_row == -1:
        raise ValueError("Invalid format")

    header = raw.iloc[header_row].fillna("").astype(str).str.strip().tolist()
    if not header or not any(h for h in header):
        raise ValueError("Invalid format")

    data = raw.iloc[header_row + 1 :].reset_index(drop=True)
    df = pd.DataFrame(data.values, columns=header)
    df = df.loc[:, [c for c in df.columns if str(c).strip()]]

    if ROLL_COL not in df.columns:
        raise ValueError("Invalid format")

    co_map: Dict[str, int] = {}
    for col in df.columns:
        if col == ROLL_COL:
            continue
        ok, co_num = _normalize_co_col(col)
        if ok:
            co_map[col] = co_num

    if not co_map:
        raise ValueError("No CO columns found")

    if len(df) < 1:
        raise ValueError("Max marks row missing")

    max_marks: Dict[int, float] = {}
    max_row = df.iloc[0]
    for col, co_num in co_map.items():
        value = _to_number(max_row[col])
        if pd.isna(value):
            raise ValueError("Max marks row missing")
        max_marks[co_num] = float(value)

    students_df = df.iloc[1:].copy()
    students_df[ROLL_COL] = students_df[ROLL_COL].astype(str).str.strip()
    students_df = students_df[students_df[ROLL_COL] != ""]

    if students_df.empty:
        raise ValueError("Roll numbers missing")

    students: List[Dict[str, object]] = []
    for _, row in students_df.iterrows():
        roll_no = str(row[ROLL_COL]).strip()
        if not roll_no:
            continue
        marks: Dict[int, float] = {}
        for col, co_num in co_map.items():
            value = _to_number(row[col])
            marks[co_num] = 0.0 if pd.isna(value) else float(value)
        students.append({"roll_no": roll_no, "marks": marks})

    if not students:
        raise ValueError("Roll numbers missing")

    return {"max_marks": max_marks, "students": students}
