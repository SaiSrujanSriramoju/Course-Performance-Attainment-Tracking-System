import mysql.connector

from config import DB_CONFIG


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


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
            "passing_marks INT"
            ")"
        )
        try:
            cursor.execute("ALTER TABLE Courses ADD COLUMN batch_name VARCHAR(100)")
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

        conn.commit()
    finally:
        cursor.close()
        conn.close()
