"""Authentication, RBAC and audit helpers (FR-AAA-001, FR-AAA-002)."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import get_db

_bearer = HTTPBearer(auto_error=False)
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 30

PASSWORD_RULES = [
    (r".{8,}", "at least 8 characters"),
    (r"[A-Z]", "an uppercase letter"),
    (r"[a-z]", "a lowercase letter"),
    (r"\d", "a digit"),
    (r"[^A-Za-z0-9]", "a special character"),
]

# Permission matrix from FR-AAA-002. `scope_field` names the Constituency
# attribute a role is restricted to; None means unrestricted.
ROLE_SCOPE_FIELD = {
    "ROLE_ADMIN": None,
    "ROLE_MINISTRY": None,
    "ROLE_STATE_NODAL": "state",
    "ROLE_DISTRICT": "district",
    "ROLE_MP": "name",
    "ROLE_PUBLIC": "__aggregate_only__",
}

ROLE_PERMISSIONS = {
    "ROLE_ADMIN": {"upload_data", "manage_users", "manage_alerts", "generate_reports",
                   "view_works", "view_constituencies", "configure_thresholds"},
    "ROLE_MINISTRY": {"manage_alerts", "generate_reports", "view_works", "view_constituencies"},
    "ROLE_STATE_NODAL": {"manage_alerts", "generate_reports", "view_works", "view_constituencies"},
    "ROLE_DISTRICT": {"manage_alerts", "generate_reports", "view_works"},
    "ROLE_MP": {"generate_reports", "view_works"},
    "ROLE_PUBLIC": set(),
}


def hash_password(password: str) -> str:
    """PBKDF2-SHA256 hashing. The SRS names bcrypt(cost 12); PBKDF2 from the
    standard library keeps the MVP dependency-free with equivalent salted
    key-stretching semantics."""
    salt = hashlib.sha256(password.encode()).hexdigest()[:16]
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return candidate == digest


def password_violations(password: str) -> list[str]:
    return [label for pattern, label in PASSWORD_RULES if not re.search(pattern, password)]


def create_token(user: models.User, kind: str = "access") -> str:
    settings = get_settings()
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if kind == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "scope_type": user.scope_type,
        "scope_value": user.scope_value,
        "type": kind,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    claims = decode_token(credentials.credentials)
    if claims.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access token required")
    user = db.get(models.User, claims["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require(permission: str):
    """Dependency factory enforcing a single named permission."""

    def guard(user: models.User = Depends(current_user)) -> models.User:
        if permission not in ROLE_PERMISSIONS.get(user.role, set()):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return guard


def scope_filter(user: models.User):
    """Return a SQLAlchemy criterion restricting Constituency rows to the
    user's scope, or None when the role sees everything."""
    field = ROLE_SCOPE_FIELD.get(user.role)
    if field is None:
        return None
    if field == "__aggregate_only__":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    if not user.scope_value:
        return None
    return getattr(models.Constituency, field) == user.scope_value


def assert_in_scope(user: models.User, constituency: models.Constituency) -> None:
    field = ROLE_SCOPE_FIELD.get(user.role)
    if field in (None,):
        return
    if field == "__aggregate_only__":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    if user.scope_value and getattr(constituency, field) != user.scope_value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Resource outside your assigned scope")


def record_audit(db: Session, user: models.User | None, action: str, **fields) -> models.AuditLog:
    entry = models.AuditLog(user_id=user.id if user else None, action=action, **fields)
    db.add(entry)
    return entry


def register_login_failure(db: Session, user: models.User) -> None:
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= MAX_FAILED_LOGINS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
    db.commit()


def is_locked(user: models.User) -> bool:
    return bool(user.locked_until and user.locked_until > datetime.utcnow())
