# AcademIQ — Features Guide

This document explains every feature in the system in detail: what it does, who can use it,
what information it needs, and what you get back. It is written from the perspective of
someone using the system, not testing it.

---

## Table of Contents

1. [Who Can Use What — User Roles](#1-who-can-use-what--user-roles)
2. [Authentication](#2-authentication)
3. [Student Profiles](#3-student-profiles)
4. [Courses and Assessments](#4-courses-and-assessments)
5. [Attendance Tracking](#5-attendance-tracking)
6. [Assessment Results](#6-assessment-results)
7. [Semester GPA Records](#7-semester-gpa-records)
8. [Risk Predictions](#8-risk-predictions)
9. [Interventions](#9-interventions)
10. [Dashboards](#10-dashboards)
11. [Scheduled Background Tasks](#11-scheduled-background-tasks)
12. [Email Alerts](#12-email-alerts)

---

## 1. Who Can Use What — User Roles

Every user in AcademIQ has one of three roles. The role is set when the account is created
and determines what that person can see and do.

### Student

A student can only see information about themselves. They cannot see other students, cannot
record attendance or results, and cannot create interventions.

What a student can do:
- Log in and view their own risk prediction
- See their own dashboard (attendance summary, recent results, pending interventions)
- View their own prediction history over time
- View recommendations generated for them

### Lecturer

A lecturer manages students academically. They can see all students, record attendance and
results, and create interventions. They cannot retrain the ML models.

What a lecturer can do — everything a student can, plus:
- View the full student list and filter it
- View any student's dashboard and prediction
- Create courses and record assessments
- Record weekly attendance for students
- Submit assessment results for students
- Record end-of-semester GPAs
- Create and action interventions
- View the cohort-level risk summary

### Admin

An admin has full access. In addition to everything a lecturer can do, an admin can trigger
ML model retraining.

---

## 2. Authentication

### Logging In

Every user logs in with an email address and password. On success the system returns a
**JWT access token** that must be sent with every subsequent request.

The token expires after 60 minutes by default (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`
in `.env`). After it expires the user must log in again.

**What you need:**
- Email address
- Password

**What you get back:**
- `access_token` — the token to attach to future requests
- `role` — the user's role (`student`, `lecturer`, or `admin`)
- `user_id` — the user's unique ID
- `full_name` — the user's display name

**In the frontend:** Enter credentials on the login page. The token is stored automatically
and attached to every API call via an HTTP interceptor. You do not need to handle it manually.

**In Swagger UI:** After logging in, copy the `access_token` value, click the **Authorize**
button at the top of the page, paste the token, and click Authorize. All requests will now
be authenticated.

---

### Registering a General User

Creates a new user account without a student profile. Use this to create lecturer or admin
accounts.

**What you need:**
- `email` — must be unique across all users
- `password`
- `full_name`
- `role` — one of `student`, `lecturer`, `admin`

---

### Registering a Student

Creates a user account and a full student profile in one step. The role is automatically
set to `student` — it cannot be overridden here.

**What you need:**

| Field | Description |
|---|---|
| `email` | Must be unique |
| `password` | |
| `full_name` | Student's display name |
| `student_number` | Unique student number (e.g. `21164180`) |
| `programme` | Degree programme (e.g. `Computer Science`) |
| `year_of_study` | Current year: 1, 2, 3, or 4 |
| `ses_status` | Socioeconomic status: `low`, `middle`, or `high` |
| `is_scholarship` | `true` or `false` |
| `is_employed_part_time` | `true` or `false` |
| `distance_from_campus_km` | Distance in kilometres |

The `ses_status`, `is_employed_part_time`, and `distance_from_campus_km` fields feed directly
into the risk prediction model as features. Accurate values improve prediction quality.

---

### Viewing Your Own Account

`GET /api/auth/me` returns the currently logged-in user's details. Useful for confirming which
account is active and what role it has.

---

## 3. Student Profiles

A student profile holds the academic and demographic information about a student. It is linked
one-to-one with the user account.

### Listing All Students

Available to lecturers and admins. Returns all student profiles with their linked user details
(full name).

**Filtering options:**
- `programme` — filter by degree programme (exact match, case-sensitive)
- `year` — filter by year of study (integer)

**Pagination:**
- `skip` — how many records to skip (default 0)
- `limit` — how many to return (default 100, max 500)

**What each result includes:** student number, programme, year of study, SES status,
scholarship and employment flags, distance from campus, and the student's full name.

---

## 4. Courses and Assessments

Courses are the academic units that students are enrolled in. Assessments belong to courses
and are used when recording student results.

### Creating a Course

Available to lecturers and admins.

**What you need:**

| Field | Description |
|---|---|
| `course_code` | Unique code (e.g. `CS301`). Cannot be duplicated. |
| `course_name` | Full name (e.g. `Data Structures & Algorithms`) |
| `credits` | Credit value (default 3) |
| `semester` | Which semester: 1 or 2 |
| `year` | Academic year as an integer (e.g. `2025`) |
| `lecturer_id` | Optional — the user ID of the assigned lecturer |

### Listing Courses

Returns all courses along with their full list of assessments (tests, assignments, exams).
Use this to find `course_id` and `assessment_id` values when recording attendance or results.

### Listing Assessments for a Course

`GET /api/courses/{course_id}/assessments` returns just the assessments for a specific course.
Each assessment includes its name, type (`test`, `assignment`, or `exam`), maximum marks, and
weighting percentage.

> The seed script creates 4 courses and 5 assessments per course. These are already available
> when you run the system for the first time.

---

## 5. Attendance Tracking

Attendance is recorded per student, per course, per week. The system tracks not just physical
attendance but also online engagement.

### Recording Weekly Attendance

Available to lecturers and admins.

**What you need:**

| Field | Description |
|---|---|
| `student_id` | The student's profile ID (from the students list) |
| `course_id` | The course ID (from the courses list) |
| `week_number` | Week of the semester (e.g. `1` through `12`) |
| `classes_held` | How many classes were held that week |
| `classes_attended` | How many the student actually attended |
| `lms_logins` | How many times the student logged into the LMS that week |
| `assignment_submissions` | Number of assignments submitted that week |

**What you get back:** The attendance record with a computed `attendance_rate`
(classes_attended ÷ classes_held, as a decimal between 0 and 1).

**How this affects predictions:**

The attendance records for a student are aggregated each time a prediction runs:

- `attendance_rate` — total attended across all courses and weeks ÷ total held
- `lms_engagement_rate` — total LMS logins ÷ total weeks recorded
- `assignment_submission_rate` — total submissions ÷ total weeks recorded

A student with even one week of low attendance will see their rate pulled down. The more weeks
are recorded, the more accurate and stable these averages become.

### Viewing a Student's Attendance History

`GET /api/attendance/student/{student_id}` returns all attendance records for a student,
ordered by week number. Each record shows the attendance rate for that specific week.

---

## 6. Assessment Results

Assessment results capture how a student performed on each test, assignment, or exam. The
system calculates the percentage score automatically using the assessment's `max_marks`.

### Submitting a Result

Available to lecturers and admins.

**What you need:**

| Field | Description |
|---|---|
| `student_id` | The student's profile ID |
| `assessment_id` | The assessment ID (from the course's assessment list) |
| `marks_obtained` | Marks the student received. Set to `null` if the student did not submit. |
| `submitted_on_time` | `true` or `false` |

**What you get back:** The result with a `percentage` field calculated as
`marks_obtained ÷ max_marks × 100`. If `marks_obtained` is null, `percentage` is also null.

**How this affects predictions:**

All results for a student are read each time a prediction runs:

- `avg_assessment_score` — the mean percentage across all submitted (non-null) results
- `assessments_missed` — count of results where `marks_obtained` is null
- `late_submissions` — count of results where `submitted_on_time` is false

A student with several null results and late submissions will score higher on the risk model.

### Viewing a Student's Results

`GET /api/results/student/{student_id}` returns all results for that student, newest first.

---

## 7. Semester GPA Records

Semester GPAs are the official end-of-semester academic record for a student. They serve two
purposes in AcademIQ:

1. **As a prediction feature** — the most recent recorded GPA is used as `gpa_prior` when the
   prediction model runs. Without any GPA on record, the system defaults to 2.5.

2. **As training labels** — when the ML model is retrained, it uses real GPA values as the
   target variable for the GPA regressor. Students without a recorded GPA are excluded from
   training entirely.

### Recording a Semester GPA

Available to lecturers and admins.

**What you need:**

| Field | Description |
|---|---|
| `student_id` | The student's profile ID |
| `year` | The calendar year (e.g. `2024`) |
| `semester` | 1 or 2 |
| `gpa` | The student's GPA for that semester (0.0 – 4.0) |

### Viewing GPA History

`GET /api/semester-gpa/student/{student_id}` returns all GPA records for that student,
newest first. This allows you to track academic progress across semesters.

---

## 8. Risk Predictions

Risk prediction is the central feature of AcademIQ. It analyses all available data about a
student and produces a risk level, a risk score, a predicted GPA, the top factors driving
the prediction, and personalised recommendations.

### How a Prediction is Produced

When a prediction is requested the system:

1. Reads all attendance records, assessment results, and profile data for the student
2. Calculates 12 numerical features from that data
3. Passes those features through the risk classification model
4. Generates SHAP values to explain which features had the most influence
5. Runs the GPA regressor if it has been trained
6. Produces recommendations based on the feature values and risk level
7. Saves the prediction to the database

### Risk Levels

| Level | Meaning |
|---|---|
| **Low** | Student is on track. No immediate concern. |
| **Medium** | Some warning signs present. Monitor closely. |
| **High** | Multiple risk factors active. Intervention recommended. |
| **Critical** | Student is at serious risk of failing. Immediate action needed. |

### Risk Score

The `risk_score` is a number between 0.0 and 1.0 that quantifies how strongly the model
places the student in their predicted risk level. A score of 0.92 in the Critical category
means the model is highly confident. A score of 0.51 in Medium means borderline.

### Predicted GPA

The `predicted_gpa` field estimates the student's end-of-semester GPA (0.0–4.0) using a
separate regression model. This field is `null` until the GPA regressor has been trained.

### Risk Factors

The `risk_factors` array lists the top 5 features that most influenced the prediction, along
with each feature's current value and its impact score. A positive impact means the feature
is pushing the risk level up; a negative impact means it is pulling it down.

Example for a low-risk student:
```
Class attendance       impact: -0.42   value: 0.92
Assessment performance impact: -0.31   value: 85.3
Prior academic record  impact: -0.18   value: 3.2
```

Example for a critical-risk student:
```
Class attendance       impact: +0.51   value: 0.45
Assessment performance impact: +0.38   value: 32.1
Missed assessments     impact: +0.21   value: 4
```

### Recommendations

Recommendations are plain-English messages generated from the feature values. Each one is
specific to the student's situation:

| Trigger | Recommendation |
|---|---|
| Attendance below 75% | Warning with current percentage, suggestion to speak to lecturer |
| Avg score below 55% | Book tutoring or visit academic support |
| More than 1 missed assessment | Contact lecturer for make-up opportunities |
| LMS logins fewer than 2 per week | Reminder to engage with online materials |
| Employed part-time AND attendance below 80% | Time management and counselling suggestion |
| Risk level is High or Critical | Urgent prompt to see academic advisor |
| None of the above | Positive reinforcement if everything looks good |

### Running a Prediction

**For a specific student (lecturer/admin):**  
`GET /api/predictions/student/{student_id}`

**For the currently logged-in student:**  
`GET /api/predictions/my`

Every call to these endpoints runs a fresh prediction using the latest data and saves the
result to the prediction history.

### Prediction History

`GET /api/predictions/student/{student_id}/history` returns every prediction ever run for
a student, in chronological order. This allows you to track how a student's risk level has
changed over the semester as more data is recorded.

Supports pagination: `?skip=0&limit=50`

### Cohort Risk Summary

`GET /api/predictions/risk-summary` (lecturer/admin only) returns a breakdown of all students'
latest risk levels in a single view:

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

Each student is counted once using their most recent prediction. This is what the lecturer
dashboard uses to show the overall cohort health.

### Training the ML Model

`POST /api/predictions/train` (admin only) triggers a full retraining of both the risk
classifier and the GPA regressor using all data currently in the database.

**Requirements before training will run:**
- At least 10 students must have at least one `SemesterGPA` record each
- Those same students must also have existing risk predictions (used as the risk label)

Before the trained model exists, all predictions fall back to a rule-based scoring system.
After training, all predictions use the XGBoost model with SHAP explanations and the GPA
regressor becomes active.

The trained models are saved to `backend/ml/saved_models/` and persist across server restarts.

---

## 9. Interventions

An intervention is a recorded action taken — or planned — to help a student who has been
identified as at-risk. Interventions create an audit trail and allow lecturers to track
whether actions have been followed through.

### Intervention Types

| Type | Use case |
|---|---|
| `tutoring` | Schedule or refer for peer or academic tutoring |
| `counseling` | Refer to student counselling services |
| `alert` | Flag the student to relevant staff |
| `resource` | Provide or link to specific academic resources |

### Creating an Intervention

Available to lecturers and admins.

**What you need:**

| Field | Description |
|---|---|
| `student_id` | The student's profile ID |
| `intervention_type` | One of the four types above |
| `description` | Free text — what the intervention involves and why |
| `recommended_by` | `"system"` for auto-generated, or a lecturer's user ID |

A newly created intervention has `is_actioned: false` and no `actioned_at` timestamp.

### Actioning an Intervention

`PATCH /api/interventions/{intervention_id}` marks an intervention as completed.

**What you provide:**
- `is_actioned: true`
- `outcome_note` — optional free text describing what happened (e.g. "Student attended
  3 tutoring sessions. Attendance improved to 75%.")

When actioned, the `actioned_at` timestamp is set automatically.

### Viewing Interventions

`GET /api/interventions/student/{student_id}` returns all interventions for a student,
newest first.

Add `?pending_only=true` to show only interventions that have not yet been actioned.
This is useful for a lecturer checking what still needs follow-up.

---

## 10. Dashboards

### Lecturer / Admin Dashboard

The main dashboard view for lecturers and admins shows:
- The cohort risk summary (from `GET /api/predictions/risk-summary`)
- A list of all students with their latest risk levels

From the student list a lecturer can drill into any individual student's dashboard.

### Student Detail View

`GET /api/students/{student_id}/dashboard` returns a full picture of one student:

| Section | What it contains |
|---|---|
| `profile` | Student number, programme, year, SES status, scholarship, employment, distance |
| `current_risk` | A fresh risk prediction generated at the time of the request |
| `attendance_summary` | Total classes held, total attended, overall attendance rate, weeks tracked |
| `recent_results` | Last 5 assessment results with marks and percentage |
| `pending_interventions` | All interventions that have not yet been actioned |

This single endpoint is designed so the frontend can render a complete student view with one
API call. The prediction is run fresh each time the dashboard is loaded, so it always reflects
the most current data.

### Student Self-Dashboard

`GET /api/students/me/dashboard` returns the same structure but scoped to the currently
logged-in student. Students call this to see their own risk level, attendance, and any
interventions created for them.

---

## 11. Scheduled Background Tasks

These tasks run automatically when the Celery worker and beat scheduler are running. They
do not require any manual action once the scheduler is started.

### Nightly Predictions (2:00 AM, every day)

Re-runs the risk prediction for every student in the database and saves each result. This
ensures that by the start of each working day all risk levels reflect the previous day's data
even if no one manually triggered a prediction.

### Weekly Model Retraining (3:00 AM, every Sunday)

Attempts to retrain the XGBoost risk classifier and GPA regressor. If fewer than 10 students
have a recorded `SemesterGPA`, the task logs a message and skips. When enough data exists,
new model files are written to `backend/ml/saved_models/` and immediately used for all
future predictions.

### Weekly Risk Alerts (8:00 AM, every Monday)

Sends an email to every active lecturer listing all students currently at HIGH or CRITICAL
risk. If `EMAIL_ENABLED=false` in `.env` (the default), the alerts are printed to the Celery
worker log instead of sent. See the next section for email configuration.

---

## 12. Email Alerts

Email alerts notify lecturers automatically when students are at serious risk. They are
optional — the rest of the system works without them.

### Enabling Emails

In `backend/.env`, set:

```
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=alerts@academiq.edu
```

For Gmail, `SMTP_PASSWORD` must be an **App Password** (not your regular login password).
Generate one at Google Account → Security → App Passwords.

### What the Alert Email Contains

Each lecturer receives one email per week listing every HIGH and CRITICAL risk student:

```
Subject: AcademIQ Weekly Risk Alert — 4 student(s) need attention

Dear Mr. L. Shumba,

4 student(s) currently require your attention:
  - 21164181 (Computer Science) → CRITICAL (score: 92%)
  - 21164183 (Computer Science) → HIGH (score: 78%)
  - 21164185 (Information Systems) → CRITICAL (score: 88%)
  - 21164188 (Computer Science) → HIGH (score: 71%)

Please log in to AcademIQ to review and create interventions.
```

### Without Email Enabled

When `EMAIL_ENABLED=false`, the `send_risk_alerts` task still runs on schedule. Instead of
sending emails it logs the alert content at `WARNING` level in the Celery worker terminal.
This lets you verify the feature is working without needing SMTP configuration.
