# AcademIQ — Student Performance Predictor

> AI-powered system to identify at-risk students, predict academic outcomes,  
> and deliver personalised intervention recommendations.

**Author:** Emeldah Miyanda · 21164180 · Computer Science  
**Supervisor:** Mr. L. Shumba

---

## System Overview

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML/JS (Angular-ready) | Student & lecturer portals |
| API | FastAPI (Python) | REST endpoints, auth, routing |
| ML Engine | XGBoost + SHAP | Risk classification & explainability |
| GPA Predictor | Gradient Boosting | End-of-semester GPA forecast |
| Database | PostgreSQL | Student, attendance, results storage |
| Cache | Redis | Sessions, fast reads |
| Background | Celery | Scheduled model retraining |

---

## Key Metrics Used for Prediction

1. **Class Attendance** — attendance rate, LMS login frequency, assignment submission rate  
2. **Educational Background / Results** — average assessment score, missed assessments, late submissions, prior GPA  
3. **Socioeconomic Status** — SES classification (low/middle/high), scholarship status, part-time employment, distance from campus  

---

## Quick Start (Docker — Recommended)

```bash
# 1. Clone and enter the project
cd student-predictor

# 2. Start all services
docker compose up -d

# 3. API is live at:
#    http://localhost:8000
#    http://localhost:8000/docs  ← Swagger UI
```

---

## Manual Setup (Development)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL and SECRET_KEY

# Start PostgreSQL and Redis (or use Docker for just those)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=yourpassword postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# Run the API (tables are auto-created on startup)
uvicorn main:app --reload --port 8000
```

### Frontend

The frontend is a single HTML file that connects to the backend API.

```bash
# Open directly in browser:
open frontend-angular/index.html

# Or serve with any static server:
cd frontend-angular
python -m http.server 3000
# → http://localhost:3000
```

> **Note for Angular migration:** The `frontend-angular/` folder contains  
> the working prototype. To migrate to a full Angular project:  
> `ng new student-predictor-ui --routing --style=scss`  
> Each section in `index.html` maps to an Angular component (see below).

---

## API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login — returns JWT |
| POST | `/api/auth/register` | Register any user |
| POST | `/api/auth/register/student` | Register student + profile |
| GET | `/api/auth/me` | Current user info |

### Predictions (core feature)
| Method | Path | Description |
|---|---|---|
| GET | `/api/predictions/student/{id}` | Run prediction for a student |
| GET | `/api/predictions/my` | Student views own prediction |
| GET | `/api/predictions/risk-summary` | Cohort risk breakdown |
| POST | `/api/predictions/train` | Admin: retrain ML models |

### Data
| Method | Path | Description |
|---|---|---|
| GET | `/api/students/` | List all students |
| GET | `/api/students/me/dashboard` | Student's own dashboard |
| POST | `/api/attendance/` | Record weekly attendance |
| POST | `/api/results/` | Record assessment result |
| POST | `/api/interventions/` | Create intervention |
| PATCH | `/api/interventions/{id}` | Mark intervention actioned |

---

## ML Model Details

### Risk Classifier
- **Algorithm:** XGBoost (multi-class)
- **Output classes:** Low / Medium / High / Critical
- **Explainability:** SHAP TreeExplainer — top 5 factors shown per prediction
- **Fallback:** Rule-based heuristic scoring until enough training data exists

### GPA Predictor
- **Algorithm:** Gradient Boosting Regressor (scikit-learn)
- **Output:** Predicted end-of-semester GPA (0–4 scale)

### Features Used
| Feature | Source | Weight (approx.) |
|---|---|---|
| Attendance rate | Attendance records | 40% |
| Average assessment score | Assessment results | 35% |
| Socioeconomic status | Student profile | 15% |
| LMS engagement | Attendance records | 5% |
| Missed assessments | Assessment results | 5% |

### Retraining
Models automatically retrain via the `/api/predictions/train` admin endpoint  
(or scheduled via Celery). Minimum 10 labelled student records required.

---

## Project Structure

```
student-predictor/
├── backend/
│   ├── main.py                  ← FastAPI app entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── core/
│   │   ├── config.py            ← Settings from .env
│   │   └── auth.py              ← JWT + password utilities
│   ├── db/
│   │   ├── models.py            ← SQLAlchemy ORM models
│   │   └── session.py           ← DB engine + session
│   ├── api/
│   │   ├── schemas.py           ← Pydantic request/response models
│   │   └── routes/
│   │       ├── auth.py          ← Login, register endpoints
│   │       ├── predictions.py   ← Risk prediction endpoints
│   │       └── data.py          ← Students, attendance, results, interventions
│   └── ml/
│       ├── predictor.py         ← Feature engineering + model inference
│       └── saved_models/        ← Trained model files (git-ignored)
├── frontend-angular/
│   └── index.html               ← Full working frontend prototype
├── docker-compose.yml
└── README.md
```

---

## Angular Component Mapping

When migrating to full Angular:

| HTML section | Angular Component | Route |
|---|---|---|
| Auth screen | `AuthComponent` | `/login` |
| Dashboard view | `DashboardComponent` | `/dashboard` |
| Students view | `StudentsComponent` | `/students` |
| Student detail | `StudentDetailComponent` | `/students/:id` |
| Attendance form | `AttendanceComponent` | `/attendance` |
| Interventions | `InterventionsComponent` | `/interventions` |
| My profile | `MyProfileComponent` | `/profile` |

Angular services to create:
- `AuthService` — login, register, token management  
- `PredictionService` — fetch predictions, risk summary  
- `StudentService` — student list, dashboard data  
- `AttendanceService` — submit attendance records  
- `InterventionService` — CRUD for interventions  

---

## User Roles

| Role | Access |
|---|---|
| **Student** | Own risk prediction, recommendations, profile |
| **Lecturer** | All student predictions, create interventions, record results |
| **Admin** | Everything + model retraining, system monitoring |

---

## Development Roadmap

- [x] Database schema (User, StudentProfile, Attendance, Assessment, RiskPrediction, Intervention)
- [x] FastAPI backend with JWT auth
- [x] Rule-based risk scoring (pre-ML fallback)
- [x] XGBoost risk classifier + SHAP explanations
- [x] GPA regression model
- [x] Recommendation engine
- [x] Frontend prototype (student + lecturer + admin views)
- [x] Docker Compose deployment
- [ ] Angular component migration
- [ ] Alembic database migrations
- [ ] Celery scheduled retraining tasks
- [ ] Email/SMS alerts for critical risk students
- [ ] Longitudinal trend tracking (semester-over-semester)
- [ ] LMS API integration (Moodle / Blackboard)
