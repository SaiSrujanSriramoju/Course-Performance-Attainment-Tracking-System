/* ---------------------- ADMIN REPORTS ---------------------- */
// Admin logic differs: summarize admin-specific localStorage keys

function loadAdminData() {
  const courses = JSON.parse(localStorage.getItem("admin_courses")) || [];
  const assignments = JSON.parse(localStorage.getItem("admin_assignments")) || [];

  const assignmentMap = {};
  assignments.forEach(a => { assignmentMap[a.courseCode] = a; });

  return { courses, assignmentMap };
}

function renderAdminReports() {
  const container = document.getElementById("reportCards");
  if (!container) return;

  const { courses, assignmentMap } = loadAdminData();
  container.innerHTML = "";

  if (!courses.length) {
    const empty = document.createElement("div");
    empty.className = "course-card";
    empty.innerHTML = "<p>No courses found. Please add courses in Course Management.</p>";
    container.appendChild(empty);
    return;
  }

  courses.forEach(c => {
    const assigned = assignmentMap[c.courseCode];
    const passing = c.passingMarks !== undefined && c.passingMarks !== "" ? c.passingMarks : "Not set";
    const status = assigned ? "Configured" : "Pending";

    const card = document.createElement("div");
    card.className = "course-card";

    card.innerHTML = `
      <div class="course-title">${c.courseCode} - ${c.courseName}</div>
      <div class="course-meta">
        <span class="label">Semester:</span> ${c.semester || "—"}<br>
        <span class="label">Batch:</span> ${c.batchName || "—"}<br>
        <span class="label">Credits:</span> ${c.credits || "—"}
      </div>
      <div class="course-meta">
        <span class="label">Assigned Faculty:</span> ${assigned ? assigned.facultyName : "Not assigned"}<br>
        <span class="label">Passing Marks:</span> ${passing}
      </div>
      <p class="course-instructions">Configuration Status: <strong>${status}</strong></p>
    `;

    container.appendChild(card);
  });
}

function logout() {
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("facultyLoggedIn");
  window.location.href = "../login/index.html";
}

renderAdminReports();
