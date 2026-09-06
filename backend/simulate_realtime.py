"""
Simulate real-time WebSocket propagation between two roles:
Role 1: NGO tab (listening on WebSocket)
Role 2: Donor tab (creating donation and watching claim status)
"""

import sys
import json
from fastapi.testclient import TestClient
from main import app as fastapi_app
from app.database import Base, engine
import app.models  # noqa

client = TestClient(fastapi_app)

def run_simulation():
    print("--- 1. Resetting test database ---")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("--- 2. Registering NGO and Donor ---")
    ngo_res = client.post("/auth/verify", json={"id_token": "ngo-tab-token", "name": "Community Food Bank", "role": "ngo"})
    assert ngo_res.status_code == 200, ngo_res.text
    ngo_token = ngo_res.json()["access_token"]
    ngo_id = ngo_res.json()["user"]["id"]
    print(f"NGO registered: id={ngo_id}, token={ngo_token[:15]}...")

    donor_res = client.post("/auth/verify", json={"id_token": "donor-tab-token", "name": "Sunrise Bakery", "role": "donor"})
    assert donor_res.status_code == 200, donor_res.text
    donor_token = donor_res.json()["access_token"]
    donor_id = donor_res.json()["user"]["id"]
    print(f"Donor registered: id={donor_id}, token={donor_token[:15]}...")

    print("\n--- 3. Opening NGO WebSocket Tab ---")
    with client.websocket_connect(f"/ws?token={ngo_token}") as ngo_ws:
        print(">> NGO Tab connected to /ws successfully!")

        print("\n--- 4. Donor Tab creates a donation (POST /donations/) ---")
        donation_payload = {
            "food_type": "Fresh Bagels & Croissants",
            "quantity": 25.0,
            "unit": "packets",
            "expiry_time": "2026-09-07T12:00:00",
            "pickup_lat": 13.0827,
            "pickup_lng": 80.2707
        }
        create_res = client.post(f"/donations/?donor_id={donor_id}", json=donation_payload)
        assert create_res.status_code == 201, create_res.text
        donation_id = create_res.json()["id"]
        print(f">> Donor created donation id={donation_id} ('Fresh Bagels & Croissants')")

        print("\n--- 5. Verifying NGO Tab received real-time broadcast ---")
        received_msg = ngo_ws.receive_json()
        print(f">> NGO Tab received WebSocket message: {json.dumps(received_msg, indent=2)}")
        assert received_msg["type"] == "NEW_DONATION"
        assert received_msg["donation"]["id"] == donation_id
        assert received_msg["donation"]["food_type"] == "Fresh Bagels & Croissants"
        print(">> VERIFIED: NGO Tab received NEW_DONATION in real-time!")

    print("\n--- 6. Opening Donor WebSocket Tab ---")
    with client.websocket_connect(f"/ws?token={donor_token}") as donor_ws:
        print(">> Donor Tab connected to /ws successfully!")

        print("\n--- 7. NGO Tab claims donation (POST /claims/) ---")
        claim_res = client.post("/claims/", json={"donation_id": donation_id, "ngo_id": ngo_id})
        assert claim_res.status_code == 201, claim_res.text
        claim_id = claim_res.json()["id"]
        print(f">> NGO claimed donation #{donation_id} (claim #{claim_id})")

        print("\n--- 8. Verifying Donor Tab received real-time claim notification ---")
        donor_msg = donor_ws.receive_json()
        print(f">> Donor Tab received WebSocket message: {json.dumps(donor_msg, indent=2)}")
        assert donor_msg["type"] == "CLAIM_STATUS_UPDATED"
        assert donor_msg["claim"]["donation_id"] == donation_id
        assert donor_msg["claim"]["status"] == "pending"
        print(">> VERIFIED: Donor Tab received CLAIM_STATUS_UPDATED in real-time!")

    print("\n=======================================================")
    print("ALL REAL-TIME MULTI-ROLE PROPAGATION TESTS PASSED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    run_simulation()
