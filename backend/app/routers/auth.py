"""Authentication endpoints (FR-AAA-001)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.username == payload.username))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if security.is_locked(user):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Account locked until {user.locked_until.isoformat()} after repeated failures",
        )
    if not security.verify_password(payload.password, user.password_hash):
        security.register_login_failure(db, user)
        security.record_audit(db, user, "LOGIN_FAILED", resource_type="user", resource_id=user.username)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()
    security.record_audit(db, user, "LOGIN", resource_type="user", resource_id=user.username)
    db.commit()
    return schemas.TokenResponse(
        access_token=security.create_token(user, "access"),
        refresh_token=security.create_token(user, "refresh"),
        user=schemas.UserOut.model_validate(user),
    )


@router.post("/refresh")
def refresh(payload: schemas.RefreshRequest, db: Session = Depends(get_db)):
    claims = security.decode_token(payload.refresh_token)
    if claims.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token required")
    user = db.get(models.User, claims["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return {"access_token": security.create_token(user, "access")}


@router.post("/logout")
def logout(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    security.record_audit(db, user, "LOGOUT", resource_type="user", resource_id=user.username)
    db.commit()
    return {"detail": "Logged out"}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(security.current_user)):
    return schemas.UserOut.model_validate(user)
