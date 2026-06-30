import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBackendAPIs:
    """Backend API tests for IT NOC Dashboard iteration 2"""

    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200

    def test_alerts(self):
        r = requests.get(f"{BASE_URL}/api/alerts")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data or isinstance(data, list)

    def test_circuits(self):
        r = requests.get(f"{BASE_URL}/api/circuits")
        assert r.status_code == 200
        data = r.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert len(items) == 8, f"Expected 8 circuits, got {len(items)}"

    def test_tickets(self):
        r = requests.get(f"{BASE_URL}/api/tickets")
        assert r.status_code == 200
        data = r.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert len(items) == 5, f"Expected 5 tickets, got {len(items)}"

    def test_vendor_status(self):
        r = requests.get(f"{BASE_URL}/api/vendor-status")
        assert r.status_code == 200

    def test_unifi_events_200(self):
        r = requests.get(f"{BASE_URL}/api/unifi-events")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        items = data["items"]
        assert len(items) >= 8, f"Expected at least 8 events, got {len(items)}"
        criticals = [e for e in items if e["severity"] == "critical"]
        assert len(criticals) >= 1, "No critical events found"

    def test_unifi_events_severity_filter(self):
        r = requests.get(f"{BASE_URL}/api/unifi-events", params={"severity": "critical"})
        assert r.status_code == 200
        data = r.json()
        for item in data["items"]:
            assert item["severity"] == "critical"

    def test_settings_get(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        data = r.json()
        assert "syslog_port" in data or "unifi_syslog_port" in data or any("port" in k.lower() for k in data.keys()), \
            f"No syslog port field found in settings: {list(data.keys())}"
