from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from db.session import get_db
from db.models import User, StudentProfile, RiskPrediction
from api.schemas import (
    PredictionOut, RiskSummary, RiskFactorDetail, PredictionHistoryPoint,
    LatestPredictionRow,
)
from core.auth import get_current_user, require_role
from ml.predictor import predict_student_risk, generate_recommendations
import json

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.get("/student/{student_id}", response_model=PredictionOut)
def get_prediction(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run or retrieve the latest risk prediction for a student."""
    profile = db.query(StudentProfile).filter(StudentProfile.id == student_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Student not found")

    # Students can only view their own prediction
    if current_user.role.value == "student":
        if not profile.user_id == current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = predict_student_risk(student_id, db)
    if result is None:
        raise HTTPException(status_code=422, detail="Not enough data to generate prediction")

    recommendations = generate_recommendations(result)

    # Persist prediction
    prediction_record = RiskPrediction(
        student_id=student_id,
        risk_level=result["risk_level"],
        risk_score=result["risk_score"],
        predicted_gpa=result.get("predicted_gpa"),
        top_risk_factors=json.dumps(result["risk_factors"]),
    )
    db.add(prediction_record)
    db.commit()

    user = profile.user
    return PredictionOut(
        student_id=student_id,
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


@router.get("/my", response_model=PredictionOut)
def my_prediction(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Students call this to get their own prediction."""
    profile = current_user.student_profile
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return get_prediction(profile.id, db, current_user)


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


@router.get("/risk-summary", response_model=RiskSummary)
def risk_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    """
    Cohort-level risk breakdown for the dashboard.

    Counting happens entirely in SQL — at several thousand students there are
    far too many prediction rows to pull into Python just to group them.
    """
    latest = _latest_prediction_subquery()

    rows = (
        db.query(latest.c.risk_level, func.count().label("n"))
        .filter(latest.c.rn == 1)
        .group_by(latest.c.risk_level)
        .all()
    )
    # risk_level comes back as a RiskLevel enum, whose str() is "RiskLevel.LOW" —
    # key the counts off the stored value ("low") instead.
    counts = {getattr(level, "value", level): n for level, n in rows}

    low = counts.get("low", 0)
    medium = counts.get("medium", 0)
    high = counts.get("high", 0)
    critical = counts.get("critical", 0)

    total = low + medium + high + critical
    at_risk = high + critical

    return RiskSummary(
        total_students=total,
        low_risk=low,
        medium_risk=medium,
        high_risk=high,
        critical_risk=critical,
        at_risk_percentage=round(at_risk / total * 100, 1) if total else 0.0,
    )


@router.get("/latest", response_model=List[LatestPredictionRow])
def latest_predictions(
    response: Response,
    risk_level: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "lecturer")),
):
    """
    Paged listing of each student's most recent prediction, highest risk first.

    Lets the predictions screen show existing scores without firing one request
    per student. The unpaged total is returned in the `X-Total-Count` header.
    """
    latest = _latest_prediction_subquery()

    conditions = [latest.c.rn == 1]
    if risk_level:
        conditions.append(latest.c.risk_level == risk_level.lower())
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        conditions.append(or_(
            func.lower(StudentProfile.student_number).like(term),
            func.lower(StudentProfile.programme).like(term),
            func.lower(User.full_name).like(term),
        ))

    # Highest risk first, so the students needing attention lead the list.
    severity = case(
        (latest.c.risk_level == "critical", 0),
        (latest.c.risk_level == "high", 1),
        (latest.c.risk_level == "medium", 2),
        else_=3,
    )

    base = (
        db.query(
            StudentProfile.id.label("student_id"),
            User.full_name.label("student_name"),
            StudentProfile.student_number,
            StudentProfile.programme,
            StudentProfile.year_of_study,
            latest.c.risk_level,
            latest.c.risk_score,
            latest.c.predicted_gpa,
            latest.c.created_at.label("predicted_at"),
        )
        .select_from(latest)
        .join(StudentProfile, StudentProfile.id == latest.c.student_id)
        .join(User, User.id == StudentProfile.user_id)
        .filter(*conditions)
    )

    total = (
        db.query(func.count())
        .select_from(latest)
        .join(StudentProfile, StudentProfile.id == latest.c.student_id)
        .join(User, User.id == StudentProfile.user_id)
        .filter(*conditions)
        .scalar()
    ) or 0
    response.headers["X-Total-Count"] = str(total)

    rows = (
        base.order_by(severity.asc(), latest.c.risk_score.desc(), StudentProfile.student_number)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [LatestPredictionRow.model_validate(r) for r in rows]


def _latest_prediction_subquery():
    """
    Subquery numbering each student's predictions newest-first, so `rn == 1`
    selects exactly one current prediction per student.
    """
    row_number = func.row_number().over(
        partition_by=RiskPrediction.student_id,
        order_by=RiskPrediction.created_at.desc(),
    ).label("rn")
    return (
        select(
            RiskPrediction.student_id,
            RiskPrediction.risk_level,
            RiskPrediction.risk_score,
            RiskPrediction.predicted_gpa,
            RiskPrediction.created_at,
            row_number,
        ).subquery()
    )


@router.post("/train", status_code=202)
def trigger_training(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """Admin endpoint to trigger model retraining from collected data."""
    import pandas as pd
    from ml.predictor import build_features, train_models

    students = db.query(StudentProfile).all()
    records = []
    for s in students:
        f = build_features(s.id, db)
        if f:
            # Use latest risk prediction as label (if available)
            latest = (
                db.query(RiskPrediction)
                .filter(RiskPrediction.student_id == s.id)
                .order_by(RiskPrediction.created_at.desc())
                .first()
            )
            risk_label_map = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            if latest:
                f["risk_label"] = risk_label_map.get(latest.risk_level.value, 1)
                f["final_gpa"] = latest.predicted_gpa or 2.5
                records.append(f)

    if len(records) < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 10 labelled student records to train. Have {len(records)}."
        )

    df = pd.DataFrame(records)
    result = train_models(df)
    return {"message": "Model retrained successfully", **result}
