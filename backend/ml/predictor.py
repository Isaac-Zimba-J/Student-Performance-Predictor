"""
ML Service — Feature engineering, model training, and prediction.

Models used:
  - XGBoost classifier  → risk level (low/medium/high/critical)
  - Gradient Boosting regressor → predicted end-of-semester GPA
  - SHAP values → explain which factors drove each prediction
"""

import json
import numpy as np
import pandas as pd
from typing import Optional
from sqlalchemy.orm import Session
from db.models import StudentProfile, AttendanceRecord, AssessmentResult, RiskLevel

try:
    import xgboost as xgb
    import shap
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.preprocessing import LabelEncoder
    import joblib
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

import os

MODEL_DIR = os.path.join(os.path.dirname(__file__), "saved_models")
os.makedirs(MODEL_DIR, exist_ok=True)

RISK_CLASSIFIER_PATH = os.path.join(MODEL_DIR, "risk_classifier.json")
GPA_REGRESSOR_PATH = os.path.join(MODEL_DIR, "gpa_regressor.pkl")

FEATURE_NAMES = [
    "attendance_rate",          # % classes attended (0–1)
    "lms_engagement_rate",      # LMS logins per week on average
    "assignment_submission_rate",
    "avg_assessment_score",     # average mark % across all assessments
    "gpa_prior",                # GPA from previous semester (0–4)
    "year_of_study",
    "ses_encoded",              # SES: low=0, middle=1, high=2
    "is_scholarship",
    "is_employed",
    "distance_km",
    "assessments_missed",       # count of null marks
    "late_submissions",         # count of not submitted_on_time
]

FEATURE_LABELS = {
    "attendance_rate": "Class attendance",
    "lms_engagement_rate": "Online platform engagement",
    "assignment_submission_rate": "Assignment submission rate",
    "avg_assessment_score": "Assessment performance",
    "gpa_prior": "Prior academic record",
    "year_of_study": "Year of study",
    "ses_encoded": "Socioeconomic status",
    "is_scholarship": "Scholarship recipient",
    "is_employed": "Part-time employment",
    "distance_km": "Distance from campus",
    "assessments_missed": "Missed assessments",
    "late_submissions": "Late submissions",
}

SES_MAP = {"low": 0, "middle": 1, "high": 2}
RISK_MAP = {0: RiskLevel.LOW, 1: RiskLevel.MEDIUM, 2: RiskLevel.HIGH, 3: RiskLevel.CRITICAL}


def build_features(student_id: str, db: Session) -> Optional[dict]:
    """Pull all student data from DB and engineer the feature vector."""
    profile: StudentProfile = db.query(StudentProfile).filter(
        StudentProfile.id == student_id
    ).first()
    if not profile:
        return None

    # ── Attendance features ────────────────────────────────────────
    attendance_rows = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id
    ).all()

    total_held = sum(r.classes_held for r in attendance_rows) or 1
    total_attended = sum(r.classes_attended for r in attendance_rows)
    total_lms = sum(r.lms_logins for r in attendance_rows)
    total_submissions = sum(r.assignment_submissions for r in attendance_rows)
    weeks = len(attendance_rows) or 1

    attendance_rate = total_attended / total_held
    lms_engagement_rate = total_lms / weeks
    assignment_submission_rate = total_submissions / weeks

    # ── Assessment features ────────────────────────────────────────
    from sqlalchemy.orm import joinedload as _jl
    result_rows = db.query(AssessmentResult).options(
        _jl(AssessmentResult.assessment)
    ).filter(
        AssessmentResult.student_id == student_id
    ).all()

    # Normalise to percentage using each assessment's own max_marks
    pct_scores = [
        (r.marks_obtained / r.assessment.max_marks * 100)
        for r in result_rows
        if r.marks_obtained is not None
        and r.assessment is not None
        and r.assessment.max_marks
    ]
    avg_score = (sum(pct_scores) / len(pct_scores)) if pct_scores else 50.0
    assessments_missed = sum(1 for r in result_rows if r.marks_obtained is None)
    late_submissions = sum(1 for r in result_rows if not r.submitted_on_time)

    # ── Profile features ───────────────────────────────────────────
    ses_encoded = SES_MAP.get(profile.ses_status.value, 1)

    features = {
        "attendance_rate": round(attendance_rate, 4),
        "lms_engagement_rate": round(lms_engagement_rate, 4),
        "assignment_submission_rate": round(assignment_submission_rate, 4),
        "avg_assessment_score": round(avg_score, 4),
        "gpa_prior": 2.5,  # placeholder — load from historical table when available
        "year_of_study": profile.year_of_study,
        "ses_encoded": ses_encoded,
        "is_scholarship": int(profile.is_scholarship),
        "is_employed": int(profile.is_employed_part_time),
        "distance_km": profile.distance_from_campus_km,
        "assessments_missed": assessments_missed,
        "late_submissions": late_submissions,
    }
    return features


def features_to_array(features: dict) -> np.ndarray:
    return np.array([[features[k] for k in FEATURE_NAMES]], dtype=np.float32)


# ── Rule-based fallback (used before model is trained) ────────────────────────

def rule_based_risk(features: dict) -> tuple[RiskLevel, float]:
    """Simple heuristic risk scoring — replaced by ML once model is trained."""
    score = 0.0

    # Attendance (weight 40%)
    att = features["attendance_rate"]
    if att < 0.5:
        score += 0.4
    elif att < 0.7:
        score += 0.25
    elif att < 0.85:
        score += 0.1

    # Assessment performance (weight 35%)
    perf = features["avg_assessment_score"]
    if perf < 40:
        score += 0.35
    elif perf < 55:
        score += 0.22
    elif perf < 65:
        score += 0.1

    # SES (weight 15%)
    if features["ses_encoded"] == 0:
        score += 0.1
    if features["is_employed"]:
        score += 0.05

    # Missed assessments (weight 10%)
    score += min(features["assessments_missed"] * 0.04, 0.1)
    score += min(features["late_submissions"] * 0.02, 0.05)

    score = min(score, 1.0)

    if score < 0.25:
        level = RiskLevel.LOW
    elif score < 0.5:
        level = RiskLevel.MEDIUM
    elif score < 0.75:
        level = RiskLevel.HIGH
    else:
        level = RiskLevel.CRITICAL

    return level, round(score, 4)


def predict_student_risk(student_id: str, db: Session) -> Optional[dict]:
    """
    Main prediction entry point.
    Returns a dict with risk_level, risk_score, predicted_gpa, risk_factors.
    """
    features = build_features(student_id, db)
    if features is None:
        return None

    X = features_to_array(features)

    # ── Try trained ML model first ─────────────────────────────────
    if ML_AVAILABLE and os.path.exists(RISK_CLASSIFIER_PATH):
        classifier = xgb.XGBClassifier()
        classifier.load_model(RISK_CLASSIFIER_PATH)

        proba = classifier.predict_proba(X)[0]
        pred_class = int(np.argmax(proba))
        risk_level = RISK_MAP[pred_class]
        risk_score = float(proba[pred_class])

        # SHAP explanations
        explainer = shap.TreeExplainer(classifier)
        shap_values = explainer.shap_values(X)
        # For multi-class, use the predicted class's SHAP values
        if isinstance(shap_values, list):
            class_shap = shap_values[pred_class][0]
        else:
            class_shap = shap_values[0]

        risk_factors = []
        for fname, impact in zip(FEATURE_NAMES, class_shap):
            risk_factors.append({
                "factor": FEATURE_LABELS.get(fname, fname),
                "impact": round(float(impact), 4),
                "value": str(round(features[fname], 3)),
            })
        risk_factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

        predicted_gpa = None
        if os.path.exists(GPA_REGRESSOR_PATH):
            gpa_model = joblib.load(GPA_REGRESSOR_PATH)
            predicted_gpa = float(round(gpa_model.predict(X)[0], 2))

    else:
        # ── Fallback: rule-based scoring ──────────────────────────
        risk_level, risk_score = rule_based_risk(features)

        risk_factors = [
            {
                "factor": FEATURE_LABELS.get(k, k),
                "impact": round((1 - features[k]) * 0.4 if k == "attendance_rate" else features[k] * 0.1, 4),
                "value": str(round(features[k], 3)),
            }
            for k in FEATURE_NAMES
        ]
        risk_factors.sort(key=lambda x: abs(x["impact"]), reverse=True)
        predicted_gpa = None

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "predicted_gpa": predicted_gpa,
        "risk_factors": risk_factors[:5],   # top 5 factors
        "raw_features": features,
    }


def generate_recommendations(risk_result: dict) -> list[str]:
    """Generate human-readable recommendations based on the top risk factors."""
    recommendations = []
    features = risk_result.get("raw_features", {})
    risk_level = risk_result["risk_level"]

    if features.get("attendance_rate", 1.0) < 0.75:
        recommendations.append(
            f"Your attendance is at {round(features['attendance_rate']*100)}% — "
            "aim for at least 80% to stay on track. Consider speaking to your course lecturer."
        )

    if features.get("avg_assessment_score", 100) < 55:
        recommendations.append(
            "Your average assessment score is below the pass mark. "
            "Book a tutoring session or visit the academic support centre."
        )

    if features.get("assessments_missed", 0) > 1:
        recommendations.append(
            f"You have {features['assessments_missed']} missed assessment(s). "
            "Contact your lecturer immediately to discuss make-up opportunities."
        )

    if features.get("lms_engagement_rate", 10) < 2:
        recommendations.append(
            "Your online platform engagement is very low. "
            "Logging in regularly to access materials and announcements is essential."
        )

    if features.get("is_employed") and features.get("attendance_rate", 1.0) < 0.8:
        recommendations.append(
            "Balancing part-time work with studies can be challenging. "
            "Speak to a student counsellor about time management strategies."
        )

    if risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
        recommendations.append(
            "⚠️ Your academic risk level is serious. Please schedule a meeting with your "
            "academic advisor or student support services as soon as possible."
        )

    if not recommendations:
        recommendations.append(
            "You are on track — keep up the good attendance and consistent effort! "
            "Review your upcoming assessment schedule to stay ahead."
        )

    return recommendations


def train_models(training_data: pd.DataFrame):
    """
    Train risk classifier and GPA regressor from labelled data.
    Call this from the admin endpoint or Celery task once enough data is collected.

    training_data columns must include all FEATURE_NAMES plus:
      - risk_label: int (0=low, 1=medium, 2=high, 3=critical)
      - final_gpa: float
    """
    if not ML_AVAILABLE:
        raise RuntimeError("ML libraries not installed. Run: pip install xgboost shap scikit-learn")

    X = training_data[FEATURE_NAMES].values.astype(np.float32)
    y_risk = training_data["risk_label"].values
    y_gpa = training_data["final_gpa"].values

    # Risk classifier
    clf = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        eval_metric="mlogloss",
        random_state=42,
    )
    clf.fit(X, y_risk)
    clf.save_model(RISK_CLASSIFIER_PATH)

    # GPA regressor
    reg = GradientBoostingRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.08,
        random_state=42,
    )
    reg.fit(X, y_gpa)
    joblib.dump(reg, GPA_REGRESSOR_PATH)

    return {"status": "trained", "samples": len(X)}
