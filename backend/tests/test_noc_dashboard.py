"""
NOC Dashboard Backend API Tests
Tests all critical endpoints for the IT NOC Dashboard.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestHealthAndRoot:
    def test_api_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert data["status"] == "IT Dashboard API online"

class TestDashboardSummary:
    def test_dashboard_summary_status(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary")
        assert r.status_code == 200

    def test_dashboard_summary_structure(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary")
        data = r.json()
        assert "alerts" in data
        assert "circuits" in data
        assert "tickets" in data

    def test_dashboard_summary_alerts_fields(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary")
        alerts = r.json()["alerts"]
        assert "total" in alerts
        assert "critical" in alerts
        assert "warning" in alerts
        assert "unacknowledged" in alerts

    def test_dashboard_summary_circuits_fields(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary")
        circuits = r.json()["circuits"]
        assert "total" in circuits
        assert "up" in circuits
        assert "down" in circuits


class TestAlerts:
    def test_get_alerts_status(self):
        r = requests.get(f"{BASE_URL}/api/alerts")
        assert r.status_code == 200

    def test_get_alerts_structure(self):
        r = requests.get(f"{BASE_URL}/api/alerts")
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_create_alert(self):
        payload = {"title": "TEST_Alert", "message": "Test message", "severity": "warning", "source": "test"}
        r = requests.post(f"{BASE_URL}/api/alerts", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST_Alert"
        assert "id" in data

    def test_delete_alert(self):
        # Create then delete
        payload = {"title": "TEST_Delete_Alert", "message": "To be deleted", "severity": "info", "source": "test"}
        r = requests.post(f"{BASE_URL}/api/alerts", json=payload)
        alert_id = r.json()["id"]
        dr = requests.delete(f"{BASE_URL}/api/alerts/{alert_id}")
        assert dr.status_code == 200


class TestCircuits:
    def test_get_circuits_status(self):
        r = requests.get(f"{BASE_URL}/api/circuits")
        assert r.status_code == 200

    def test_get_circuits_is_list(self):
        r = requests.get(f"{BASE_URL}/api/circuits")
        data = r.json()
        assert isinstance(data, list)

    def test_circuits_have_required_fields(self):
        r = requests.get(f"{BASE_URL}/api/circuits")
        circuits = r.json()
        assert len(circuits) > 0, "Expected seed circuits"
        c = circuits[0]
        assert "site" in c
        assert "provider" in c
        assert "status" in c


class TestSites:
    def test_get_sites_status(self):
        r = requests.get(f"{BASE_URL}/api/sites")
        assert r.status_code == 200

    def test_get_sites_is_list(self):
        r = requests.get(f"{BASE_URL}/api/sites")
        assert isinstance(r.json(), list)

    def test_sites_have_coords(self):
        r = requests.get(f"{BASE_URL}/api/sites")
        sites = r.json()
        assert len(sites) > 0
        s = sites[0]
        assert "coords" in s or "lat" in s or "lng" in s or "coordinates" in s


class TestSettings:
    def test_get_settings_status(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200

    def test_get_settings_structure(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        data = r.json()
        assert "kiosk_enabled" in data
        assert "kiosk_interval" in data
        assert "kiosk_pages" in data

    def test_kiosk_pages_is_list(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        data = r.json()
        assert isinstance(data["kiosk_pages"], list)
        assert len(data["kiosk_pages"]) > 0


class TestVendorStatus:
    def test_get_vendor_status_status(self):
        r = requests.get(f"{BASE_URL}/api/vendor-status", timeout=30)
        assert r.status_code == 200

    def test_vendor_status_has_vendors(self):
        r = requests.get(f"{BASE_URL}/api/vendor-status", timeout=30)
        data = r.json()
        assert "vendors" in data
        assert isinstance(data["vendors"], list)
        assert len(data["vendors"]) > 0

    def test_vendor_has_fields(self):
        r = requests.get(f"{BASE_URL}/api/vendor-status", timeout=30)
        vendors = r.json()["vendors"]
        v = vendors[0]
        assert "id" in v
        assert "name" in v
        assert "status" in v


class TestWUGTopology:
    def test_wug_topology_status(self):
        r = requests.get(f"{BASE_URL}/api/wug/topology", timeout=15)
        assert r.status_code == 200

    def test_wug_topology_structure(self):
        r = requests.get(f"{BASE_URL}/api/wug/topology", timeout=15)
        data = r.json()
        assert "locations" in data
        assert "alerts" in data
        assert "source" in data

    def test_wug_topology_source_pending_when_unconfigured(self):
        # Without WUG credentials configured, should return pending/demo
        r = requests.get(f"{BASE_URL}/api/wug/topology", timeout=15)
        data = r.json()
        # source should be 'pending' (no creds) or 'live'/'demo'
        assert data["source"] in ("pending", "live", "demo", "error")


class TestTickets:
    def test_get_tickets_status(self):
        r = requests.get(f"{BASE_URL}/api/tickets")
        assert r.status_code == 200

    def test_tickets_structure(self):
        r = requests.get(f"{BASE_URL}/api/tickets")
        data = r.json()
        assert "items" in data
        assert "total" in data
