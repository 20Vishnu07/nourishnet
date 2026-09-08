"""
Authentication router — Firebase token verification + JWT issuance.

Flow:
1. Client sends Firebase ID token to POST /auth/verify
2. Backend verifies token with Firebase Admin SDK
3. Creates user if first login, or retrieves existing user
4. Returns JWT access token for subsequent API calls
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
import httpx
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

    # Provide safe unique phone handling in case SQLite schema has legacy UNIQUE/NOT NULL constraint on phone
    import uuid
    raw_phone = request.phone.strip() if request.phone and request.phone.strip() else None
    if raw_phone:
        existing_phone = db.query(User).filter(User.phone == raw_phone).first()
        if existing_phone and existing_phone.email != clean_email:
            phone_val = f"{raw_phone[:14]}_{uuid.uuid4().hex[:4]}"[:20]
        else:
            phone_val = raw_phone[:20]
    else:
        phone_val = f"+91{uuid.uuid4().int % 10**10:010d}"[:20]

    new_user = User(
        email=clean_email,
        hashed_password=hash_password(request.password),
        name=request.name.strip(),
        role=request.role,
        phone=phone_val,
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
        if "email" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered. Please sign in instead.",
            )
        # If still phone or other collision, retry with guaranteed unique phone
        try:
            new_user.phone = f"+91{uuid.uuid4().int % 10**10:010d}"[:20]
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
        except Exception as retry_err:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Registration failed: {str(retry_err)}",
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

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email. Please sign up to create your account.",
        )

    if not user.hashed_password or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again.",
        )

    access_token = create_access_token(
        data={"user_id": user.id, "role": user.role.value}
    )
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
        is_new_user=False,
    )


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


# Temporary in-memory storage for reset verification codes: {email: {"code": "123456", "expires": timestamp}}
RESET_CODES: dict[str, dict] = {}


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Initiate password reset: verify user exists and generate a 6-digit verification code."""
    import random
    import time

    clean_email = request.email.lower().strip()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No account found with email ID '{clean_email}'. Please verify your email or sign up.",
        )

    code = f"{random.randint(100000, 999999)}"
    RESET_CODES[clean_email] = {
        "code": code,
        "expires": time.time() + 900,  # 15 minutes validity
    }

    return {
        "status": "success",
        "message": f"Verification code generated for {clean_email}.",
        "reset_code": code,
        "email": clean_email,
    }


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset user password using the verification code."""
    import time

    clean_email = request.email.lower().strip()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No account found with email ID '{clean_email}'.",
        )

    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long.",
        )

    saved = RESET_CODES.get(clean_email)
    if not saved or saved.get("code") != request.code.strip() or time.time() > saved.get("expires", 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code.",
        )

    # Update password
    user.hashed_password = hash_password(request.new_password)
    db.commit()
    db.refresh(user)

    # Remove used code
    RESET_CODES.pop(clean_email, None)

    return {
        "status": "success",
        "message": "Password has been successfully reset! Please sign in with your new password.",
        "email": clean_email,
    }


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


@router.get("/detect-location")
async def detect_location(request: Request):
    """Fallback IP geolocation proxy to bypass client-side adblockers."""
    client_ip = request.headers.get("x-forwarded-for")
    if client_ip:
        client_ip = client_ip.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else ""

    url = (
        f"https://ipwho.is/{client_ip}"
        if client_ip and not client_ip.startswith(("127.", "192.168.", "10.", "172."))
        else "https://ipwho.is/"
    )
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "latitude" in data and "longitude" in data:
                    return {
                        "lat": float(data["latitude"]),
                        "lng": float(data["longitude"]),
                        "city": data.get("city", "Current Area"),
                        "source": "ip",
                    }
    except Exception:
        pass

    return {
        "lat": 13.0827,
        "lng": 80.2707,
        "city": "Chennai",
        "source": "default",
    }

