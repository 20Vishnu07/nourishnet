import enum
from datetime import datetime

from sqlalchemy import (
    String,
    Float,
    Integer,
    Enum as SAEnum,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DonationStatus(str, enum.Enum):
    available = "available"
    claimed = "claimed"
    picked_up = "picked_up"
    delivered = "delivered"
    expired = "expired"


class Donation(Base):
    __tablename__ = "donations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    donor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    food_type: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    expiry_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    pickup_lat: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_lng: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[DonationStatus] = mapped_column(
        SAEnum(DonationStatus), default=DonationStatus.available
    )
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    # Relationships
    donor: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", lazy="selectin"
    )
