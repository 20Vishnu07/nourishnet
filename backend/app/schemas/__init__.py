from datetime import datetime

from pydantic import BaseModel, Field

from app.models.user import UserRole


# --- User Schemas ---


class UserCreate(BaseModel):
    phone: str | None = Field(None, max_length=30)
    email: str | None = Field(None, max_length=120)
    role: UserRole
    name: str = Field(..., max_length=100)
    org_name: str | None = Field(None, max_length=150)
    address: str | None = Field(None, max_length=255)
    language_pref: str = Field(default="en", max_length=10)
    firebase_uid: str | None = None


class UserRegisterRequest(BaseModel):
    email: str = Field(..., max_length=120)
    password: str = Field(..., min_length=6, max_length=100)
    name: str = Field(..., max_length=100)
    role: UserRole
    phone: str | None = Field(None, max_length=30)
    org_name: str | None = Field(None, max_length=150)
    address: str | None = Field(None, max_length=255)
    language_pref: str = Field(default="en", max_length=10)


class UserLoginRequest(BaseModel):
    email: str = Field(..., max_length=120)
    password: str = Field(..., max_length=100)
    role: UserRole | None = None


class UserResponse(BaseModel):
    id: int
    name: str
    email: str | None = None
    phone: str | None = None
    role: UserRole
    org_name: str | None = None
    address: str | None = None
    language_pref: str = "en"
    firebase_uid: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    org_name: str | None = None
    address: str | None = None
    language_pref: str | None = None
    role: UserRole | None = None

