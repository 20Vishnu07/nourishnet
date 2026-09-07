from datetime import datetime

from pydantic import BaseModel, Field

from app.models.donation import DonationStatus
from app.schemas import UserResponse


class DonationCreate(BaseModel):
    food_type: str = Field(..., max_length=100)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., max_length=20)
    expiry_time: datetime
    pickup_lat: float = Field(..., ge=-90, le=90)
    pickup_lng: float = Field(..., ge=-180, le=180)
    image_url: str | None = None


class DonationUpdate(BaseModel):
    food_type: str | None = None
    quantity: float | None = Field(default=None, gt=0)
    unit: str | None = None
    expiry_time: datetime | None = None
    pickup_lat: float | None = Field(default=None, ge=-90, le=90)
    pickup_lng: float | None = Field(default=None, ge=-180, le=180)
    status: DonationStatus | None = None
    image_url: str | None = None


class DonationResponse(BaseModel):
    id: int
    donor_id: int
    food_type: str
    quantity: float
    unit: str
    expiry_time: datetime
    pickup_lat: float
    pickup_lng: float
    status: DonationStatus
    image_url: str | None = None
    created_at: datetime
    donor: UserResponse | None = None

    model_config = {"from_attributes": True}
