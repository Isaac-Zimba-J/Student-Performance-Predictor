"""
Seed script — populates the database with a realistic, full-scale demo cohort.

Usage:
  cd backend
  python seed.py                    # 5,000 students (wipes existing seed data first)
  python seed.py --students 10000   # bigger cohort
  python seed.py --keep             # append instead of wiping
  python seed.py --no-predictions   # skip pre-computed risk predictions

Creates:
  - 1 admin, 12 lecturers
  - N students (default 5,000) with profiles
  - 10 programmes x 4 years x 3 courses  = 120 courses, 5 assessments each
  - 12 weeks of attendance / LMS engagement per student
  - Assessment marks for every course the student is enrolled in
  - 1-3 historical semester GPAs per student
  - A pre-computed risk prediction per student (so the dashboard has data immediately)
  - Interventions for the students flagged high / critical

Everything is bulk-inserted in chunks, so 5,000 students takes well under a minute.
"""

import argparse
import json
import os
import random
import sys
import time
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import insert, text

from db.session import SessionLocal, engine
from db.models import (
    Base, User, StudentProfile, Course, Assessment, AssessmentResult,
    AttendanceRecord, RiskPrediction, Intervention, SemesterGPA,
    UserRole, SESStatus, RiskLevel,
)
from core.auth import hash_password
from ml.predictor import rule_based_risk, FEATURE_NAMES, FEATURE_LABELS

random.seed(42)

CHUNK = 2_000
WEEKS = 12
DEMO_PASSWORD = "password123"
CURRENT_YEAR = 2026


# ─── NAME POOLS ───────────────────────────────────────────────────────────────

FIRST_NAMES = [
    "Emeldah", "Chanda", "Mulenga", "Bupe", "Nkandu", "Chilufya", "Mutinta", "Chembe",
    "Matilda", "Kelvin", "Natasha", "Lweendo", "Mwaka", "Sibongile", "Thandiwe", "Kondwani",
    "Mapalo", "Chipo", "Musonda", "Namakau", "Lubuto", "Kabwe", "Sepiso", "Chibwe",
    "Mwansa", "Chola", "Besa", "Kafwimbi", "Luyando", "Mweemba", "Namwene", "Kasuba",
    "Bwalya", "Chikondi", "Temwani", "Wezi", "Zikomo", "Mubita", "Nsofwa", "Chimuka",
    "Twaambo", "Choolwe", "Given", "Precious", "Blessings", "Gift", "Mercy", "Grace",
    "Joseph", "Daniel", "Peter", "Isaac", "Brian", "Kennedy", "Emmanuel", "Wisdom",
    "Charity", "Faith", "Hope", "Ruth", "Esther", "Miriam", "Deborah", "Rachel",
    "Sunday", "Monday", "Friday", "Christopher", "Wilson", "Godfrey", "Nelson", "Clement",
    "Agnes", "Beatrice", "Catherine", "Doreen", "Eunice", "Florence", "Gladys", "Hilda",
    "Irene", "Janet", "Kalima", "Lillian", "Monica", "Nancy", "Olivia", "Patricia",
    "Rita", "Susan", "Teresa", "Veronica", "Winnie", "Yvonne", "Zenani", "Alinaswe",
    "Chinyama", "Kaunda", "Muyunda", "Namoonga", "Sikanyika", "Taonga", "Vwanganji", "Yotam",
    "Abel", "Bright", "Chanceli", "Dominic", "Edwin", "Fred", "Gerald", "Henry",
    "Ivan", "Jonathan", "Kelvin", "Lameck", "Martin", "Newton", "Oscar", "Paul",
]

SURNAMES = [
    "Miyanda", "Mwansa", "Kapata", "Mutale", "Phiri", "Bwalya", "Hakasenke", "Nkole",
    "Lungu", "Ng'andu", "Banda", "Tembo", "Zulu", "Mwale", "Sakala", "Daka",
    "Chanda", "Musonda", "Chileshe", "Kabwe", "Mumba", "Sinkala", "Nyirenda", "Simukonda",
    "Kalunga", "Mubanga", "Mwanza", "Chirwa", "Chibale", "Kunda", "Sichone", "Mwewa",
    "Chipimo", "Hamweemba", "Munkombwe", "Siamubotu", "Muleya", "Cheelo", "Malambo", "Habeenzu",
    "Shumba", "Katongo", "Mulwanda", "Chibuye", "Nakazwe", "Bweupe", "Mutti", "Chansa",
    "Sikazwe", "Kaunda", "Nkonde", "Mvula", "Ngoma", "Soko", "Njobvu", "Lubinda",
    "Mukelabai", "Sitali", "Wamundila", "Muyunda", "Imasiku", "Mubita", "Namakando", "Silwimba",
    "Chikwanda", "Simutowe", "Kalaba", "Chomba", "Kangwa", "Mofya", "Namukolo", "Chitala",
    "Mwape", "Kasonde", "Bemba", "Lubasi", "Simfukwe", "Nsofwa", "Chikuta", "Mwiinga",
    "Hachintu", "Munsanje", "Sialumba", "Chizyuka", "Mudenda", "Nchimunya", "Simasiku", "Kanyanta",
]

PROGRAMMES = [
    "Computer Science",
    "Information Systems",
    "Software Engineering",
    "Data Science",
    "Cyber Security",
    "Information Technology",
    "Business Administration",
    "Accountancy",
    "Civil Engineering",
    "Electrical Engineering",
]

PROGRAMME_PREFIX = {
    "Computer Science": "CS",
    "Information Systems": "IS",
    "Software Engineering": "SE",
    "Data Science": "DS",
    "Cyber Security": "CY",
    "Information Technology": "IT",
    "Business Administration": "BA",
    "Accountancy": "AC",
    "Civil Engineering": "CE",
    "Electrical Engineering": "EE",
}

# 3 course titles per programme year (index 0 -> year 1 ... index 3 -> year 4)
COURSE_TITLES = {
    "Computer Science": [
        ["Introduction to Programming", "Discrete Mathematics", "Computer Organisation"],
        ["Data Structures & Algorithms", "Object Oriented Programming", "Operating Systems"],
        ["Database Systems", "Computer Networks", "Software Design Patterns"],
        ["Machine Learning", "Distributed Systems", "Capstone Project"],
    ],
    "Information Systems": [
        ["Foundations of Information Systems", "Business Mathematics", "IT Essentials"],
        ["Systems Analysis", "Database Fundamentals", "Business Process Modelling"],
        ["Enterprise Systems", "IS Project Management", "Data Warehousing"],
        ["IS Strategy & Governance", "Business Intelligence", "Capstone Project"],
    ],
    "Software Engineering": [
        ["Programming Fundamentals", "Software Requirements", "Web Technologies"],
        ["Software Construction", "Human Computer Interaction", "Algorithms"],
        ["Software Architecture", "Software Quality Assurance", "Mobile Development"],
        ["Software Project Management", "DevOps & Cloud Engineering", "Capstone Project"],
    ],
    "Data Science": [
        ["Statistics for Data Science", "Programming for Data Science", "Linear Algebra"],
        ["Data Wrangling", "Probability & Inference", "Databases for Analytics"],
        ["Machine Learning", "Data Visualisation", "Big Data Systems"],
        ["Deep Learning", "Applied Predictive Modelling", "Capstone Project"],
    ],
    "Cyber Security": [
        ["Introduction to Cyber Security", "Networking Fundamentals", "Systems Programming"],
        ["Cryptography", "Secure Coding", "Network Defence"],
        ["Digital Forensics", "Penetration Testing", "Security Governance"],
        ["Incident Response", "Cloud Security", "Capstone Project"],
    ],
    "Information Technology": [
        ["IT Fundamentals", "Computer Hardware & Maintenance", "Digital Literacy"],
        ["Networking I", "Systems Administration", "Scripting & Automation"],
        ["Networking II", "Cloud Infrastructure", "IT Service Management"],
        ["Virtualisation", "Enterprise Support Systems", "Capstone Project"],
    ],
    "Business Administration": [
        ["Principles of Management", "Business Communication", "Microeconomics"],
        ["Organisational Behaviour", "Marketing Management", "Business Statistics"],
        ["Operations Management", "Human Resource Management", "Corporate Finance"],
        ["Strategic Management", "Entrepreneurship", "Research Project"],
    ],
    "Accountancy": [
        ["Financial Accounting I", "Business Law", "Quantitative Methods"],
        ["Financial Accounting II", "Cost & Management Accounting", "Taxation I"],
        ["Auditing", "Corporate Reporting", "Taxation II"],
        ["Advanced Financial Reporting", "Financial Management", "Research Project"],
    ],
    "Civil Engineering": [
        ["Engineering Mathematics I", "Engineering Drawing", "Materials Science"],
        ["Structural Mechanics", "Fluid Mechanics", "Surveying"],
        ["Reinforced Concrete Design", "Geotechnical Engineering", "Transport Engineering"],
        ["Structural Analysis", "Construction Management", "Design Project"],
    ],
    "Electrical Engineering": [
        ["Engineering Mathematics I", "Circuit Theory", "Engineering Physics"],
        ["Electronics I", "Signals & Systems", "Electrical Machines"],
        ["Power Systems", "Control Engineering", "Microprocessors"],
        ["Power Electronics", "Renewable Energy Systems", "Design Project"],
    ],
}

ASSESSMENT_TEMPLATE = [
    ("Test 1", "test", 50.0, 15.0),
    ("Assignment 1", "assignment", 30.0, 10.0),
    ("Test 2", "test", 50.0, 15.0),
    ("Assignment 2", "assignment", 30.0, 10.0),
    ("Final Exam", "exam", 100.0, 50.0),
]

LECTURER_NAMES = [
    ("Mr. L. Shumba", "shumba@uni.ac.zm"),
    ("Ms. C. Banda", "banda@uni.ac.zm"),
    ("Dr. P. Mwanza", "mwanza@uni.ac.zm"),
    ("Dr. N. Tembo", "tembo@uni.ac.zm"),
    ("Mrs. R. Chileshe", "chileshe@uni.ac.zm"),
    ("Mr. K. Zulu", "zulu@uni.ac.zm"),
    ("Dr. S. Kapaso", "kapaso@uni.ac.zm"),
    ("Ms. T. Nyirenda", "nyirenda@uni.ac.zm"),
    ("Prof. G. Mulenga", "gmulenga@uni.ac.zm"),
    ("Dr. A. Sakala", "sakala@uni.ac.zm"),
    ("Mr. D. Mumba", "mumba@uni.ac.zm"),
    ("Ms. V. Daka", "daka@uni.ac.zm"),
]

# The ten named students the README and docs/TESTING.md refer to by email.
# They are seeded first, with a fixed engagement level so each one lands in the
# risk tier the documentation promises.
#   (student_number, name, programme, year, SES, scholarship, employed, km, engagement)
DEMO_STUDENTS = [
    ("21164180", "Emeldah Miyanda", "Computer Science", 3, SESStatus.MIDDLE, True, False, 8.0, 0.93),
    ("21164181", "Chanda Mwansa", "Computer Science", 3, SESStatus.LOW, False, True, 25.0, 0.16),
    ("21164182", "Mulenga Kapata", "Information Systems", 2, SESStatus.HIGH, True, False, 3.0, 0.90),
    ("21164183", "Bupe Mutale", "Computer Science", 1, SESStatus.LOW, False, True, 40.0, 0.525),
    ("21164184", "Nkandu Phiri", "Software Engineering", 4, SESStatus.MIDDLE, False, False, 12.0, 0.64),
    ("21164185", "Chilufya Bwalya", "Information Systems", 3, SESStatus.LOW, False, True, 35.0, 0.12),
    ("21164186", "Mutinta Hakasenke", "Computer Science", 2, SESStatus.HIGH, True, False, 2.0, 0.96),
    ("21164187", "Chembe Nkole", "Software Engineering", 1, SESStatus.MIDDLE, False, False, 15.0, 0.54),
    ("21164188", "Matilda Lungu", "Computer Science", 3, SESStatus.LOW, True, True, 50.0, 0.60),
    ("21164189", "Kelvin Ng'andu", "Information Systems", 4, SESStatus.MIDDLE, False, False, 6.0, 0.88),
]


INTERVENTION_TEMPLATES = {
    "tutoring": [
        "Enrol in the weekly peer tutoring group for the lowest-scoring course.",
        "Assign a senior-year student mentor for structured revision sessions.",
        "Book fortnightly one-on-one tutoring at the academic support centre.",
    ],
    "counseling": [
        "Refer to student counselling services — sustained drop in engagement.",
        "Schedule a wellbeing check-in with the faculty student advisor.",
        "Discuss workload and part-time employment balance with a counsellor.",
    ],
    "alert": [
        "Lecturer alerted — attendance has fallen below the 60% threshold.",
        "Escalated to the head of department: multiple missed assessments.",
        "Early-warning notice issued to the student and academic advisor.",
    ],
    "resource": [
        "Share recorded lectures and past papers for the weakest module.",
        "Provide data-bundle support so LMS material can be accessed off campus.",
        "Enrol in the study-skills and exam-technique short course.",
    ],
}


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def uid() -> str:
    return str(uuid.uuid4())


def chunked_insert(db, model, rows, label):
    """Bulk-insert `rows` (list of dicts) for `model` in manageable chunks."""
    if not rows:
        return
    total = len(rows)
    for start in range(0, total, CHUNK):
        db.execute(insert(model), rows[start:start + CHUNK])
    db.commit()
    print(f"  ✓ {label}: {total:,} rows")


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def ensure_indexes(db):
    """
    Create the foreign-key indexes the per-student queries rely on.

    `Base.metadata.create_all` only creates indexes alongside a *new* table, so
    databases seeded before these indexes existed need them added explicitly.
    """
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_attendance_records_student_id ON attendance_records (student_id)",
        "CREATE INDEX IF NOT EXISTS ix_attendance_records_course_id ON attendance_records (course_id)",
        "CREATE INDEX IF NOT EXISTS ix_assessments_course_id ON assessments (course_id)",
        "CREATE INDEX IF NOT EXISTS ix_assessment_results_student_id ON assessment_results (student_id)",
        "CREATE INDEX IF NOT EXISTS ix_assessment_results_assessment_id ON assessment_results (assessment_id)",
        "CREATE INDEX IF NOT EXISTS ix_risk_predictions_student_id ON risk_predictions (student_id)",
        "CREATE INDEX IF NOT EXISTS ix_interventions_student_id ON interventions (student_id)",
        "CREATE INDEX IF NOT EXISTS ix_semester_gpas_student_id ON semester_gpas (student_id)",
        "CREATE INDEX IF NOT EXISTS ix_student_profiles_programme ON student_profiles (programme)",
        "CREATE INDEX IF NOT EXISTS ix_student_profiles_year_of_study ON student_profiles (year_of_study)",
        # Latest-prediction-per-student lookups drive the dashboard and predictions list.
        "CREATE INDEX IF NOT EXISTS ix_risk_predictions_student_created ON risk_predictions (student_id, created_at DESC)",
    ]
    for stmt in statements:
        db.execute(text(stmt))
    db.commit()
    print(f"  ✓ indexes ensured ({len(statements)})")


def wipe(db):
    """Remove all seedable data. Users are removed last because everything FKs to them."""
    tables = [
        "risk_predictions", "interventions", "semester_gpas",
        "assessment_results", "attendance_records", "assessments",
        "courses", "student_profiles", "users",
    ]
    db.execute(text("TRUNCATE TABLE " + ", ".join(tables) + " RESTART IDENTITY CASCADE"))
    db.commit()
    print(f"  ✓ cleared {len(tables)} tables")


# ─── COHORT GENERATION ────────────────────────────────────────────────────────

def make_engagement_profile(rng):
    """
    Draw a latent 'engagement' score in [0, 1] that drives every behavioural signal.

    The mixture is tuned so the resulting rule-based risk split lands near a
    realistic institutional distribution (roughly 50% low, 27% medium,
    15% high, 8% critical) rather than a flat random spread.
    """
    roll = rng.random()
    if roll < 0.46:          # thriving
        base = rng.uniform(0.78, 0.99)
    elif roll < 0.74:        # coping
        base = rng.uniform(0.58, 0.78)
    elif roll < 0.90:        # struggling
        base = rng.uniform(0.38, 0.58)
    else:                    # in serious difficulty
        base = rng.uniform(0.10, 0.38)
    return base


def build_students(n, rng):
    """Generate profile-level data for n students, plus their latent engagement."""
    students = []

    # Named demo students keep the emails and student numbers the docs quote.
    for i, (number, name, programme, year, ses, schol, employed, km, engagement) in enumerate(DEMO_STUDENTS[:n]):
        students.append({
            "serial": i + 1,
            "full_name": name,
            "email": f"student{i + 1}@uni.ac.zm",
            "student_number": number,
            "programme": programme,
            "year_of_study": year,
            "ses_status": ses,
            "is_scholarship": schol,
            "is_employed_part_time": employed,
            "distance_from_campus_km": km,
            "engagement": engagement,
        })

    for i in range(len(students), n):
        serial = i + 1
        programme = rng.choice(PROGRAMMES)
        year = rng.choices([1, 2, 3, 4], weights=[0.32, 0.27, 0.23, 0.18])[0]
        engagement = make_engagement_profile(rng)

        # Socio-economic status correlates mildly (not deterministically) with engagement.
        ses_roll = rng.random() * 0.6 + engagement * 0.4
        if ses_roll < 0.38:
            ses = SESStatus.LOW
        elif ses_roll < 0.80:
            ses = SESStatus.MIDDLE
        else:
            ses = SESStatus.HIGH

        # Low-SES students are likelier to work part time and to live further out.
        employed_p = {SESStatus.LOW: 0.45, SESStatus.MIDDLE: 0.22, SESStatus.HIGH: 0.08}[ses]
        distance = {
            SESStatus.LOW: rng.uniform(8, 55),
            SESStatus.MIDDLE: rng.uniform(3, 28),
            SESStatus.HIGH: rng.uniform(1, 14),
        }[ses]
        scholarship_p = {SESStatus.LOW: 0.30, SESStatus.MIDDLE: 0.18, SESStatus.HIGH: 0.10}[ses]

        first = rng.choice(FIRST_NAMES)
        last = rng.choice(SURNAMES)
        enrol_year = CURRENT_YEAR - (year - 1)
        student_number = f"{str(enrol_year)[2:]}{serial:06d}"

        students.append({
            "serial": serial,
            "full_name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower().replace(chr(39), '')}{serial}@student.uni.ac.zm",
            "student_number": student_number,
            "programme": programme,
            "year_of_study": year,
            "ses_status": ses,
            "is_scholarship": rng.random() < scholarship_p,
            "is_employed_part_time": rng.random() < employed_p,
            "distance_from_campus_km": round(distance, 1),
            "engagement": engagement,
        })
    return students


def build_features_from_seed(s, totals):
    """
    Mirror `ml.predictor.build_features` using the numbers we just generated,
    so a seeded prediction matches what the API would compute from the rows.
    """
    ses_map = {"low": 0, "middle": 1, "high": 2}
    return {
        "attendance_rate": round(totals["attended"] / max(totals["held"], 1), 4),
        "lms_engagement_rate": round(totals["lms"] / max(totals["weeks"], 1), 4),
        "assignment_submission_rate": round(totals["subs"] / max(totals["weeks"], 1), 4),
        "avg_assessment_score": round(totals["avg_score"], 4),
        "gpa_prior": totals["gpa_prior"],
        "year_of_study": s["year_of_study"],
        "ses_encoded": ses_map[s["ses_status"].value],
        "is_scholarship": int(s["is_scholarship"]),
        "is_employed": int(s["is_employed_part_time"]),
        "distance_km": s["distance_from_campus_km"],
        "assessments_missed": totals["missed"],
        "late_submissions": totals["late"],
    }


def fallback_risk_factors(features):
    """Same shape the rule-based branch of predict_student_risk emits."""
    factors = [
        {
            "factor": FEATURE_LABELS.get(k, k),
            "impact": round((1 - features[k]) * 0.4 if k == "attendance_rate" else features[k] * 0.1, 4),
            "value": str(round(features[k], 3)),
        }
        for k in FEATURE_NAMES
    ]
    factors.sort(key=lambda f: abs(f["impact"]), reverse=True)
    return factors[:5]


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed the AcademIQ demo database.")
    parser.add_argument("--students", type=int, default=5000,
                        help="number of students to create (default: 5000)")
    parser.add_argument("--keep", action="store_true",
                        help="append to existing data instead of wiping it first")
    parser.add_argument("--no-predictions", action="store_true",
                        help="skip pre-computed risk predictions and interventions")
    args = parser.parse_args()

    # Windows consoles default to a legacy code page (cp1252), which cannot
    # encode the check marks and bar characters printed below — that raises
    # UnicodeEncodeError as soon as output is redirected to a file or pipe.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    n_students = max(1, args.students)
    rng = random.Random(42)
    started = time.time()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print(f"\nSeeding {n_students:,} students…\n")

        print("Preparing schema…")
        ensure_indexes(db)

        if not args.keep:
            print("Clearing existing data…")
            wipe(db)

        # ── Staff ────────────────────────────────────────────────────────────
        print("Creating staff accounts…")
        staff_hash = hash_password(DEMO_PASSWORD)
        admin_id = uid()
        user_rows = [{
            "id": admin_id, "email": "admin@uni.ac.zm", "hashed_password": staff_hash,
            "full_name": "Dr. Admin", "role": UserRole.ADMIN, "is_active": True,
        }]
        lecturer_ids = []
        for name, email in LECTURER_NAMES:
            lec_id = uid()
            lecturer_ids.append(lec_id)
            user_rows.append({
                "id": lec_id, "email": email, "hashed_password": staff_hash,
                "full_name": name, "role": UserRole.LECTURER, "is_active": True,
            })
        chunked_insert(db, User, user_rows, "staff users")

        # ── Courses & assessments ────────────────────────────────────────────
        print("Creating courses and assessments…")
        course_rows, assessment_rows = [], []
        # courses_by[(programme, year)] -> list of course ids
        courses_by = {}
        # assessments_by[course_id] -> list of (assessment_id, max_marks, type)
        assessments_by = {}
        for programme in PROGRAMMES:
            prefix = PROGRAMME_PREFIX[programme]
            for year_idx, titles in enumerate(COURSE_TITLES[programme]):
                year = year_idx + 1
                for slot, title in enumerate(titles):
                    course_id = uid()
                    semester = 1 if slot < 2 else 2
                    course_rows.append({
                        "id": course_id,
                        "code": f"{prefix}{year}{slot + 1:02d}",
                        "name": title,
                        "credits": rng.choice([3, 3, 3, 4]),
                        "semester": semester,
                        "academic_year": str(CURRENT_YEAR),
                        "lecturer_id": rng.choice(lecturer_ids),
                        "total_classes": 36,
                    })
                    courses_by.setdefault((programme, year), []).append(course_id)

                    bucket = []
                    for a_name, a_type, max_marks, weight in ASSESSMENT_TEMPLATE:
                        a_id = uid()
                        assessment_rows.append({
                            "id": a_id, "course_id": course_id, "name": a_name,
                            "assessment_type": a_type, "max_marks": max_marks,
                            "weight_percent": weight,
                            "due_date": datetime(CURRENT_YEAR, 3, 1) + timedelta(weeks=3 * len(bucket)),
                        })
                        bucket.append((a_id, max_marks, a_type))
                    assessments_by[course_id] = bucket

        chunked_insert(db, Course, course_rows, "courses")
        chunked_insert(db, Assessment, assessment_rows, "assessments")

        # ── Students ─────────────────────────────────────────────────────────
        print(f"Generating {n_students:,} student profiles…")
        students = build_students(n_students, rng)

        # One bcrypt hash reused for every demo student — hashing 5,000 times
        # would take ~20 minutes and every account shares the same password anyway.
        student_hash = hash_password(DEMO_PASSWORD)

        student_user_rows, profile_rows = [], []
        for s in students:
            user_id, profile_id = uid(), uid()
            s["user_id"], s["profile_id"] = user_id, profile_id
            student_user_rows.append({
                "id": user_id, "email": s["email"], "hashed_password": student_hash,
                "full_name": s["full_name"], "role": UserRole.STUDENT, "is_active": True,
            })
            profile_rows.append({
                "id": profile_id, "user_id": user_id,
                "student_number": s["student_number"], "programme": s["programme"],
                "year_of_study": s["year_of_study"], "ses_status": s["ses_status"],
                "is_scholarship": s["is_scholarship"],
                "is_employed_part_time": s["is_employed_part_time"],
                "distance_from_campus_km": s["distance_from_campus_km"],
            })
        chunked_insert(db, User, student_user_rows, "student users")
        chunked_insert(db, StudentProfile, profile_rows, "student profiles")

        # ── Behavioural data ─────────────────────────────────────────────────
        print("Generating attendance, marks and GPA history…")
        attendance_rows, result_rows, gpa_rows = [], [], []
        prediction_rows, intervention_rows = [], []
        term_start = datetime(CURRENT_YEAR, 2, 3)
        risk_counts = {level: 0 for level in RiskLevel}

        for s in students:
            eng = s["engagement"]
            enrolled = courses_by[(s["programme"], s["year_of_study"])]

            # Each student draws from their own seeded stream, so a given student
            # always gets the same history no matter how large the cohort is or
            # who was generated before them.
            rng = random.Random(90210 + s["serial"])

            # ── Attendance / engagement, one record per teaching week ────────
            att_mean = clamp(0.32 + eng * 0.68, 0.15, 0.99)
            lms_mean = clamp(eng * 11.0, 0.4, 12.0)
            held_total = attended_total = lms_total = subs_total = 0
            for week in range(1, WEEKS + 1):
                held = 3
                # Engagement drifts slightly over the term; struggling students slide further.
                drift = (week - WEEKS / 2) / WEEKS * (0.14 if eng < 0.55 else -0.03)
                week_rate = clamp(att_mean - drift + rng.uniform(-0.12, 0.12), 0.0, 1.0)
                attended = int(round(held * week_rate))
                attended = clamp(attended, 0, held)
                lms = max(0, int(round(rng.gauss(lms_mean, 1.8))))
                subs = 1 if (week % 3 == 0 and rng.random() < clamp(eng + 0.15, 0, 1)) else 0

                held_total += held
                attended_total += attended
                lms_total += lms
                subs_total += subs

                attendance_rows.append({
                    "id": uid(), "student_id": s["profile_id"],
                    "course_id": enrolled[(week - 1) % len(enrolled)],
                    "week_number": week, "classes_held": held, "classes_attended": attended,
                    "lms_logins": lms, "assignment_submissions": subs,
                    "recorded_at": term_start + timedelta(weeks=week),
                })

            # ── Assessment marks across every enrolled course ────────────────
            score_mean = clamp(22 + eng * 68, 12, 96)
            pct_scores, missed, late = [], 0, 0
            for course_id in enrolled:
                for a_id, max_marks, a_type in assessments_by[course_id]:
                    # Disengaged students miss assessments far more often.
                    miss_p = clamp(0.30 - eng * 0.28, 0.005, 0.30)
                    if rng.random() < miss_p:
                        missed += 1
                        result_rows.append({
                            "id": uid(), "student_id": s["profile_id"], "assessment_id": a_id,
                            "marks_obtained": None, "submitted_on_time": False,
                            "recorded_at": term_start + timedelta(days=rng.randint(20, 110)),
                        })
                        late += 1
                        continue

                    pct = clamp(rng.gauss(score_mean, 9.0), 0, 100)
                    if a_type == "exam":
                        pct = clamp(pct - 4 + rng.uniform(-3, 3), 0, 100)
                    on_time = rng.random() > clamp(0.45 - eng * 0.42, 0.02, 0.45)
                    if not on_time:
                        late += 1
                    pct_scores.append(pct)
                    result_rows.append({
                        "id": uid(), "student_id": s["profile_id"], "assessment_id": a_id,
                        "marks_obtained": round(max_marks * pct / 100, 1),
                        "submitted_on_time": on_time,
                        "recorded_at": term_start + timedelta(days=rng.randint(20, 110)),
                    })

            avg_score = sum(pct_scores) / len(pct_scores) if pct_scores else 50.0

            # ── Historical semester GPAs (one per completed semester) ────────
            gpa_prior = 2.5
            completed_semesters = (s["year_of_study"] - 1) * 2
            completed_semesters = min(completed_semesters, 4)
            if completed_semesters:
                base_gpa = clamp(0.6 + eng * 3.4, 0.3, 4.0)
                for k in range(completed_semesters):
                    offset = completed_semesters - k          # how far back
                    year = CURRENT_YEAR - ((offset + 1) // 2)
                    semester = 2 if offset % 2 == 1 else 1
                    gpa = round(clamp(base_gpa + rng.uniform(-0.35, 0.35), 0.0, 4.0), 2)
                    gpa_rows.append({
                        "id": uid(), "student_id": s["profile_id"],
                        "year": year, "semester": semester, "gpa": gpa,
                        # recorded_at ordering decides which GPA counts as "prior"
                        "recorded_at": datetime(year, 6 if semester == 1 else 12, 15),
                    })
                    gpa_prior = gpa   # the loop ends on the most recent semester

            # ── Pre-computed risk prediction ────────────────────────────────
            if not args.no_predictions:
                features = build_features_from_seed(s, {
                    "held": held_total, "attended": attended_total,
                    "lms": lms_total, "subs": subs_total, "weeks": WEEKS,
                    "avg_score": avg_score, "gpa_prior": gpa_prior,
                    "missed": missed, "late": late,
                })
                level, score = rule_based_risk(features)
                risk_counts[level] += 1
                prediction_rows.append({
                    "id": uid(), "student_id": s["profile_id"],
                    "risk_level": level, "risk_score": score,
                    "predicted_gpa": round(clamp(0.4 + (1 - score) * 3.6, 0.0, 4.0), 2),
                    "top_risk_factors": json.dumps(fallback_risk_factors(features)),
                    "model_version": "v1",
                    "created_at": term_start + timedelta(weeks=WEEKS, hours=rng.randint(0, 72)),
                })

                # Interventions for the students who actually need them
                if level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                    how_many = 2 if level == RiskLevel.CRITICAL else 1
                    for kind in rng.sample(list(INTERVENTION_TEMPLATES), how_many):
                        actioned = rng.random() < 0.35
                        created = term_start + timedelta(weeks=rng.randint(4, WEEKS))
                        intervention_rows.append({
                            "id": uid(), "student_id": s["profile_id"],
                            "intervention_type": kind,
                            "description": rng.choice(INTERVENTION_TEMPLATES[kind]),
                            "recommended_by": "system",
                            "is_actioned": actioned,
                            "outcome_note": "Student attended and engaged with the support offered."
                            if actioned else None,
                            "created_at": created,
                            "actioned_at": created + timedelta(days=rng.randint(2, 14)) if actioned else None,
                        })

        chunked_insert(db, AttendanceRecord, attendance_rows, "attendance records")
        chunked_insert(db, AssessmentResult, result_rows, "assessment results")
        chunked_insert(db, SemesterGPA, gpa_rows, "semester GPAs")
        chunked_insert(db, RiskPrediction, prediction_rows, "risk predictions")
        chunked_insert(db, Intervention, intervention_rows, "interventions")

        elapsed = time.time() - started
        total_rows = (len(user_rows) + len(course_rows) + len(assessment_rows)
                      + len(student_user_rows) + len(profile_rows) + len(attendance_rows)
                      + len(result_rows) + len(gpa_rows) + len(prediction_rows)
                      + len(intervention_rows))

        print(f"\n✅ Seed complete — {total_rows:,} rows in {elapsed:.1f}s")

        if not args.no_predictions:
            print("\nRisk distribution:")
            for level in (RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL):
                count = risk_counts[level]
                pct = count / n_students * 100
                bar = "█" * int(pct / 2)
                print(f"  {level.value:<9} {count:>6,}  {pct:5.1f}%  {bar}")

        n_demo = min(len(DEMO_STUDENTS), n_students)
        print(f"\nDemo credentials (password: {DEMO_PASSWORD}):")
        print("  Admin:     admin@uni.ac.zm")
        print(f"  Lecturers: {LECTURER_NAMES[0][1]} … {LECTURER_NAMES[-1][1]}")
        print(f"  Students:  student1@uni.ac.zm … student{n_demo}@uni.ac.zm  (named demo cohort)")
        if n_students > n_demo:
            print(f"             plus {n_students - n_demo:,} generated accounts, "
                  f"e.g. {students[n_demo]['email']}")
        print("\nStart the API and open http://localhost:8000/docs\n")

    finally:
        db.close()


if __name__ == "__main__":
    main()
