// ========= CONFIG =========
const API_BASE = "http://localhost:5000/api";
const ROLL_COL = "Roll No";
const COLS = ["CO-1", "CO-2", "Tot"];

// ========= STATE =========
let courses = [];
let activeCourseIndex = null;       // which course is currently being processed
let lastPayload = null;             // last computed report for the active course (includes attainment)
let currentSummaryWithoutAtt = null;// summary before attainment so we can re-apply if needed

// ========= UTILS =========
function loadCourses() {
  const raw = localStorage.getItem("courses");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Invalid courses data in localStorage");
    return [];
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function looksLikeRoll(val) {
  if (val == null) return false;
  const s = String(val).trim().toUpperCase();
  // Example: 24MCMC01, 23MCMC18
  return /^\d{2}MCMC\d{2}$/.test(s);
}

function attempted(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s !== "" && s !== "ab";
}

function toNumberSafe(v) {
  if (v == null) return NaN;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

// ========= RENDER COURSES =========
const coursesArea = document.getElementById("coursesArea");
const excelInput = document.getElementById("excelInput");

async function applyBackendAttainment(payload, courseId) {
  try {
    payload.attainment = payload.attainment || {};
    payload.attainment._refreshing = true;
    const response = await fetch(`${API_BASE}/get_attainment_ranges/${courseId}`, { credentials: "include" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      payload.attainment._refreshing = false;
      return;
    }

    const ranges = result.ranges || [];
    const rangesByCo = {};
    ranges.forEach((row) => {
      const coNumber = Number(row.co_number);
      if (!rangesByCo[coNumber]) rangesByCo[coNumber] = [];
      rangesByCo[coNumber].push({
        level: Number(row.level_number),
        low: Number(row.lower_limit),
        high: Number(row.upper_limit)
      });
    });
    Object.keys(rangesByCo).forEach((key) => {
      rangesByCo[key].sort((a, b) => a.level - b.level);
    });

    const levelsByCol = {};
    const perc = payload.percentages || {};
    const cols = payload.cols || [];

    cols.forEach((col) => {
      if (col.startsWith("CO-")) {
        const coNumber = Number(col.replace("CO-", ""));
        const rangesForCo = rangesByCo[coNumber] || [];
        const pct = Number(perc[col]);
        const lvl = getLevelFromLevels(rangesForCo, pct);
        levelsByCol[col] = lvl || 0;
      }
    });

    const coLevels = Object.keys(levelsByCol).map((key) => levelsByCol[key]).filter((v) => Number.isFinite(v));
    if (cols.includes("Tot")) {
      const avgLevel = coLevels.length ? Number((coLevels.reduce((a, b) => a + b, 0) / coLevels.length).toFixed(2)) : 0;
      levelsByCol["Tot"] = avgLevel;
    }

    payload.attainment.levelsByCol = levelsByCol;
    payload.attainment.backendApplied = true;
    payload.attainment._refreshing = false;
    payload.attainment.rangesUpdatedAt = localStorage.getItem(`rangesUpdated_${courseId}`) || payload.attainment.rangesUpdatedAt;

    renderReport(payload);
  } catch (err) {
    payload.attainment = payload.attainment || {};
    payload.attainment._refreshing = false;
    // ignore
  }
}

async function applyBackendThresholds(payload, courseId) {
  try {
    payload.thresholdsApplied = true;
    const response = await fetch(`${API_BASE}/co/${courseId}`, { credentials: "include" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      payload.thresholdsApplied = false;
      return;
    }

    const marks = {};
    (result.outcomes || []).forEach((row) => {
      marks[`CO-${row.co_number}`] = Number(row.threshold_mark);
    });

    payload.thresholdMarks = marks;
    payload.thresholdsUpdatedAt = localStorage.getItem(`thresholdsUpdated_${courseId}`) || payload.thresholdsUpdatedAt;
    if (payload.attainment) {
      payload.attainment.backendApplied = false;
      delete payload.attainment.levelsByCol;
    }
    renderReport(payload);
  } catch (err) {
    payload.thresholdsApplied = false;
  }
}

function renderCourses() {
  if (!courses.length) {
    courses = loadCourses();
  }
  coursesArea.innerHTML = "";

  if (!courses.length) {
    const div = document.createElement("div");
    div.className = "course-card";
    div.innerHTML = "<p>No courses found. Please add courses in the Courses module.</p>";
    coursesArea.appendChild(div);
    return;
  }

  courses.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = "course-card";

    const passing = c.passingPercent ?? c.passPercent ?? c.passing ?? "";

    card.innerHTML = `
      <div class="course-title">${escapeHtml(c.name || "Course " + (idx + 1))}</div>
      <div class="course-meta">
        <span class="label">Batch:</span> ${escapeHtml(c.batch || "Not set")}<br>
        <span class="label">Passing %:</span> ${passing || "Not set"}
      </div>
      <p class="course-instructions">
        Upload marks Excel (.xlsx) to generate the report.
      </p>
      <div class="course-actions">
        <button class="btn btn-primary" data-idx="${idx}" data-role="marks-btn">Upload Minor 1 Excel</button>
        <button class="btn btn-outline" data-idx="${idx}" data-role="minor2-btn">Upload Minor 2 Excel</button>
        <button class="btn btn-outline" data-idx="${idx}" data-role="minor3-btn">Upload Minor 3 Excel</button>
        <button class="btn btn-outline" data-idx="${idx}" data-role="major-btn">Upload Major Excel</button>
        <button class="btn btn-outline" data-idx="${idx}" data-role="view-last-btn">View Last Report</button>
        <button class="btn btn-green" data-idx="${idx}" data-role="final-map-btn">Final Mapping</button>
      </div>
      <div class="course-instructions" style="margin-top:14px;">CO-PO Matrix</div>
      <div id="co-po-matrix-${idx}">Loading CO-PO matrix...</div>
      <div class="course-instructions" style="margin-top:14px;">PO Attainment (Direct)</div>
      <div id="po-attainment-${idx}">Loading PO attainment...</div>
      <p class="helper-text">
        Excel format: first row after header = max marks; following rows = students.
      </p>
    `;
    coursesArea.appendChild(card);

    loadCoPoSection(c, idx);
  });
}

// Delegate button clicks
coursesArea.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-role]");
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (Number.isNaN(idx)) return;

  const role = btn.dataset.role;
  if (role === "marks-btn") {
    handleMarksUploadClick(idx);
  } else if (role === "minor2-btn") {
    handleMinorUploadClick(idx, 'minor2');
  } else if (role === "minor3-btn") {
    handleMinorUploadClick(idx, 'minor3');
  } else if (role === "major-btn") {
    handleMinorUploadClick(idx, 'major');
  } else if (role === "final-map-btn") {
    generateFinalAttainmentMapping(idx);
  } else if (role === "view-last-btn") {
    handleViewLastReport(idx);
  }
});

async function fetchAssignedCourses() {
  const response = await fetch(`${API_BASE}/faculty/courses`, { credentials: "include" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Failed to load courses");
  }

  const mapped = (result.courses || []).map((c) => ({
    courseId: c.course_id,
    courseCode: c.course_code,
    name: c.course_name,
    batch: c.batch_name || "",
    passPercent: c.passing_marks,
  }));

  localStorage.setItem("courses", JSON.stringify(mapped));
  return mapped;
}


async function loadCoPoSection(course, idx) {
  const matrixContainer = document.getElementById(`co-po-matrix-${idx}`);
  const poContainer = document.getElementById(`po-attainment-${idx}`);
  if (!matrixContainer || !poContainer) return;

  if (!course.courseId) {
    matrixContainer.innerHTML = "<p>CO-PO matrix not available for this course.</p>";
    poContainer.innerHTML = "<p>PO attainment not available for this course.</p>";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/co_po_direct/${course.courseId}`, { credentials: "include" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Failed to load CO-PO matrix");
    }

    const poHeaders = (result.po_numbers || []).map((po) => `<th>PO${po}</th>`).join("");
    const matrixRows = (result.co_numbers || []).map((co) => {
      const cells = (result.po_numbers || []).map((po) => {
        const val = result.matrix?.[co]?.[po] ?? 0;
        return `<td>${val}</td>`;
      }).join("");
      return `<tr><td>CO${co}</td>${cells}</tr>`;
    }).join("");

    const avgCells = (result.po_numbers || []).map((po) => {
      const avg = result.column_averages?.[po] ?? 0;
      return `<td>${avg}</td>`;
    }).join("");

    matrixContainer.innerHTML = `
      <table class="matrix-table">
        <thead>
          <tr>
            <th>CO</th>
            ${poHeaders}
          </tr>
        </thead>
        <tbody>
          ${matrixRows || "<tr><td colspan=\"13\">No matrix data available.</td></tr>"}
          <tr>
            <td><strong>Average</strong></td>
            ${avgCells}
          </tr>
        </tbody>
      </table>
    `;

    const poRows = (result.po_attainment || []).map((row) => (
      `<tr><td>PO${row.po_number}</td><td>${row.attainment}</td></tr>`
    )).join("");

    poContainer.innerHTML = `
      <table class="matrix-table">
        <thead>
          <tr>
            <th>PO</th>
            <th>Attainment Value</th>
          </tr>
        </thead>
        <tbody>
          ${poRows || "<tr><td colspan=\"2\">No PO attainment available.</td></tr>"}
        </tbody>
      </table>
    `;
  } catch (err) {
    matrixContainer.innerHTML = `<p>${err.message || "Failed to load CO-PO matrix"}</p>`;
    poContainer.innerHTML = `<p>${err.message || "Failed to load PO attainment"}</p>`;
  }
}

// QUESTION PAPER upload removed (handled outside this UI).

// ========= MARKS UPLOAD =========
let marksTargetIndex = null;

function handleMarksUploadClick(idx) {
  activeCourseIndex = idx;
  marksTargetIndex = idx;
  excelInput.value = "";
  excelInput.click();
}

function handleMinorUploadClick(idx, type) {
  // type: 'minor2' | 'minor3' | 'major'
  activeCourseIndex = idx;
  window._reportsUploadType = type;
  excelInput.value = "";
  excelInput.click();
}

excelInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });

      const parsed = normalizeSheet(rows);

      // Decide which report type we're generating. Default = standard marks upload
      const type = window._reportsUploadType || 'marks';

      if (type === 'marks') {
        const summary = computeSummary(parsed);
        currentSummaryWithoutAtt = summary; // save for later

        // threshold percentage comes from Courses module
        const course = courses[activeCourseIndex] || {};
        const passPercent = Number(course.passingPercent ?? course.passPercent ?? course.passing ?? 0) || 0;

        const thresholdData = computeThresholds(summary, passPercent);

        // Build payload (without attainment yet)
        const payload = {
          courseName: course.name || "Course",
          batch: course.batch || "",
          passingPercent: passPercent,
          cols: COLS,
          summary,
          thresholdPercent: passPercent,
          thresholdMarks: thresholdData.thresholdMarks,
          above: thresholdData.above,
          percentages: thresholdData.percentages,
          attainment: null,
        };

        lastPayload = payload;
        // Render current report without attainment
        renderReport(payload);
        openDrawerForCourse(activeCourseIndex);

        // Attainment levels are defined in the Courses module; no per-report definition required.

        // Persist base report (without attainment yet)
        saveReportForCourse(activeCourseIndex, payload);

        // Also persist this main marks upload as Minor1 so final mapping
        // can include the first minor automatically.
        try { saveMinorReportForCourse(activeCourseIndex, 'minor1', payload); } catch (e) { console.warn('Could not save minor1 report', e); }

        // Build downloadable workbook and enable download button
        try {
          const build = buildWorkbookFromPayload(payload, payload.courseName || 'Course');
          lastPayload.pendingWorkbook = build.wb;
          lastPayload.pendingFilename = build.filename;
          const dlBtn = document.getElementById('downloadXlsxBtn');
          if (dlBtn) {
            dlBtn.classList.remove('btn-disabled');
            dlBtn.disabled = false;
          }
        } catch (err) {
          console.warn('Could not build workbook for main report', err);
        }

        // PDF download removed
      } else {
        // minor2 / minor3 / major — generate a downloadable Excel report for selected COs
        let cols = [];
        let label = type;
        if (type === 'minor2') {
          cols = ['CO-3', 'CO-4', 'Tot'];
          label = 'Minor2';
        } else if (type === 'minor3') {
          cols = ['CO-5', 'CO-6', 'Tot'];
          label = 'Minor3';
        } else if (type === 'major') {
          cols = ['CO-1','CO-2','CO-3','CO-4','CO-5','CO-6','Tot'];
          label = 'Major';
        }

        generateAndDownloadReport(parsed, cols, label);
      }

      // reset upload type
      window._reportsUploadType = undefined;

    } catch (err) {
      console.error(err);
      alert(err && err.message ? err.message : "Could not read the Excel file. Please check the format.");
    }
  };
  reader.readAsArrayBuffer(file);
});

// ========= NORMALIZE SHEET & SUMMARY =========
function normalizeSheet(rows) {
  if (!rows || !rows.length) throw new Error("Empty sheet");

  // Find header row containing Roll No (within first 6 rows)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(v => (v == null ? "" : String(v).trim()));
    if (row.some(cell => {
      const low = cell.toLowerCase();
      return low === ROLL_COL.toLowerCase() || low === "rollno" || low === "roll no." || low === "roll number";
    })) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) headerRowIndex = 0;

  // Normalize headers to canonical names so files with minor variations
  // like "CO3", "co 3", "CO-3" are mapped to a common key "CO-3".
  function canonicalHeader(h) {
    if (h == null) return "";
    const s = String(h).trim();
    if (!s) return "";
    const low = s.toLowerCase();
    if (
      low === ROLL_COL.toLowerCase() ||
      low === "rollno" ||
      low === "roll" ||
      low === "roll no." ||
      low === "roll number"
    ) return ROLL_COL;
    if (low === "tot" || low === "total") return "Tot";
    // match CO variants like "CO3", "co 3", "Co-3", "CO_3"
    const m = low.match(/^co[\s_\-]?(\d+)$/);
    if (m) return `CO-${Number(m[1])}`;
    // also accept formats like "coblah"? otherwise preserve trimmed original
    return s;
  }

  const header = rows[headerRowIndex].map(h => canonicalHeader(h));
  const dataRows = rows.slice(headerRowIndex + 1);

  const objs = dataRows.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      if (!key) continue;
      obj[key] = r[i] != null ? r[i] : null;
    }
    return obj;
  });

  return { header, rows: objs };
}

function computeSummary(parsed) {
  const headers = parsed.header;
  if (!headers.includes(ROLL_COL)) throw new Error(`Missing column: ${ROLL_COL}`);
  if (!parsed.rows.length) throw new Error("No data rows found");

  // Detect CO columns present in the sheet (CO-1, CO-2, ...)
  const coCols = headers.filter(h => /^CO-\d+$/i.test(h));
  if (!coCols.length) {
    throw new Error("No CO columns found");
  }
  const cols = coCols;

  // First row = max marks
  const maxRow = parsed.rows[0];
  const maxMarks = {};
  for (const c of cols) {
    maxMarks[c] = toNumberSafe(maxRow[c]);
  }

  // If Tot is not present but CO columns exist, synthesize a Tot column
  // by summing the CO max marks; we'll also compute per-student Tot later.
  const hasTotHeader = headers.includes('Tot');
  const includeSyntheticTot = !hasTotHeader && coCols.length > 0;
  if (includeSyntheticTot) {
    maxMarks['Tot'] = coCols.reduce((s, cc) => s + (Number.isFinite(maxMarks[cc]) ? maxMarks[cc] : 0), 0);
  }

  // Student rows (skip first row)
  const parsedStudentRows = parsed.rows.slice(1);
  const rowsWithRollValue = parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '').length;
  const studRowsStrict = parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '' && /^\d{2}MCMC\d{2}$/.test(String(r[ROLL_COL]).trim().toUpperCase()));
  // If strict roll-format matching captures most students, use it;
  // otherwise fall back to any non-empty Roll No (more tolerant for varied formats).
  const useStrict = studRowsStrict.length >= Math.max(1, Math.floor(rowsWithRollValue / 2));
  const studRows = useStrict ? studRowsStrict : parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '');
  const totalStudents = studRows.length;

  // Attempts per column (include synthetic Tot if applicable)
  const attempts = {};
  const effectiveCols = includeSyntheticTot ? [...cols, 'Tot'] : cols.slice();

  // If we're synthesizing Tot, compute per-student Tot now
  if (includeSyntheticTot) {
    for (const r of studRows) {
      let tot = 0;
      let any = false;
      for (const cc of coCols) {
        const v = toNumberSafe(r[cc]);
        if (!Number.isNaN(v)) { tot += v; any = true; }
      }
      if (any) r['Tot'] = tot;
    }
  }

  for (const c of effectiveCols) {
    // For Tot, always count students who attempted any CO (not rely on Tot cell)
    if (c === 'Tot' && coCols.length) {
      attempts[c] = studRows.reduce((acc, r) => acc + (coCols.some(co => attempted(r[co])) ? 1 : 0), 0);
    } else {
      attempts[c] = studRows.reduce((acc, r) => acc + (attempted(r[c]) ? 1 : 0), 0);
    }
  }

  // Appeared: prefer CO columns to decide appearance when CO columns
  // are present (this matches Attempts per column). Only fall back to
  // using Tot when no CO columns are available.
  let appeared = 0;
  const coColsForCount = cols.filter(c => /^CO-\d+$/i.test(c));
  for (const r of studRows) {
    const hasAnyCO = coColsForCount.length ? coColsForCount.some(cc => attempted(r[cc])) : false;
    const hasTot = headers.includes("Tot") && attempted(r["Tot"]);
    if (coColsForCount.length) {
      if (hasAnyCO) appeared += 1;
    } else {
      if (hasTot) appeared += 1;
    }
  }
  const absentees = totalStudents - appeared;

  // Averages per column (excluding absentees)
  const avgs = {};
  for (const c of effectiveCols) {
    const vals = studRows
      .filter(r => attempted(r[c]))
      .map(r => toNumberSafe(r[c]))
      .filter(v => !Number.isNaN(v));
    avgs[c] = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : NaN;
  }

  return {
    maxMarks,
    studRows,
    totalStudents,
    attempts,
    appeared,
    absentees,
    avgs,
    // debug helpers
    parsedRowsCount: parsedStudentRows.length,
    rowsWithRollValue,
    matchedByRollCount: studRowsStrict.length,
    rollMatchingMethod: useStrict ? 'strict' : 'non-empty'
  };
}

// Flexible summary generator for arbitrary CO columns
function computeSummaryForCols(parsed, cols) {
  const headers = parsed.header;
  if (!parsed.rows.length) throw new Error("No data rows found");

  // Build a tolerant mapping from desired column names to actual header keys
  const desired = [ ...cols ];
  const actualHeaders = headers.slice();
  const desiredToActual = {};

  function normalizeKey(s) {
    if (s == null) return '';
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const headerNormMap = {};
  for (const h of actualHeaders) headerNormMap[normalizeKey(h)] = h;

  // ensure Roll No present
  if (!actualHeaders.some(h => normalizeKey(h) === normalizeKey(ROLL_COL))) {
    throw new Error(`Missing column: ${ROLL_COL}`);
  }

  for (const d of desired) {
    const keyNorm = normalizeKey(d);
    if (headerNormMap[keyNorm]) {
      desiredToActual[d] = headerNormMap[keyNorm];
    } else {
      // try relaxed CO matching (e.g., CO3 -> CO-3)
      if (/^co-?\d+$/i.test(d)) {
        // try to find any header that normalizes to start with 'co' + number
        const matched = actualHeaders.find(h => normalizeKey(h).startsWith(normalizeKey(d)));
        if (matched) {
          desiredToActual[d] = matched;
          continue;
        }
      }
      throw new Error(`Missing column: ${d}. Detected headers: ${actualHeaders.join(', ')}`);
    }
  }

  // First row = max marks
  const maxRow = parsed.rows[0];
  const maxMarks = {};
  for (const d of desired) {
    const actual = desiredToActual[d];
    maxMarks[d] = actual ? toNumberSafe(maxRow[actual]) : NaN;
  }

  // If Tot was requested but not present, and CO columns are available,
  // synthesize Tot as the sum of CO max marks and later per-student totals.
  const coActualKeys = desired.filter(d => d !== 'Tot').map(d => desiredToActual[d]).filter(Boolean);
  let synthesizeTot = false;
  if (desired.includes('Tot') && !desiredToActual['Tot'] && coActualKeys.length) {
    maxMarks['Tot'] = coActualKeys.reduce((s, k) => s + (Number.isFinite(maxMarks[k]) ? maxMarks[k] : 0), 0);
    synthesizeTot = true;
  }

  // Student rows (skip first row)
  const parsedStudentRows = parsed.rows.slice(1);
  const rowsWithRollValue = parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '').length;
  const studRowsStrict = parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '' && /^\d{2}MCMC\d{2}$/.test(String(r[ROLL_COL]).trim().toUpperCase()));
  const useStrict = studRowsStrict.length >= Math.max(1, Math.floor(rowsWithRollValue / 2));
  const studRows = useStrict ? studRowsStrict : parsedStudentRows.filter(r => r[ROLL_COL] != null && String(r[ROLL_COL]).trim() !== '');
  const totalStudents = studRows.length;

  // Attempts per column (handle synthetic Tot)
  const attempts = {};
  const effectiveDesired = desired.slice();
  if (synthesizeTot && !effectiveDesired.includes('Tot')) effectiveDesired.push('Tot');

  // If synthesizing Tot, compute per-student Tot now (sum of CO actual keys)
  if (synthesizeTot) {
    for (const r of studRows) {
      let tot = 0;
      let any = false;
      for (const k of coActualKeys) {
        const v = toNumberSafe(r[k]);
        if (!Number.isNaN(v)) { tot += v; any = true; }
      }
      if (any) r['Tot'] = tot;
    }
  }

  for (const d of effectiveDesired) {
    const actual = desiredToActual[d] || d;
    // For Tot, always count students who attempted any CO (use mapped CO keys)
    if (d === 'Tot' && coActualKeys.length) {
      attempts[d] = studRows.reduce((acc, r) => acc + (coActualKeys.some(k => attempted(r[k])) ? 1 : 0), 0);
    } else {
      attempts[d] = studRows.reduce((acc, r) => acc + (attempted(r[actual]) ? 1 : 0), 0);
    }
  }

  // Appeared: prefer CO columns (mapped keys) when available; fall back
  // to Tot only if no CO keys are present.
  let appeared = 0;
  for (const r of studRows) {
    const hasAnyCO = coActualKeys.length ? coActualKeys.some(k => attempted(r[k])) : false;
    const hasTot = desiredToActual['Tot'] ? attempted(r[desiredToActual['Tot']]) : false;
    if (coActualKeys.length) {
      if (hasAnyCO) appeared += 1;
    } else {
      if (hasTot) appeared += 1;
    }
  }
  const absentees = totalStudents - appeared;

  const avgs = {};
  for (const d of effectiveDesired) {
    const actual = desiredToActual[d] || d;
    const vals = studRows.filter(r => attempted(r[actual])).map(r => toNumberSafe(r[actual])).filter(v => !Number.isNaN(v));
    avgs[d] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : NaN;
  }

  return { maxMarks, studRows, totalStudents, attempts, appeared, absentees, avgs,
           parsedRowsCount: parsedStudentRows.length, rowsWithRollValue, matchedByRollCount: studRowsStrict.length, rollMatchingMethod: useStrict ? 'strict' : 'non-empty' };
}

function computeThresholds(summary, thresholdMarks, appearedStudents, thresholdPercentFallback) {
  const thresholdByCol = {};
  const above = {};
  const percentages = {};

  // Determine which columns to compute thresholds for. Prefer the
  // columns present in the summary (this handles Minor2/Minor3/Major),
  // otherwise fall back to the global COLS list.
  const cols = (summary && summary.maxMarks && Object.keys(summary.maxMarks).length)
    ? Object.keys(summary.maxMarks)
    : COLS;

  const hasMarks = thresholdMarks && Object.keys(thresholdMarks).length;
  for (const c of cols) {
    let thrMark = hasMarks ? Number(thresholdMarks[c]) : NaN;
    if (!Number.isFinite(thrMark) && c === "Tot") {
      const coKeys = cols.filter(k => k.startsWith("CO-"));
      const sumCo = coKeys.reduce((sum, k) => sum + (Number(thresholdMarks?.[k]) || 0), 0);
      if (sumCo) thrMark = sumCo;
    }
    if (!Number.isFinite(thrMark) && Number.isFinite(thresholdPercentFallback)) {
      const rawMax = summary.maxMarks && summary.maxMarks[c];
      const max = Number.isFinite(rawMax) ? rawMax : NaN;
      if (Number.isFinite(max)) {
        thrMark = Number(((thresholdPercentFallback / 100) * max).toFixed(2));
      }
    }

    if (!Number.isFinite(thrMark)) {
      thresholdByCol[c] = NaN;
      above[c] = 0;
      percentages[c] = 0;
      continue;
    }

    thresholdByCol[c] = thrMark;

    const marks = (Array.isArray(summary.studRows) ? summary.studRows : [])
      .filter(r => attempted(r[c]))
      .map(r => toNumberSafe(r[c]))
      .filter(v => !Number.isNaN(v));

    // Count students whose numeric mark is >= threshold mark
    const countAbove = marks.filter(m => m >= thrMark).length;
    above[c] = countAbove;

    const pct = appearedStudents
      ? Number(((countAbove / appearedStudents) * 100).toFixed(2))
      : 0;
    percentages[c] = pct;
  }

  return { thresholdMarks: thresholdByCol, above, percentages };
}

// Map a percentage to a level using the levels array [{level,low,high},...]
function getLevelFromLevels(levels, pct) {
  if (!Array.isArray(levels) || !Number.isFinite(pct)) return null;
  for (const L of levels) {
    if (pct >= L.low && pct <= L.high) return L.level;
  }
  return null;
}

// Compute weighted aggregate percentage across assessments. `weights` is an
// object like { minor2:0.2, minor3:0.2, major:0.6 }. `values` is an object
// like { minor2: pct, minor3: pct, major: pct } (pct in 0-100). Missing
// entries are ignored and weights re-normalized.
function computeWeightedAggregate(values, weights) {
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(values || {})) {
    const v = Number(values[k]);
    const w = Number(weights && weights[k] ? weights[k] : 0);
    if (!Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    sum += v * w;
    wsum += w;
  }
  if (wsum <= 0) return NaN;
  return Number((sum / wsum).toFixed(2));
}

// ========= REPORT RENDERING =========
const resultsDrawer = document.getElementById("resultsDrawer");
const resultsPrintable = document.getElementById("resultsPrintable");
const drawerCourseTitle = document.getElementById("drawerCourseTitle");
const drawerBatchInfo = document.getElementById("drawerBatchInfo");

function openDrawerForCourse(idx) {
  const course = courses[idx] || {};
  drawerCourseTitle.textContent = course.name || "Course Report";
  drawerBatchInfo.textContent = course.batch ? `Batch: ${course.batch}` : "";
  resultsDrawer.classList.add("open");
}

document.getElementById("closeDrawerBtn").addEventListener("click", () => {
  resultsDrawer.classList.remove("open");
});

function renderReport(payload) {
  if (!payload) return;
  lastPayload = payload;

  // If a course is active and has a passingPercent set, prefer that value
  // so reports always reflect the latest passing % entered in Courses module.
  const s = payload.summary;
  // Defensive: if the summary lacks a Tot column but has CO columns,
  // synthesize per-student Tot, max Tot and Tot attempts/avgs so the
  // rest of the rendering and threshold computation can include Tot.
  if (s && s.maxMarks) {
    const coKeys = Object.keys(s.maxMarks).filter(k => (/^CO-\d+$/i).test(k));
    if (coKeys.length && !Object.prototype.hasOwnProperty.call(s.maxMarks, 'Tot')) {
      // Max Tot = sum of CO max marks (ignore NaN)
      s.maxMarks['Tot'] = coKeys.reduce((sum, k) => sum + (Number.isFinite(s.maxMarks[k]) ? s.maxMarks[k] : 0), 0);

      // Compute per-student Tot where any CO value exists
      if (Array.isArray(s.studRows)) {
        for (const r of s.studRows) {
          let tot = 0;
          let any = false;
          for (const k of coKeys) {
            const v = toNumberSafe(r[k]);
            if (!Number.isNaN(v)) { tot += v; any = true; }
          }
          if (any) r['Tot'] = tot;
        }
      }

      // Attempts and averages for Tot
      s.attempts = s.attempts || {};
      s.attempts['Tot'] = Array.isArray(s.studRows) ? s.studRows.reduce((acc, r) => acc + (coKeys.some(k => attempted(r[k])) ? 1 : 0), 0) : 0;
      s.avgs = s.avgs || {};
      const totVals = Array.isArray(s.studRows) ? s.studRows.filter(r => coKeys.some(k => attempted(r[k]))).map(r => coKeys.reduce((sum, k) => sum + (toNumberSafe(r[k]) || 0), 0)) : [];
      s.avgs['Tot'] = totVals.length ? (totVals.reduce((a,b)=>a+b,0) / totVals.length) : NaN;
    }
  }
  const currentCourse = (typeof activeCourseIndex === 'number' && !Number.isNaN(activeCourseIndex))
    ? (courses[activeCourseIndex] || null)
    : null;

  if (currentCourse && currentCourse.courseId) {
    const key = `thresholdsUpdated_${currentCourse.courseId}`;
    const updatedAt = localStorage.getItem(key);
    if (updatedAt && payload.thresholdsUpdatedAt !== updatedAt) {
      payload.thresholdsApplied = false;
      payload.thresholdsUpdatedAt = updatedAt;
      if (payload.attainment) {
        payload.attainment.backendApplied = false;
        delete payload.attainment.levelsByCol;
      }
    }
  }

  if (currentCourse && currentCourse.courseId && payload.attainment) {
    const key = `rangesUpdated_${currentCourse.courseId}`;
    const updatedAt = localStorage.getItem(key);
    if (updatedAt && payload.attainment.rangesUpdatedAt !== updatedAt) {
      payload.attainment.backendApplied = false;
      payload.attainment.rangesUpdatedAt = updatedAt;
      delete payload.attainment.levelsByCol;
    }
  }

  const currentPassPercent = (currentCourse)
    ? Number((currentCourse.passingPercent ?? currentCourse.passPercent ?? currentCourse.passing) || 0)
    : Number(payload.passingPercent || payload.thresholdPercent || 0);

  if (currentCourse && currentCourse.courseId && !payload.thresholdsApplied) {
    applyBackendThresholds(payload, currentCourse.courseId);
  }

  // Recompute threshold-related values using threshold marks (fallback to %)
  const recomputed = computeThresholds(s, payload.thresholdMarks || {}, s.appeared || 0, currentPassPercent);

  // Update payload fields so the display and saved report stay consistent
  payload.thresholdPercent = currentPassPercent;
  payload.thresholdMarks = recomputed.thresholdMarks;
  payload.above = recomputed.above;
  payload.percentages = recomputed.percentages;

  if (!payload.attainment) payload.attainment = {};
  if (currentCourse && currentCourse.courseId && !payload.attainment.backendApplied && !payload.attainment._refreshing) {
    applyBackendAttainment(payload, currentCourse.courseId);
  }

  const tPercent = payload.thresholdPercent;
  const thrMarks = payload.thresholdMarks;
  const above = payload.above;
  const perc = payload.percentages;
  const att = payload.attainment;
  const colsToShow = payload.cols || COLS;

  let html = "";

  // Course header (small, inside report)
  html += `
    <div style="margin-bottom:10px;">
      <div style="font-size:0.9rem;">University of Hyderabad</div>
      <div style="font-size:1.1rem;font-weight:700;color:#a10e1d;margin-top:4px;">
        ${escapeHtml(payload.courseName || "")}
      </div>
      <div style="font-size:0.88rem;margin-top:2px;">
        Batch: ${escapeHtml(payload.batch || "")}
      </div>
      <div style="font-size:0.88rem;">
        Passing %: ${payload.passingPercent ?? ""}
      </div>
      <div style="font-size:0.82rem;margin-top:4px;color:#333;opacity:0.9;">
        Detected headers: ${escapeHtml((s && s.parsedRowsCount!==undefined) ? Object.keys(s.maxMarks).join(', ') : (payload.cols||COLS).join(', '))}
      </div>
      <div style="font-size:0.82rem;margin-top:2px;color:#333;opacity:0.85;">
        Parsed rows: ${s.parsedRowsCount ?? ''}, Rows with Roll value: ${s.rowsWithRollValue ?? ''}, Rows matching roll pattern: ${s.matchedByRollCount ?? ''}
      </div>
      <div class="section-separator"></div>
    </div>
  `;

  // SUMMARY
  html += `
    <h4>===== SUMMARY =====</h4>
    <div class="result-row"><span>Total students in class</span><span>${s.totalStudents}</span></div>
    <div class="result-row"><span>Students appeared for the test</span><span>${s.appeared}</span></div>
    <div class="result-row"><span>Students absent</span><span>${s.absentees}</span></div>
    <div class="section-separator"></div>
  `;

  // MAX MARKS
  html += `
    <h4>----- Maximum Marks -----</h4>
    ${colsToShow.map(c => `
      <div class="result-row">
        <span>${c}</span><span>Max = ${isNaN(s.maxMarks[c]) ? "N/A" : s.maxMarks[c]}</span>
      </div>
    `).join("")}
    <div class="section-separator"></div>
  `;

  // ATTEMPTS
  html += `
    <h4>----- Attempts per column -----</h4>
    ${colsToShow.map(c => `
      <div class="result-row">
        <span>${c}</span><span>${s.attempts[c]}</span>
      </div>
    `).join("")}
    <div class="section-separator"></div>
  `;

  // AVERAGES
  html += `
    <h4>----- Averages (absentees excluded) -----</h4>
    ${colsToShow.map(c => {
      const v = s.avgs[c];
      const d = Number.isFinite(v) ? v.toFixed(2) : "N/A";
      return `<div class="result-row"><span>${c} Average</span><span>${d}</span></div>`;
    }).join("")}
    <div class="section-separator"></div>
  `;

  // THRESHOLD RESULTS
  html += `
    <h4>----- Students Scoring ≥ Threshold Marks -----</h4>
    ${colsToShow.map(c => `
        <div class="result-row">
          <span>${c}</span>
          <span>${above[c]} students (${perc[c]}%) — Threshold Marks = ${Number.isFinite(thrMarks[c]) ? thrMarks[c] : 'N/A'}</span>
        </div>
    `).join("")}
  `;

  // ATTAINMENT LEVELS (if already computed)
  if (att && att.levelsByCol) {
    html += `
      <div class="section-separator"></div>
      <h4>===== ATTAINMENT LEVELS =====</h4>
      ${colsToShow.map(c => `
        <div class="result-row">
          <span>${c}</span>
          <span>Level ${att.levelsByCol[c] ?? 0} (based on ${perc[c]}%)</span>
        </div>
      `).join("")}
    `;
  }

  resultsPrintable.innerHTML = html;
}

// ========= GENERATE & DOWNLOAD REPORT (Minor/Major) =========
function generateAndDownloadReport(parsed, cols, label) {
  try {
    const summary = computeSummaryForCols(parsed, cols);

    const course = courses[activeCourseIndex] || {};
    const passPercent = Number(course.passingPercent ?? course.passPercent ?? course.passing ?? 0) || 0;
    const thresholdData = computeThresholds(summary, passPercent);

    // Build payload to show in drawer
    const payload = {
      courseName: course.name || 'Course',
      batch: course.batch || '',
      passingPercent: passPercent,
      summary,
      thresholdPercent: passPercent,
      thresholdMarks: thresholdData.thresholdMarks,
      above: thresholdData.above,
      percentages: thresholdData.percentages,
      attainment: null
    };

    lastPayload = payload;
    // record which columns this payload uses
    lastPayload.cols = cols;
    renderReport(payload);
    openDrawerForCourse(activeCourseIndex);

    // Build workbook but DO NOT auto-download. Store it on lastPayload and enable download button.
    const build = buildWorkbookFromPayload(payload, label);
    lastPayload.pendingWorkbook = build.wb;
    lastPayload.pendingFilename = build.filename;
    // Enable download button so user can download this report
    const dlBtn = document.getElementById('downloadXlsxBtn');
    if (dlBtn) {
      dlBtn.classList.remove('btn-disabled');
      dlBtn.disabled = false;
    }

    // Create worksheet data (simple row array)
    const outRows = [];
    outRows.push(['Metric','Value']);
    outRows.push(['Total Students', summary.totalStudents]);
    outRows.push(['Appeared', summary.appeared]);
    outRows.push(['Absent', summary.absentees]);
    outRows.push([]);
    outRows.push(['Max Marks','']);
    for (const c of cols) outRows.push([c, summary.maxMarks[c]]);
    outRows.push([]);
    outRows.push(['Attempts','']);
    for (const c of cols) outRows.push([c, summary.attempts[c]]);
    outRows.push([]);
    outRows.push(['Averages','']);
    for (const c of cols) outRows.push([c, Number.isFinite(summary.avgs[c]) ? summary.avgs[c].toFixed(2) : 'N/A']);
    outRows.push([]);
    outRows.push([`Students Scoring >= ${passPercent}% of Max Marks`, '']);
    for (const c of cols) outRows.push([c, thresholdData.above[c] + ' students (' + thresholdData.percentages[c] + '%) — Threshold Marks = ' + thresholdData.thresholdMarks[c]]);

    // Add student data sheet (flat rows)
    const studentRows = [];
    const hdr = Object.keys(parsed.rows[0]).filter(h=>h);
    studentRows.push(hdr);
    for (const r of summary.studRows) {
      const row = hdr.map(h => r[h] == null ? '' : r[h]);
      studentRows.push(row);
    }

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(outRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

    const filename = (course.name||'Course').replace(/\s+/g,'_') + '_' + label + '_Report.xlsx';
    // Persist generated minor/major report separately so final mapping can use it
    try { saveMinorReportForCourse(activeCourseIndex, label.toLowerCase(), payload); } catch (e) { console.warn('Could not save minor report', e); }
  } catch (err) {
    alert('Error generating report: ' + err.message);
    console.error(err);
  }
}

// Build an XLSX workbook from a payload (includes attainment if present)
function buildWorkbookFromPayload(payload, label) {
  if (!payload || !payload.summary) throw new Error('No payload to build workbook');
  const s = payload.summary;
  const cols = payload.cols || COLS;

  const outRows = [];
  outRows.push(['Metric','Value']);
  outRows.push(['Total Students', s.totalStudents]);
  outRows.push(['Appeared', s.appeared]);
  outRows.push(['Absent', s.absentees]);
  outRows.push([]);
  outRows.push(['Max Marks','']);
  for (const c of cols) outRows.push([c, s.maxMarks[c]]);
  outRows.push([]);
  outRows.push(['Attempts','']);
  for (const c of cols) outRows.push([c, s.attempts[c]]);
  outRows.push([]);
  outRows.push(['Averages','']);
  for (const c of cols) outRows.push([c, Number.isFinite(s.avgs[c]) ? s.avgs[c].toFixed(2) : 'N/A']);
  outRows.push([]);
  outRows.push([`Students Scoring ≥ ${payload.thresholdPercent}% of Max Marks`, '']);
  for (const c of cols) outRows.push([c, (payload.above && payload.percentages) ? (payload.above[c] + ' students (' + payload.percentages[c] + '%) — Threshold Marks = ' + payload.thresholdMarks[c]) : 'N/A']);

  if (payload.attainment && payload.attainment.levelsByCol) {
    outRows.push([]);
    outRows.push(['Attainment Levels','']);
    for (const c of cols) outRows.push([c, 'Level ' + (payload.attainment.levelsByCol[c] || 0) + (payload.percentages && payload.percentages[c] ? (' (based on ' + payload.percentages[c] + '%)') : '')]);
  }

  // Students sheet
  const studentRows = [];
  const hdr = Object.keys(payload.summary.studRows[0] || {}).filter(h=>h);
  studentRows.push(hdr);
  for (const r of payload.summary.studRows) {
    studentRows.push(hdr.map(h => r[h] == null ? '' : r[h]));
  }

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(outRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

  const filename = (payload.courseName||'Course').replace(/\s+/g,'_') + '_' + (label||'Report') + '_Report.xlsx';
  return { wb, filename };
}

// Attainment modal removed: attainment levels must be configured in Courses module.

// ========= FINAL ATTAINMENT MAPPING =========
// Compute final mapping using minors (internal) and major (external)
function generateFinalAttainmentMapping(idx) {
  const course = (loadCourses() || [])[idx];
  if (!course) {
    alert('Course not found');
    return;
  }

  // Load saved minor/major reports
  const minors = loadMinorReportsForCourse(idx) || {};
  if (!minors || (Object.keys(minors).length === 0)) {
    alert('No Minor/Major reports found for this course. Please upload Minor2/Minor3/Major first.');
    return;
  }

  // Build union of COs from minor and major reports
  const coSet = new Set();
  for (const k of Object.keys(minors)) {
    const mr = minors[k];
    if (mr && mr.percentages) Object.keys(mr.percentages).forEach(c => coSet.add(c));
  }
  const allCOs = Array.from(coSet).sort();

  // Course-defined levels (must be provided when adding course)
  const levels = course.attainmentLevels || null;
  if (!levels || !Array.isArray(levels) || levels.length === 0) {
    if (!confirm('No attainment levels defined for this course. Define them now in Courses?')) return;
    // redirect user to courses page
    window.location.href = '/courses/courses.html';
    return;
  }

  // For each CO compute:
  // - Internal level: derived from Minor reports (minor2+minor3). We'll average available minors equally.
  // - External level: derived from Major report percentages.
  // - Direct = ROUND(internal_level*0.4 + external_level*0.6, 2)

  const results = [];
  for (const co of allCOs) {
    // internal: consider minor2 and minor3 only
    const minorKeys = ['minor1','minor2','minor3'];
    let internalLevel = null;
    const internalLevels = [];
    for (const mk of minorKeys) {
      const mr = minors[mk];
      if (mr && mr.percentages && Number.isFinite(Number(mr.percentages[co]))) {
        const pct = Number(mr.percentages[co]);
        const lvl = getLevelFromLevels(levels, pct);
        if (lvl) internalLevels.push(lvl);
      }
    }
    if (internalLevels.length) {
      // average minor levels
      internalLevel = Number((internalLevels.reduce((a,b)=>a+b,0)/internalLevels.length).toFixed(2));
    }

    // external: major
    let externalLevel = null;
    const mrMajor = minors['major'];
    if (mrMajor && mrMajor.percentages && Number.isFinite(Number(mrMajor.percentages[co]))) {
      const pctM = Number(mrMajor.percentages[co]);
      externalLevel = getLevelFromLevels(levels, pctM);
    }

    const direct = (Number.isFinite(internalLevel) && Number.isFinite(externalLevel))
      ? Number(((internalLevel * 0.4) + (externalLevel * 0.6)).toFixed(2))
      : NaN;

    results.push({ co, internalLevel, externalLevel, direct });
  }

  // Render final mapping in drawer (separate from minor/major display)
  const courseName = course.name || 'Course';
  const html = buildFinalMappingHtml(courseName, results);
  resultsPrintable.innerHTML = html;
  drawerCourseTitle.textContent = courseName + ' — Final Attainment Level Mapping';
  drawerBatchInfo.textContent = course.batch ? `Batch: ${course.batch}` : '';
  resultsDrawer.classList.add('open');

  // Also store final mapping on a payload for download/export
  lastPayload = lastPayload || {};
  lastPayload.finalMapping = { courseName, batch: course.batch || '', rows: results };
  try {
    const wb = buildFinalMappingWorkbook(lastPayload.finalMapping);
    lastPayload.finalMapping.wb = wb.wb;
    lastPayload.finalMapping.filename = wb.filename;
  } catch (e) { console.warn('Could not build final mapping workbook', e); }
}

function buildFinalMappingHtml(courseName, rows) {
  let html = `<div style="margin-bottom:10px;"><div style="font-size:1.1rem;font-weight:700;color:#a10e1d;">${escapeHtml(courseName)}</div><div class="section-separator"></div></div>`;
  html += `<h4>Final Attainment Level Mapping</h4>`;
  html += `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">CO</th><th style="padding:6px">Internal</th><th style="padding:6px">External</th><th style="padding:6px">Direct</th></tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr><td style="padding:6px">${escapeHtml(r.co)}</td><td style="text-align:center;padding:6px">${Number.isFinite(r.internalLevel)?r.internalLevel:''}</td><td style="text-align:center;padding:6px">${Number.isFinite(r.externalLevel)?r.externalLevel:''}</td><td style="text-align:center;padding:6px">${Number.isFinite(r.direct)?r.direct:''}</td></tr>`;
  }
  html += `</tbody></table>`;
  // Add small note
  html += `<div style="margin-top:10px;font-size:0.86rem;color:#444">Direct = Internal*0.4 + External*0.6 (rounded to 2 decimals)</div>`;
  return html;
}

function buildFinalMappingWorkbook(mapping) {
  // mapping.rows: [{co, internalLevel, externalLevel, direct},...]
  const rows = [];
  rows.push(['CO','Internal','External','Direct']);
  for (const r of mapping.rows) rows.push([r.co, r.internalLevel == null ? '' : r.internalLevel, r.externalLevel == null ? '' : r.externalLevel, r.direct == null ? '' : r.direct]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Final_Attainment_Level_Mapping');
  const filename = (mapping.courseName||'Course').replace(/\s+/g,'_') + '_Final_Attainment_Level_Mapping.xlsx';
  return { wb, filename };
}

// ========= SAVE / LOAD REPORT PAYLOAD =========
function saveReportForCourse(idx, payload) {
  try {
    localStorage.setItem("report_" + idx, JSON.stringify(payload));
  } catch (e) {
    console.warn("Could not store report payload", e);
  }
}

// Persist minor/major report payloads separately so final mapping can read them
function saveMinorReportForCourse(idx, typeLabel, payload) {
  try {
    const key = "report_" + idx + "_minors";
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    obj[String(typeLabel).toLowerCase()] = payload;
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn('Could not store minor report payload', e);
  }
}

function loadMinorReportsForCourse(idx) {
  try {
    const key = "report_" + idx + "_minors";
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function loadReportForCourse(idx) {
  const raw = localStorage.getItem("report_" + idx);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function handleViewLastReport(idx) {
  const payload = loadReportForCourse(idx);
  if (!payload) {
    alert("No saved report for this course yet. Please upload marks Excel first.");
    return;
  }
  if (payload.attainment) {
    payload.attainment.backendApplied = false;
    delete payload.attainment.levelsByCol;
  }
  payload.thresholdsApplied = false;
  activeCourseIndex = idx;
  lastPayload = payload;
  renderReport(payload);
  openDrawerForCourse(idx);
}

// PDF download functionality removed

// Download generated XLSX (available after any report generation)
const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');
if (downloadXlsxBtn) {
  downloadXlsxBtn.addEventListener('click', () => {
    if (!lastPayload) {
      alert('No generated workbook available. Please upload marks Excel first.');
      return;
    }
    try {
      // Prefer final mapping workbook if present
      if (lastPayload.finalMapping && lastPayload.finalMapping.wb) {
        XLSX.writeFile(lastPayload.finalMapping.wb, lastPayload.finalMapping.filename || 'final_mapping.xlsx');
        return;
      }
      if (lastPayload.pendingWorkbook) {
        XLSX.writeFile(lastPayload.pendingWorkbook, lastPayload.pendingFilename || 'report.xlsx');
        return;
      }
      alert('No generated workbook available. Please upload marks Excel first.');
    } catch (err) {
      console.error('Download failed', err);
      alert('Download failed: ' + err.message);
    }
  });
}

// ========= INIT =========
async function initReports() {
  try {
    courses = await fetchAssignedCourses();
  } catch (err) {
    courses = loadCourses();
  }
  renderCourses();
}

initReports();

// Listen for cross-tab/localStorage updates so changes in Courses reflect here
window.addEventListener('storage', (e) => {
  if (e.key === 'courses') {
    renderCourses();

    // If a report is open and a course is active, re-render with updated passing %
    if (lastPayload && typeof activeCourseIndex === 'number' && !Number.isNaN(activeCourseIndex)) {
      const updatedCourse = (loadCourses() || [])[activeCourseIndex];
      if (updatedCourse) {
        // recompute thresholds based on new passing percent
        const newPass = Number((updatedCourse.passingPercent ?? updatedCourse.passPercent ?? updatedCourse.passing) || 0);
        const recomputed = computeThresholds(lastPayload.summary, newPass);
        lastPayload.thresholdPercent = newPass;
        lastPayload.thresholdMarks = recomputed.thresholdMarks;
        lastPayload.above = recomputed.above;
        lastPayload.percentages = recomputed.percentages;
        // Persist and re-render
        saveReportForCourse(activeCourseIndex, lastPayload);
        renderReport(lastPayload);
      }
    }
  }
});
/**
 * CLEAN & FIXED REPORTS.JS
 * - Removed PDF download completely
 * - Fixed Attainment Section (now works properly)
 * - Saves attainment level into localStorage
 * - Dashboard can read attainment values
 */

(() => {
  "use strict";

  /* ---------------- Config ---------------- */
  const ROLL_COL = "Roll No";
  const COLS = ["CO-1", "CO-2", "Tot"];
  const rollRegex = /^\d{2}MCMC\d{2}$/i;

  /* ---------------- Helpers ---------------- */
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, m =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  }

  function looksLikeRoll(x) {
    if (!x) return false;
    return rollRegex.test(String(x).trim().toUpperCase());
  }

  function attempted(v) {
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return s !== "" && s !== "ab";
  }

  function toNumberSafe(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  /* ---------------- DOM refs ---------------- */
  const coursesArea = $("coursesArea");
  const fileInput = $("fileInput");

  const thresholdModal = $("thresholdModal");
  const thresholdInput = $("thresholdInput");
  const thresholdOk = $("thresholdOk");
  const thresholdCancel = $("thresholdCancel");

  const attainmentModal = $("attainmentModal");
  const levelsCount = $("levelsCount");
  const levelsContainer = $("levelsContainer");
  const attainmentOk = $("attainmentOk");
  const attainmentCancel = $("attainmentCancel");

  const resultsDrawer = $("resultsDrawer");
  const resultsContainer = $("resultsContainer");
  const closeDrawerBtn = $("closeDrawer");

  /* ---------------- State ---------------- */
  let courses = [];
  let activeCourseIndex = null;
  let parsedSheetData = null;
  let lastPayload = null;

  /* ---------------- Storage helpers ---------------- */
  function loadCourses() {
    try {
      return JSON.parse(localStorage.getItem("courses") || "[]");
    } catch {
      return [];
    }
  }

  function saveReport(idx, payload) {
    localStorage.setItem(`report_${idx}`, JSON.stringify(payload));
  }

  function loadReport(idx) {
    let r = localStorage.getItem(`report_${idx}`);
    return r ? JSON.parse(r) : null;
  }

  /* ---------------- Render Courses ---------------- */
  function renderCoursesList() {
    courses = loadCourses();
    coursesArea.innerHTML = "";

    if (!courses.length) {
      coursesArea.innerHTML = `<p>No courses added yet.</p>`;
      return;
    }

    courses.forEach((course, idx) => {
      const card = document.createElement("div");
      card.className = "course-card";
      card.innerHTML = `
        <h3>${escapeHtml(course.name)}</h3>
        <p><strong>Batch:</strong> ${escapeHtml(course.batch)}</p>
        <button class="btn primary" data-idx="${idx}" onclick="triggerUpload(event)">Upload File</button>
        <button class="btn alt" onclick="showSavedReport(${idx})">View Last Report</button>
      `;
      coursesArea.appendChild(card);
    });
  }

  /* ---------------- File Upload ---------------- */
  function triggerUpload(e) {
    activeCourseIndex = Number(e.currentTarget.dataset.idx);
    fileInput.value = "";
    fileInput.click();
  }

  fileInput.addEventListener("change", handleFile);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target.result;
        const wb = XLSX.read(data, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        parsedSheetData = normalizeSheet(rows);
        openThresholdModal();
      } catch (err) {
        alert("Error reading file: " + err.message);
      }
    };

    reader.readAsBinaryString(f);
  }

  function normalizeSheet(rows) {
    let headerRow = rows[0];
    let header = headerRow.map(h => String(h || "").trim());

    let dataRows = rows.slice(1);

    let objects = dataRows.map(r => {
      let obj = {};
      header.forEach((h, i) => {
        obj[h] = r[i] !== undefined ? r[i] : null;
      });
      return obj;
    });

    return { header, rows: objects };
  }

  /* ---------------- Compute Summary ---------------- */
  function computeSummary(parsed) {
    let header = parsed.header;
    let rows = parsed.rows;

    let max_marks = {
      "CO-1": toNumberSafe(rows[0]["CO-1"]),
      "CO-2": toNumberSafe(rows[0]["CO-2"]),
      "Tot": toNumberSafe(rows[0]["Tot"])
    };

    let students = rows.slice(1).filter(r => looksLikeRoll(r[ROLL_COL]));

    let total = students.length;

    let attempts = {};
    COLS.forEach(c => {
      attempts[c] = students.filter(r => attempted(r[c])).length;
    });

    let appeared = header.includes("Tot")
      ? students.filter(r => attempted(r["Tot"])).length
      : students.filter(r => attempted(r["CO-1"]) || attempted(r["CO-2"])).length;

    let absentees = total - appeared;

    let avgs = {};
    COLS.forEach(c => {
      let vals = students
        .filter(r => attempted(r[c]))
        .map(r => toNumberSafe(r[c]))
        .filter(v => !isNaN(v));
      avgs[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    });

    return { max_marks, total, attempts, appeared, absentees, avgs, students };
  }

  /* ---------------- Threshold Modal ---------------- */
  function openThresholdModal() {
    thresholdModal.style.display = "flex";
  }

  thresholdCancel.onclick = () => {
    thresholdModal.style.display = "none";
  };

  thresholdOk.onclick = () => {
    let pct = Number(thresholdInput.value);

    if (pct < 0 || pct > 100 || isNaN(pct)) {
      alert("Enter valid threshold");
      return;
    }

    thresholdModal.style.display = "none";

    let summary = computeSummary(parsedSheetData);
    let thresholdMarks = {};
    let above = {};
    let percent = {};

    COLS.forEach(c => {
      thresholdMarks[c] = Number(((pct / 100) * summary.max_marks[c]).toFixed(2));
      let marks = summary.students
        .filter(r => attempted(r[c]))
        .map(r => toNumberSafe(r[c]));

      let count = marks.filter(m => m >= thresholdMarks[c]).length;
      above[c] = count;
      percent[c] = summary.attempts[c]
        ? Number((count / summary.attempts[c]) * 100).toFixed(2)
        : "0.00";
    });

    lastPayload = {
      courseIndex: activeCourseIndex,
      summary,
      thresholdPercent: pct,
      thresholdMarks,
      above,
      percent
    };

    saveReport(activeCourseIndex, lastPayload);
    showResultsDrawer(lastPayload);
  };

  /* ---------------- Drawer Rendering ---------------- */
  function showResultsDrawer(payload) {
    let course = loadCourses()[payload.courseIndex];
    resultsContainer.innerHTML = `
      <h2>${escapeHtml(course.name)}</h2>
      <p><strong>Batch:</strong> ${escapeHtml(course.batch)}</p>
      <hr>
    `;

    let s = payload.summary;

    resultsContainer.innerHTML += `
      <div class="result-block">
        <h4>===== SUMMARY =====</h4>
        <div class="result-row"><span>Total Students</span><span>${s.total}</span></div>
        <div class="result-row"><span>Appeared</span><span>${s.appeared}</span></div>
        <div class="result-row"><span>Absent</span><span>${s.absentees}</span></div>
      </div>

      <div class="result-block">
        <h4>----- Maximum Marks -----</h4>
        ${COLS.map(c => `<div class="result-row"><span>${c}</span><span>${s.max_marks[c]}</span></div>`).join("")}
      </div>

      <div class="result-block">
        <h4>----- Attempts -----</h4>
        ${COLS.map(c => `<div class="result-row"><span>${c}</span><span>${s.attempts[c]}</span></div>`).join("")}
      </div>

      <div class="result-block">
        <h4>----- Averages -----</h4>
        ${COLS.map(c => `<div class="result-row"><span>${c} Avg</span><span>${s.avgs[c].toFixed(2)}</span></div>`).join("")}
      </div>

      <div class="result-block">
        <h4>----- Threshold (${payload.thresholdPercent}%) -----</h4>
        ${COLS.map(c =>
          `<div class="result-row"><span>${c}</span><span>${payload.above[c]} students (${payload.percent[c]}%)</span></div>`
        ).join("")}
      </div>

      <button class="btn primary" id="attBtn">Define Attainment Levels</button>
    `;

    $("attBtn").onclick = () => openAttainmentModal(payload);

    resultsDrawer.classList.add("open");
  }

  /* ---------------- Attainment Modal ---------------- */
  function openAttainmentModal(payload) {
    lastPayload = payload;
    levelsContainer.innerHTML = "";
    levelsCount.value = 3;

    buildLevelInputs();
    attainmentModal.style.display = "flex";
  }

  function buildLevelInputs() {
    levelsContainer.innerHTML = "";
    let n = Number(levelsCount.value);

    for (let i = 1; i <= n; i++) {
      levelsContainer.innerHTML += `
        <div class="level-row">
          <input type="number" class="level-low" placeholder="Level ${i} Lower">
          <input type="number" class="level-high" placeholder="Level ${i} Upper">
        </div>
      `;
    }
  }

  levelsCount.onchange = buildLevelInputs;

  attainmentCancel.onclick = () => {
    attainmentModal.style.display = "none";
  };

  attainmentOk.onclick = () => {
    let rows = [...document.querySelectorAll(".level-row")];
    let levels = [];
    let prevUpper = -1;

    try {
      rows.forEach((row, i) => {
        let low = Number(row.querySelector(".level-low").value);
        let high = Number(row.querySelector(".level-high").value);

        if (isNaN(low) || isNaN(high) || low < 0 || high > 100 || low > high)
          throw new Error("Invalid bounds");

        if (low <= prevUpper)
          throw new Error("Bounds should not overlap");

        levels.push([i + 1, low, high]);
        prevUpper = high;
      });

      let attainmentResult = {};
      COLS.forEach(c => {
        let pct = Number(lastPayload.percent[c]);
        attainmentResult[c] = determineAttainment(pct, levels);
      });

      lastPayload.attainmentLevel = attainmentResult;
      saveReport(lastPayload.courseIndex, lastPayload);

      resultsContainer.innerHTML += `
        <div class="result-block">
          <h4>===== ATTAINMENT LEVELS =====</h4>
          ${COLS.map(c =>
            `<div class="result-row"><span>${c}</span><span>Level ${attainmentResult[c]}</span></div>`
          ).join("")}
        </div>
      `;

      attainmentModal.style.display = "none";

    } catch (err) {
      alert(err.message);
    }
  };

  function determineAttainment(pct, levels) {
    for (let [level, low, high] of levels) {
      if (pct >= low && pct <= high) return level;
    }
    return 0;
  }

  /* ---------------- Saved Report ---------------- */
  function showSavedReport(idx) {
    let payload = loadReport(idx);
    if (!payload) {
      alert("No saved report available.");
      return;
    }
    showResultsDrawer(payload);
  }

  /* ---------------- Drawer close ---------------- */
  closeDrawerBtn.onclick = () => {
    resultsDrawer.classList.remove("open");
    resultsContainer.innerHTML = "";
  };

  /* ---------------- Initialize ---------------- */
  window.triggerUpload = triggerUpload;
  window.showSavedReport = showSavedReport;
  window.openAttainmentModal = openAttainmentModal;

  renderCoursesList();

})();
