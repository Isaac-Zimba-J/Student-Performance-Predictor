from celery import Celery
from celery.schedules import crontab
from core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "student_predictor",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.scheduled"],
)

celery_app.conf.timezone = "Africa/Lusaka"

celery_app.conf.beat_schedule = {
    # Re-run predictions for all students every night at 2am
    "nightly-predictions": {
        "task": "tasks.scheduled.run_all_predictions",
        "schedule": crontab(hour=2, minute=0),
    },
    # Retrain ML models every Sunday at 3am (when enough data exists)
    "weekly-model-retrain": {
        "task": "tasks.scheduled.retrain_models",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
    },
    # Send alerts to lecturers for critical-risk students every Monday 8am
    "weekly-risk-alerts": {
        "task": "tasks.scheduled.send_risk_alerts",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),
    },
}
