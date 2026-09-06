import enum
from datetime import datetime

from sqlalchemy import String, Enum as SAEnum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserRole(str, enum.Enum):
    donor = "donor"
    ngo = "ngo"
    volunteer = "volunteer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    org_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language_pref: Mapped[str] = mapped_column(String(10), default="en")
    firebase_uid: Mapped[str | None] = mapped_column(
        String(128), unique=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

