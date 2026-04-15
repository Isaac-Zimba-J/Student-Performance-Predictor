# AcademIQ — Bug Fixes & Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 known bugs and implement 7 missing features so AcademIQ works as a complete, deployable student performance predictor system.

**Architecture:** Full-stack — FastAPI/SQLAlchemy backend + Angular 17 frontend. Bugs are fixed in-place with minimal diff. New features follow the established patterns: Pydantic schemas in `api/schemas.py`, ORM models in `db/models.py` + Alembic migration, routes in `api/routes/`, Angular services in `core/services/api.services.ts` and components under `features/`.

**Tech Stack:** Python 3.11, FastAPI 0.111, SQLAlchemy 2.x, Pydantic v2, XGBoost 2.0.3, Angular 17, TypeScript 5.2

---

## File Map

### Backend — Modified
- `backend/main.py` — Fix CORS wildcard+credentials error; replace deprecated `@app.on_event` with lifespan
- `backend/core/config.py` — Add `ALLOWED_ORIGINS`, SMTP settings
- `backend/core/notifications.py` — **NEW** — configurable email sender (SMTP or log fallback)
- `backend/api/schemas.py` — Fix `PredictionHistoryPoint` field alias; add `full_name` to `StudentProfileOut`; add `SemesterGPACreate/Out`, `CourseCreate`; modernise `Config` → `model_config`
- `backend/db/models.py` — Add `full_name` property to `StudentProfile`; add `SemesterGPA` model
- `backend/alembic/versions/0002_semester_gpa.py` — **NEW** — migration for `semester_gpas` table
- `backend/ml/predictor.py` — Remove deprecated XGBoost param; fix `avg_assessment_score` normalisation; use real `gpa_prior` from DB
- `backend/api/routes/data.py` — Fix `current_risk=None`; eager-load `user` on student queries; add `SemesterGPA` and course-creation routes; add pagination
- `backend/api/routes/predictions.py` — Remove dead `subq` code; add pagination to history endpoint
- `backend/tasks/scheduled.py` — Fix circular retrain; use real email notifications
- `docker-compose.yml` — Add Celery Beat service
- `backend/.env.example` — **NEW**

### Frontend — Modified
- `frontend-angular/src/app/core/models.ts` — Add `full_name` to `StudentProfile`; add `SemesterGPACreate/Out`, `CourseCreate`
- `frontend-angular/src/app/core/services/api.services.ts` — Add `SemesterGPAService`; add `CourseService.create()`; add pagination params to `StudentService.getAll()`
- `frontend-angular/src/app/features/students/student-list/student-list.component.ts` — Show `full_name`; search by name
- `frontend-angular/src/app/features/students/student-detail/student-detail.component.ts` — Remove double `loadHistory()`; add GPA entry form
- `frontend-angular/src/app/features/results/results.component.ts` — Add course creation form

---

## Part A: Bug Fixes

### Task 1: Fix CORS wildcard+credentials and deprecated startup event

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/core/config.py`

`allow_origins=["http://localhost:4200","*"]` combined with `allow_credentials=True` causes Starlette to raise a `ValueError` at startup. Fix by reading origins from settings. Also replace `@app.on_event("startup")` (deprecated FastAPI 0.93+) with a `lifespan` context manager.

- [ ] **Step 1: Update config.py with ALLOWED_ORIGINS**

Replace entire `backend/core/config.py`:
```python
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:yourpassword@127.0.0.1:5432/student_predictor"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:4200"]

    # Email (optional — alerts fall back to logging if EMAIL_ENABLED=False)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "alerts@academiq.edu"
    EMAIL_ENABLED: bool = False

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 2: Replace main.py with lifespan + fixed CORS**

Replace entire `backend/main.py`:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes.auth import router as auth_router
from api.routes.predictions import router as predictions_router
from api.routes.data import (
    courses_router,
    students_router,
    attendance_router,
    results_router,
    interventions_router,
    semester_gpa_router,
)
from core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db.session import engine
    from db.models import Base
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")
    yield


app = FastAPI(
    title="Student Performance Predictor API",
    description="AI-powered system for identifying at-risk students and recommending interventions.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api"
app.include_router(auth_router, prefix=PREFIX)
app.include_router(predictions_router, prefix=PREFIX)
app.include_router(courses_router, prefix=PREFIX)
app.include_router(students_router, prefix=PREFIX)
app.include_router(attendance_router, prefix=PREFIX)
app.include_router(results_router, prefix=PREFIX)
app.include_router(interventions_router, prefix=PREFIX)
app.include_router(semester_gpa_router, prefix=PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
```

- [ ] **Step 3: Verify backend starts without error**

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```
Expected: `✅ Database tables ready` printed, no `ValueError` about CORS wildcards.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/core/config.py
git commit -m "fix: cors wildcard+credentials startup error; replace deprecated startup event with lifespan"
```

---

### Task 2: Fix PredictionHistoryPoint field name mismatch

**Files:**
- Modify: `backend/api/schemas.py`

The ORM model `RiskPrediction` stores the timestamp in `created_at`, but `PredictionHistoryPoint` expects `predicted_at`. With Pydantic v2 `from_attributes=True`, accessing a non-existent attribute causes a 500. Fix with `validation_alias` so the ORM's `created_at` is accepted while the JSON output remains `predicted_at`. Also modernise all `class Config` inner classes to `model_config = ConfigDict(...)` (Pydantic v2 best practice).

- [ ] **Step 1: Rewrite schemas.py with all fixes**

Replace entire `backend/api/schemas.py`:
```python
from pydantic import BaseModel, EmailStr, Field, ConfigDict, AliasChoices
from typing import Optional, List
from datetime import datetime
from db.models import RiskLevel, UserRole, SESStatus


# ─── AUTH ─────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ─── USER ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.STUDENT


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


# ─── STUDENT PROFILE ─────────────────────────────────────────────────────────

class StudentProfileCreate(BaseModel):
    student_number: str
    programme: str
    year_of_study: int = Field(ge=1, le=6)
    ses_status: SESStatus = SESStatus.MIDDLE
    is_scholarship: bool = False
    is_employed_part_time: bool = False
    distance_from_campus_km: float = 0.0


class StudentRegisterRequest(BaseModel):
    """Flat schema accepted by POST /register/student — matches the frontend payload."""
    email: EmailStr
    password: str
    full_name: str
    student_number: str
    programme: str
    year_of_study: int = Field(ge=1, le=6)
    ses_status: SESStatus = SESStatus.MIDDLE
    is_scholarship: bool = False
    is_employed_part_time: bool = False
    distance_from_campus_km: float = 0.0


class StudentProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_number: str
    full_name: str = ""
    programme: str
    year_of_study: int
    ses_status: SESStatus
    is_scholarship: bool
    is_employed_part_time: bool
    distance_from_campus_km: float


# ─── ATTENDANCE ───────────────────────────────────────────────────────────────

class AttendanceCreate(BaseModel):
    student_id: str
    course_id: str
    week_number: int = Field(ge=1, le=52)
    classes_held: int = Field(ge=0)
    classes_attended: int = Field(ge=0)
    lms_logins: int = Field(ge=0, default=0)
    assignment_submissions: int = Field(ge=0, default=0)


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    course_id: str
    week_number: int
    classes_held: int
    classes_attended: int
    lms_logins: int
    assignment_submissions: int
    attendance_rate: float = 0.0
    recorded_at: datetime


# ─── ASSESSMENT RESULT ────────────────────────────────────────────────────────

class AssessmentResultCreate(BaseModel):
    student_id: str
    assessment_id: str
    marks_obtained: Optional[float] = None
    submitted_on_time: bool = True


class AssessmentResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    assessment_id: str
    marks_obtained: Optional[float]
    submitted_on_time: bool
    percentage: Optional[float] = None
    recorded_at: datetime


# ─── RISK PREDICTION ─────────────────────────────────────────────────────────

class RiskFactorDetail(BaseModel):
    factor: str
    impact: float
    value: str


class PredictionOut(BaseModel):
    student_id: str
    student_name: str
    student_number: str
    risk_level: RiskLevel
    risk_score: float
    predicted_gpa: Optional[float]
    risk_factors: List[RiskFactorDetail]
    recommendations: List[str]
    model_version: str
    predicted_at: datetime


# ─── INTERVENTION ─────────────────────────────────────────────────────────────

class InterventionCreate(BaseModel):
    student_id: str
    intervention_type: str
    description: str
    recommended_by: str = "system"


class InterventionUpdate(BaseModel):
    is_actioned: bool
    outcome_note: Optional[str] = None


class InterventionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    intervention_type: str
    description: str
    recommended_by: str
    is_actioned: bool
    outcome_note: Optional[str]
    created_at: datetime
    actioned_at: Optional[datetime]


# ─── PREDICTION HISTORY ───────────────────────────────────────────────────────

class PredictionHistoryPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    risk_level: RiskLevel
    risk_score: float
    predicted_gpa: Optional[float]
    # RiskPrediction stores this as `created_at`; map it to `predicted_at` for the API
    predicted_at: datetime = Field(
        validation_alias=AliasChoices("predicted_at", "created_at")
    )


# ─── COURSES & ASSESSMENTS ───────────────────────────────────────────────────

class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    name: str
    assessment_type: str
    max_marks: float
    weight_percent: float


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    credits: int
    semester: int
    academic_year: str
    total_classes: int
    assessments: List[AssessmentOut] = []


class CourseCreate(BaseModel):
    code: str
    name: str
    credits: int = 3
    semester: int = Field(ge=1, le=2)
    academic_year: str
    total_classes: int = 30
    lecturer_id: Optional[str] = None


# ─── SEMESTER GPA ─────────────────────────────────────────────────────────────

class SemesterGPACreate(BaseModel):
    student_id: str
    academic_year: str
    semester: int = Field(ge=1, le=2)
    gpa: float = Field(ge=0.0, le=4.0)


class SemesterGPAOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    academic_year: str
    semester: int
    gpa: float
    recorded_at: datetime


# ─── DASHBOARD SUMMARIES ──────────────────────────────────────────────────────

class RiskSummary(BaseModel):
    total_students: int
    low_risk: int
    medium_risk: int
    high_risk: int
    critical_risk: int
    at_risk_percentage: float


class StudentDashboard(BaseModel):
    profile: StudentProfileOut
    current_risk: Optional[PredictionOut]
    attendance_summary: dict
    recent_results: List[AssessmentResultOut]
    pending_interventions: List[InterventionOut]
```

- [ ] **Step 2: Verify history endpoint returns data (not 500)**

```bash
cd backend
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"shumba@uni.ac.zm","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

PROFILE_ID=$(curl -s http://localhost:8000/api/students/ \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Run a prediction first to create a history record
curl -s "http://localhost:8000/api/predictions/student/$PROFILE_ID" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

# Then check history — should return [] or a list, never 500
curl -s "http://localhost:8000/api/predictions/student/$PROFILE_ID/history" \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `[]` or a JSON array — no `{"detail": "Internal Server Error"}`.

- [ ] **Step 3: Commit**

```bash
git add backend/api/schemas.py
git commit -m "fix: prediction history 500 - map created_at to predicted_at; modernise Pydantic config"
```

---

### Task 3: Fix XGBoost deprecated parameter

**Files:**
- Modify: `backend/ml/predictor.py`

`use_label_encoder=False` was removed in XGBoost 2.x. With `xgboost==2.0.3` in requirements, calling `train_models()` raises `TypeError`. Remove the parameter.

- [ ] **Step 1: Remove the deprecated parameter**

In `backend/ml/predictor.py`, in the `train_models` function, find and replace:
```python
    clf = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
    )
```
With:
```python
    clf = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        eval_metric="mlogloss",
        random_state=42,
    )
```

- [ ] **Step 2: Verify training runs without error**

```bash
cd backend
python3 -c "
import sys; sys.path.insert(0, '.')
import pandas as pd, numpy as np
from ml.predictor import FEATURE_NAMES, train_models
data = {k: np.random.rand(15) for k in FEATURE_NAMES}
data['risk_label'] = np.random.randint(0, 4, 15)
data['final_gpa'] = np.random.uniform(1.0, 4.0, 15)
result = train_models(pd.DataFrame(data))
print(result)
"
```
Expected: `{'status': 'trained', 'samples': 15}` — no `TypeError`.

- [ ] **Step 3: Commit**

```bash
git add backend/ml/predictor.py
git commit -m "fix: remove use_label_encoder param removed in xgboost 2.x"
```

---

### Task 4: Fix avg_assessment_score normalisation

**Files:**
- Modify: `backend/ml/predictor.py`

`build_features()` averages raw marks (e.g. 37.5 out of 50) across assessments that have different `max_marks` (30, 50, 100). The rule-based thresholds compare it against percentage values (40, 55, 65). Normalise each mark to a percentage before averaging.

- [ ] **Step 1: Replace assessment features block in build_features()**

In `backend/ml/predictor.py`, replace the assessment features section:
```python
    # ── Assessment features ────────────────────────────────────────
    result_rows = db.query(AssessmentResult).filter(
        AssessmentResult.student_id == student_id
    ).all()

    scores = [r.marks_obtained for r in result_rows if r.marks_obtained is not None]
    avg_score = (sum(scores) / len(scores)) if scores else 50.0
    assessments_missed = sum(1 for r in result_rows if r.marks_obtained is None)
    late_submissions = sum(1 for r in result_rows if not r.submitted_on_time)
```

With:
```python
    # ── Assessment features ────────────────────────────────────────
    from sqlalchemy.orm import joinedload as _jl
    result_rows = db.query(AssessmentResult).options(
        _jl(AssessmentResult.assessment)
    ).filter(
        AssessmentResult.student_id == student_id
    ).all()

    # Normalise to percentage using each assessment's own max_marks
    pct_scores = [
        (r.marks_obtained / r.assessment.max_marks * 100)
        for r in result_rows
        if r.marks_obtained is not None
        and r.assessment is not None
        and r.assessment.max_marks
    ]
    avg_score = (sum(pct_scores) / len(pct_scores)) if pct_scores else 50.0
    assessments_missed = sum(1 for r in result_rows if r.marks_obtained is None)
    late_submissions = sum(1 for r in result_rows if not r.submitted_on_time)
```

- [ ] **Step 2: Verify prediction still returns valid output**

```bash
curl -s "http://localhost:8000/api/predictions/student/$PROFILE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
# avg_assessment_score should now be 0-100 range
raw = d.get('risk_factors', [])
print('risk_level:', d.get('risk_level'))
print('risk_score:', d.get('risk_score'))
"
```
Expected: Valid JSON with a `risk_level` value.

- [ ] **Step 3: Commit**

```bash
git add backend/ml/predictor.py
git commit -m "fix: normalize assessment scores to % before averaging (was comparing raw marks to % thresholds)"
```

---

### Task 5: Fix StudentDashboard current_risk always None

**Files:**
- Modify: `backend/api/routes/data.py`

`_build_dashboard()` hardcodes `current_risk=None`. The prediction import is there but unused. Fix by actually calling `predict_student_risk()` and building a `PredictionOut`.

- [ ] **Step 1: Replace _build_dashboard() in data.py**

In `backend/api/routes/data.py`, replace the entire `_build_dashboard` function:
```python
def _build_dashboard(profile: StudentProfile, db: Session) -> StudentDashboard:
    from ml.predictor import predict_student_risk, generate_recommendations
    from api.schemas import RiskFactorDetail, PredictionOut as PredOut
    from db.models import RiskPrediction as RiskPred
    from datetime import datetime
    import json

    attendance_rows = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == profile.id
    ).all()
    total_held = sum(r.classes_held for r in attendance_rows) or 1
    total_attended = sum(r.classes_attended for r in attendance_rows)
    attendance_summary = {
        "total_classes_held": total_held,
        "total_classes_attended": total_attended,
        "attendance_rate": round(total_attended / total_held * 100, 1),
        "weeks_tracked": len(attendance_rows),
    }

    recent_results = (
        db.query(AssessmentResult)
        .filter(AssessmentResult.student_id == profile.id)
        .order_by(AssessmentResult.recorded_at.desc())
        .limit(5)
        .all()
    )

    pending_interventions = (
        db.query(Intervention)
        .filter(Intervention.student_id == profile.id, Intervention.is_actioned == False)
        .order_by(Intervention.created_at.desc())
        .all()
    )

    # Generate current risk prediction
    current_risk_out = None
    result = predict_student_risk(profile.id, db)
    if result is not None:
        recommendations = generate_recommendations(result)
        prediction_record = RiskPred(
            student_id=profile.id,
            risk_level=result["risk_level"],
            risk_score=result["risk_score"],
            predicted_gpa=result.get("predicted_gpa"),
            top_risk_factors=json.dumps(result["risk_factors"]),
        )
        db.add(prediction_record)
        db.commit()

        user = profile.user
        current_risk_out = PredOut(
            student_id=profile.id,
            student_name=user.full_name,
            student_number=profile.student_number,
            risk_level=result["risk_level"],
            risk_score=result["risk_score"],
            predicted_gpa=result.get("predicted_gpa"),
            risk_factors=[RiskFactorDetail(**f) for f in result["risk_factors"]],
            recommendations=recommendations,
            model_version="v1",
            predicted_at=datetime.utcnow(),
        )

    return StudentDashboard(
        profile=StudentProfileOut.model_validate(profile),
        current_risk=current_risk_out,
        attendance_summary=attendance_summary,
        recent_results=[AssessmentResultOut.model_validate(r) for r in recent_results],
        pending_interventions=[InterventionOut.model_validate(i) for i in pending_interventions],
    )
```

- [ ] **Step 2: Verify dashboard returns current_risk**

```bash
STUDENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@uni.ac.zm","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8000/api/students/me/dashboard \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('current_risk is not None:', d.get('current_risk') is not None)
print('risk_level:', (d.get('current_risk') or {}).get('risk_level'))
"
```
Expected: `current_risk is not None: True` and a `risk_level` value.

- [ ] **Step 3: Commit**

```bash
git add backend/api/routes/data.py
git commit -m "fix: student dashboard now populates current_risk (was always None)"
```

---

### Task 6: Remove dead subquery in risk_summary

**Files:**
- Modify: `backend/api/routes/predictions.py`

The unused `subq` block in `risk_summary` builds a correlated subquery that is never referenced — the actual dedup happens in the Python loop below it. Remove the dead code.

- [ ] **Step 1: Replace the risk_summary function body**

In `backend/api/routes/predictions.py`, replace the `risk_summary` function:
```python
@router.get("/risk-summary", response_model=RiskSummary)
def risk_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    """Cohort-level risk breakdown for the dashboard."""
    from db.models import RiskLevel as RL

    all_predictions = db.query(RiskPrediction).order_by(
        RiskPrediction.student_id, RiskPrediction.created_at.desc()
    ).all()

    seen = set()
    latest = []
    for p in all_predictions:
        if p.student_id not in seen:
            seen.add(p.student_id)
            latest.append(p)

    counts = {RL.LOW: 0, RL.MEDIUM: 0, RL.HIGH: 0, RL.CRITICAL: 0}
    for p in latest:
        counts[p.risk_level] = counts.get(p.risk_level, 0) + 1

    total = len(latest) or 1
    at_risk = counts[RL.HIGH] + counts[RL.CRITICAL]

    return RiskSummary(
        total_students=total,
        low_risk=counts[RL.LOW],
        medium_risk=counts[RL.MEDIUM],
        high_risk=counts[RL.HIGH],
        critical_risk=counts[RL.CRITICAL],
        at_risk_percentage=round(at_risk / total * 100, 1),
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/routes/predictions.py
git commit -m "fix: remove unused dead subquery in risk_summary"
```

---

### Task 7: Add Celery Beat to docker-compose and create .env.example

**Files:**
- Modify: `docker-compose.yml`
- Create: `backend/.env.example`

Without a Beat service, none of the scheduled tasks (nightly predictions, weekly retraining, weekly alerts) ever fire.

- [ ] **Step 1: Add beat service to docker-compose.yml**

In `docker-compose.yml`, add this service after `worker:` (before `volumes:`):
```yaml
  # ── Celery Beat (cron scheduler) ─────────────────────────────
  beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A tasks.celery_app beat --loglevel=info
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/student_predictor
      REDIS_URL: redis://redis:6379/0
      SECRET_KEY: change-this-in-production-please
    depends_on:
      - db
      - redis
    volumes:
      - model_data:/app/ml/saved_models
```

- [ ] **Step 2: Create backend/.env.example**

Create file `backend/.env.example`:
```
# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/student_predictor

# ── Redis / Celery ────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── JWT ───────────────────────────────────────────────────────
SECRET_KEY=change-this-to-a-long-random-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ── CORS (JSON list of allowed frontend origins) ──────────────
ALLOWED_ORIGINS=["http://localhost:4200"]

# ── Email alerts (set EMAIL_ENABLED=true to send real emails) ─
EMAIL_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=yourapppassword
SMTP_FROM=alerts@academiq.edu

# ── Environment ───────────────────────────────────────────────
ENVIRONMENT=development
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml backend/.env.example
git commit -m "fix: add celery beat scheduler to docker-compose; add .env.example"
```

---

### Task 8: Fix double loadHistory() call in frontend

**Files:**
- Modify: `frontend-angular/src/app/features/students/student-detail/student-detail.component.ts`

`ngOnInit` calls `loadHistory()` once. `loadPrediction`'s success callback calls it again. This fires two simultaneous HTTP requests on every page load.

- [ ] **Step 1: Remove redundant loadHistory() from loadPrediction**

In `student-detail.component.ts`, replace the `loadPrediction` method:
```typescript
loadPrediction() {
  this.loadingPred = true;
  this.predService.getStudentPrediction(this.studentId).subscribe({
    next: p => { this.prediction = p; this.loadingPred = false; },
    error: () => { this.predError = 'Not enough data to generate prediction yet.'; this.loadingPred = false; },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-angular/src/app/features/students/student-detail/student-detail.component.ts
git commit -m "fix: remove duplicate loadHistory() call triggered inside loadPrediction success"
```

---

## Part B: Missing Features

### Task 9: Show student full name throughout the UI

**Files:**
- Modify: `backend/db/models.py`
- Modify: `backend/api/routes/data.py`
- Modify: `frontend-angular/src/app/core/models.ts`
- Modify: `frontend-angular/src/app/features/students/student-list/student-list.component.ts`

`StudentProfileOut` has no `full_name`. The student list shows only student numbers. `StudentProfile` has a `user` relationship — add a `@property` to the ORM model and eager-load the relation in queries.

- [ ] **Step 1: Add full_name property to StudentProfile ORM model**

In `backend/db/models.py`, add after the `interventions` relationship in `StudentProfile`:
```python
    @property
    def full_name(self) -> str:
        return self.user.full_name if self.user else ""
```

- [ ] **Step 2: Eager-load user in list_students and dashboard routes**

In `backend/api/routes/data.py`, add `joinedload` import at the top:
```python
from sqlalchemy.orm import joinedload
```

Replace `list_students`:
```python
@students_router.get("/", response_model=List[StudentProfileOut])
def list_students(
    programme: Optional[str] = None,
    year: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    q = db.query(StudentProfile).options(joinedload(StudentProfile.user))
    if programme:
        q = q.filter(StudentProfile.programme == programme)
    if year:
        q = q.filter(StudentProfile.year_of_study == year)
    return q.offset(skip).limit(limit).all()
```

Replace `my_dashboard`:
```python
@students_router.get("/me/dashboard", response_model=StudentDashboard)
def my_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = (
        db.query(StudentProfile)
        .options(joinedload(StudentProfile.user))
        .filter(StudentProfile.user_id == current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return _build_dashboard(profile, db)
```

Replace `student_dashboard`:
```python
@students_router.get("/{student_id}/dashboard", response_model=StudentDashboard)
def student_dashboard(
    student_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    profile = (
        db.query(StudentProfile)
        .options(joinedload(StudentProfile.user))
        .filter(StudentProfile.id == student_id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Student not found")
    return _build_dashboard(profile, db)
```

Also add `Query` to the import at the top of `data.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Query
```

- [ ] **Step 3: Add full_name to Angular StudentProfile model**

In `frontend-angular/src/app/core/models.ts`, update `StudentProfile`:
```typescript
export interface StudentProfile {
  id: string;
  student_number: string;
  full_name: string;
  programme: string;
  year_of_study: number;
  ses_status: SESStatus;
  is_scholarship: boolean;
  is_employed_part_time: boolean;
  distance_from_campus_km: number;
}
```

- [ ] **Step 4: Show name in student-list component**

In `student-list.component.ts`, replace the student number `<td>`:
```html
<td>
  <div class="student-name">{{ s.full_name }}</div>
  <div style="font-size:11px;color:var(--muted2)">{{ s.student_number }}</div>
</td>
```

Update `filterStudents()` to also search by name:
```typescript
filterStudents() {
  this.filtered = this.students.filter(s => {
    const q = this.searchQuery.toLowerCase();
    const matchesSearch = !q ||
      s.student_number.toLowerCase().includes(q) ||
      s.full_name.toLowerCase().includes(q) ||
      s.programme.toLowerCase().includes(q);
    const matchesYear = !this.filterYear || s.year_of_study === +this.filterYear;
    return matchesSearch && matchesYear;
  });
}
```

- [ ] **Step 5: Verify student list shows names**

Navigate to `http://localhost:4200/students` — student names should appear above student numbers.

- [ ] **Step 6: Commit**

```bash
git add backend/db/models.py backend/api/routes/data.py \
  frontend-angular/src/app/core/models.ts \
  frontend-angular/src/app/features/students/student-list/student-list.component.ts
git commit -m "feat: add student full_name to profile output and student list"
```

---

### Task 10: Historical GPA table, API, and prediction integration

**Files:**
- Modify: `backend/db/models.py`
- Create: `backend/alembic/versions/0002_semester_gpa.py`
- Modify: `backend/api/routes/data.py`
- Modify: `backend/ml/predictor.py`
- Modify: `frontend-angular/src/app/core/models.ts`
- Modify: `frontend-angular/src/app/core/services/api.services.ts`
- Modify: `frontend-angular/src/app/features/students/student-detail/student-detail.component.ts`

`gpa_prior` is hardcoded to 2.5 for every student because there's no historical GPA storage. This feature adds a `semester_gpas` table, an API to record them, and updates `build_features()` to use the latest real value.

- [ ] **Step 1: Add SemesterGPA ORM model**

In `backend/db/models.py`, add the `semester_gpas` relationship to `StudentProfile` after the `interventions` relationship:
```python
    semester_gpas = relationship(
        "SemesterGPA", back_populates="student",
        order_by="SemesterGPA.recorded_at.desc()"
    )
```

Add the new model at the bottom of the file (after `Intervention`):
```python
# ─── SEMESTER GPA ─────────────────────────────────────────────────────────────

class SemesterGPA(Base):
    __tablename__ = "semester_gpas"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("student_profiles.id"), nullable=False)
    academic_year = Column(String, nullable=False)   # e.g. "2024"
    semester = Column(Integer, nullable=False)        # 1 or 2
    gpa = Column(Float, nullable=False)              # 0.0 – 4.0
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("StudentProfile", back_populates="semester_gpas")
```

- [ ] **Step 2: Create Alembic migration**

Create `backend/alembic/versions/0002_semester_gpa.py`:
```python
"""Add semester_gpas table

Revision ID: 0002_semester_gpa
Revises: 0001_initial
Create Date: 2026-04-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_semester_gpa'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('semester_gpas',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('academic_year', sa.String(), nullable=False),
        sa.Column('semester', sa.Integer(), nullable=False),
        sa.Column('gpa', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_semester_gpas_student_id', 'semester_gpas', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_semester_gpas_student_id', table_name='semester_gpas')
    op.drop_table('semester_gpas')
```

Run the migration:
```bash
cd backend
alembic upgrade head
```
Expected output: `Running upgrade 0001_initial -> 0002_semester_gpa, Add semester_gpas table`

- [ ] **Step 3: Add semester_gpa_router to data.py**

In `backend/api/routes/data.py`, add these imports:
```python
from db.models import SemesterGPA
from api.schemas import SemesterGPACreate, SemesterGPAOut
```

Add at the bottom of the file (before the final blank line):
```python
# ─── SEMESTER GPA ─────────────────────────────────────────────────────────────

semester_gpa_router = APIRouter(prefix="/semester-gpa", tags=["Semester GPA"])


@semester_gpa_router.post("/", response_model=SemesterGPAOut, status_code=201)
def record_semester_gpa(
    data: SemesterGPACreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    """Record a student's GPA for a completed semester."""
    record = SemesterGPA(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return SemesterGPAOut.model_validate(record)


@semester_gpa_router.get("/student/{student_id}", response_model=List[SemesterGPAOut])
def get_semester_gpas(
    student_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(SemesterGPA)
        .filter(SemesterGPA.student_id == student_id)
        .order_by(SemesterGPA.recorded_at.desc())
        .all()
    )
```

- [ ] **Step 4: Update build_features() to use real gpa_prior**

In `backend/ml/predictor.py`, add `SemesterGPA` to the model import:
```python
from db.models import StudentProfile, AttendanceRecord, AssessmentResult, RiskLevel, SemesterGPA
```

Add this helper function directly above `build_features`:
```python
def _get_prior_gpa(student_id: str, db: Session) -> float:
    """Return the most recent recorded semester GPA, or 2.5 if none exists."""
    record = (
        db.query(SemesterGPA)
        .filter(SemesterGPA.student_id == student_id)
        .order_by(SemesterGPA.recorded_at.desc())
        .first()
    )
    return record.gpa if record else 2.5
```

In `build_features()`, replace:
```python
        "gpa_prior": 2.5,  # placeholder — load from historical table when available
```
With:
```python
        "gpa_prior": _get_prior_gpa(student_id, db),
```

- [ ] **Step 5: Add Angular models**

In `frontend-angular/src/app/core/models.ts`, add at the bottom (before the final blank line):
```typescript
// ── Semester GPA ──────────────────────────────────────────────
export interface SemesterGPACreate {
  student_id: string;
  academic_year: string;
  semester: number;
  gpa: number;
}

export interface SemesterGPAOut {
  id: string;
  student_id: string;
  academic_year: string;
  semester: number;
  gpa: number;
  recorded_at: string;
}
```

- [ ] **Step 6: Add SemesterGPAService to api.services.ts**

In `frontend-angular/src/app/core/services/api.services.ts`, add at the bottom:
```typescript
// ── Semester GPA Service ──────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class SemesterGPAService {
  constructor(private http: HttpClient) {}

  record(data: SemesterGPACreate): Observable<SemesterGPAOut> {
    return this.http.post<SemesterGPAOut>(`${API}/semester-gpa/`, data);
  }

  getForStudent(studentId: string): Observable<SemesterGPAOut[]> {
    return this.http.get<SemesterGPAOut[]>(`${API}/semester-gpa/student/${studentId}`);
  }
}
```

Add to the top-level import from models:
```typescript
import {
  PredictionOut, PredictionHistoryPoint, RiskSummary, StudentProfile, StudentDashboard,
  AttendanceCreate, AttendanceOut, InterventionCreate, InterventionOut,
  CourseOut, CourseCreate, AssessmentResultCreate, AssessmentResultOut,
  SemesterGPACreate, SemesterGPAOut,
} from '../models';
```

- [ ] **Step 7: Add GPA entry form to student-detail component**

In `student-detail.component.ts`, add to the imports at the top of the file:
```typescript
import { SemesterGPAService } from '../../../core/services/api.services';
import { SemesterGPAOut } from '../../../core/models';
```

Add to the class properties (after `intSuccess = ''`):
```typescript
semesterGpas: SemesterGPAOut[] = [];
gpaForm = { academic_year: new Date().getFullYear().toString(), semester: 1, gpa: 2.5 };
savingGpa = false;
gpaSuccess = false;
```

Add `SemesterGPAService` to the constructor:
```typescript
constructor(
  private route: ActivatedRoute,
  private predService: PredictionService,
  private interventionService: InterventionService,
  private attendanceService: AttendanceService,
  private auth: AuthService,
  private gpaService: SemesterGPAService,
) {}
```

In `ngOnInit()`, add `this.loadGPAs();` after `this.loadInterventions();`.

Add these methods to the class (after `createIntervention()`):
```typescript
loadGPAs() {
  this.gpaService.getForStudent(this.studentId).subscribe({
    next: data => this.semesterGpas = data,
  });
}

saveGPA() {
  this.savingGpa = true;
  this.gpaService.record({ ...this.gpaForm, student_id: this.studentId }).subscribe({
    next: g => {
      this.semesterGpas = [g, ...this.semesterGpas];
      this.savingGpa = false;
      this.gpaSuccess = true;
      setTimeout(() => this.gpaSuccess = false, 3000);
    },
    error: () => { this.savingGpa = false; },
  });
}
```

Add this card to the template, after the interventions card:
```html
<!-- Semester GPA record -->
<div class="card" style="margin-top:20px">
  <div class="card-title">Record semester GPA</div>
  <div class="form-row">
    <div class="form-group">
      <label>Academic year</label>
      <input type="text" [(ngModel)]="gpaForm.academic_year" placeholder="2024">
    </div>
    <div class="form-group">
      <label>Semester</label>
      <select [(ngModel)]="gpaForm.semester">
        <option [ngValue]="1">Semester 1</option>
        <option [ngValue]="2">Semester 2</option>
      </select>
    </div>
    <div class="form-group">
      <label>GPA (0.0–4.0)</label>
      <input type="number" [(ngModel)]="gpaForm.gpa" min="0" max="4" step="0.1">
    </div>
  </div>
  <button class="btn-sm primary" (click)="saveGPA()" [disabled]="savingGpa">
    {{ savingGpa ? 'Saving...' : 'Save GPA' }}
  </button>
  <span *ngIf="gpaSuccess" style="color:var(--green);font-size:13px;margin-left:12px">✓ GPA recorded</span>
  <div *ngIf="semesterGpas.length > 0" style="margin-top:12px;font-size:12px;color:var(--muted2)">
    <span *ngFor="let g of semesterGpas" style="margin-right:16px">
      {{ g.academic_year }} S{{ g.semester }}: <strong style="color:var(--text)">{{ g.gpa.toFixed(2) }}</strong>
    </span>
  </div>
</div>
```

- [ ] **Step 8: Verify GPA API end-to-end**

```bash
PROFILE_ID=$(curl -s http://localhost:8000/api/students/ \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Record a GPA
curl -s -X POST http://localhost:8000/api/semester-gpa/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"student_id\": \"$PROFILE_ID\", \"academic_year\": \"2024\", \"semester\": 1, \"gpa\": 3.2}" \
  | python3 -m json.tool
```
Expected: JSON object with `"gpa": 3.2`.

```bash
# Verify prediction uses it
curl -s "http://localhost:8000/api/predictions/student/$PROFILE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Has prediction:', d.get('risk_level') is not None)
"
```
Expected: `Has prediction: True` — no server error.

- [ ] **Step 9: Commit**

```bash
git add backend/db/models.py \
  backend/alembic/versions/0002_semester_gpa.py \
  backend/api/routes/data.py \
  backend/ml/predictor.py \
  frontend-angular/src/app/core/models.ts \
  frontend-angular/src/app/core/services/api.services.ts \
  frontend-angular/src/app/features/students/student-detail/student-detail.component.ts
git commit -m "feat: add semester GPA table, API, and wire into gpa_prior prediction feature"
```

---

### Task 11: Course creation API and UI

**Files:**
- Modify: `backend/api/routes/data.py`
- Modify: `frontend-angular/src/app/core/services/api.services.ts`
- Modify: `frontend-angular/src/app/features/results/results.component.ts`

Courses can only be added via the seed script. Add `POST /courses` and a creation form in the Results page.

- [ ] **Step 1: Add POST /courses endpoint to data.py**

In `backend/api/routes/data.py`, add to `courses_router` (after `list_assessments`):
```python
@courses_router.post("/", response_model=CourseOut, status_code=201)
def create_course(
    data: CourseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    """Create a new course. Course code must be unique."""
    existing = db.query(Course).filter(Course.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Course code '{data.code}' already exists")
    course = Course(**data.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    out = CourseOut.model_validate(course)
    out.assessments = []
    return out
```

Update the imports in `data.py` to include `CourseCreate`:
```python
from api.schemas import (
    AttendanceCreate, AttendanceOut,
    AssessmentResultCreate, AssessmentResultOut,
    InterventionCreate, InterventionUpdate, InterventionOut,
    StudentDashboard, StudentProfileOut,
    CourseOut, CourseCreate, AssessmentOut,
    SemesterGPACreate, SemesterGPAOut,
)
```

- [ ] **Step 2: Add CourseCreate model to Angular models.ts**

In `frontend-angular/src/app/core/models.ts`, add after `CourseOut`:
```typescript
export interface CourseCreate {
  code: string;
  name: string;
  credits: number;
  semester: number;
  academic_year: string;
  total_classes: number;
  lecturer_id?: string;
}
```

- [ ] **Step 3: Add create() method to CourseService**

In `api.services.ts`, replace `CourseService`:
```typescript
@Injectable({ providedIn: 'root' })
export class CourseService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<CourseOut[]> {
    return this.http.get<CourseOut[]>(`${API}/courses/`);
  }

  create(data: CourseCreate): Observable<CourseOut> {
    return this.http.post<CourseOut>(`${API}/courses/`, data);
  }
}
```

Update the import in `api.services.ts`:
```typescript
import {
  PredictionOut, PredictionHistoryPoint, RiskSummary, StudentProfile, StudentDashboard,
  AttendanceCreate, AttendanceOut, InterventionCreate, InterventionOut,
  CourseOut, CourseCreate, AssessmentResultCreate, AssessmentResultOut,
  SemesterGPACreate, SemesterGPAOut,
} from '../models';
```

- [ ] **Step 4: Add course creation form to results.component.ts**

In `results.component.ts`, add these properties to the class:
```typescript
showCourseForm = false;
savingCourse = false;
courseSuccess = false;
courseError = '';
newCourse: CourseCreate = {
  code: '', name: '', credits: 3, semester: 1,
  academic_year: new Date().getFullYear().toString(), total_classes: 30,
};
```

Add the `saveCourse()` method to the class:
```typescript
saveCourse() {
  if (!this.newCourse.code || !this.newCourse.name) return;
  this.savingCourse = true; this.courseError = '';
  this.courseService.create(this.newCourse).subscribe({
    next: course => {
      this.courses = [...this.courses, course];
      this.savingCourse = false;
      this.courseSuccess = true;
      this.showCourseForm = false;
      this.newCourse = {
        code: '', name: '', credits: 3, semester: 1,
        academic_year: new Date().getFullYear().toString(), total_classes: 30,
      };
      setTimeout(() => this.courseSuccess = false, 3000);
    },
    error: e => {
      this.savingCourse = false;
      this.courseError = e.error?.detail || 'Failed to create course';
    },
  });
}
```

In the template, replace the course overview section header to add the toggle button and the creation form. Replace:
```html
    <!-- Course overview table -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">Courses &amp; assessments</div>
```
With:
```html
    <!-- Course overview table -->
    <div class="card" style="margin-top:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="card-title" style="margin:0">Courses &amp; assessments</div>
        <button class="btn-sm primary" (click)="showCourseForm = !showCourseForm">+ Add course</button>
      </div>
      <div *ngIf="courseSuccess" style="color:var(--green);font-size:13px;margin-bottom:12px">✓ Course created successfully</div>

      <!-- Course creation form -->
      <div *ngIf="showCourseForm" style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px">
        <div class="card-title">New course</div>
        <div class="form-row">
          <div class="form-group">
            <label>Course code</label>
            <input type="text" [(ngModel)]="newCourse.code" placeholder="CS401">
          </div>
          <div class="form-group">
            <label>Course name</label>
            <input type="text" [(ngModel)]="newCourse.name" placeholder="Algorithms">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Credits</label>
            <input type="number" [(ngModel)]="newCourse.credits" min="1" max="6">
          </div>
          <div class="form-group">
            <label>Semester</label>
            <select [(ngModel)]="newCourse.semester">
              <option [ngValue]="1">Semester 1</option>
              <option [ngValue]="2">Semester 2</option>
            </select>
          </div>
          <div class="form-group">
            <label>Academic year</label>
            <input type="text" [(ngModel)]="newCourse.academic_year" placeholder="2024">
          </div>
          <div class="form-group">
            <label>Total classes</label>
            <input type="number" [(ngModel)]="newCourse.total_classes" min="1">
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn-sm primary" (click)="saveCourse()" [disabled]="savingCourse">
            {{ savingCourse ? 'Saving...' : 'Create course' }}
          </button>
          <button class="btn-sm secondary" (click)="showCourseForm = false">Cancel</button>
          <span *ngIf="courseError" style="color:var(--red);font-size:13px">{{ courseError }}</span>
        </div>
      </div>
```

- [ ] **Step 5: Verify course creation**

Navigate to `http://localhost:4200/results`, click **+ Add course**, fill in the form, submit. The new course should appear in the courses table below.

```bash
curl -s -X POST http://localhost:8000/api/courses/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"CS999","name":"Test Course","credits":3,"semester":1,"academic_year":"2024","total_classes":30}' \
  | python3 -m json.tool
```
Expected: JSON with `"code": "CS999"`.

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes/data.py \
  frontend-angular/src/app/core/models.ts \
  frontend-angular/src/app/core/services/api.services.ts \
  frontend-angular/src/app/features/results/results.component.ts
git commit -m "feat: add course creation endpoint and UI form in results page"
```

---

### Task 12: Configurable email notification system

**Files:**
- Create: `backend/core/notifications.py`
- Modify: `backend/tasks/scheduled.py`

Replace the pure `log.warning()` alert with an email sender that uses `smtplib`. Falls back to logging when `EMAIL_ENABLED=False` (the default).

- [ ] **Step 1: Create backend/core/notifications.py**

Create `backend/core/notifications.py`:
```python
"""
Email notification helper.

Uses Python's built-in smtplib. Falls back to structured logging
when EMAIL_ENABLED=False (the default for dev environments).
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send a plain-text email. Returns True on success, False on failure.
    Falls back to logging if EMAIL_ENABLED is False.
    """
    settings = get_settings()

    if not settings.EMAIL_ENABLED:
        log.warning(f"[EMAIL → {to}] Subject: {subject}\n{body}")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())

        log.info(f"Email sent to {to}: {subject}")
        return True

    except Exception as e:
        log.error(f"Failed to send email to {to}: {e}")
        return False
```

- [ ] **Step 2: Update send_risk_alerts to use send_email**

In `backend/tasks/scheduled.py`, replace the `send_risk_alerts` task:
```python
@celery_app.task(name="tasks.scheduled.send_risk_alerts")
def send_risk_alerts():
    """
    Collect all CRITICAL and HIGH risk students and notify lecturers.
    Set EMAIL_ENABLED=true and configure SMTP in .env to send real emails.
    Without SMTP config, alerts are logged at WARNING level.
    """
    from core.notifications import send_email

    db = SessionLocal()
    try:
        all_preds = (
            db.query(RiskPrediction)
            .order_by(RiskPrediction.student_id, RiskPrediction.created_at.desc())
            .all()
        )
        seen = set()
        at_risk = []
        for p in all_preds:
            if p.student_id not in seen:
                seen.add(p.student_id)
                if p.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                    at_risk.append(p)

        if not at_risk:
            log.info("No at-risk students to alert.")
            return {"alerts_sent": 0}

        lecturers = db.query(User).filter(
            User.role == UserRole.LECTURER, User.is_active == True
        ).all()

        sent = 0
        for lecturer in lecturers:
            student_lines = []
            for p in at_risk:
                profile = db.query(StudentProfile).filter(
                    StudentProfile.id == p.student_id
                ).first()
                if profile:
                    student_lines.append(
                        f"  - {profile.student_number} ({profile.programme}) "
                        f"→ {p.risk_level.value.upper()} (score: {round(p.risk_score * 100)}%)"
                    )

            subject = f"AcademIQ Weekly Risk Alert — {len(at_risk)} student(s) need attention"
            body = (
                f"Dear {lecturer.full_name},\n\n"
                f"{len(at_risk)} student(s) currently require your attention:\n"
                + "\n".join(student_lines)
                + "\n\nPlease log in to AcademIQ to review and create interventions."
            )

            if send_email(lecturer.email, subject, body):
                sent += 1

        return {"alerts_sent": sent, "at_risk_students": len(at_risk)}

    finally:
        db.close()
```

- [ ] **Step 3: Commit**

```bash
git add backend/core/notifications.py backend/tasks/scheduled.py
git commit -m "feat: replace log-only alerts with configurable smtplib email sender"
```

---

### Task 13: Fix circular retrain — use real GPA labels

**Files:**
- Modify: `backend/tasks/scheduled.py`

The weekly retrain uses `latest_pred.predicted_gpa` (the model's own output) as the `final_gpa` training label. This means the model trains on its own predictions instead of real outcomes. Fix it to only train when real `SemesterGPA` records exist.

- [ ] **Step 1: Replace retrain_models task**

In `backend/tasks/scheduled.py`, add `SemesterGPA` to the model import:
```python
from db.models import StudentProfile, RiskPrediction, RiskLevel, User, UserRole, SemesterGPA
```

Replace the `retrain_models` function:
```python
@celery_app.task(bind=True, name="tasks.scheduled.retrain_models", max_retries=1)
def retrain_models(self):
    """
    Retrain XGBoost and GPA models from labelled data.
    Uses real SemesterGPA records as the final_gpa label.
    Skips training if fewer than 10 students have real GPA records.
    """
    import pandas as pd
    from ml.predictor import build_features, train_models, FEATURE_NAMES

    db = SessionLocal()
    try:
        students = db.query(StudentProfile).all()
        records = []
        risk_label_map = {"low": 0, "medium": 1, "high": 2, "critical": 3}

        for profile in students:
            features = build_features(profile.id, db)
            if not features:
                continue

            # Only use students with a real recorded semester GPA
            real_gpa = (
                db.query(SemesterGPA)
                .filter(SemesterGPA.student_id == profile.id)
                .order_by(SemesterGPA.recorded_at.desc())
                .first()
            )
            if not real_gpa:
                continue

            latest_pred = (
                db.query(RiskPrediction)
                .filter(RiskPrediction.student_id == profile.id)
                .order_by(RiskPrediction.created_at.desc())
                .first()
            )
            if not latest_pred:
                continue

            features["risk_label"] = risk_label_map.get(latest_pred.risk_level.value, 1)
            features["final_gpa"] = real_gpa.gpa
            records.append(features)

        if len(records) < 10:
            log.info(
                f"Skipping retrain — only {len(records)} students have real GPA labels "
                f"(need 10+). Record semester GPAs via the API to enable model training."
            )
            return {"skipped": True, "records": len(records)}

        df = pd.DataFrame(records)
        result = train_models(df)
        log.info(f"Model retrain complete: {result}")
        return result

    except Exception as exc:
        log.error(f"retrain_models failed: {exc}")
        raise self.retry(exc=exc, countdown=600)
    finally:
        db.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/tasks/scheduled.py
git commit -m "fix: retrain_models now uses real SemesterGPA labels instead of its own predictions"
```

---

### Task 14: Add pagination to list endpoints

**Files:**
- Modify: `backend/api/routes/predictions.py`

`list_students` pagination was added in Task 9. This task adds pagination to the prediction history endpoint which can grow large as nightly runs accumulate.

- [ ] **Step 1: Add pagination to get_prediction_history**

In `backend/api/routes/predictions.py`, add `Query` to the FastAPI import:
```python
from fastapi import APIRouter, Depends, HTTPException, Query
```

Replace `get_prediction_history`:
```python
@router.get("/student/{student_id}/history", response_model=list[PredictionHistoryPoint])
def get_prediction_history(
    student_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All past predictions for a student, oldest first."""
    profile = db.query(StudentProfile).filter(StudentProfile.id == student_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Student not found")
    if current_user.role.value == "student" and profile.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    records = (
        db.query(RiskPrediction)
        .filter(RiskPrediction.student_id == student_id)
        .order_by(RiskPrediction.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [PredictionHistoryPoint.model_validate(r) for r in records]
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/routes/predictions.py
git commit -m "feat: add skip/limit pagination to prediction history endpoint"
```

---

## Final Verification

- [ ] **Run seed and smoke-test the full flow**

```bash
cd backend
# Start dependencies
docker compose up -d db redis

# Run migrations
alembic upgrade head

# Seed demo data
python seed.py

# Start API
python -m uvicorn main:app --reload --port 8000 &

# Smoke test
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"shumba@uni.ac.zm","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "--- Students (with names) ---"
curl -s http://localhost:8000/api/students/ -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; [print(s['full_name'], s['student_number']) for s in json.load(sys.stdin)]"

echo "--- Risk Summary ---"
curl -s http://localhost:8000/api/predictions/risk-summary -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- Health ---"
curl -s http://localhost:8000/health
```
Expected: Student names printed, risk summary JSON, `{"status":"ok","version":"1.0.0"}`.

- [ ] **Run Angular frontend**

```bash
cd frontend-angular
npm install
npm start
```
Navigate to `http://localhost:4200`, log in as `shumba@uni.ac.zm` / `password123`.
- Dashboard shows risk summary
- Students page shows names
- Student detail shows prediction + GPA form
- Results page has "+ Add course" button
