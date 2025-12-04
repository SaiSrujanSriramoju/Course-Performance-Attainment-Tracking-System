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
