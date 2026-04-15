from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from db.session import get_db
from db.models import User, StudentProfile
from api.schemas import Token, LoginRequest, UserCreate, UserOut, StudentProfileCreate, StudentRegisterRequest
from core.auth import verify_password, hash_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    token = create_access_token({"sub": user.id, "role": user.role})
    return Token(
        access_token=token,
        role=user.role,
        user_id=user.id,
        full_name=user.full_name
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/register/student", response_model=UserOut, status_code=201)
def register_student(data: StudentRegisterRequest, db: Session = Depends(get_db)):
    """Register a student with their academic profile in one flat request body."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    from db.models import UserRole
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole.STUDENT,
    )
    db.add(user)
    db.flush()

    profile_fields = {"student_number", "programme", "year_of_study",
                      "ses_status", "is_scholarship", "is_employed_part_time",
                      "distance_from_campus_km"}
    profile = StudentProfile(
        user_id=user.id,
        **{k: v for k, v in data.model_dump().items() if k in profile_fields}
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
