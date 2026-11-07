from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_rising_trend_predicts_breach():
    # +1 C per minute from 30 C; limit 35 C -> 5 minutes after the last point at 30 C + 2 = 32 C -> 3 min
    pts = [{"ts": 60 * i, "value": 30 + i} for i in range(3)]
    r = client.post("/predict", json={"asset_id": "B-12", "metric": "inlet_c", "limit": 35, "points": pts})
    assert r.status_code == 200
    body = r.json()
    assert round(body["slope_per_min"], 3) == 1.0
    assert round(body["minutes_to_breach"], 3) == 3.0


def test_flat_trend_has_no_breach():
    pts = [{"ts": 60 * i, "value": 24} for i in range(4)]
    r = client.post("/predict", json={"asset_id": "A-01", "metric": "inlet_c", "limit": 35, "points": pts})
    assert r.json()["breach_at"] is None


def test_needs_two_points():
    r = client.post("/predict", json={"asset_id": "A-01", "metric": "inlet_c", "limit": 35, "points": [{"ts": 0, "value": 1}]})
    assert r.status_code == 422
