"""
Scheduled background tasks:
  1. run_all_predictions  — nightly risk scoring for every student
  2. retrain_models       — weekly ML model retraining
  3. send_risk_alerts     — notify lecturers about critical-risk students
"""

import logging
from tasks.celery_app import celery_app
from db.session import SessionLocal
from db.models import StudentProfile, RiskPrediction, RiskLevel, User, UserRole

log = logging.getLogger(__name__)


@celery_app.task(bind=True, name="tasks.scheduled.run_all_predictions", max_retries=2)
def run_all_predictions(self):
    """Re-generate risk predictions for every active student."""
    from ml.predictor import predict_student_risk, generate_recommendations
    import json

    db = SessionLocal()
    try:
        students = db.query(StudentProfile).all()
        updated = 0
        failed = 0

        for profile in students:
            try:
                result = predict_student_risk(profile.id, db)
                if result is None:
                    continue

                record = RiskPrediction(
                    student_id=profile.id,
                    risk_level=result["risk_level"],
                    risk_score=result["risk_score"],
                    predicted_gpa=result.get("predicted_gpa"),
                    top_risk_factors=json.dumps(result["risk_factors"]),
                )
                db.add(record)
                updated += 1
            except Exception as e:
                log.warning(f"Prediction failed for student {profile.id}: {e}")
                failed += 1

        db.commit()
        log.info(f"Nightly predictions: {updated} updated, {failed} failed")
        return {"updated": updated, "failed": failed}

    except Exception as exc:
        log.error(f"run_all_predictions failed: {exc}")
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.scheduled.retrain_models", max_retries=1)
def retrain_models(self):
    """Retrain XGBoost and GPA models from the latest labelled data."""
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

            latest_pred = (
                db.query(RiskPrediction)
                .filter(RiskPrediction.student_id == profile.id)
                .order_by(RiskPrediction.created_at.desc())
                .first()
            )
            if not latest_pred:
                continue

            features["risk_label"] = risk_label_map.get(latest_pred.risk_level.value, 1)
            features["final_gpa"] = latest_pred.predicted_gpa or 2.5
            records.append(features)

        if len(records) < 10:
            log.info(f"Skipping retrain — only {len(records)} labelled records (need 10+)")
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


@celery_app.task(name="tasks.scheduled.send_risk_alerts")
def send_risk_alerts():
    """
    Collect all CRITICAL and HIGH risk students and log alerts.
    In production: replace log.warning() with email/SMS via SendGrid/Twilio.
    """
    db = SessionLocal()
    try:
        # Get the latest prediction per student
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

        # Get all lecturers to notify
        lecturers = db.query(User).filter(User.role == UserRole.LECTURER, User.is_active == True).all()

        for lecturer in lecturers:
            student_lines = []
            for p in at_risk:
                profile = db.query(StudentProfile).filter(StudentProfile.id == p.student_id).first()
                if profile:
                    student_lines.append(
                        f"  - {profile.student_number} ({profile.programme}) "
                        f"→ {p.risk_level.value.upper()} (score: {round(p.risk_score*100)}%)"
                    )

            alert_body = (
                f"Weekly Risk Alert — AcademIQ\n\n"
                f"Dear {lecturer.full_name},\n\n"
                f"{len(at_risk)} student(s) currently require your attention:\n"
                + "\n".join(student_lines)
                + "\n\nPlease log in to AcademIQ to review and create interventions."
            )
            # TODO: replace with real email/SMS delivery
            log.warning(f"[ALERT → {lecturer.email}]\n{alert_body}")

        return {"alerts_sent": len(lecturers), "at_risk_students": len(at_risk)}

    finally:
        db.close()
