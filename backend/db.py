import mysql.connector

from config import DB_CONFIG

# Create a database connection using the configured credentials.


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


# Initialize required tables and seed a default admin account.
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Admin ("
            "admin_id INT AUTO_INCREMENT PRIMARY KEY, "
            "username VARCHAR(100) NOT NULL UNIQUE, "
            "password VARCHAR(255) NOT NULL"
            ")"
        )
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Faculty ("
            "faculty_id VARCHAR(50) PRIMARY KEY, "
            "name VARCHAR(150) NOT NULL, "
            "email VARCHAR(150) NOT NULL UNIQUE, "
            "department VARCHAR(150), "
            "password VARCHAR(255) NOT NULL, "
            "first_login BOOLEAN DEFAULT TRUE"
            ")"
        )
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Courses ("
            "course_id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_code VARCHAR(50) NOT NULL UNIQUE, "
            "course_name VARCHAR(200) NOT NULL, "
            "semester VARCHAR(50), "
            "batch_name VARCHAR(100), "
            "credits INT, "
            "passing_marks INT, "
            "syllabus_path VARCHAR(255), "
            "number_of_cos INT"
            ")"
        )
        try:
            cursor.execute("ALTER TABLE Courses ADD COLUMN batch_name VARCHAR(100)")
        except mysql.connector.Error as exc:
            if exc.errno != 1060:
                raise
        try:
            cursor.execute("ALTER TABLE Courses ADD COLUMN syllabus_path VARCHAR(255)")
        except mysql.connector.Error as exc:
            if exc.errno != 1060:
                raise
        try:
            cursor.execute("ALTER TABLE Courses ADD COLUMN number_of_cos INT")
        except mysql.connector.Error as exc:
            if exc.errno != 1060:
                raise
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Course_Faculty ("
            "id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_id INT NOT NULL, "
            "faculty_id VARCHAR(50) NOT NULL, "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id), "
            "FOREIGN KEY (faculty_id) REFERENCES Faculty(faculty_id)"
            ")"
        )

        cursor.execute("SET FOREIGN_KEY_CHECKS=0")
        try:
            cursor.execute("ALTER TABLE Course_Faculty DROP FOREIGN KEY course_faculty_ibfk_2")
        except mysql.connector.Error:
            pass
        try:
            cursor.execute("ALTER TABLE Faculty MODIFY COLUMN faculty_id VARCHAR(50)")
        except mysql.connector.Error as exc:
            if exc.errno != 1060:
                raise
        try:
            cursor.execute("ALTER TABLE Course_Faculty MODIFY COLUMN faculty_id VARCHAR(50)")
        except mysql.connector.Error as exc:
            if exc.errno != 1060:
                raise
        try:
            cursor.execute(
                "ALTER TABLE Course_Faculty "
                "ADD CONSTRAINT course_faculty_ibfk_2 "
                "FOREIGN KEY (faculty_id) REFERENCES Faculty(faculty_id)"
            )
        except mysql.connector.Error:
            pass
        cursor.execute("SET FOREIGN_KEY_CHECKS=1")
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Course_Outcomes ("
            "co_id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "description TEXT, "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS CO_Thresholds ("
            "threshold_id INT AUTO_INCREMENT PRIMARY KEY, "
            "co_id INT NOT NULL, "
            "threshold_mark INT NOT NULL, "
            "FOREIGN KEY (co_id) REFERENCES Course_Outcomes(co_id)"
            ")"
        )
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Student_Scores ("
            "score_id INT AUTO_INCREMENT PRIMARY KEY, "
            "co_id INT NOT NULL, "
            "student_id INT NOT NULL, "
            "marks INT NOT NULL, "
            "FOREIGN KEY (co_id) REFERENCES Course_Outcomes(co_id)"
            ")"
        )
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS Attainment_Levels ("
            "attainment_id INT AUTO_INCREMENT PRIMARY KEY, "
            "co_id INT NOT NULL, "
            "percentage DECIMAL(5,2), "
            "level VARCHAR(50), "
            "calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
            "FOREIGN KEY (co_id) REFERENCES Course_Outcomes(co_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS co_attainment ("
            "id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_id INT NOT NULL, "
            "faculty_id VARCHAR(50) NOT NULL, "
            "co_number INT NOT NULL, "
            "attainment_value DECIMAL(5,2) NOT NULL, "
            "UNIQUE KEY uniq_course_faculty_co (course_id, faculty_id, co_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id), "
            "FOREIGN KEY (faculty_id) REFERENCES Faculty(faculty_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS co_attainment_levels ("
            "id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_id INT NOT NULL, "
            "faculty_id VARCHAR(50) NOT NULL, "
            "co_number INT NOT NULL, "
            "level_number INT NOT NULL, "
            "lower_limit INT NOT NULL, "
            "upper_limit INT NOT NULL, "
            "UNIQUE KEY uniq_course_faculty_co_level (course_id, faculty_id, co_number, level_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id), "
            "FOREIGN KEY (faculty_id) REFERENCES Faculty(faculty_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS co_po_matrix ("
            "id INT AUTO_INCREMENT PRIMARY KEY, "
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "po_number INT NOT NULL, "
            "value INT NOT NULL, "
            "UNIQUE KEY uniq_course_co_po (course_id, co_number, po_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS minor1_attainment ("
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "attainment DECIMAL(5,2) NOT NULL, "
            "UNIQUE KEY uniq_minor1 (course_id, co_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS minor2_attainment ("
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "attainment DECIMAL(5,2) NOT NULL, "
            "UNIQUE KEY uniq_minor2 (course_id, co_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS minor3_attainment ("
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "attainment DECIMAL(5,2) NOT NULL, "
            "UNIQUE KEY uniq_minor3 (course_id, co_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )

        cursor.execute(
            "CREATE TABLE IF NOT EXISTS major_attainment ("
            "course_id INT NOT NULL, "
            "co_number INT NOT NULL, "
            "attainment DECIMAL(5,2) NOT NULL, "
            "UNIQUE KEY uniq_major (course_id, co_number), "
            "FOREIGN KEY (course_id) REFERENCES Courses(course_id)"
            ")"
        )

        # Ensure a default admin account exists for first-time login.
        cursor.execute("SELECT COUNT(*) FROM Admin")
        if cursor.fetchone()[0] == 0:
            cursor.execute(
                "INSERT INTO Admin (username, password) VALUES (%s, %s)",
                ("admin", "admin123"),
            )

        conn.commit()
    finally:
        cursor.close()
        conn.close()
