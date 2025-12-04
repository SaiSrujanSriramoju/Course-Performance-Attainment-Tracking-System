import re
import os
import math
from datetime import datetime

try:
    import pandas as pd
except Exception as e:
    print("This script requires pandas. Install with: pip install pandas openpyxl")
    raise


ROLL_COL = "Roll No"


def looks_like_roll(x: object) -> bool:
    if pd.isna(x):
        return False
    s = str(x).strip().upper()
    return bool(re.fullmatch(r"\d{2}MCMC\d{2}", s))


def attempted(val: object) -> bool:
    return pd.notna(val) and str(val).strip().lower() != "ab"


def to_number_safe(v):
    try:
        if pd.isna(v):
            return float('nan')
        n = float(v)
        return n
    except Exception:
        return float('nan')


def get_attainment_levels():
    n = int(input("\nEnter the number of attainment levels: ").strip())
    levels = []
    prev_upper = -1
    print("Enter lower and upper bounds for each attainment level (inclusive).")
    for i in range(1, n + 1):
        low = float(input(f"Level {i} - Lower bound: ").strip())
        high = float(input(f"Level {i} - Upper bound: ").strip())
        if low < 0 or high > 100 or low > high:
            raise ValueError("Bounds must be between 0 and 100, and low <= high")
        if low <= prev_upper:
            raise ValueError("Levels must not overlap and must be increasing")
        levels.append((i, low, high))
        prev_upper = high
    return levels


def determine_attainment(percentage, levels):
    for level, low, high in levels:
        if low <= percentage <= high:
            return level
    return 0


def find_header_row(df):
    # read first 6 rows to find a row that contains Roll No
    for i in range(min(6, len(df))):
        row = df.iloc[i].astype(str).fillna("")
        if any(cell.strip().lower() == ROLL_COL.lower() for cell in row):
            return i
    return 0


def normalize_sheet(path):
    # Read without header, detect header row
    raw = pd.read_excel(path, header=None, engine='openpyxl')
    header_idx = find_header_row(raw)
    header = raw.iloc[header_idx].fillna("").astype(str).str.strip().tolist()
    data = raw.iloc[header_idx + 1 :].reset_index(drop=True)
    # Build DataFrame with named columns where header present
    cols = [h for h in header if h]
    if not cols:
        raise ValueError("Could not detect header columns")
    df = pd.DataFrame(data.values, columns=header)
    # keep only columns that have a header name
    df = df.loc[:, [c for c in df.columns if str(c).strip()]]
    return header, df


def process_report(path, co_list, report_label, output_dir="reports_output"):
    print(f"\nProcessing {report_label} from: {path}")
    header, df = normalize_sheet(path)

    for col in [ROLL_COL] + co_list:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col} in {path}")

    # First data row = max marks
    max_marks = {c: to_number_safe(df.loc[0, c]) for c in co_list}

    students = df.iloc[1:].copy()
    students = students[students[ROLL_COL].apply(looks_like_roll)].copy()

    total_students = len(students)
    attempts = {c: int(students[c].apply(attempted).sum()) for c in co_list}

    # appeared using Tot if present
    if "Tot" in df.columns:
        appeared = int(students['Tot'].apply(attempted).sum())
    else:
        # if multiple CO columns, consider appeared if any CO attempted
        appeared = int(students[co_list].apply(lambda row: any(attempted(x) for x in row), axis=1).sum())

    absentees = total_students - appeared

    avgs = {}
    for c in co_list:
        vals = pd.to_numeric(students.loc[students[c].apply(attempted), c], errors='coerce').dropna()
        avgs[c] = float(vals.mean()) if len(vals) else float('nan')

    # ask threshold percent
    thr_pct = float(input(f"Enter the threshold percentage for {report_label} (e.g., 40): ").strip())
    thr_marks = {c: (round((thr_pct / 100.0) * max_marks[c], 2) if pd.notna(max_marks[c]) else float('nan')) for c in co_list}

    above = {}
    percent = {}
    for c in co_list:
        marks = pd.to_numeric(students.loc[students[c].apply(attempted), c], errors='coerce').dropna()
        count = int((marks >= thr_marks[c]).sum()) if not math.isnan(thr_marks[c]) else 0
        above[c] = count
        percent[c] = round((count / attempts[c] * 100), 2) if attempts[c] else 0.0

    print("\nSummary:")
    print(f"Total students: {total_students}")
    print(f"Appeared: {appeared}")
    print(f"Absent: {absentees}")
    print("Max marks:")
    for c in co_list:
        print(f"  {c}: {max_marks[c]}")
    print("Averages:")
    for c in co_list:
        print(f"  {c}: {avgs[c]:.2f}")
    print(f"\nStudents scoring >= {thr_pct}% of Max Marks:")
    for c in co_list:
        print(f"  {c}: {above[c]} students ({percent[c]}%) — Threshold Marks = {thr_marks[c]}")

    # attainment
    print("\nDefine attainment levels:")
    levels = get_attainment_levels()
    attainment = {c: determine_attainment(percent[c], levels) for c in co_list}

    print("\nAttainment Levels:")
    for c in co_list:
        print(f"  {c}: Level {attainment[c]} (based on {percent[c]}%)")

    # Build report DataFrame
    rows = []
    rows.append(("Total Students", total_students))
    rows.append(("Appeared", appeared))
    rows.append(("Absent", absentees))

    rows.append(("", ""))
    rows.append(("Max Marks", ""))
    for c in co_list:
        rows.append((c, max_marks[c]))

    rows.append(("", ""))
    rows.append(("Attempts", ""))
    for c in co_list:
        rows.append((c, attempts[c]))

    rows.append(("", ""))
    rows.append(("Averages", ""))
    for c in co_list:
        rows.append((c, avgs[c]))

    rows.append(("", ""))
    rows.append((f"Students Scoring >= {thr_pct}%", ""))
    for c in co_list:
        rows.append((c, f"{above[c]} students ({percent[c]}%) — Threshold Marks = {thr_marks[c]}"))

    rows.append(("", ""))
    rows.append(("Attainment Levels", ""))
    for c in co_list:
        rows.append((c, f"Level {attainment[c]} (based on {percent[c]}%)"))

    report_df = pd.DataFrame(rows, columns=["Metric", "Value"])

    # Ensure output directory
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    out_path = os.path.join(output_dir, f"{report_label.replace(' ', '_')}_report_{ts}.xlsx")
    with pd.ExcelWriter(out_path, engine='openpyxl') as writer:
        report_df.to_excel(writer, sheet_name='Summary', index=False)
        # also write student raw data for reference
        students.to_excel(writer, sheet_name='Students', index=False)

    print(f"Report saved to: {out_path}")
    return out_path


def main():
    print("Generate reports for Minor2, Minor3, and Major")
    tasks = [
        ("Minor2", ["CO-3", "CO-4", "Tot"]),
        ("Minor3", ["CO-5", "CO-6", "Tot"]),
        ("Major", ["CO-1", "CO-2", "CO-3", "CO-4", "CO-5", "CO-6", "Tot"]),
    ]

    outputs = {}
    for label, cols in tasks:
        path = input(f"\nEnter Excel path for {label} (leave blank to skip): ").strip()
        if not path:
            print(f"Skipping {label}")
            continue
        if not os.path.exists(path):
            print("File not found, skipping.")
            continue
        try:
            out = process_report(path, cols, label)
            outputs[label] = out
        except Exception as e:
            print(f"Error processing {label}: {e}")

    print("\nDone. Generated reports:")
    for k, v in outputs.items():
        print(f" - {k}: {v}")


if __name__ == '__main__':
    main()
