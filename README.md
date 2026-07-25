# AcademIQ — Student Performance Predictor

> AI-powered system to identify at-risk students, predict academic outcomes,
> and deliver personalised intervention recommendations.

**Author:** Emeldah Miyanda · 21164180 · Computer Science  
**Supervisor:** Mr. L. Shumba

---

## System Overview

| Layer         | Technology        | Purpose                              |
| ------------- | ----------------- | ------------------------------------ |
| Frontend      | Angular 17        | Student & lecturer portals           |
| API           | FastAPI (Python)  | REST endpoints, auth, routing        |
| ML Engine     | XGBoost + SHAP    | Risk classification & explainability |
| GPA Predictor | Gradient Boosting | End-of-semester GPA forecast         |
| Database      | PostgreSQL        | Student, attendance, results storage |
| Cache         | Redis             | Celery broker for background tasks   |
| Background    | Celery            | Scheduled model retraining & alerts  |

---

## Before You Start — Install These First

You need four tools installed on your machine before anything else will work.

### 1. Python 3.10 or higher

- **macOS:** `brew install python` or download from [python.org](https://www.python.org/downloads/)
- **Windows:** Download the installer from [python.org](https://www.python.org/downloads/). During install, **tick the box that says "Add Python to PATH"** before clicking Install.

Check it works: open a terminal and run:

```
python --version
```

You should see `Python 3.10.x` or higher.

---

### 2. Node.js 18 or higher

- **macOS:** `brew install node` or download from [nodejs.org](https://nodejs.org)
- **Windows:** Download the LTS installer from [nodejs.org](https://nodejs.org)

Check it works:

```
node --version
```

You should see `v18.x.x` or higher.

---

### 3. PostgreSQL 16

- **macOS:** `brew install postgresql@16` then `brew services start postgresql@16`
- **Windows:** Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). During setup, remember the password you set for the `postgres` user — you will need it later.

Check it works:

```
psql --version
```

---

### 4. Redis 7

- **macOS:** `brew install redis` then `brew services start redis`
- **Windows:** Redis does not have an official Windows build. Use one of these options:
  - **Option A (easiest):** Install [Memurai](https://www.memurai.com/) — a Redis-compatible server for Windows, free for development.
  - **Option B:** Enable WSL (Windows Subsystem for Linux), then run `sudo apt install redis-server` inside WSL.

Check it works:

```
redis-cli ping
```

You should see `PONG`.

---

## Setup and Running

You will need **two terminal windows** open at the same time — one for the backend, one for the frontend. A third is optional for background tasks.

---

### Step 1 — Create the database

Open a terminal and run:

**macOS / Linux:**

```bash
psql -U postgres -c "CREATE DATABASE student_predictor;"
```

**Windows (Command Prompt or PowerShell):**

```powershell
psql -U postgres -c "CREATE DATABASE student_predictor;"
```

It will ask for your PostgreSQL password. Type it and press Enter.

---

### Step 2 — Set up the backend

Open your first terminal window.

**macOS / Linux:**

```bash
# 1. Go into the backend folder
cd backend

# 2. Create a virtual environment
python -m venv venv

# 3. Activate it
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create your .env file from the example
cp .env.example .env
```

**Windows (Command Prompt):**

```bat
:: 1. Go into the backend folder
cd backend

:: 2. Create a virtual environment
python -m venv venv

:: 3. Activate it
venv\Scripts\activate

:: 4. Install dependencies
pip install -r requirements.txt

:: 5. Create your .env file from the example
copy .env.example .env
```

**Windows (PowerShell):**

```powershell
# 1. Go into the backend folder
cd backend

# 2. Create a virtual environment
python -m venv venv

# 3. Activate it
.\venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create your .env file from the example
Copy-Item .env.example .env
```

> **PowerShell note:** If step 3 gives a "running scripts is disabled" error, run this first:
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

### Step 3 — Configure the .env file

Open `backend/.env` in any text editor and update these two lines:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD_HERE@127.0.0.1:5432/student_predictor
SECRET_KEY=any-long-random-string-you-make-up
```

Replace `YOUR_PASSWORD_HERE` with the PostgreSQL password you set during installation.  
The `SECRET_KEY` can be anything — it signs JWT tokens. Make it long and random.

Leave everything else as-is for development.

---

### Step 4 — Start the backend API

Still in the `backend/` folder with the virtual environment active, run:

**macOS / Linux / Windows:**

```bash
uvicorn main:app --reload --port 8000
```

The first time this runs it will automatically create all database tables.

You should see output ending with:

```
✅ Database tables ready
INFO:     Uvicorn running on http://127.0.0.1:8000
```

The API is now live at **http://localhost:8000**  
Open **http://localhost:8000/docs** in your browser to see all endpoints.

> Keep this terminal open. The API stops if you close it.

---

### Step 5 — Seed the database with demo data

Open a **new terminal window** (keep the API running in the first one).

**macOS / Linux:**

```bash
cd backend
source venv/bin/activate
python seed.py
```

**Windows (Command Prompt):**

```bat
cd backend
venv\Scripts\activate
python seed.py
```

**Windows (PowerShell):**

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python seed.py
```

When it finishes you will see:

```
✅ Seed complete!

Demo credentials (password: password123):
  Admin:    admin@uni.ac.zm
  Lecturer: shumba@uni.ac.zm
  Lecturer: banda@uni.ac.zm
  Students: student1@uni.ac.zm … student10@uni.ac.zm
```

> Only run the seed script once. Running it a second time will fail because
> the email addresses already exist in the database.

---

### Step 6 — Start the frontend

Open another terminal window (the API must still be running).

**macOS / Linux / Windows:**

```bash
cd frontend-angular
npm install
npm start
```

`npm install` only needs to run once. After that you can just use `npm start`.

Wait until you see:

```
** Angular Live Development Server is listening on localhost:4200 **
```

Then open **http://localhost:4200** in your browser and log in with any of the demo credentials above.

---

### Step 7 — (Optional) Celery background worker

Celery handles scheduled tasks: re-running predictions every night, retraining ML models weekly, and sending risk alert emails. You can skip this during development — the API works without it.

If you want background tasks running, open **two more terminals**, both inside the `backend/` folder with the virtual environment active.

**Terminal A — task worker:**

macOS / Linux:

```bash
celery -A tasks.celery_app worker --loglevel=info
```

Windows:

```bat
celery -A tasks.celery_app worker --loglevel=info --pool=solo
```

> Windows requires `--pool=solo` because the default worker pool is not supported there.

**Terminal B — cron scheduler:**

macOS / Linux / Windows:

```bash
celery -A tasks.celery_app beat --loglevel=info
```

---

## Stopping Everything

- **Backend / Frontend / Celery:** Press `Ctrl + C` in the terminal where each is running.
- **macOS services:** `brew services stop postgresql@16` and `brew services stop redis`
- **Windows:** Stop Memurai from the system tray, or stop the PostgreSQL service from Windows Services.

---

## Starting Again After the First Setup

Once everything is installed and configured you only need these commands on subsequent runs:

**macOS / Linux:**

```bash
# Terminal 1 — Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend-angular
npm start
```

**Windows (Command Prompt):**

```bat
:: Terminal 1 — Backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000

:: Terminal 2 — Frontend
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000

```

**Windows (PowerShell):**

```powershell
# Terminal 1 — Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend-angular
npm start
```

---

## Environment Variables Reference

All settings live in `backend/.env`. Full list:

| Variable                      | What it does                            | Default                                                               |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string            | `postgresql://postgres:yourpassword@127.0.0.1:5432/student_predictor` |
| `SECRET_KEY`                  | Signs JWT tokens — keep this secret     | `change-this-in-production`                                           |
| `REDIS_URL`                   | Redis address for Celery                | `redis://localhost:6379/0`                                            |
| `ALGORITHM`                   | JWT signing algorithm                   | `HS256`                                                               |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | How long login tokens last              | `60`                                                                  |
| `EMAIL_ENABLED`               | Set to `true` to send real email alerts | `false`                                                               |
| `SMTP_HOST`                   | Your email provider's SMTP server       | _(blank)_                                                             |
| `SMTP_USER`                   | SMTP login email                        | _(blank)_                                                             |
| `SMTP_PASSWORD`               | SMTP app password                       | _(blank)_                                                             |

---

## API Endpoints

### Auth

| Method | Path                         | Description                |
| ------ | ---------------------------- | -------------------------- |
| POST   | `/api/auth/login`            | Login — returns JWT        |
| POST   | `/api/auth/register`         | Register any user          |
| POST   | `/api/auth/register/student` | Register student + profile |
| GET    | `/api/auth/me`               | Current user info          |

### Predictions (core feature)

| Method | Path                                    | Description                  |
| ------ | --------------------------------------- | ---------------------------- |
| GET    | `/api/predictions/student/{id}`         | Run prediction for a student |
| GET    | `/api/predictions/my`                   | Student views own prediction |
| GET    | `/api/predictions/student/{id}/history` | Past predictions (paginated) |
| GET    | `/api/predictions/risk-summary`         | Cohort risk breakdown        |
| POST   | `/api/predictions/train`                | Admin: retrain ML models     |

### Data

| Method | Path                              | Description                       |
| ------ | --------------------------------- | --------------------------------- |
| GET    | `/api/students/`                  | List all students                 |
| GET    | `/api/students/me/dashboard`      | Student's own dashboard           |
| GET    | `/api/students/{id}/dashboard`    | Lecturer/admin: student dashboard |
| POST   | `/api/attendance/`                | Record weekly attendance          |
| GET    | `/api/attendance/student/{id}`    | Get student attendance history    |
| POST   | `/api/results/`                   | Record assessment result          |
| GET    | `/api/results/student/{id}`       | Get student results               |
| POST   | `/api/interventions/`             | Create intervention               |
| PATCH  | `/api/interventions/{id}`         | Mark intervention actioned        |
| GET    | `/api/interventions/student/{id}` | Get student interventions         |
| POST   | `/api/courses/`                   | Create course                     |
| GET    | `/api/courses/`                   | List courses                      |
| POST   | `/api/semester-gpa/`              | Record end-of-semester GPA        |
| GET    | `/api/semester-gpa/student/{id}`  | Get GPA history                   |

---

## ML Model Details

### Risk Classifier

- **Algorithm:** XGBoost (multi-class)
- **Output classes:** Low / Medium / High / Critical
- **Explainability:** SHAP TreeExplainer — top 5 factors shown per prediction
- **Fallback:** Rule-based heuristic scoring is used until enough training data exists

### GPA Predictor

- **Algorithm:** Gradient Boosting Regressor (scikit-learn)
- **Output:** Predicted end-of-semester GPA (0–4 scale)

### Features Used

| Feature                  | Source             | Weight (approx.) |
| ------------------------ | ------------------ | ---------------- |
| Attendance rate          | Attendance records | 40%              |
| Average assessment score | Assessment results | 35%              |
| Socioeconomic status     | Student profile    | 15%              |
| LMS engagement           | Attendance records | 5%               |
| Missed assessments       | Assessment results | 5%               |

### Retraining

Models are retrained via `POST /api/predictions/train` (admin only) or the weekly Celery beat task. At least 10 students with recorded `SemesterGPA` entries are required before training will run.

---

## Project Structure

```
student-predictor/
├── backend/
│   ├── main.py                  ← FastAPI app entry point
│   ├── seed.py                  ← Populates DB with demo data (run once)
│   ├── requirements.txt
│   ├── .env.example             ← Copy to .env and configure
│   ├── core/
│   │   ├── config.py            ← Settings loaded from .env
│   │   ├── auth.py              ← JWT + password utilities, role guards
│   │   └── notifications.py     ← Email alerts (logs if EMAIL_ENABLED=false)
│   ├── db/
│   │   ├── models.py            ← SQLAlchemy ORM models
│   │   └── session.py           ← DB engine + session
│   ├── api/
│   │   ├── schemas.py           ← Pydantic request/response models
│   │   └── routes/
│   │       ├── auth.py          ← Login, register endpoints
│   │       ├── predictions.py   ← Risk prediction endpoints
│   │       └── data.py          ← Students, courses, attendance, results, interventions, GPA
│   ├── ml/
│   │   ├── predictor.py         ← Feature engineering + model inference
│   │   └── saved_models/        ← Trained model files (git-ignored)
│   └── tasks/
│       ├── celery_app.py        ← Celery config + beat schedule
│       └── scheduled.py         ← Nightly predictions, weekly retrain, risk alert emails
├── frontend-angular/
│   └── src/app/
│       ├── core/
│       │   ├── models.ts        ← TypeScript interfaces
│       │   ├── services/        ← HTTP services for every API resource
│       │   ├── guards/          ← Auth + role guards
│       │   └── interceptors/    ← Attaches JWT to every request
│       └── features/            ← One component per page
└── README.md
```

---

## User Roles

| Role         | Access                                                        |
| ------------ | ------------------------------------------------------------- |
| **Student**  | Own risk prediction, recommendations, dashboard               |
| **Lecturer** | All student predictions, create interventions, record results |
| **Admin**    | Everything + model retraining, system monitoring              |

---

## Development Roadmap

- [x] Database schema (User, StudentProfile, Attendance, Assessment, RiskPrediction, Intervention, SemesterGPA)
- [x] FastAPI backend with JWT auth
- [x] Rule-based risk scoring (pre-ML fallback)
- [x] XGBoost risk classifier + SHAP explanations
- [x] GPA regression model
- [x] Recommendation engine
- [x] Angular 17 frontend (student + lecturer + admin views)
- [x] Celery scheduled tasks (nightly predictions, weekly retrain, risk alerts)
- [ ] Alembic database migrations
- [ ] Email/SMS alerts for critical risk students
- [ ] Longitudinal trend tracking (semester-over-semester)
- [ ] LMS API integration (Moodle / Blackboard)
