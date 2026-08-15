# Course Performance & Attainment Tracking System

## Overview

The **Course Performance & Attainment Tracking System** is a web-based application developed to automate the Course Outcome (CO) and Program Outcome (PO) attainment process used in Outcome Based Education (OBE).

The system helps administrators and faculty members manage courses, faculty assignments, syllabus documents, student marks, attainment configurations, CO-PO mappings, and attainment reports in a centralized platform.

It reduces the manual effort involved in Excel-based calculations and helps generate CO and PO attainment results more efficiently and consistently.

## Objectives

- Automate CO and PO attainment calculations.
- Reduce manual work involved in academic assessment.
- Process student marks uploaded through Excel files.
- Support configurable threshold marks and attainment levels.
- Process syllabus documents and extract relevant CO and CO-PO information.
- Manage courses and faculty assignments centrally.
- Generate attainment reports for academic assessment.

## Main Features

### Admin Module

The Admin module allows administrators to:

- Manage courses.
- Manage faculty members.
- Upload syllabus documents.
- Assign faculty members to courses.
- Manage course-related information.

### Faculty Module

The Faculty module allows faculty members to:

- Log in securely.
- View assigned courses.
- Upload student marks.
- Configure threshold marks.
- Define attainment levels.
- View CO attainment.
- View PO attainment.
- Generate academic reports.

### Syllabus Processing

The system supports syllabus document uploads and processes the uploaded syllabus files to identify Course Outcomes and CO-PO mapping information.

Uploaded syllabus files are maintained in the project's `uploads/syllabus/` directory.

### Marks Processing

Faculty members can upload student marksheets. The system processes the uploaded marks and prepares the data required for CO attainment calculation.

The backend contains a dedicated `marks_parser.py` file for marks processing.

### CO Attainment

CO attainment is calculated using student performance and the threshold marks defined by the faculty.

For theory subjects:

**40% Internal Assessment + 60% External Assessment**

For laboratory subjects:

**60% Internal Assessment + 40% External Assessment**

The resulting weighted value provides the final direct CO attainment.

### PO Attainment

PO attainment is calculated using:

- Final direct CO attainment.
- CO-PO mapping values.

The mapping levels are:

- **3 – High contribution**
- **2 – Medium contribution**
- **1 – Low contribution**

The mapping values and CO attainment values are combined to calculate the final normalized PO attainment.

## System Workflow

```text
Admin Login
      |
      v
Course Management
      |
      v
Syllabus Upload
      |
      v
CO and CO-PO Processing
      |
      v
Faculty Assignment
      |
      v
Faculty Login
      |
      v
Marks Upload
      |
      v
Marks Processing
      |
      v
Threshold and Attainment Configuration
      |
      v
CO Attainment Calculation
      |
      v
Final Direct CO Attainment
      |
      v
PO Attainment Calculation
      |
      v
Reports
```

## Technologies Used

| Technology | Purpose |
|---|---|
| HTML | Web page structure |
| CSS | User interface styling |
| JavaScript | Frontend interaction and dynamic functionality |
| Python | Backend processing and calculation logic |
| Flask | Web application backend |
| MySQL | Database management |
| SheetJS | Excel file processing |
| PDF/DOC/DOCX Parsers | Syllabus document processing |

## System Architecture

The system follows a three-layer architecture consisting of the frontend, backend, and database layers.

### Frontend Layer

The frontend provides the interface through which Admin and Faculty users interact with the system. It includes login, dashboard, course management, marks upload, attainment configuration, and report pages.

### Backend Layer

The backend is developed using Flask and Python. It handles authentication, course operations, syllabus processing, marks processing, CO and PO attainment calculations, and database communication.

### Database Layer

MySQL is used to store and manage academic and attainment-related data such as faculty details, courses, Course Outcomes, student marks, threshold marks, attainment levels, CO-PO mappings, and attainment results.

## Project Structure

```text
major_project/
│
├── backend/
│   ├── __pycache__/
│   ├── app.py
│   ├── config.py
│   ├── db.py
│   └── marks_parser.py
│
├── frontend/
│   ├── admin/
│   ├── courses/
│   ├── faculty/
│   ├── login/
│   └── reports/
│
├── uploads/
│   └── syllabus/
│
├── requirements.txt
└── README.md
```
## Database Design

The system uses MySQL as a centralized database for storing academic and attainment-related information.

The database manages data related to:

- Admin
- Faculty
- Courses
- Course assignments
- Course Outcomes
- Student marks
- Threshold marks
- Attainment levels
- CO-PO mappings
- CO attainment
- Minor and major attainment

The database relationships allow the system to retrieve the required data for CO and PO attainment calculations and report generation.

## CO-PO Mapping

The system uses three mapping levels to represent the contribution of a Course Outcome towards a Program Outcome.

| Mapping Level | Contribution |
|---|---|
| 3 | High |
| 2 | Medium |
| 1 | Low |

These mapping values are used along with the final direct CO attainment values to calculate PO attainment.

## Benefits

- Reduces manual calculation work.
- Reduces chances of calculation errors.
- Centralizes academic data.
- Simplifies student marks processing.
- Automates CO and PO attainment calculations.
- Supports different assessment weightages for theory and laboratory subjects.
- Simplifies academic report generation.
- Improves consistency in academic assessment.

## Future Scope

The system can be further enhanced with:

- Advanced graphical dashboards.
- Detailed academic performance analytics.
- Automated student performance prediction.
- Cloud-based deployment.
- Mobile application support.
- Integration with existing academic management systems.

## Conclusion

The Course Performance & Attainment Tracking System provides a centralized solution for managing the CO and PO attainment process. It brings course management, syllabus processing, marks processing, attainment calculation, CO-PO mapping, and report generation into a single web-based platform.

The system reduces manual effort, improves calculation consistency, and provides an organized approach to academic assessment and Outcome Based Education activities.
