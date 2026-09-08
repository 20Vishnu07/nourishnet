from datetime import datetime

from pydantic import BaseModel

from app.models.claim import ClaimStatus
from app.schemas.donation import DonationResponse
from app.schemas import UserResponse


class ClaimCreate(BaseModel):
    donation_id: int
    ngo_id: int
    volunteer_id: int | None = None
    needs_volunteer: bool = False


class ClaimStatusUpdate(BaseModel):
    status: ClaimStatus | None = None
    volunteer_id: int | None = None
    needs_volunteer: bool | None = None
    delivery_photo: str | None = None


class VolunteerLocationUpdate(BaseModel):
    lat: float
    lng: float


class ClaimResponse(BaseModel):
    id: int
    donation_id: int
    ngo_id: int
    volunteer_id: int | None = None
    needs_volunteer: bool = False
    volunteer_lat: float | None = None
    volunteer_lng: float | None = None
    volunteer_updated_at: datetime | None = None
    delivery_photo: str | None = None
    status: ClaimStatus
    claimed_at: datetime
    donation: DonationResponse | None = None
    ngo: UserResponse | None = None
    volunteer: UserResponse | None = None

    model_config = {"from_attributes": True}
