from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from db.session import get_db
from db.models import User, StudentProfile, AttendanceRecord, AssessmentResult, Intervention, Course, Assessment
from api.schemas import (
    AttendanceCreate, AttendanceOut,
    AssessmentResultCreate, AssessmentResultOut,
    InterventionCreate, InterventionUpdate, InterventionOut,
    StudentDashboard, StudentProfileOut,
    CourseOut, AssessmentOut,
)
from core.auth import get_current_user, require_role
from datetime import datetime

# ─── COURSES ─────────────────────────────────────────────────────────────────

courses_router = APIRouter(prefix="/courses", tags=["Courses"])


@courses_router.get("/", response_model=List[CourseOut])
def list_courses(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    courses = db.query(Course).all()
    result = []
    for c in courses:
        out = CourseOut.model_validate(c)
        out.assessments = [AssessmentOut.model_validate(a) for a in c.assessments]
        result.append(out)
    return result


@courses_router.get("/{course_id}/assessments", response_model=List[AssessmentOut])
def list_assessments(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    return db.query(Assessment).filter(Assessment.course_id == course_id).all()


# ─── STUDENTS ────────────────────────────────────────────────────────────────

students_router = APIRouter(prefix="/students", tags=["Students"])


@students_router.get("/", response_model=List[StudentProfileOut])
def list_students(
    programme: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    q = db.query(StudentProfile)
    if programme:
        q = q.filter(StudentProfile.programme == programme)
    if year:
        q = q.filter(StudentProfile.year_of_study == year)
    return q.all()


@students_router.get("/me/dashboard", response_model=StudentDashboard)
def my_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = current_user.student_profile
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return _build_dashboard(profile, db)


@students_router.get("/{student_id}/dashboard", response_model=StudentDashboard)
def student_dashboard(
    student_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    profile = db.query(StudentProfile).filter(StudentProfile.id == student_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Student not found")
    return _build_dashboard(profile, db)


def _build_dashboard(profile: StudentProfile, db: Session) -> StudentDashboard:
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

    from api.routes.predictions import get_prediction
    from db.models import RiskPrediction
    latest_prediction_record = (
        db.query(RiskPrediction)
        .filter(RiskPrediction.student_id == profile.id)
        .order_by(RiskPrediction.created_at.desc())
        .first()
    )

    return StudentDashboard(
        profile=StudentProfileOut.model_validate(profile),
        current_risk=None,
        attendance_summary=attendance_summary,
        recent_results=[AssessmentResultOut.model_validate(r) for r in recent_results],
        pending_interventions=[InterventionOut.model_validate(i) for i in pending_interventions],
    )


# ─── ATTENDANCE ───────────────────────────────────────────────────────────────

attendance_router = APIRouter(prefix="/attendance", tags=["Attendance"])


@attendance_router.post("/", response_model=AttendanceOut, status_code=201)
def record_attendance(
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    record = AttendanceRecord(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    rate = record.classes_attended / (record.classes_held or 1)
    out = AttendanceOut.model_validate(record)
    out.attendance_rate = round(rate, 4)
    return out


@attendance_router.get("/student/{student_id}", response_model=List[AttendanceOut])
def get_student_attendance(
    student_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id
    ).order_by(AttendanceRecord.week_number).all()
    result = []
    for r in rows:
        out = AttendanceOut.model_validate(r)
        out.attendance_rate = round(r.classes_attended / (r.classes_held or 1), 4)
        result.append(out)
    return result


# ─── ASSESSMENT RESULTS ───────────────────────────────────────────────────────

results_router = APIRouter(prefix="/results", tags=["Assessment Results"])


@results_router.post("/", response_model=AssessmentResultOut, status_code=201)
def submit_result(
    data: AssessmentResultCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    from db.models import Assessment
    assessment = db.query(Assessment).filter(Assessment.id == data.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    result = AssessmentResult(**data.model_dump())
    db.add(result)
    db.commit()
    db.refresh(result)

    out = AssessmentResultOut.model_validate(result)
    if result.marks_obtained is not None:
        out.percentage = round(result.marks_obtained / assessment.max_marks * 100, 1)
    return out


@results_router.get("/student/{student_id}", response_model=List[AssessmentResultOut])
def get_student_results(
    student_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(AssessmentResult).filter(
        AssessmentResult.student_id == student_id
    ).order_by(AssessmentResult.recorded_at.desc()).all()
    return [AssessmentResultOut.model_validate(r) for r in rows]


# ─── INTERVENTIONS ────────────────────────────────────────────────────────────

interventions_router = APIRouter(prefix="/interventions", tags=["Interventions"])


@interventions_router.post("/", response_model=InterventionOut, status_code=201)
def create_intervention(
    data: InterventionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    intervention = Intervention(**data.model_dump())
    db.add(intervention)
    db.commit()
    db.refresh(intervention)
    return InterventionOut.model_validate(intervention)


@interventions_router.patch("/{intervention_id}", response_model=InterventionOut)
def update_intervention(
    intervention_id: str,
    data: InterventionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    intervention = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention not found")

    intervention.is_actioned = data.is_actioned
    if data.outcome_note:
        intervention.outcome_note = data.outcome_note
    if data.is_actioned:
        intervention.actioned_at = datetime.utcnow()

    db.commit()
    db.refresh(intervention)
    return InterventionOut.model_validate(intervention)


@interventions_router.get("/student/{student_id}", response_model=List[InterventionOut])
def get_interventions(
    student_id: str,
    pending_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Intervention).filter(Intervention.student_id == student_id)
    if pending_only:
        q = q.filter(Intervention.is_actioned == False)
    return [InterventionOut.model_validate(i) for i in q.order_by(Intervention.created_at.desc()).all()]
