"""Claims router — create and update claim status, volunteer coordination, and live GPS tracking."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim, ClaimStatus
from app.models.donation import Donation, DonationStatus
from app.schemas.claim import (
    ClaimCreate,
    ClaimStatusUpdate,
    ClaimResponse,
    VolunteerLocationUpdate,
)
from app.websocket import manager

router = APIRouter(prefix="/claims", tags=["claims"])


@router.post("/", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
async def create_claim(claim: ClaimCreate, db: Session = Depends(get_db)):
    """Create a new claim on a donation and broadcast in real-time."""
    # Verify donation exists and is available
    donation = db.query(Donation).filter(Donation.id == claim.donation_id).first()
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donation {claim.donation_id} not found",
        )
    if donation.status != DonationStatus.available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Donation {claim.donation_id} is not available (status: {donation.status.value})",
        )

    # Check no existing active claim on this donation
    existing_claim = (
        db.query(Claim)
        .filter(
            Claim.donation_id == claim.donation_id,
            Claim.status.not_in([ClaimStatus.cancelled]),
        )
        .first()
    )
    if existing_claim:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This donation has already been claimed",
        )

    # Create claim and update donation status
    db_claim = Claim(
        donation_id=claim.donation_id,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id,
        needs_volunteer=claim.needs_volunteer,
        status=ClaimStatus.pending,
    )
    donation.status = DonationStatus.claimed
    db.add(db_claim)
    db.commit()
    db.refresh(db_claim)

    claim_dict = {
        "id": db_claim.id,
        "donation_id": db_claim.donation_id,
        "ngo_id": db_claim.ngo_id,
        "volunteer_id": db_claim.volunteer_id,
        "needs_volunteer": db_claim.needs_volunteer,
        "status": db_claim.status.value,
    }

    # Broadcast real-time claim notification
    await manager.broadcast_claim_status_change(
        claim_data=claim_dict,
        donor_id=donation.donor_id,
        ngo_id=db_claim.ngo_id,
        volunteer_id=db_claim.volunteer_id,
    )

    if db_claim.needs_volunteer:
        await manager.broadcast_volunteer_request(claim_dict)

    return db_claim


@router.get("/", response_model=list[ClaimResponse])
def list_claims(
    ngo_id: int | None = None,
    volunteer_id: int | None = None,
    available_for_volunteer: bool = False,
    needs_volunteer: bool | None = None,
    db: Session = Depends(get_db),
):
    """List claims, optionally filtered by NGO, volunteer, or available delivery requests."""
    query = db.query(Claim)
    if available_for_volunteer:
        query = query.filter(
            Claim.needs_volunteer.is_(True),
            Claim.volunteer_id.is_(None),
            Claim.status.not_in([ClaimStatus.cancelled, ClaimStatus.delivered]),
        )
    else:
        if ngo_id is not None:
            query = query.filter(Claim.ngo_id == ngo_id)
        if volunteer_id is not None:
            query = query.filter(Claim.volunteer_id == volunteer_id)
        if needs_volunteer is not None:
            query = query.filter(Claim.needs_volunteer == needs_volunteer)

    return query.order_by(Claim.id.desc()).all()


@router.post("/{claim_id}/request-volunteer", response_model=ClaimResponse)
async def request_volunteer_delivery(
    claim_id: int,
    needs_volunteer: bool = True,
    db: Session = Depends(get_db),
):
    """NGO toggles volunteer delivery assistance for an active claim."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    claim.needs_volunteer = needs_volunteer
    if not needs_volunteer and claim.volunteer_id is None:
        # Revert status if unassigned
        claim.status = ClaimStatus.pending

    db.commit()
    db.refresh(claim)

    claim_dict = {
        "id": claim.id,
        "donation_id": claim.donation_id,
        "ngo_id": claim.ngo_id,
        "volunteer_id": claim.volunteer_id,
        "needs_volunteer": claim.needs_volunteer,
        "status": claim.status.value,
    }

    donation = db.query(Donation).filter(Donation.id == claim.donation_id).first()
    donor_id = donation.donor_id if donation else 0

    await manager.broadcast_claim_status_change(
        claim_data=claim_dict,
        donor_id=donor_id,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id,
    )

    if needs_volunteer:
        await manager.broadcast_volunteer_request(claim_dict)

    return claim


@router.post("/{claim_id}/accept", response_model=ClaimResponse)
async def accept_volunteer_delivery(
    claim_id: int,
    volunteer_id: int,
    db: Session = Depends(get_db),
):
    """A volunteer accepts an open delivery request."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    if claim.volunteer_id is not None and claim.volunteer_id != volunteer_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This delivery has already been accepted by another volunteer",
        )

    claim.volunteer_id = volunteer_id
    claim.needs_volunteer = True
    claim.status = ClaimStatus.assigned

    db.commit()
    db.refresh(claim)

    donation = db.query(Donation).filter(Donation.id == claim.donation_id).first()
    donor_id = donation.donor_id if donation else 0

    claim_dict = {
        "id": claim.id,
        "donation_id": claim.donation_id,
        "ngo_id": claim.ngo_id,
        "volunteer_id": claim.volunteer_id,
        "needs_volunteer": claim.needs_volunteer,
        "status": claim.status.value,
    }

    await manager.broadcast_claim_status_change(
        claim_data=claim_dict,
        donor_id=donor_id,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id,
    )

    return claim


@router.post("/{claim_id}/location", response_model=ClaimResponse)
async def update_volunteer_location(
    claim_id: int,
    location: VolunteerLocationUpdate,
    db: Session = Depends(get_db),
):
    """Volunteer updates their live GPS location, streaming in real-time to the NGO."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    claim.volunteer_lat = location.lat
    claim.volunteer_lng = location.lng
    claim.volunteer_updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(claim)

    # Broadcast live GPS coordinates to NGO and volunteer
    await manager.broadcast_volunteer_location(
        claim_id=claim.id,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id or 0,
        lat=location.lat,
        lng=location.lng,
        status=claim.status.value,
    )

    return claim


@router.patch("/{claim_id}/status", response_model=ClaimResponse)
async def update_claim_status(
    claim_id: int,
    update: ClaimStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update a claim's status, optionally assign a volunteer, and broadcast in real-time."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim {claim_id} not found",
        )

    if update.status is not None:
        claim.status = update.status

    if update.volunteer_id is not None:
        claim.volunteer_id = update.volunteer_id

    if update.needs_volunteer is not None:
        claim.needs_volunteer = update.needs_volunteer

    if update.delivery_photo is not None:
        claim.delivery_photo = update.delivery_photo

    # Sync donation status with claim status
    donation = db.query(Donation).filter(Donation.id == claim.donation_id).first()
    if donation and update.status is not None:
        status_map = {
            ClaimStatus.picked_up: DonationStatus.picked_up,
            ClaimStatus.delivered: DonationStatus.delivered,
            ClaimStatus.cancelled: DonationStatus.available,
        }
        if update.status in status_map:
            donation.status = status_map[update.status]

    db.commit()
    db.refresh(claim)

    # Broadcast real-time claim status update to donor, ngo, and volunteer
    await manager.broadcast_claim_status_change(
        claim_data={
            "id": claim.id,
            "donation_id": claim.donation_id,
            "ngo_id": claim.ngo_id,
            "volunteer_id": claim.volunteer_id,
            "needs_volunteer": claim.needs_volunteer,
            "status": claim.status.value,
            "delivery_photo": claim.delivery_photo,
        },
        donor_id=donation.donor_id if donation else 0,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id,
    )

    return claim

