import re
import pandas as pd

ROLL_COL = "Roll No"
COLS = ["CO-1", "CO-2", "Tot"]

def looks_like_roll(x: object) -> bool:
    """Check if value looks like a valid roll number (e.g., 24MCMC01)."""
    if pd.isna(x):
        return False
    s = str(x).strip().upper()
    return bool(re.fullmatch(r"\d{2}MCMC\d{2}", s))

def attempted(val: object) -> bool:
    """True if student attempted (not 'Ab' or blank)."""
    return pd.notna(val) and str(val).strip().lower() != "ab"

def get_attainment_levels():
    """Ask user for attainment levels and bounds with validation."""
    n = int(input("\nEnter the number of attainment levels: "))
    levels = []
    print("\nEnter lower and upper bounds for each attainment level (inclusive).")
    print("(Example: For 3 levels, you might enter 0–49, 50–74, 75–100)\n")

    prev_upper = -1
    for i in range(1, n + 1):
        low = float(input(f"Level {i} - Lower bound: "))
        high = float(input(f"Level {i} - Upper bound: "))

        if low < 0 or high > 100 or low > high:
            raise ValueError(" Bounds must be between 0 and 100, and lower ≤ upper.")
        if low <= prev_upper:
            raise ValueError(f" Overlap detected! Level {i} lower bound ({low}) "
                             f"must be greater than previous level's upper bound ({prev_upper}).")

        levels.append((i, low, high))
        prev_upper = high

    if levels[-1][2] != 100:
        print(" Note: The upper bound of the last attainment level is not 100. "
              "You may want to adjust it for completeness.")
    return levels

def determine_attainment(percentage, levels):
    """Determine attainment level for a given percentage."""
    for level, low, high in levels:
        if low <= percentage <= high:
            return level
    return 0

def main():
    path = input("Enter the full path of your Excel file: ").strip()

    # Avoid Excel's temporary lock files (~$)
    if path.split("\\")[-1].startswith("~$"):
        print(" That looks like a temporary Excel lock file. Please  use the original file instead.")
        return

    df = pd.read_excel(path)

    # Ensure required columns exist
    for col in [ROLL_COL] + COLS:
        if col not in df.columns:
            raise ValueError(f"Missing column: {col}")

    # First row = max marks
    max_marks = {c: pd.to_numeric(df.loc[0, c], errors="coerce") for c in COLS}
    df = df.iloc[1:].copy()
    df = df[df[ROLL_COL].apply(looks_like_roll)].copy()

    # Basic counts
    total_students = len(df)
    attempts = {c: int(df[c].apply(attempted).sum()) for c in COLS}

    appeared = int(df["Tot"].apply(attempted).sum()) if "Tot" in df.columns else int(
        (df["CO-1"].apply(attempted) | df["CO-2"].apply(attempted)).sum()
    )
    absentees = total_students - appeared

    # Averages excluding absentees
    avgs = {}
    for c in COLS:
        s = pd.to_numeric(df.loc[df[c].apply(attempted), c], errors="coerce")
        avgs[c] = float(s.mean()) if len(s) else float("nan")

    #  Display initial summary 
    print("\n===== SUMMARY =====")
    print(f"Total students in class        : {total_students}")
    print(f"Students appeared for the test : {appeared}")
    print(f"Students absent                : {absentees}")

    print("\n----- Maximum Marks -----")
    for c in COLS:
        print(f"{c}: Max = {max_marks[c]}")

    print("\n----- Attempts per column -----")
    for c in COLS:
        print(f"{c}: {attempts[c]}")

    print("\n----- Averages (absentees excluded) -----")
    for c in COLS:
        print(f"{c} Average: {avgs[c]:.2f}")

    # Now ask for threshold percentage
    print("\n============================================")
    threshold_percent = float(input("Enter the threshold percentage for qualifying (e.g., 40 or 50): "))
    if threshold_percent < 0 or threshold_percent > 100:
        raise ValueError(" Threshold percentage must be between 0 and 100.")
    print("============================================")

    # Compute threshold marks per column
    threshold_marks = {c: round((threshold_percent / 100) * max_marks[c], 2) for c in COLS}

    # Calculate students scoring ≥ threshold
    above_threshold, percentage_threshold = {}, {}
    for c in COLS:
        marks = pd.to_numeric(df.loc[df[c].apply(attempted), c], errors="coerce")
        count_above = (marks >= threshold_marks[c]).sum()
        above_threshold[c] = int(count_above)
        percentage_threshold[c] = round((count_above / attempts[c] * 100), 2) if attempts[c] else 0.0

    # Display threshold results
    print(f"\n----- Students Scoring ≥ {threshold_percent}% of Max Marks -----")
    for c in COLS:
        print(f"{c}: {above_threshold[c]} students ({percentage_threshold[c]}%) "
              f"— Threshold Marks = {threshold_marks[c]}")

    #  Now ask for attainment levels 
    print("\n============================================")
    print("Now define the attainment levels (based on the above percentages)")
    print("============================================")
    levels = get_attainment_levels()

    attainment = {c: determine_attainment(percentage_threshold[c], levels) for c in COLS}

    # ===== ATTAINMENT REPORT =====
    print("\n===== ATTAINMENT LEVELS =====")
    for c in COLS:
        print(f"{c}: Attainment Level {attainment[c]} (based on {percentage_threshold[c]}%)")

if __name__ == "__main__":
    main()
