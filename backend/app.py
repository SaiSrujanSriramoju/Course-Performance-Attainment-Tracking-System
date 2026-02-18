from datetime import datetime
from functools import wraps
import os

from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.utils import secure_filename

from db import get_db_connection, init_db

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

CORS(
    app,
    resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500"]}},
    supports_credentials=True,
)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "uploads", "syllabus")
ALLOWED_SYLLABUS_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_SYLLABUS_SIZE_BYTES = 5 * 1024 * 1024

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ADMIN_UI_DIR = os.path.join(BASE_DIR, "admin_ui")
FACULTY_UI_DIR = os.path.join(BASE_DIR, "faculty_ui")
LOGIN_UI_DIR = os.path.join(BASE_DIR, "login")
COURSES_UI_DIR = os.path.join(BASE_DIR, "courses_ui")
REPORTS_UI_DIR = os.path.join(BASE_DIR, "Reports_ui")

app.config["MAX_CONTENT_LENGTH"] = MAX_SYLLABUS_SIZE_BYTES


def allowed_syllabus_file(filename):
    _, ext = os.path.splitext(filename)
    return ext.lower() in ALLOWED_SYLLABUS_EXTENSIONS


def json_response(payload, status=200):
    return jsonify(payload), status


def get_request_json():
    data = request.get_json(silent=True)
    if data is None:
        return {}, json_response({"success": False, "message": "Invalid JSON body"}, 400)
    return data, None


def login_required(handler):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        if not session.get("role"):
            return json_response({"success": False, "message": "Unauthorized"}, 401)
        return handler(*args, **kwargs)

    return wrapper


def role_required(role):
    def decorator(handler):
        @wraps(handler)
        def wrapper(*args, **kwargs):
            if not session.get("role"):
                return json_response({"success": False, "message": "Unauthorized"}, 401)
            if session.get("role") != role:
                return json_response({"success": False, "message": "Forbidden"}, 403)
            return handler(*args, **kwargs)

        return wrapper

    return decorator


@app.route("/api/login", methods=["POST"])
def login():
    data, error = get_request_json()
    if error:
        return error

    user_id = data.get("user_id")
    password = data.get("password")
    if not user_id or not password:
        return json_response({"success": False, "message": "user_id and password required"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT admin_id, username FROM Admin WHERE username=%s AND password=%s",
            (user_id, password),
        )
        admin = cursor.fetchone()
        if admin:
            session.clear()
            session["role"] = "admin"
            session["admin_id"] = admin["admin_id"]
            return json_response({"status": "success", "role": "admin"})

        cursor.execute(
            "SELECT faculty_id, name, email, department, first_login "
            "FROM Faculty WHERE faculty_id=%s AND password=%s",
            (user_id, password),
        )
        faculty = cursor.fetchone()
        if faculty:
            session.clear()
            session["role"] = "faculty"
            session["faculty_id"] = faculty["faculty_id"]
            return json_response({"status": "success", "role": "faculty"})

        return json_response({"status": "error", "message": "Invalid credentials"}, 401)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/session", methods=["GET"])
def session_status():
    role = session.get("role")
    if not role:
        return json_response({"authenticated": False}, 401)

    payload = {"authenticated": True, "role": role}
    if role == "admin":
        payload["admin_id"] = session.get("admin_id")
    if role == "faculty":
        payload["faculty_id"] = session.get("faculty_id")
    return json_response(payload)


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return json_response({"success": True})


@app.route("/api/login/admin", methods=["POST"])
def login_admin():
    data, error = get_request_json()
    if error:
        return error

    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return json_response({"success": False, "message": "username and password required"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT admin_id, username FROM Admin WHERE username=%s AND password=%s",
            (username, password),
        )
        admin = cursor.fetchone()
        if not admin:
            return json_response({"success": False, "message": "Invalid credentials"}, 401)
        session.clear()
        session["role"] = "admin"
        session["admin_id"] = admin["admin_id"]
        return json_response({"success": True, "admin": admin})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/login/faculty", methods=["POST"])
def login_faculty():
    data, error = get_request_json()
    if error:
        return error

    faculty_id = data.get("faculty_id")
    password = data.get("password")
    if not faculty_id or not password:
        return json_response({"success": False, "message": "faculty_id and password required"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT faculty_id, name, email, department, first_login "
            "FROM Faculty WHERE faculty_id=%s AND password=%s",
            (faculty_id, password),
        )
        faculty = cursor.fetchone()
        if not faculty:
            return json_response({"success": False, "message": "Invalid credentials"}, 401)
        session.clear()
        session["role"] = "faculty"
        session["faculty_id"] = faculty["faculty_id"]
        return json_response({"success": True, "faculty": faculty})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/change-password", methods=["POST"])
@login_required
def change_password():
    data, error = get_request_json()
    if error:
        return error

    role = data.get("role")
    new_password = data.get("new_password")
    old_password = data.get("old_password")

    if role not in ["admin", "faculty"]:
        return json_response({"success": False, "message": "role must be admin or faculty"}, 400)
    if session.get("role") != role:
        return json_response({"success": False, "message": "Forbidden"}, 403)

    if not new_password or not old_password:
        return json_response({"success": False, "message": "old_password and new_password required"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if role == "admin":
            username = data.get("username")
            if not username:
                return json_response({"success": False, "message": "username required"}, 400)
            cursor.execute(
                "UPDATE Admin SET password=%s WHERE username=%s AND password=%s",
                (new_password, username, old_password),
            )
        else:
            faculty_id = data.get("faculty_id")
            if not faculty_id:
                return json_response({"success": False, "message": "faculty_id required"}, 400)
            cursor.execute(
                "UPDATE Faculty SET password=%s, first_login=0 "
                "WHERE faculty_id=%s AND password=%s",
                (new_password, faculty_id, old_password),
            )

        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Invalid credentials"}, 401)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/faculty", methods=["POST"])
@role_required("admin")
def create_faculty():
    data, error = get_request_json()
    if error:
        return error

    required = ["faculty_id", "name", "email", "department", "password"]
    if not all(data.get(k) for k in required):
        return json_response({"success": False, "message": "Missing faculty fields"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Faculty (faculty_id, name, email, department, password, first_login) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                data["faculty_id"],
                data["name"],
                data["email"],
                data["department"],
                data["password"],
                data.get("first_login", 1),
            ),
        )
        conn.commit()
        return json_response({"success": True}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/faculty", methods=["GET"])
@role_required("admin")
def list_faculty():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT faculty_id, name, email, department, first_login FROM Faculty")
        rows = cursor.fetchall()
        return json_response({"success": True, "faculty": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/faculty/<faculty_id>", methods=["PUT"])
@role_required("admin")
def update_faculty(faculty_id):
    data, error = get_request_json()
    if error:
        return error

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE Faculty SET name=%s, email=%s, department=%s "
            "WHERE faculty_id=%s",
            (
                data.get("name"),
                data.get("email"),
                data.get("department"),
                faculty_id,
            ),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Faculty not found"}, 404)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/faculty/<faculty_id>", methods=["DELETE"])
@role_required("admin")
def delete_faculty(faculty_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM Course_Faculty WHERE faculty_id=%s", (faculty_id,))
        cursor.execute("DELETE FROM Faculty WHERE faculty_id=%s", (faculty_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Faculty not found"}, 404)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/courses", methods=["POST"])
@role_required("admin")
def create_course():
    form = request.form
    file = request.files.get("syllabus_file")

    if request.content_length and request.content_length > MAX_SYLLABUS_SIZE_BYTES:
        return json_response({"success": False, "message": "Syllabus file exceeds 5MB limit"}, 413)

    required = ["course_code", "course_name", "semester", "batch_name", "credits", "passing_marks"]
    if not all(form.get(k) for k in required):
        return json_response({"success": False, "message": "Missing course fields"}, 400)

    if not file or not file.filename:
        return json_response({"success": False, "message": "Syllabus file is required"}, 400)

    if not allowed_syllabus_file(file.filename):
        return json_response({"success": False, "message": "Only PDF or DOC/DOCX files are allowed"}, 400)

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    safe_name = secure_filename(file.filename)
    _, ext = os.path.splitext(safe_name)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    stored_name = f"{form.get('course_code')}_{timestamp}{ext.lower()}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_name)
    file.save(file_path)

    syllabus_path = os.path.join("uploads", "syllabus", stored_name).replace("\\", "/")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Courses (course_code, course_name, semester, batch_name, credits, passing_marks, syllabus_path) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                form["course_code"],
                form["course_name"],
                form["semester"],
                form["batch_name"],
                form["credits"],
                form["passing_marks"],
                syllabus_path,
            ),
        )
        conn.commit()
        return json_response({"success": True, "syllabus_path": syllabus_path}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/courses", methods=["GET"])
@role_required("admin")
def list_courses():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT course_id, course_code, course_name, semester, batch_name, credits, passing_marks, syllabus_path "
            "FROM Courses"
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "courses": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/uploads/syllabus/<path:filename>", methods=["GET"])
def get_syllabus(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/api/courses/<int:course_id>", methods=["PUT"])
@role_required("admin")
def update_course(course_id):
    data, error = get_request_json()
    if error:
        return error

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE Courses SET course_code=%s, course_name=%s, semester=%s, batch_name=%s, credits=%s, passing_marks=%s "
            "WHERE course_id=%s",
            (
                data.get("course_code"),
                data.get("course_name"),
                data.get("semester"),
                data.get("batch_name"),
                data.get("credits"),
                data.get("passing_marks"),
                course_id,
            ),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Course not found"}, 404)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/courses/<int:course_id>", methods=["DELETE"])
@role_required("admin")
def delete_course(course_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM Course_Faculty WHERE course_id=%s", (course_id,))
        cursor.execute("DELETE FROM Courses WHERE course_id=%s", (course_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Course not found"}, 404)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/assign", methods=["POST"])
@role_required("admin")
def assign_faculty():
    data, error = get_request_json()
    if error:
        return error

    course_id = data.get("course_id")
    faculty_id = data.get("faculty_id")
    if not course_id or not faculty_id:
        return json_response({"success": False, "message": "course_id and faculty_id required"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Course_Faculty (course_id, faculty_id) VALUES (%s, %s)",
            (course_id, faculty_id),
        )
        conn.commit()
        return json_response({"success": True}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/assignments", methods=["GET"])
@role_required("admin")
def list_assignments():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT cf.id, cf.course_id, cf.faculty_id, c.course_code, c.course_name, "
            "f.name AS faculty_name, f.department "
            "FROM Course_Faculty cf "
            "JOIN Courses c ON c.course_id = cf.course_id "
            "JOIN Faculty f ON f.faculty_id = cf.faculty_id"
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "assignments": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/assignments/<int:assignment_id>", methods=["DELETE"])
@role_required("admin")
def delete_assignment(assignment_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM Course_Faculty WHERE id=%s", (assignment_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return json_response({"success": False, "message": "Assignment not found"}, 404)
        return json_response({"success": True})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/faculty/courses", methods=["GET"])
@role_required("faculty")
def list_faculty_courses():
    faculty_id = session.get("faculty_id")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT c.course_id, c.course_code, c.course_name, c.semester, "
            "c.batch_name, c.credits, c.passing_marks "
            "FROM Courses c "
            "JOIN Course_Faculty cf ON cf.course_id = c.course_id "
            "WHERE cf.faculty_id = %s",
            (faculty_id,),
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "courses": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/login", methods=["GET"])
def login_page():
    return send_from_directory(LOGIN_UI_DIR, "index.html")


@app.route("/login/<path:filename>", methods=["GET"])
def serve_login_assets(filename):
    return send_from_directory(LOGIN_UI_DIR, filename)


@app.route("/admin/<path:filename>", methods=["GET"])
def serve_admin_assets(filename):
    return send_from_directory(ADMIN_UI_DIR, filename)


@app.route("/admin/dashboard", methods=["GET"])
def serve_admin_dashboard():
    return send_from_directory(ADMIN_UI_DIR, "dashboard.html")


@app.route("/faculty/<path:filename>", methods=["GET"])
def serve_faculty_assets(filename):
    return send_from_directory(FACULTY_UI_DIR, filename)


@app.route("/faculty/dashboard", methods=["GET"])
def serve_faculty_dashboard():
    return send_from_directory(FACULTY_UI_DIR, "dashboard.html")


@app.route("/courses/<path:filename>", methods=["GET"])
def serve_courses_assets(filename):
    return send_from_directory(COURSES_UI_DIR, filename)


@app.route("/courses", methods=["GET"])
def serve_courses_page():
    return send_from_directory(COURSES_UI_DIR, "courses.html")


@app.route("/reports/<path:filename>", methods=["GET"])
def serve_reports_assets(filename):
    return send_from_directory(REPORTS_UI_DIR, filename)


@app.route("/reports", methods=["GET"])
def serve_reports_page():
    return send_from_directory(REPORTS_UI_DIR, "reports.html")


@app.route("/api/co", methods=["POST"])
def create_co():
    data, error = get_request_json()
    if error:
        return error

    required = ["course_id", "co_number", "description"]
    if not all(data.get(k) for k in required):
        return json_response({"success": False, "message": "Missing CO fields"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Course_Outcomes (course_id, co_number, description) VALUES (%s, %s, %s)",
            (data["course_id"], data["co_number"], data["description"]),
        )
        conn.commit()
        return json_response({"success": True}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/threshold", methods=["POST"])
def create_threshold():
    data, error = get_request_json()
    if error:
        return error

    required = ["co_id", "threshold_mark"]
    if not all(data.get(k) for k in required):
        return json_response({"success": False, "message": "Missing threshold fields"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO CO_Thresholds (co_id, threshold_mark) VALUES (%s, %s)",
            (data["co_id"], data["threshold_mark"]),
        )
        conn.commit()
        return json_response({"success": True}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/co/<int:course_id>", methods=["GET"])
def get_course_outcomes(course_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT co.co_id, co.co_number, co.description, t.threshold_mark "
            "FROM Course_Outcomes co "
            "LEFT JOIN CO_Thresholds t ON t.co_id = co.co_id "
            "WHERE co.course_id=%s",
            (course_id,),
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "outcomes": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/calculate-attainment", methods=["POST"])
def calculate_attainment():
    data, error = get_request_json()
    if error:
        return error

    course_id = data.get("course_id")
    levels = data.get("levels") or [
        {"min_percentage": 80, "level": 3},
        {"min_percentage": 60, "level": 2},
        {"min_percentage": 40, "level": 1},
    ]

    if not course_id:
        return json_response({"success": False, "message": "course_id required"}, 400)

    levels = sorted(levels, key=lambda x: x.get("min_percentage", 0), reverse=True)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT co.co_id, t.threshold_mark "
            "FROM Course_Outcomes co "
            "LEFT JOIN CO_Thresholds t ON t.co_id = co.co_id "
            "WHERE co.course_id=%s",
            (course_id,),
        )
        outcomes = cursor.fetchall()

        results = []
        for outcome in outcomes:
            co_id = outcome["co_id"]
            threshold = outcome.get("threshold_mark") or 0

            cursor.execute(
                "SELECT AVG(marks) AS avg_marks FROM Student_Scores WHERE co_id=%s",
                (co_id,),
            )
            avg_marks = cursor.fetchone()["avg_marks"] or 0

            percentage = 0
            if threshold:
                percentage = (avg_marks / threshold) * 100

            level = 0
            for rule in levels:
                if percentage >= rule.get("min_percentage", 0):
                    level = rule.get("level", 0)
                    break

            cursor.execute(
                "INSERT INTO Attainment_Levels (co_id, percentage, level, calculated_at) "
                "VALUES (%s, %s, %s, %s)",
                (co_id, percentage, level, datetime.utcnow()),
            )

            results.append({
                "co_id": co_id,
                "percentage": percentage,
                "level": level,
            })

        conn.commit()
        return json_response({"success": True, "attainment": results})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/attainment/<int:course_id>", methods=["GET"])
def get_attainment(course_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT a.attainment_id, a.co_id, a.percentage, a.level, a.calculated_at "
            "FROM Attainment_Levels a "
            "JOIN Course_Outcomes co ON co.co_id = a.co_id "
            "WHERE co.course_id=%s "
            "ORDER BY a.calculated_at DESC",
            (course_id,),
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "attainment": rows})
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
