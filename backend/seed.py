"""
Seed script — populates the database with realistic demo data.

Usage:
  cd backend
  python seed.py

Creates:
  - 1 admin user
  - 2 lecturers
  - 10 students with profiles, attendance records, and assessment results
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from db.session import SessionLocal, engine
from db.models import Base, User, StudentProfile, Course, AttendanceRecord, Assessment, AssessmentResult
from db.models import UserRole, SESStatus
from core.auth import hash_password
import random, uuid

random.seed(42)

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def uid(): return str(uuid.uuid4())


def make_user(email, name, role, password="password123"):
    u = User(id=uid(), email=email, hashed_password=hash_password(password),
             full_name=name, role=role)
    db.add(u)
    return u


def make_student(user, number, programme, year, ses, scholarship=False, employed=False, distance=5.0):
    p = StudentProfile(
        id=uid(), user_id=user.id, student_number=number,
        programme=programme, year_of_study=year, ses_status=ses,
        is_scholarship=scholarship, is_employed_part_time=employed,
        distance_from_campus_km=distance,
    )
    db.add(p)
    return p


print("Creating users......")

admin = make_user("admin@uni.ac.zm", "Dr. Admin", UserRole.ADMIN)
lec1 = make_user("shumba@uni.ac.zm", "Mr. L. Shumba", UserRole.LECTURER)
lec2 = make_user("banda@uni.ac.zm", "Ms. C. Banda", UserRole.LECTURER)

students_data = [
    ("21164180", "Emeldah Miyanda", "Computer Science", 3, SESStatus.MIDDLE, True, False, 8.0),
    ("21164181", "Chanda Mwansa", "Computer Science", 3, SESStatus.LOW, False, True, 25.0),
    ("21164182", "Mulenga Kapata", "Information Systems", 2, SESStatus.HIGH, True, False, 3.0),
    ("21164183", "Bupe Mutale", "Computer Science", 1, SESStatus.LOW, False, True, 40.0),
    ("21164184", "Nkandu Phiri", "Software Engineering", 4, SESStatus.MIDDLE, False, False, 12.0),
    ("21164185", "Chilufya Bwalya", "Information Systems", 3, SESStatus.LOW, False, True, 35.0),
    ("21164186", "Mutinta Hakasenke", "Computer Science", 2, SESStatus.HIGH, True, False, 2.0),
    ("21164187", "Chembe Nkole", "Software Engineering", 1, SESStatus.MIDDLE, False, False, 15.0),
    ("21164188", "Matilda Lungu", "Computer Science", 3, SESStatus.LOW, True, True, 50.0),
    ("21164189", "Kelvin Ng'andu", "Information Systems", 4, SESStatus.MIDDLE, False, False, 6.0),
]

student_users = []
student_profiles = []
for i, (num, name, prog, year, ses, schol, emp, dist) in enumerate(students_data):
    email = f"student{i+1}@uni.ac.zm"
    u = make_user(email, name, UserRole.STUDENT)
    p = make_student(u, num, prog, year, ses, schol, emp, dist)
    student_users.append(u)
    student_profiles.append(p)

db.flush()

print("Creating courses...")
courses = []
for code, name, sem, lec_id in [
    ("CS301", "Data Structures & Algorithms", 1, lec1.id),
    ("CS302", "Database Systems", 1, lec1.id),
    ("IS201", "Systems Analysis", 1, lec2.id),
    ("SE401", "Software Project Management", 2, lec2.id),
]:
    c = Course(id=uid(), code=code, name=name, credits=3, semester=1,
               academic_year="2024", lecturer_id=lec_id, total_classes=30)
    db.add(c)
    courses.append(c)

db.flush()

print("Creating assessments...")
assessments = []
for course in courses:
    for aname, atype, max_m, weight in [
        ("Test 1", "test", 50, 15),
        ("Assignment 1", "assignment", 30, 10),
        ("Test 2", "test", 50, 15),
        ("Assignment 2", "assignment", 30, 10),
        ("Final Exam", "exam", 100, 50),
    ]:
        a = Assessment(id=uid(), course_id=course.id, name=aname,
                       assessment_type=atype, max_marks=max_m, weight_percent=weight)
        db.add(a)
        assessments.append(a)

db.flush()

print("Creating attendance records...")

# Risk profiles: index maps to risk severity
# 0=Emeldah(low), 1=Chanda(critical), 2=Mulenga(low),
# 3=Bupe(high), 4=Nkandu(medium), 5=Chilufya(critical),
# 6=Mutinta(low), 7=Chembe(medium), 8=Matilda(high), 9=Kelvin(low)
attendance_rates = [0.92, 0.45, 0.88, 0.58, 0.72, 0.40, 0.95, 0.70, 0.55, 0.85]
lms_rates       = [8,    1,    7,    2,    5,    1,    9,    4,    2,    7   ]

for i, profile in enumerate(student_profiles):
    att_rate = attendance_rates[i]
    lms_base = lms_rates[i]
    for week in range(1, 13):
        held = 3
        attended = round(held * att_rate + random.uniform(-0.3, 0.3))
        attended = max(0, min(held, attended))
        lms = max(0, lms_base + random.randint(-1, 2))
        subs = 1 if week % 3 == 0 else 0
        r = AttendanceRecord(
            id=uid(), student_id=profile.id,
            course_id=random.choice(courses).id,
            week_number=week, classes_held=held, classes_attended=attended,
            lms_logins=lms, assignment_submissions=subs,
        )
        db.add(r)

db.flush()

print("Creating assessment results...")
score_ranges = [
    (75, 95),  # Emeldah — good
    (25, 45),  # Chanda — critical
    (70, 90),  # Mulenga — good
    (35, 55),  # Bupe — high risk
    (55, 72),  # Nkandu — medium
    (20, 40),  # Chilufya — critical
    (80, 98),  # Mutinta — low risk
    (58, 74),  # Chembe — medium
    (30, 50),  # Matilda — high risk
    (72, 88),  # Kelvin — low risk
]

course_assessments = {}
for a in assessments:
    course_assessments.setdefault(a.course_id, []).append(a)

for i, profile in enumerate(student_profiles):
    lo, hi = score_ranges[i]
    for course in courses[:2]:  # Assign to first 2 courses
        for assessment in course_assessments.get(course.id, []):
            if assessment.assessment_type == "exam" and random.random() < 0.1:
                continue  # Occasional missing result
            pct = random.uniform(lo, hi) / 100
            marks = round(assessment.max_marks * pct, 1)
            on_time = random.random() > (0.4 if attendance_rates[i] < 0.6 else 0.05)
            r = AssessmentResult(
                id=uid(), student_id=profile.id, assessment_id=assessment.id,
                marks_obtained=marks, submitted_on_time=on_time,
            )
            db.add(r)

db.commit()
db.close()

print("\n✅ Seed complete!")
print("\nDemo credentials (password: password123):")
print("  Admin:    admin@uni.ac.zm")
print("  Lecturer: shumba@uni.ac.zm")
print("  Lecturer: banda@uni.ac.zm")
print("  Students: student1@uni.ac.zm … student10@uni.ac.zm")
print("\nNow run predictions at: http://localhost:8000/docs")
