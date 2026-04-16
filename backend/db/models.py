from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func
import enum
import uuid


class Base(DeclarativeBase):
    pass


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class UserRole(str, enum.Enum):
    STUDENT = "student"
    LECTURER = "lecturer"
    ADMIN = "admin"


class SESStatus(str, enum.Enum):
    LOW = "low"
    MIDDLE = "middle"
    HIGH = "high"


# ─── USER ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(SAEnum(UserRole, native_enum=False), nullable=False, default=UserRole.STUDENT)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student_profile = relationship("StudentProfile", back_populates="user", uselist=False)


# ─── STUDENT PROFILE ─────────────────────────────────────────────────────────

class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), unique=True, nullable=False)
    student_number = Column(String, unique=True, nullable=False, index=True)
    programme = Column(String, nullable=False)
    year_of_study = Column(Integer, nullable=False)
    ses_status = Column(SAEnum(SESStatus, native_enum=False), default=SESStatus.MIDDLE)
    is_scholarship = Column(Boolean, default=False)
    is_employed_part_time = Column(Boolean, default=False)
    distance_from_campus_km = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="student_profile")
    attendance_records = relationship("AttendanceRecord", back_populates="student")
    assessment_results = relationship("AssessmentResult", back_populates="student")
    risk_predictions = relationship("RiskPrediction", back_populates="student")
    interventions = relationship("Intervention", back_populates="student")

    @property
    def full_name(self) -> str:
        return self.user.full_name if self.user else ""


# ─── COURSE ───────────────────────────────────────────────────────────────────

class Course(Base):
    __tablename__ = "courses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    credits = Column(Integer, default=3)
    semester = Column(Integer, nullable=False)
    academic_year = Column(String, nullable=False)
    lecturer_id = Column(String, ForeignKey("users.id"))
    total_classes = Column(Integer, default=30)

    lecturer = relationship("User")
    attendance_records = relationship("AttendanceRecord", back_populates="course")
    assessments = relationship("Assessment", back_populates="course")


# ─── ATTENDANCE ───────────────────────────────────────────────────────────────

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("student_profiles.id"), nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    week_number = Column(Integer, nullable=False)
    classes_held = Column(Integer, default=1)
    classes_attended = Column(Integer, default=0)
    lms_logins = Column(Integer, default=0)          # LMS engagement
    assignment_submissions = Column(Integer, default=0)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("StudentProfile", back_populates="attendance_records")
    course = relationship("Course", back_populates="attendance_records")


# ─── ASSESSMENTS ─────────────────────────────────────────────────────────────

class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    name = Column(String, nullable=False)        # e.g. "Test 1", "Assignment 2", "Exam"
    assessment_type = Column(String, nullable=False)   # test | assignment | exam
    max_marks = Column(Float, default=100.0)
    weight_percent = Column(Float, default=10.0)
    due_date = Column(DateTime(timezone=True))

    course = relationship("Course", back_populates="assessments")
    results = relationship("AssessmentResult", back_populates="assessment")


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("student_profiles.id"), nullable=False)
    assessment_id = Column(String, ForeignKey("assessments.id"), nullable=False)
    marks_obtained = Column(Float, nullable=True)   # Null = not yet submitted
    submitted_on_time = Column(Boolean, default=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("StudentProfile", back_populates="assessment_results")
    assessment = relationship("Assessment", back_populates="results")


# ─── RISK PREDICTION ─────────────────────────────────────────────────────────

class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("student_profiles.id"), nullable=False)
    risk_level = Column(SAEnum(RiskLevel, native_enum=False), nullable=False)
    risk_score = Column(Float, nullable=False)          # 0.0 – 1.0
    predicted_gpa = Column(Float, nullable=True)
    top_risk_factors = Column(Text, nullable=True)      # JSON string of SHAP values
    model_version = Column(String, default="v1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("StudentProfile", back_populates="risk_predictions")


# ─── INTERVENTIONS ────────────────────────────────────────────────────────────

class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String, ForeignKey("student_profiles.id"), nullable=False)
    intervention_type = Column(String, nullable=False)  # tutoring | counseling | alert | resource
    description = Column(Text, nullable=False)
    recommended_by = Column(String, default="system")   # system | lecturer_id
    is_actioned = Column(Boolean, default=False)
    outcome_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    actioned_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("StudentProfile", back_populates="interventions")