from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from db.session import get_db
from db.models import User, StudentProfile, RiskPrediction
from api.schemas import PredictionOut, RiskSummary, RiskFactorDetail, PredictionHistoryPoint
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
        .all()
    )
    return [PredictionHistoryPoint.model_validate(r) for r in records]


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
