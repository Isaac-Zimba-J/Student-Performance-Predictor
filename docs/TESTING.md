# AcademIQ — System Testing Guide

This document covers every feature in the system, how to test it, what to expect,
and a detailed explanation of how the ML prediction algorithms work.

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Authentication](#2-authentication)
3. [User Roles and Access Control](#3-user-roles-and-access-control)
4. [Student Management](#4-student-management)
5. [Course Management](#5-course-management)
6. [Attendance Recording](#6-attendance-recording)
7. [Assessment Results](#7-assessment-results)
8. [Semester GPA](#8-semester-gpa)
9. [Risk Predictions](#9-risk-predictions)
10. [Interventions](#10-interventions)
11. [Background Tasks (Celery)](#11-background-tasks-celery)
12. [How the Prediction Algorithms Work](#12-how-the-prediction-algorithms-work)

---

## 1. Test Environment Setup

### Prerequisites

- Backend running at `http://localhost:8000`
- Frontend running at `http://localhost:4200`
- Database seeded with demo data (`python seed.py`)

### Tools needed

- **Swagger UI** — `http://localhost:8000/docs` — lets you call every API endpoint directly in the browser, no extra tools needed.
- **Browser** — for testing the Angular frontend at `http://localhost:4200`.
- **Postman or curl** — optional, for scripted or automated testing.

### Demo accounts (all use password `password123`)

| Email | Role | What you can access |
|---|---|---|
| `admin@uni.ac.zm` | Admin | Everything |
| `shumba@uni.ac.zm` | Lecturer | Students, attendance, results, interventions |
| `banda@uni.ac.zm` | Lecturer | Students, attendance, results, interventions |
| `student1@uni.ac.zm` | Student | Own dashboard and prediction only |
| `student2@uni.ac.zm` | Student | Own dashboard and prediction only |
| `student3@uni.ac.zm` … `student10@uni.ac.zm` | Student | Own dashboard and prediction only |

### How to authenticate in Swagger UI

1. Open `http://localhost:8000/docs`
2. Click the `POST /api/auth/login` endpoint
3. Click **Try it out**
4. Enter: `{ "email": "admin@uni.ac.zm", "password": "password123" }`
5. Click **Execute**
6. Copy the `access_token` value from the response
7. Click the **Authorize** button at the top of the page
8. Paste the token in the `bearerAuth` field and click **Authorize**

All subsequent requests will now be sent as that user.

---

## 2. Authentication

### Feature: Login

**Endpoint:** `POST /api/auth/login`

**Test — valid credentials:**
```json
{
  "email": "admin@uni.ac.zm",
  "password": "password123"
}
```
**Expected response (200):**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "role": "admin",
  "user_id": "...",
  "full_name": "Dr. Admin"
}
```

**Test — wrong password:**
```json
{
  "email": "admin@uni.ac.zm",
  "password": "wrongpassword"
}
```
**Expected response (401):** `"Invalid email or password"`

**Test — non-existent email:**
```json
{
  "email": "nobody@uni.ac.zm",
  "password": "password123"
}
```
**Expected response (401):** `"Invalid email or password"`

---

### Feature: Register a general user

**Endpoint:** `POST /api/auth/register`

```json
{
  "email": "newlecturer@uni.ac.zm",
  "password": "securepass99",
  "full_name": "Dr. New Lecturer",
  "role": "lecturer"
}
```
**Expected (201):** Returns the new user object without the password.

**Test — duplicate email:**  
Register with the same email again.  
**Expected (400):** `"Email already registered"`

---

### Feature: Register a student with profile

**Endpoint:** `POST /api/auth/register/student`

This creates a `User` and a `StudentProfile` in one request.

```json
{
  "email": "newstudent@uni.ac.zm",
  "password": "pass1234",
  "full_name": "Test Student",
  "student_number": "21999999",
  "programme": "Computer Science",
  "year_of_study": 2,
  "ses_status": "middle",
  "is_scholarship": false,
  "is_employed_part_time": false,
  "distance_from_campus_km": 10.0
}
```
**Expected (201):** Returns the user object. The role is automatically set to `student`.

---

### Feature: Get current user

**Endpoint:** `GET /api/auth/me`

**Expected:** Returns the currently logged-in user's details.  
**Test:** Log in as different roles and confirm the returned data matches.

---

## 3. User Roles and Access Control

The system enforces three roles. Test that each boundary is respected.

### Student access restrictions

Log in as `student1@uni.ac.zm` and try the following — all should be **denied (403)**:

| Endpoint | Why it should be denied |
|---|---|
| `GET /api/students/` | Students cannot list all students |
| `GET /api/predictions/student/{any_other_student_id}` | Students can only see their own prediction |
| `POST /api/attendance/` | Only lecturers/admins record attendance |
| `POST /api/results/` | Only lecturers/admins record results |
| `POST /api/predictions/train` | Admin only |

Endpoints students **can** access:

| Endpoint | Expected |
|---|---|
| `GET /api/auth/me` | Own user details |
| `GET /api/predictions/my` | Own risk prediction |
| `GET /api/students/me/dashboard` | Own dashboard |

### Lecturer access restrictions

Log in as `shumba@uni.ac.zm` and confirm:

- `POST /api/predictions/train` → **403** (admin only)
- `GET /api/students/` → **200** (allowed)
- `POST /api/attendance/` → **201** (allowed)

---

## 4. Student Management

### Feature: List all students

**Endpoint:** `GET /api/students/`  
**Auth required:** Admin or Lecturer

**Expected (200):** Array of student profiles including name, student number, programme, year of study, and SES status.

**Test filters:**
- `GET /api/students/?programme=Computer+Science` — returns only CS students
- `GET /api/students/?year=3` — returns only year 3 students
- `GET /api/students/?skip=0&limit=5` — first 5 students only

---

### Feature: Student dashboard

**Endpoint:** `GET /api/students/{student_id}/dashboard`  
**Auth required:** Admin or Lecturer

The dashboard bundles four things in one response:
1. Student profile
2. Current risk prediction (auto-generated)
3. Attendance summary
4. Last 5 assessment results
5. Pending interventions

**How to get a student ID:**  
Call `GET /api/students/` and copy the `id` field from any student in the list.

**Expected (200):** A JSON object with all four sections populated.

**Test — student views own dashboard:**  
Log in as `student1@uni.ac.zm` and call `GET /api/students/me/dashboard`.  
**Expected:** Same structure, but scoped to their own data.

---

## 5. Course Management

### Feature: Create a course

**Endpoint:** `POST /api/courses/`  
**Auth required:** Admin or Lecturer

```json
{
  "course_code": "CS401",
  "course_name": "Artificial Intelligence",
  "credits": 3,
  "semester": 1,
  "year": 2025,
  "lecturer_id": null
}
```
**Expected (201):** Course object with the generated `id`.

**Test — duplicate course code:**  
Try creating another course with `"course_code": "CS401"`.  
**Expected (400):** `"Course code 'CS401' already exists"`

---

### Feature: List all courses

**Endpoint:** `GET /api/courses/`  
**Auth required:** Admin or Lecturer

**Expected (200):** Array of courses, each including their list of assessments.

---

## 6. Attendance Recording

### Feature: Record weekly attendance

**Endpoint:** `POST /api/attendance/`  
**Auth required:** Admin or Lecturer

First get a `student_id` from `GET /api/students/` and a `course_id` from `GET /api/courses/`.

```json
{
  "student_id": "<student profile id>",
  "course_id": "<course id>",
  "week_number": 13,
  "classes_held": 3,
  "classes_attended": 2,
  "lms_logins": 5,
  "assignment_submissions": 1
}
```
**Expected (201):** Attendance record with a computed `attendance_rate` (0.0–1.0).

**Effect on prediction:** Once attendance is recorded, the next prediction run for that student will use the updated attendance rate.

---

### Feature: Get student attendance history

**Endpoint:** `GET /api/attendance/student/{student_id}`

**Expected (200):** All attendance records for that student, ordered by week number, each with an `attendance_rate`.

**What to look for:**
- Students with mostly `1.0` rates → expected Low risk
- Students with rates below `0.5` → expected Critical risk (like student2 — Chanda Mwansa)

---

## 7. Assessment Results

### Feature: Submit a result

**Endpoint:** `POST /api/results/`  
**Auth required:** Admin or Lecturer

First get an `assessment_id` from `GET /api/courses/{course_id}/assessments`.

```json
{
  "student_id": "<student profile id>",
  "assessment_id": "<assessment id>",
  "marks_obtained": 72.5,
  "submitted_on_time": true
}
```
**Expected (201):** Result with a computed `percentage` based on the assessment's `max_marks`.

**Test — missing assessment (marks_obtained null):**
```json
{
  "student_id": "<id>",
  "assessment_id": "<id>",
  "marks_obtained": null,
  "submitted_on_time": false
}
```
**Expected (201):** Created with `percentage` as null. This increments `assessments_missed` in the next prediction.

---

### Feature: Get student results

**Endpoint:** `GET /api/results/student/{student_id}`

**Expected (200):** All results for that student, newest first.

---

## 8. Semester GPA

### Feature: Record a semester GPA

**Endpoint:** `POST /api/semester-gpa/`  
**Auth required:** Admin or Lecturer

```json
{
  "student_id": "<student profile id>",
  "year": 2024,
  "semester": 1,
  "gpa": 3.2
}
```
**Expected (201):** GPA record.

**Why this matters:** The `gpa_prior` feature used in predictions is pulled from the most recent `SemesterGPA` record. Without any recorded GPA, the system defaults to `2.5`. Recording real GPAs improves prediction accuracy and is also required before model retraining can run.

---

### Feature: Get GPA history

**Endpoint:** `GET /api/semester-gpa/student/{student_id}`

**Expected (200):** All recorded semester GPAs for that student, newest first.

---

## 9. Risk Predictions

This is the core feature of the system.

### Feature: Run a prediction for a student

**Endpoint:** `GET /api/predictions/student/{student_id}`  
**Auth required:** Any authenticated user (students can only call it for themselves)

**Expected (200):**
```json
{
  "student_id": "...",
  "student_name": "Emeldah Miyanda",
  "student_number": "21164180",
  "risk_level": "low",
  "risk_score": 0.12,
  "predicted_gpa": null,
  "risk_factors": [
    { "factor": "Class attendance", "impact": 0.08, "value": "0.92" },
    { "factor": "Assessment performance", "impact": 0.05, "value": "85.3" }
  ],
  "recommendations": [
    "You are on track — keep up the good attendance..."
  ],
  "model_version": "v1",
  "predicted_at": "2025-..."
}
```

**Test with different students to see different risk levels:**

| Student | Email | Expected risk |
|---|---|---|
| Emeldah Miyanda | student1@uni.ac.zm | Low |
| Chanda Mwansa | student2@uni.ac.zm | Critical (45% attendance, 25–45% scores) |
| Bupe Mutale | student4@uni.ac.zm | High (58% attendance, 35–55% scores) |
| Chilufya Bwalya | student6@uni.ac.zm | Critical (40% attendance, 20–40% scores) |
| Mutinta Hakasenke | student7@uni.ac.zm | Low (95% attendance, 80–98% scores) |

---

### Feature: Student views own prediction

**Endpoint:** `GET /api/predictions/my`  
**Auth required:** Student

Log in as any student and call this. No student ID needed — the API resolves it from the JWT.

---

### Feature: Prediction history

**Endpoint:** `GET /api/predictions/student/{student_id}/history`

Every time a prediction is run, it is stored. This endpoint returns all past predictions in chronological order.

**Test pagination:**
- `?skip=0&limit=5` — first 5
- `?skip=5&limit=5` — next 5

**Expected (200):** Array of `{ risk_level, risk_score, predicted_gpa, created_at }`

---

### Feature: Risk summary (cohort view)

**Endpoint:** `GET /api/predictions/risk-summary`  
**Auth required:** Admin or Lecturer

**Expected (200):**
```json
{
  "total_students": 10,
  "low_risk": 4,
  "medium_risk": 2,
  "high_risk": 2,
  "critical_risk": 2,
  "at_risk_percentage": 40.0
}
```

This uses the **latest prediction per student** — each student is counted once.

---

### Feature: Trigger model retraining

**Endpoint:** `POST /api/predictions/train`  
**Auth required:** Admin only

**Expected — not enough data (202 or 400):**  
If fewer than 10 students have a recorded `SemesterGPA`, the response will be:
```json
{ "detail": "Need at least 10 labelled student records to train. Have X." }
```

**To enable training:**
1. Record a `SemesterGPA` for at least 10 students via `POST /api/semester-gpa/`
2. Call `POST /api/predictions/train` again

**Expected after training:**
```json
{ "message": "Model retrained successfully", "status": "trained", "samples": 10 }
```

After training, the saved model files appear in `backend/ml/saved_models/` and all subsequent predictions use XGBoost instead of the rule-based fallback.

---

## 10. Interventions

### Feature: Create an intervention

**Endpoint:** `POST /api/interventions/`  
**Auth required:** Admin or Lecturer

```json
{
  "student_id": "<student profile id>",
  "intervention_type": "tutoring",
  "description": "Student struggling with Data Structures. Schedule weekly tutoring sessions.",
  "recommended_by": "system"
}
```

**Intervention types:** `tutoring` | `counseling` | `alert` | `resource`

**Expected (201):** Intervention record with `is_actioned: false`.

---

### Feature: Mark an intervention as actioned

**Endpoint:** `PATCH /api/interventions/{intervention_id}`

```json
{
  "is_actioned": true,
  "outcome_note": "Student attended 3 tutoring sessions. Attendance improved to 75%."
}
```
**Expected (200):** Updated intervention with `is_actioned: true` and `actioned_at` timestamp set.

---

### Feature: List interventions for a student

**Endpoint:** `GET /api/interventions/student/{student_id}`

- `GET /api/interventions/student/{id}` — all interventions
- `GET /api/interventions/student/{id}?pending_only=true` — only unactioned ones

---

## 11. Background Tasks (Celery)

These run on a schedule when the Celery worker and beat are running. They can also be triggered manually for testing.

### Scheduled tasks

| Task | Schedule | What it does |
|---|---|---|
| `run_all_predictions` | Every night at 2:00 AM | Runs a risk prediction for every student and saves the result |
| `retrain_models` | Every Sunday at 3:00 AM | Retrains XGBoost and GPA models if 10+ students have real GPA records |
| `send_risk_alerts` | Every Monday at 8:00 AM | Emails all lecturers a list of HIGH and CRITICAL risk students |

### How to test manually

Start the Celery worker, then trigger tasks directly from a Python shell:

```bash
cd backend
source venv/bin/activate   # Windows: venv\Scripts\activate
python
```

```python
from tasks.scheduled import run_all_predictions, retrain_models, send_risk_alerts

# Run immediately (not as a background task)
run_all_predictions()
retrain_models()
send_risk_alerts()
```

**Expected from `run_all_predictions`:**
```python
{'updated': 10, 'failed': 0}
```

**Expected from `retrain_models` before any GPAs are recorded:**
```python
{'skipped': True, 'records': 0}
```

**Expected from `send_risk_alerts` with `EMAIL_ENABLED=false`:**  
Alerts are logged to the console instead of sent. Check the terminal running the worker for lines like:
```
WARNING  [ALERT] High/Critical risk students for lecturer shumba@uni.ac.zm: ...
```

---

## 12. How the Prediction Algorithms Work

This section explains what happens inside `backend/ml/predictor.py` when a prediction is requested.

---

### Step 1 — Feature Engineering

When `GET /api/predictions/student/{id}` is called, the system first queries the database to build a **feature vector** — 12 numbers that describe the student's current academic situation.

| Feature | How it is calculated |
|---|---|
| `attendance_rate` | Total classes attended ÷ total classes held across all courses |
| `lms_engagement_rate` | Total LMS logins ÷ number of weeks tracked |
| `assignment_submission_rate` | Total assignment submissions ÷ number of weeks tracked |
| `avg_assessment_score` | Average of (marks_obtained ÷ max_marks × 100) across all submitted assessments |
| `gpa_prior` | Most recent recorded `SemesterGPA.gpa`, defaults to 2.5 if none exists |
| `year_of_study` | Taken directly from the student profile |
| `ses_encoded` | SES status mapped to a number: low=0, middle=1, high=2 |
| `is_scholarship` | 1 if the student has a scholarship, 0 otherwise |
| `is_employed` | 1 if employed part-time, 0 otherwise |
| `distance_km` | Distance from campus in km, from the student profile |
| `assessments_missed` | Count of assessment results where `marks_obtained` is null |
| `late_submissions` | Count of results where `submitted_on_time` is false |

A student with no attendance records will have `attendance_rate = 1.0` (the formula defaults the denominator to 1 to avoid division by zero). A student with no assessment results will have `avg_assessment_score = 50.0`.

---

### Step 2 — Risk Classification

#### Before model training: Rule-based fallback

Until the XGBoost model is trained, a weighted scoring formula is used:

```
score = 0.0

Attendance (contributes up to 0.40 of the score):
  attendance_rate < 0.50  → +0.40  (very low attendance)
  attendance_rate < 0.70  → +0.25
  attendance_rate < 0.85  → +0.10

Assessment score (contributes up to 0.35):
  avg_score < 40%  → +0.35  (failing)
  avg_score < 55%  → +0.22
  avg_score < 65%  → +0.10

SES and employment (contributes up to 0.15):
  SES = low       → +0.10
  part-time work  → +0.05

Missed work (contributes up to 0.15):
  +0.04 per missed assessment (capped at 0.10)
  +0.02 per late submission (capped at 0.05)

Final score is clamped to 1.0, then mapped to a risk level:
  score < 0.25 → LOW
  score < 0.50 → MEDIUM
  score < 0.75 → HIGH
  score >= 0.75 → CRITICAL
```

**Example — Chanda Mwansa (student2):**
- Attendance 45% → +0.40
- Avg score ~35% → +0.35
- SES low → +0.10
- Employed → +0.05
- Total ≈ 0.90 → **CRITICAL**

**Example — Emeldah Miyanda (student1):**
- Attendance 92% → +0.00
- Avg score ~85% → +0.00
- SES middle → +0.00
- Total ≈ 0.00 → **LOW**

---

#### After model training: XGBoost classifier

Once `POST /api/predictions/train` is called with 10+ labelled students, the system trains an XGBoost multi-class classifier.

**Model configuration:**
- 200 decision trees
- Max tree depth of 5
- Learning rate of 0.05
- Loss function: multi-class log loss (mlogloss)

**What XGBoost does:**  
It builds an ensemble of decision trees where each new tree corrects the errors of the previous ones. The model learns which combinations of the 12 features most strongly predict each risk level from the historical data, rather than using the fixed weights in the rule-based approach.

**Output:** A probability for each of the 4 classes (low/medium/high/critical). The class with the highest probability is the prediction. The probability itself becomes the `risk_score`.

---

### Step 3 — SHAP Explanations

After the XGBoost model makes a prediction, SHAP (SHapley Additive exPlanations) is used to explain **why** that particular prediction was made.

SHAP assigns each feature an **impact value** — a number that represents how much that feature pushed the prediction toward or away from the predicted risk class. Positive values increase the predicted risk; negative values decrease it.

The top 5 factors by absolute impact are returned in the `risk_factors` array and shown on the student's prediction screen.

**Example output:**
```json
[
  { "factor": "Class attendance", "impact": -0.42, "value": "0.92" },
  { "factor": "Assessment performance", "impact": -0.31, "value": "85.3" },
  { "factor": "Prior academic record", "impact": -0.18, "value": "3.2" }
]
```
Negative values here mean those features are pulling the risk level **down** (the student is doing well). For a high-risk student the attendance and score impacts would be positive instead.

---

### Step 4 — GPA Prediction

If the GPA regressor model exists (`backend/ml/saved_models/gpa_regressor.pkl`), it is loaded and run on the same 12-feature vector to produce a `predicted_gpa` value between 0.0 and 4.0.

**Model:** Gradient Boosting Regressor  
- 150 trees, max depth 4, learning rate 0.08  
- Trained on the same feature vectors using real `SemesterGPA.gpa` values as labels

Until the model is trained, `predicted_gpa` is returned as `null`.

---

### Step 5 — Recommendations

The `generate_recommendations` function reads the feature values and risk level and produces plain-English recommendations:

| Condition | Recommendation shown |
|---|---|
| `attendance_rate < 0.75` | Attendance warning with current percentage |
| `avg_assessment_score < 55` | Tutoring / academic support suggestion |
| `assessments_missed > 1` | Contact lecturer for make-up opportunities |
| `lms_engagement_rate < 2` | Reminder to log in to the online platform |
| `is_employed AND attendance < 0.8` | Time management / counselling suggestion |
| Risk is HIGH or CRITICAL | Urgent prompt to see academic advisor |
| None of the above triggered | Positive reinforcement message |

---

### Model retraining cycle

```
Students accumulate data
        ↓
Attendance records + Assessment results + SemesterGPAs
        ↓
POST /api/predictions/train  (or weekly Celery beat task)
        ↓
build_features() called for every student with a real SemesterGPA
        ↓
XGBoost trained on feature vectors → saved to saved_models/risk_classifier.json
GradientBoosting trained on same features → saved to saved_models/gpa_regressor.pkl
        ↓
All future predictions use the trained models instead of the rule-based fallback
```

The minimum of **10 students with recorded SemesterGPA entries** is the gating condition. Without real outcome labels the model has nothing to learn from.
