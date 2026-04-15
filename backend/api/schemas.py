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
    # RiskPrediction ORM model stores the timestamp as `created_at`;
    # map it to `predicted_at` for the API output.
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
