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
from app.schemas import UserResponse, UserRegisterRequest, UserLoginRequest
from app.auth.security import hash_password, verify_password
from app.auth.firebase import verify_firebase_token
from app.auth.jwt_handler import create_access_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenVerifyRequest(BaseModel):
    """Request body for token verification."""
    id_token: str
    phone: str | None = None
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


@router.post("/register", response_model=TokenResponse)
def register_user(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new user with email and password."""
    clean_email = request.email.lower().strip()
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered. Please sign in instead.",
        )

    # Provide safe fallback phone in case old DB schema has NOT NULL/UNIQUE on phone
    phone_val = (
        request.phone.strip()
        if request.phone and request.phone.strip()
        else f"usr-{clean_email.split('@')[0][:12]}"
    )

    new_user = User(
        email=clean_email,
        hashed_password=hash_password(request.password),
        name=request.name.strip(),
        role=request.role,
        phone=phone_val[:20],
        org_name=request.org_name.strip() if request.org_name else None,
        address=request.address.strip() if request.address else None,
        language_pref=request.language_pref,
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except Exception as e:
        db.rollback()
        err_msg = str(e)
        if "UNIQUE" in err_msg.upper() or "duplicate" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or phone is already registered. Please sign in.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration error: {err_msg}",
        )

    access_token = create_access_token(
        data={"user_id": new_user.id, "role": new_user.role.value}
    )
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(new_user),
        is_new_user=True,
    )



@router.post("/login", response_model=TokenResponse)
def login_user(request: UserLoginRequest, db: Session = Depends(get_db)):
    """Sign in an existing user with email and password."""
    clean_email = request.email.lower().strip()
    user = db.query(User).filter(User.email == clean_email).first()

    if not user or not user.hashed_password or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(
        data={"user_id": user.id, "role": user.role.value}
    )
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        is_new_user=False,
    )


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

    firebase_uid = str(decoded.get("uid") or "")[:128]
    phone = decoded.get("phone_number") or request.phone

    # Check for existing user by firebase_uid or by phone
    existing_user = None
    if firebase_uid:
        existing_user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    if not existing_user and phone:
        existing_user = db.query(User).filter(User.phone == phone).first()
        if existing_user and firebase_uid and not existing_user.firebase_uid:
            existing_user.firebase_uid = firebase_uid
            db.commit()
            db.refresh(existing_user)

    if existing_user:
        # Existing user — issue JWT
        if request.name and not existing_user.name:
            existing_user.name = request.name
            db.commit()
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

    assigned_phone = phone or (f"dev-{firebase_uid}" if len(firebase_uid) <= 15 else f"dev-{firebase_uid[:15]}")
    new_user = User(
        phone=assigned_phone[:20],
        role=request.role,
        name=request.name,
        language_pref=request.language_pref,
        firebase_uid=firebase_uid or None,
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
    phone: str | None = None
    org_name: str | None = None
    address: str | None = None
    language_pref: str | None = None


@router.patch("/me", response_model=UserResponse)
def update_profile(
    updates: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile fields."""
    if updates.name is not None:
        current_user.name = updates.name
    if updates.phone is not None:
        current_user.phone = updates.phone
    if updates.org_name is not None:
        current_user.org_name = updates.org_name
    if updates.address is not None:
        current_user.address = updates.address
    if updates.language_pref is not None:
        current_user.language_pref = updates.language_pref

    db.commit()
    db.refresh(current_user)
    return current_user
