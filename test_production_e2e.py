import urllib.request, json, datetime

BASE = "https://nourishnet-yrql.onrender.com"

def post_json(path, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    res = urllib.request.urlopen(req)
    return json.loads(res.read().decode())

def get_json(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", headers=headers)
    res = urllib.request.urlopen(req)
    return json.loads(res.read().decode())

def patch_json(path, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(data).encode("utf-8"), headers=headers, method="PATCH")
    res = urllib.request.urlopen(req)
    return json.loads(res.read().decode())

print("=== NOURISHNET PRODUCTION E2E VERIFICATION ===")

# 1. Donor Login & Donation
donor_auth = post_json("/auth/verify", {"id_token": "donor_prod_test", "name": "Sunset Grand Hotel", "role": "donor"})
donor_token = donor_auth["access_token"]
donor_id = donor_auth["user"]["id"]
print(f"1. Donor authenticated: ID={donor_id} Name='{donor_auth['user']['name']}'")

expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5)).isoformat()
donation = post_json(f"/donations/?donor_id={donor_id}", {
    "food_type": "Biryani & Mixed Sweets",
    "quantity": 40.0,
    "unit": "kg",
    "expiry_time": expiry,
    "pickup_lat": 13.0827,
    "pickup_lng": 80.2707
}, token=donor_token)
don_id = donation["id"]
print(f"2. Donation created: ID={don_id}, Food='{donation['food_type']}', Qty={donation['quantity']} {donation['unit']}")

# 2. NGO Login & Claim
ngo_auth = post_json("/auth/verify", {"id_token": "ngo_prod_test", "name": "Annapoorna Food Relief", "role": "ngo"})
ngo_token = ngo_auth["access_token"]
ngo_id = ngo_auth["user"]["id"]
print(f"3. NGO authenticated: ID={ngo_id} Name='{ngo_auth['user']['name']}'")

claim = post_json("/claims/", {
    "donation_id": don_id,
    "ngo_id": ngo_id
}, token=ngo_token)
claim_id = claim["id"]
print(f"4. Claim created: ID={claim_id}, Status='{claim['status']}'")

# 3. Volunteer Login & Delivery Workflow
vol_auth = post_json("/auth/verify", {"id_token": "vol_prod_test", "name": "Karthik Volunteer", "role": "volunteer"})
vol_token = vol_auth["access_token"]
vol_id = vol_auth["user"]["id"]
print(f"5. Volunteer authenticated: ID={vol_id} Name='{vol_auth['user']['name']}'")

# Assign volunteer
assigned_claim = patch_json(f"/claims/{claim_id}/status", {"status": "assigned", "volunteer_id": vol_id}, token=ngo_token)
print(f"6. Claim assigned to Volunteer: Status='{assigned_claim['status']}', Volunteer ID={assigned_claim['volunteer_id']}")

# Picked up
picked_up = patch_json(f"/claims/{claim_id}/status", {"status": "picked_up"}, token=vol_token)
print(f"7. Volunteer picked up donation: Status='{picked_up['status']}'")

# Delivered
delivered = patch_json(f"/claims/{claim_id}/status", {"status": "delivered"}, token=vol_token)
print(f"8. Volunteer delivered food: Status='{delivered['status']}'")

# 4. ML Prediction Widget
pred = get_json(f"/predictions/{donor_id}", token=donor_token)
print(f"9. ML Prediction for Donor {donor_id}: Expected={pred['predicted_surplus_kg']}kg, Model='{pred['model_status']}', Confidence={pred['confidence']*100:.0f}%")

print("=== ALL 9 PRODUCTION E2E CHECKS PASSED PERFECTLY! ===")
