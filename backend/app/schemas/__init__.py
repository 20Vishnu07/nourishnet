from datetime import datetime

from pydantic import BaseModel, Field

from app.models.user import UserRole


# --- User Schemas ---


class UserCreate(BaseModel):
    phone: str = Field(..., max_length=20)
    role: UserRole
    name: str = Field(..., max_length=100)
    language_pref: str = Field(default="en", max_length=10)
    firebase_uid: str | None = None


class UserResponse(BaseModel):
    id: int
    phone: str
    role: UserRole
    name: str
    language_pref: str
    firebase_uid: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    language_pref: str | None = None
    role: UserRole | None = None
