"""
Authentication router — Firebase token verification + JWT issuance.

Flow:
1. Client sends Firebase ID token to POST /auth/verify
2. Backend verifies token with Firebase Admin SDK
3. Creates user if first login, or retrieves existing user
4. Returns JWT access token for subsequent API calls
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas import UserResponse
from app.auth.firebase import verify_firebase_token
from app.auth.jwt_handler import create_access_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenVerifyRequest(BaseModel):
    """Request body for token verification."""
    id_token: str
    # For first-login, client sends role selection
    name: str | None = None
    role: UserRole | None = None
    language_pref: str = "en"


class TokenResponse(BaseModel):
    """Response with JWT and user info."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    is_new_user: bool


@router.post("/verify", response_model=TokenResponse)
def verify_token(request: TokenVerifyRequest, db: Session = Depends(get_db)):
    """
    Verify a Firebase ID token and issue a JWT.

    - If user exists: return JWT + user info
    - If new user: requires name and role, creates user, returns JWT
    """
    # Verify Firebase token
    decoded = verify_firebase_token(request.id_token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token",
        )

    firebase_uid = decoded.get("uid", "")
    phone = decoded.get("phone_number")

    # Check for existing user by firebase_uid
    existing_user = (
        db.query(User).filter(User.firebase_uid == firebase_uid).first()
    )

    if existing_user:
        # Existing user — issue JWT
        access_token = create_access_token(
            data={"user_id": existing_user.id, "role": existing_user.role.value}
        )
        return TokenResponse(
            access_token=access_token,
            user=UserResponse.model_validate(existing_user),
            is_new_user=False,
        )

    # New user — name and role are required
    if not request.name or not request.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New users must provide name and role",
        )

    new_user = User(
        phone=phone or f"dev-{firebase_uid}",
        role=request.role,
        name=request.name,
        language_pref=request.language_pref,
        firebase_uid=firebase_uid,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(
        data={"user_id": new_user.id, "role": new_user.role.value}
    )
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(new_user),
        is_new_user=True,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return current_user


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    language_pref: str | None = None


@router.patch("/me", response_model=UserResponse)
def update_profile(
    updates: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile fields such as language preference."""
    if updates.name is not None:
        current_user.name = updates.name
    if updates.language_pref is not None:
        current_user.language_pref = updates.language_pref

    db.commit()
    db.refresh(current_user)
    return current_user
