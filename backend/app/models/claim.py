import enum
from datetime import datetime

from sqlalchemy import Enum as SAEnum, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClaimStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    picked_up = "picked_up"
    delivered = "delivered"
    cancelled = "cancelled"


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    donation_id: Mapped[int] = mapped_column(
        ForeignKey("donations.id"), nullable=False
    )
    ngo_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    volunteer_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    status: Mapped[ClaimStatus] = mapped_column(
        SAEnum(ClaimStatus), default=ClaimStatus.pending
    )
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    # Relationships
    donation: Mapped["Donation"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Donation", lazy="selectin"
    )
    ngo: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", foreign_keys=[ngo_id], lazy="selectin"
    )
    volunteer: Mapped["User | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", foreign_keys=[volunteer_id], lazy="selectin"
    )
