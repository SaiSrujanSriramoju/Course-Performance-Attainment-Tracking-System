from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from db import get_db_connection, init_db

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500"]}})


def json_response(payload, status=200):
    return jsonify(payload), status


def get_request_json():
    data = request.get_json(silent=True)
    if data is None:
        return {}, json_response({"success": False, "message": "Invalid JSON body"}, 400)
    return data, None


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
        return json_response({"success": True, "faculty": faculty})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/change-password", methods=["POST"])
def change_password():
    data, error = get_request_json()
    if error:
        return error

    role = data.get("role")
    new_password = data.get("new_password")
    old_password = data.get("old_password")

    if role not in ["admin", "faculty"]:
        return json_response({"success": False, "message": "role must be admin or faculty"}, 400)

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
def create_course():
    data, error = get_request_json()
    if error:
        return error

    required = ["course_code", "course_name", "semester", "batch_name", "credits", "passing_marks"]
    if not all(data.get(k) for k in required):
        return json_response({"success": False, "message": "Missing course fields"}, 400)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO Courses (course_code, course_name, semester, batch_name, credits, passing_marks) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                data["course_code"],
                data["course_name"],
                data["semester"],
                data["batch_name"],
                data["credits"],
                data["passing_marks"],
            ),
        )
        conn.commit()
        return json_response({"success": True}, 201)
    finally:
        cursor.close()
        conn.close()


@app.route("/api/courses", methods=["GET"])
def list_courses():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT course_id, course_code, course_name, semester, batch_name, credits, passing_marks "
            "FROM Courses"
        )
        rows = cursor.fetchall()
        return json_response({"success": True, "courses": rows})
    finally:
        cursor.close()
        conn.close()


@app.route("/api/courses/<int:course_id>", methods=["PUT"])
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
