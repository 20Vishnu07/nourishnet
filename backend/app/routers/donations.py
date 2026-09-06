"""Donations router — full CRUD + nearby search."""

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.donation import Donation, DonationStatus
from app.schemas.donation import DonationCreate, DonationUpdate, DonationResponse

router = APIRouter(prefix="/donations", tags=["donations"])


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate the Haversine distance in km between two lat/lng points."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


from app.websocket import manager

@router.post("/", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
async def create_donation(
    donation: DonationCreate,
    donor_id: int = Query(..., description="ID of the donor creating this donation"),
    db: Session = Depends(get_db),
):
    """Create a new donation and broadcast in real-time to active NGOs."""
    db_donation = Donation(
        donor_id=donor_id,
        food_type=donation.food_type,
        quantity=donation.quantity,
        unit=donation.unit,
        expiry_time=donation.expiry_time,
        pickup_lat=donation.pickup_lat,
        pickup_lng=donation.pickup_lng,
        status=DonationStatus.available,
    )
    db.add(db_donation)
    db.commit()
    db.refresh(db_donation)

    # Broadcast to connected NGOs
    await manager.broadcast_new_donation({
        "id": db_donation.id,
        "food_type": db_donation.food_type,
        "quantity": db_donation.quantity,
        "unit": db_donation.unit,
        "expiry_time": db_donation.expiry_time.isoformat(),
        "pickup_lat": db_donation.pickup_lat,
        "pickup_lng": db_donation.pickup_lng,
        "status": db_donation.status.value,
        "donor_id": db_donation.donor_id,
    })

    return db_donation


@router.get("/", response_model=list[DonationResponse])
def list_donations(
    skip: int = 0,
    limit: int = Query(default=50, le=100),
    db: Session = Depends(get_db),
):
    """List all donations with pagination."""
    donations = db.query(Donation).offset(skip).limit(limit).all()
    return donations


@router.get("/nearby", response_model=list[DonationResponse])
def get_nearby_donations(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=10.0, gt=0, le=100),
    db: Session = Depends(get_db),
):
    """Get available donations within a radius (Haversine distance)."""
    # Fetch all available donations and filter by distance in Python
    # For SQLite, we can't use spatial extensions, so we do it in-app
    available = (
        db.query(Donation)
        .filter(Donation.status == DonationStatus.available)
        .all()
    )
    nearby = [
        d
        for d in available
        if _haversine_km(lat, lng, d.pickup_lat, d.pickup_lng) <= radius_km
    ]
    return nearby


@router.get("/{donation_id}", response_model=DonationResponse)
def get_donation(donation_id: int, db: Session = Depends(get_db)):
    """Get a single donation by ID."""
    donation = db.query(Donation).filter(Donation.id == donation_id).first()
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found",
        )
    return donation


@router.patch("/{donation_id}", response_model=DonationResponse)
def update_donation(
    donation_id: int,
    updates: DonationUpdate,
    db: Session = Depends(get_db),
):
    """Update a donation (partial update)."""
    donation = db.query(Donation).filter(Donation.id == donation_id).first()
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found",
        )
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(donation, field, value)
    db.commit()
    db.refresh(donation)
    return donation


@router.delete("/{donation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_donation(donation_id: int, db: Session = Depends(get_db)):
    """Delete a donation."""
    donation = db.query(Donation).filter(Donation.id == donation_id).first()
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {donation_id} not found",
        )
    db.delete(donation)
    db.commit()
