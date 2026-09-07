"""
Tests for NourishNet API endpoints.

Uses FastAPI TestClient with a separate in-memory SQLite database
so tests don't touch the real database.
"""

import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.database import Base, get_db


# --- Test Database Setup ---

SQLALCHEMY_DATABASE_URL = "sqlite://"  # in-memory

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test and drop after."""
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


# --- Helpers ---


def _create_user_and_get_token(
    phone: str = "+919876543210",
    role: str = "donor",
    name: str = "Test Donor",
) -> tuple[dict, str]:
    """Create a user via auth/verify and return (user_data, token)."""
    # In dev mode, id_token is used as firebase_uid
    response = client.post(
        "/auth/verify",
        json={
            "id_token": f"dev-token-{phone}",
            "name": name,
            "role": role,
            "language_pref": "en",
        },
    )
    assert response.status_code == 200
    data = response.json()
    return data["user"], data["access_token"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- Health Check ---


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


# --- Auth ---


def test_auth_verify_creates_new_user():
    response = client.post(
        "/auth/verify",
        json={
            "id_token": "test-uid-123",
            "name": "Test User",
            "role": "donor",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_new_user"] is True
    assert data["user"]["name"] == "Test User"
    assert data["user"]["role"] == "donor"
    assert "access_token" in data


def test_auth_verify_returns_existing_user():
    # Create user
    client.post(
        "/auth/verify",
        json={"id_token": "uid-existing", "name": "First", "role": "donor"},
    )
    # Verify again with same token
    response = client.post(
        "/auth/verify",
        json={"id_token": "uid-existing"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_new_user"] is False
    assert data["user"]["name"] == "First"


def test_auth_verify_new_user_requires_name_and_role():
    response = client.post(
        "/auth/verify",
        json={"id_token": "new-user-no-role"},
    )
    assert response.status_code == 400
    assert "must provide name and role" in response.json()["detail"]


def test_auth_register_and_login():
    # 1. Register new donor
    reg_res = client.post(
        "/auth/register",
        json={
            "email": "donor1@example.com",
            "password": "strongpassword123",
            "name": "Sunshine Bakery",
            "role": "donor",
            "phone": "+919876543210",
            "org_name": "Sunshine Cafe Pvt Ltd",
            "address": "12 Anna Nagar, Chennai",
        },
    )
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert data["is_new_user"] is True
    assert data["user"]["email"] == "donor1@example.com"
    assert data["user"]["name"] == "Sunshine Bakery"
    assert data["user"]["org_name"] == "Sunshine Cafe Pvt Ltd"
    assert "access_token" in data

    # 2. Duplicate registration fails
    dup_res = client.post(
        "/auth/register",
        json={
            "email": "donor1@example.com",
            "password": "differentpass",
            "name": "Duplicate",
            "role": "donor",
        },
    )
    assert dup_res.status_code == 400
    assert "already registered" in dup_res.json()["detail"]

    # 3. Successful login with correct credentials
    login_res = client.post(
        "/auth/login",
        json={
            "email": "donor1@example.com",
            "password": "strongpassword123",
        },
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["user"]["name"] == "Sunshine Bakery"
    assert login_data["is_new_user"] is False

    # 4. Failed login with wrong password
    bad_res = client.post(
        "/auth/login",
        json={
            "email": "donor1@example.com",
            "password": "wrongpassword",
        },
    )
    assert bad_res.status_code == 401



def test_auth_me():
    _, token = _create_user_and_get_token()
    response = client.get("/auth/me", headers=_auth_header(token))
    assert response.status_code == 200
    assert response.json()["phone"].startswith("dev-")


def test_auth_me_invalid_token():
    response = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert response.status_code == 401


def test_auth_update_profile_language_pref():
    user, token = _create_user_and_get_token("+919998887776", "donor", "Language Tester")
    assert user["language_pref"] == "en"

    # Update to Tamil
    res = client.patch(
        "/auth/me",
        json={"language_pref": "ta", "name": "மொழி சோதனையாளர்"},
        headers=_auth_header(token),
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["language_pref"] == "ta"
    assert updated["name"] == "மொழி சோதனையாளர்"

    # Confirm persistence
    get_res = client.get("/auth/me", headers=_auth_header(token))
    assert get_res.json()["language_pref"] == "ta"


# --- Donations CRUD ---


def _create_test_donation(token: str, donor_id: int, lat: float = 13.0827, lng: float = 80.2707):
    """Helper to create a donation."""
    expiry = (datetime.now() + timedelta(hours=6)).isoformat()
    response = client.post(
        f"/donations/?donor_id={donor_id}",
        json={
            "food_type": "Rice",
            "quantity": 10.0,
            "unit": "kg",
            "expiry_time": expiry,
            "pickup_lat": lat,
            "pickup_lng": lng,
        },
    )
    return response


def test_create_donation():
    user, token = _create_user_and_get_token()
    response = _create_test_donation(token, user["id"])
    assert response.status_code == 201
    data = response.json()
    assert data["food_type"] == "Rice"
    assert data["quantity"] == 10.0
    assert data["status"] == "available"


def test_list_donations():
    user, token = _create_user_and_get_token()
    _create_test_donation(token, user["id"])
    _create_test_donation(token, user["id"])

    response = client.get("/donations/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_donation():
    user, token = _create_user_and_get_token()
    create_resp = _create_test_donation(token, user["id"])
    donation_id = create_resp.json()["id"]

    response = client.get(f"/donations/{donation_id}")
    assert response.status_code == 200
    assert response.json()["id"] == donation_id


def test_get_donation_not_found():
    response = client.get("/donations/9999")
    assert response.status_code == 404


def test_update_donation():
    user, token = _create_user_and_get_token()
    create_resp = _create_test_donation(token, user["id"])
    donation_id = create_resp.json()["id"]

    response = client.patch(
        f"/donations/{donation_id}",
        json={"food_type": "Biryani", "quantity": 5.0},
    )
    assert response.status_code == 200
    assert response.json()["food_type"] == "Biryani"
    assert response.json()["quantity"] == 5.0


def test_delete_donation():
    user, token = _create_user_and_get_token()
    create_resp = _create_test_donation(token, user["id"])
    donation_id = create_resp.json()["id"]

    response = client.delete(f"/donations/{donation_id}")
    assert response.status_code == 204

    response = client.get(f"/donations/{donation_id}")
    assert response.status_code == 404


def test_nearby_donations():
    user, token = _create_user_and_get_token()
    _create_test_donation(token, user["id"], lat=13.0827, lng=80.2707)
    _create_test_donation(token, user["id"], lat=28.6139, lng=77.2090)

    response = client.get("/donations/nearby?lat=13.08&lng=80.27&radius_km=50")
    assert response.status_code == 200
    nearby = response.json()
    assert len(nearby) == 1
    assert nearby[0]["pickup_lat"] == pytest.approx(13.0827, abs=0.01)


# --- Claims ---


def test_create_claim():
    donor, _ = _create_user_and_get_token("+911111111111", "donor", "Donor")
    ngo, _ = _create_user_and_get_token("+912222222222", "ngo", "NGO")
    donation = _create_test_donation("", donor["id"]).json()

    response = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"]},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["donation_id"] == donation["id"]
    assert data["ngo_id"] == ngo["id"]
    assert data["status"] == "pending"


def test_create_claim_donation_not_found():
    ngo, _ = _create_user_and_get_token("+912222222222", "ngo", "NGO")
    response = client.post(
        "/claims/",
        json={"donation_id": 9999, "ngo_id": ngo["id"]},
    )
    assert response.status_code == 404


def test_create_claim_duplicate():
    donor, _ = _create_user_and_get_token("+911111111111", "donor", "Donor")
    ngo, _ = _create_user_and_get_token("+912222222222", "ngo", "NGO")
    donation = _create_test_donation("", donor["id"]).json()

    first = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"]},
    )
    assert first.status_code == 201

    response = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"]},
    )
    assert response.status_code == 400
    assert "not available" in response.json()["detail"]


def test_update_claim_status():
    donor, _ = _create_user_and_get_token("+911111111111", "donor", "Donor")
    ngo, _ = _create_user_and_get_token("+912222222222", "ngo", "NGO")
    vol, _ = _create_user_and_get_token("+913333333333", "volunteer", "Vol")
    donation = _create_test_donation("", donor["id"]).json()
    claim = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"]},
    ).json()

    response = client.patch(
        f"/claims/{claim['id']}/status",
        json={"status": "picked_up", "volunteer_id": vol["id"]},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "picked_up"
    assert response.json()["volunteer_id"] == vol["id"]

    donation_resp = client.get(f"/donations/{donation['id']}")
    assert donation_resp.json()["status"] == "picked_up"


def test_update_claim_status_delivered():
    donor, _ = _create_user_and_get_token("+911111111111", "donor", "Donor")
    ngo, _ = _create_user_and_get_token("+912222222222", "ngo", "NGO")
    donation = _create_test_donation("", donor["id"]).json()
    claim = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"]},
    ).json()

    response = client.patch(
        f"/claims/{claim['id']}/status",
        json={"status": "delivered"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "delivered"

    donation_resp = client.get(f"/donations/{donation['id']}")
    assert donation_resp.json()["status"] == "delivered"


# --- Real-Time WebSocket Tests ---


def test_websocket_unauthenticated_rejected():
    from starlette.websockets import WebSocketDisconnect
    # Connecting without a token must be rejected
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws") as ws:
            ws.receive_text()
    assert exc_info.value.code == 1008


def test_websocket_donation_broadcast_to_ngo():
    ngo_user, ngo_token = _create_user_and_get_token("+919999999999", "ngo", "Live NGO")
    donor_user, donor_token = _create_user_and_get_token("+918888888888", "donor", "Live Donor")

    # NGO connects via WebSocket
    with client.websocket_connect(f"/ws?token={ngo_token}") as ws:
        # Donor posts a new donation via REST
        _create_test_donation(donor_token, donor_user["id"])

        # NGO WebSocket receives broadcast
        msg = ws.receive_json()
        assert msg["type"] == "NEW_DONATION"
        assert msg["donation"]["food_type"] == "Rice"
        assert msg["donation"]["donor_id"] == donor_user["id"]


def test_websocket_claim_broadcast_to_donor():
    donor_user, donor_token = _create_user_and_get_token("+918888888881", "donor", "Live Donor 2")
    ngo_user, _ = _create_user_and_get_token("+919999999991", "ngo", "Live NGO 2")
    donation = _create_test_donation(donor_token, donor_user["id"]).json()

    # Donor connects via WebSocket
    with client.websocket_connect(f"/ws?token={donor_token}") as donor_ws:
        # NGO claims the donation
        client.post(
            "/claims/",
            json={"donation_id": donation["id"], "ngo_id": ngo_user["id"]},
        )

        # Donor WebSocket receives the CLAIM_STATUS_UPDATED broadcast
        msg = donor_ws.receive_json()
        assert msg["type"] == "CLAIM_STATUS_UPDATED"
        assert msg["claim"]["donation_id"] == donation["id"]
        assert msg["claim"]["status"] == "pending"


# --- ML Surplus Prediction Tests ---


def test_prediction_donor_not_found():
    res = client.get("/predictions/99999")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_prediction_cold_start_new_donor():
    # Register a new donor with 0 past donations
    donor_user, _ = _create_user_and_get_token("+917777777771", "donor", "Cold Start Donor")
    donor_id = donor_user["id"]

    res = client.get(f"/predictions/{donor_id}")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["donor_id"] == donor_id
    assert data["model_status"] == "cold_start_default"
    assert data["predicted_surplus_kg"] == 15.0  # Documented default baseline
    assert data["historical_donations_count"] == 0
    assert "baseline" in data["message"].lower()


def test_prediction_trained_donor_with_history():
    donor_user, donor_token = _create_user_and_get_token("+917777777772", "donor", "Experienced Donor")
    donor_id = donor_user["id"]

    # Seed 2 donations for this donor
    _create_test_donation(donor_token, donor_id)
    _create_test_donation(donor_token, donor_id)

    res = client.get(f"/predictions/{donor_id}")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["donor_id"] == donor_id
    assert data["model_status"] == "trained_prediction"
    assert data["historical_donations_count"] == 2
    assert data["predicted_surplus_kg"] > 0
    assert data["confidence"] >= 0.65


# --- Volunteer Coordination & Live GPS Tracking Tests ---


def test_register_multiple_users_without_phone():
    """Verify that multiple users registering without phone don't collide."""
    reg1 = client.post(
        "/auth/register",
        json={
            "email": "testvol1@example.com",
            "password": "password123",
            "name": "Volunteer One",
            "role": "volunteer",
        },
    )
    assert reg1.status_code == 200

    reg2 = client.post(
        "/auth/register",
        json={
            "email": "testvol2@example.com",
            "password": "password123",
            "name": "Volunteer Two",
            "role": "volunteer",
        },
    )
    assert reg2.status_code == 200


def test_volunteer_coordination_and_live_tracking():
    # 1. Setup donor, NGO, and volunteer
    donor, donor_token = _create_user_and_get_token("+911234567890", "donor", "Live Food Donor")
    ngo, ngo_token = _create_user_and_get_token("+911234567891", "ngo", "Community Shelter NGO")
    vol, vol_token = _create_user_and_get_token("+911234567892", "volunteer", "Speedy Volunteer")

    # 2. Donor posts a donation
    donation = _create_test_donation(donor_token, donor["id"]).json()

    # 3. NGO claims the donation with needs_volunteer=False initially
    claim_resp = client.post(
        "/claims/",
        json={"donation_id": donation["id"], "ngo_id": ngo["id"], "needs_volunteer": False},
    )
    assert claim_resp.status_code == 201
    claim = claim_resp.json()
    assert claim["needs_volunteer"] is False
    assert claim["volunteer_id"] is None

    # 4. NGO decides to request a volunteer for delivery
    req_resp = client.post(f"/claims/{claim['id']}/request-volunteer?needs_volunteer=true")
    assert req_resp.status_code == 200
    assert req_resp.json()["needs_volunteer"] is True

    # 5. Volunteer queries available deliveries
    avail_resp = client.get("/claims/?available_for_volunteer=true")
    assert avail_resp.status_code == 200
    avail_claims = avail_resp.json()
    assert any(c["id"] == claim["id"] for c in avail_claims)

    # 6. Volunteer accepts the delivery
    accept_resp = client.post(f"/claims/{claim['id']}/accept?volunteer_id={vol['id']}")
    assert accept_resp.status_code == 200
    accepted = accept_resp.json()
    assert accepted["volunteer_id"] == vol["id"]
    assert accepted["status"] == "assigned"

    # Claim should no longer be in available list
    avail_after = client.get("/claims/?available_for_volunteer=true").json()
    assert not any(c["id"] == claim["id"] for c in avail_after)

    # 7. Volunteer streams live GPS location
    loc_resp = client.post(
        f"/claims/{claim['id']}/location",
        json={"lat": 13.0850, "lng": 80.2720},
    )
    assert loc_resp.status_code == 200
    loc_data = loc_resp.json()
    assert loc_data["volunteer_lat"] == pytest.approx(13.0850, abs=0.001)
    assert loc_data["volunteer_lng"] == pytest.approx(80.2720, abs=0.001)
    assert loc_data["volunteer_updated_at"] is not None




