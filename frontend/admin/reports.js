/* ---------------------- ADMIN REPORTS ---------------------- */
const API_BASE = "http://localhost:5000/api";

// Fetch courses and assignments for the admin summary view.
async function loadAdminData() {
  const [coursesResponse, assignmentsResponse] = await Promise.all([
    fetch(`${API_BASE}/courses`, { credentials: "include" }),
    fetch(`${API_BASE}/assignments`, { credentials: "include" })
  ]);

  const coursesResult = await coursesResponse.json();
  const assignmentsResult = await assignmentsResponse.json();

  if (!coursesResponse.ok || coursesResult.success === false) {
    throw new Error(coursesResult.message || "Failed to load courses");
  }
  if (!assignmentsResponse.ok || assignmentsResult.success === false) {
    throw new Error(assignmentsResult.message || "Failed to load assignments");
  }

  const courses = coursesResult.courses || [];
  const assignments = assignmentsResult.assignments || [];

  const assignmentMap = {};
  assignments.forEach(a => { assignmentMap[a.course_id] = a; });

  return { courses, assignmentMap };
}

// Render report cards with course configuration status.
async function renderAdminReports() {
  const container = document.getElementById("reportCards");
  if (!container) return;

  try {
    const { courses, assignmentMap } = await loadAdminData();
    container.innerHTML = "";

    if (!courses.length) {
      const empty = document.createElement("div");
      empty.className = "course-card";
      empty.innerHTML = "<p>No courses found. Please add courses in Course Management.</p>";
      container.appendChild(empty);
      return;
    }

    courses.forEach(c => {
      const assigned = assignmentMap[c.course_id];
      const passing = c.passing_marks !== undefined && c.passing_marks !== "" ? c.passing_marks : "Not set";
      const status = assigned ? "Configured" : "Pending";

      const card = document.createElement("div");
      card.className = "course-card";

      card.innerHTML = `
        <div class="course-title">${c.course_code} - ${c.course_name}</div>
        <div class="course-meta">
          <span class="label">Semester:</span> ${c.semester || "—"}<br>
          <span class="label">Batch:</span> ${c.batch_name || "—"}<br>
          <span class="label">Credits:</span> ${c.credits || "—"}
        </div>
        <div class="course-meta">
          <span class="label">Assigned Faculty:</span> ${assigned ? assigned.faculty_name : "Not assigned"}<br>
          <span class="label">Passing Marks:</span> ${passing}
        </div>
        <p class="course-instructions">Configuration Status: <strong>${status}</strong></p>
      `;

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = "";
    const error = document.createElement("div");
    error.className = "course-card";
    error.innerHTML = `<p>${err.message || "Failed to load reports."}</p>`;
    container.appendChild(error);
  }
}

// End session and return to login page.
async function logout() {
  try {
    await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "include" });
  } finally {
    window.location.href = "../login/index.html";
  }
}

renderAdminReports();
