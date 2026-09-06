from datetime import datetime

from pydantic import BaseModel

from app.models.claim import ClaimStatus
from app.schemas.donation import DonationResponse


class ClaimCreate(BaseModel):
    donation_id: int
    ngo_id: int
    volunteer_id: int | None = None


class ClaimStatusUpdate(BaseModel):
    status: ClaimStatus
    volunteer_id: int | None = None


class ClaimResponse(BaseModel):
    id: int
    donation_id: int
    ngo_id: int
    volunteer_id: int | None
    status: ClaimStatus
    claimed_at: datetime
    donation: DonationResponse | None = None

    model_config = {"from_attributes": True}
