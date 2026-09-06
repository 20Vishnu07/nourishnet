"""Claims router — create and update claim status."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim, ClaimStatus
from app.models.donation import Donation, DonationStatus
from app.schemas.claim import ClaimCreate, ClaimStatusUpdate, ClaimResponse

router = APIRouter(prefix="/claims", tags=["claims"])


from app.websocket import manager


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
        status=ClaimStatus.pending,
    )
    donation.status = DonationStatus.claimed
    db.add(db_claim)
    db.commit()
    db.refresh(db_claim)

    # Broadcast real-time claim notification
    await manager.broadcast_claim_status_change(
        claim_data={
            "id": db_claim.id,
            "donation_id": db_claim.donation_id,
            "ngo_id": db_claim.ngo_id,
            "volunteer_id": db_claim.volunteer_id,
            "status": db_claim.status.value,
        },
        donor_id=donation.donor_id,
        ngo_id=db_claim.ngo_id,
        volunteer_id=db_claim.volunteer_id,
    )

    return db_claim


@router.get("/", response_model=list[ClaimResponse])
def list_claims(
    ngo_id: int | None = None,
    volunteer_id: int | None = None,
    db: Session = Depends(get_db),
):
    """List claims, optionally filtered by NGO or volunteer."""
    query = db.query(Claim)
    if ngo_id is not None:
        query = query.filter(Claim.ngo_id == ngo_id)
    if volunteer_id is not None:
        query = query.filter(Claim.volunteer_id == volunteer_id)
    return query.all()


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

    claim.status = update.status

    if update.volunteer_id is not None:
        claim.volunteer_id = update.volunteer_id

    # Sync donation status with claim status
    donation = db.query(Donation).filter(Donation.id == claim.donation_id).first()
    if donation:
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
            "status": claim.status.value,
        },
        donor_id=donation.donor_id if donation else 0,
        ngo_id=claim.ngo_id,
        volunteer_id=claim.volunteer_id,
    )

    return claim
