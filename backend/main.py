from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes.auth import router as auth_router
from api.routes.predictions import router as predictions_router
from api.routes.data import (
    courses_router,
    students_router,
    attendance_router,
    results_router,
    interventions_router,
    semester_gpa_router,
)
from core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db.session import engine
    from db.models import Base
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")
    yield


app = FastAPI(
    title="Student Performance Predictor API",
    description="AI-powered system for identifying at-risk students and recommending interventions.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api"
app.include_router(auth_router, prefix=PREFIX)
app.include_router(predictions_router, prefix=PREFIX)
app.include_router(courses_router, prefix=PREFIX)
app.include_router(students_router, prefix=PREFIX)
app.include_router(attendance_router, prefix=PREFIX)
app.include_router(results_router, prefix=PREFIX)
app.include_router(interventions_router, prefix=PREFIX)
app.include_router(semester_gpa_router, prefix=PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
