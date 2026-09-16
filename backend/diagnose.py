"""
Diagnose why a student has no prediction.

Usage:
  cd backend
  python diagnose.py                      # environment + database totals
  python diagnose.py student2@uni.ac.zm   # ...plus everything about one student

Paste the whole output when asking for help — it answers the usual questions
(did the seed finish? is the ML branch crashing? is the model file stale?) in
one go, without needing access to the machine.
"""

import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def section(title):
    print(f"\n── {title} " + "─" * max(0, 60 - len(title)))


def main():
    email = sys.argv[1].strip().lower() if len(sys.argv) > 1 else None

    section("Environment")
    print(f"python        {sys.version.split()[0]}  ({sys.platform})")
    for mod in ("sqlalchemy", "fastapi", "bcrypt", "xgboost", "shap", "sklearn"):
        try:
            m = __import__(mod)
            print(f"{mod:<13} OK  {getattr(m, '__version__', '')}")
        except Exception as e:  # noqa: BLE001
            print(f"{mod:<13} FAIL {type(e).__name__}: {str(e).splitlines()[0][:90]}")

    import ml.predictor as predictor
    print(f"ML_AVAILABLE  {predictor.ML_AVAILABLE}")
    for label, path in (("risk model", predictor.RISK_CLASSIFIER_PATH),
                        ("gpa model", predictor.GPA_REGRESSOR_PATH)):
        print(f"{label:<13} {'present' if os.path.exists(path) else 'absent'}  {path}")
    print("scoring path  " + ("trained model (XGBoost + SHAP)"
                              if predictor.ML_AVAILABLE and os.path.exists(predictor.RISK_CLASSIFIER_PATH)
                              else "rule-based fallback"))

    section("Database")
    from core.config import get_settings
    from db.session import SessionLocal
    from sqlalchemy import text
    url = get_settings().DATABASE_URL
    print("DATABASE_URL  " + (url.split("@")[-1] if "@" in url else url))
    db = SessionLocal()
    try:
        for table in ("users", "student_profiles", "courses", "assessments", "attendance_records",
                      "assessment_results", "semester_gpas", "risk_predictions", "interventions"):
            try:
                n = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                print(f"{table:<20} {n:>8,}")
            except Exception as e:  # noqa: BLE001
                db.rollback()
                print(f"{table:<20}  ERROR {str(e).splitlines()[0][:70]}")

        if not email:
            print("\nRun again with a student email for per-student detail.")
            return

        section(f"Student {email}")
        from sqlalchemy import func
        from db.models import (User, StudentProfile, AttendanceRecord, AssessmentResult,
                               RiskPrediction, SemesterGPA)
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            print("NO USER with that email. Check the Students list for the exact address.")
            return
        print(f"user          {user.full_name}  role={user.role.value}  active={user.is_active}")
        profile = db.query(StudentProfile).filter(StudentProfile.user_id == user.id).first()
        if not profile:
            print("NO STUDENT PROFILE linked to this user (role may not be student).")
            return
        print(f"profile       {profile.student_number}  {profile.programme}  year {profile.year_of_study}")
        counts = {
            "attendance rows": db.query(AttendanceRecord).filter(AttendanceRecord.student_id == profile.id).count(),
            "assessment rows": db.query(AssessmentResult).filter(AssessmentResult.student_id == profile.id).count(),
            "semester GPAs":   db.query(SemesterGPA).filter(SemesterGPA.student_id == profile.id).count(),
            "stored predictions": db.query(RiskPrediction).filter(RiskPrediction.student_id == profile.id).count(),
        }
        for k, v in counts.items():
            print(f"{k:<20} {v}")
        if counts["attendance rows"] == 0 and counts["assessment rows"] == 0:
            print("\n→ This student has NO attendance and NO marks, so there is nothing to assess.")
            print("  If they are a seeded student, the seed did not finish: re-run  python seed.py")

        section("Live prediction attempt")
        try:
            result = predictor.predict_student_risk(profile.id, db)
        except Exception:  # noqa: BLE001
            print("EXCEPTION while predicting — this is the bug:\n")
            traceback.print_exc()
            return
        if result is None:
            print("Predictor declined (returned None): not enough data for this student.")
            return
        print(f"risk          {result['risk_level'].value}  score={result['risk_score']}  gpa={result['predicted_gpa']}")
        for f in result["risk_factors"]:
            print(f"  {f['impact']:+.3f}  {f['factor']:<26} {f['value']}")
        print("\n✓ Prediction works for this student. If the app still shows nothing, the API")
        print("  process is probably running old code — stop it and start it again.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
