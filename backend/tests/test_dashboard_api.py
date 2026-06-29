"""Backend API tests for IT Operations Dashboard"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDashboardAPI:
    """Dashboard summary and core API tests"""

    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200

    def test_dashboard_summary(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary")
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data
        assert "circuits" in data
        assert "tickets" in data
        assert data["circuits"]["total"] == 8
        assert data["circuits"]["up"] == 6
        assert data["tickets"]["total"] == 5

    def test_get_alerts(self):
        r = requests.get(f"{BASE_URL}/api/alerts")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert data["total"] >= 4
        for a in data["items"]:
            assert "severity" in a
            assert "acknowledged" in a

    def test_alerts_filter_severity(self):
        r = requests.get(f"{BASE_URL}/api/alerts?severity=critical")
        assert r.status_code == 200
        data = r.json()
        for a in data["items"]:
            assert a["severity"] == "critical"

    def test_create_alert(self):
        payload = {"title": "TEST_Alert", "message": "Test message", "severity": "info", "source": "manual"}
        r = requests.post(f"{BASE_URL}/api/alerts", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST_Alert"
        assert "id" in data
        # Cleanup
        requests.delete(f"{BASE_URL}/api/alerts/{data['id']}")

    def test_acknowledge_alert(self):
        # Create alert first
        r = requests.post(f"{BASE_URL}/api/alerts", json={"title": "TEST_ACK", "message": "ack test", "severity": "warning"})
        assert r.status_code == 200
        alert_id = r.json()["id"]
        # Acknowledge
        ack = requests.put(f"{BASE_URL}/api/alerts/{alert_id}/acknowledge?by=tester")
        assert ack.status_code == 200
        assert ack.json()["success"] is True
        # Cleanup
        requests.delete(f"{BASE_URL}/api/alerts/{alert_id}")

    def test_delete_alert(self):
        r = requests.post(f"{BASE_URL}/api/alerts", json={"title": "TEST_DEL", "message": "del", "severity": "info"})
        alert_id = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/alerts/{alert_id}")
        assert d.status_code == 200
        # Verify not found
        r2 = requests.get(f"{BASE_URL}/api/alerts")
        ids = [a["id"] for a in r2.json()["items"]]
        assert alert_id not in ids

    def test_email_webhook(self):
        payload = {"subject": "Critical: Device REMUS-RTR01 is down", "body": "Device: REMUS-RTR01\nSite: Remus\nStatus: Unreachable"}
        r = requests.post(f"{BASE_URL}/api/alerts/email-webhook", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["severity"] == "critical"
        assert data["source"] == "wug"
        assert data["device"] == "REMUS-RTR01"
        # Cleanup
        requests.delete(f"{BASE_URL}/api/alerts/{data['id']}")


class TestCircuits:
    """DIA Circuits API tests"""

    def test_get_circuits(self):
        r = requests.get(f"{BASE_URL}/api/circuits")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8

    def test_create_and_delete_circuit(self):
        payload = {"site": "TEST_Site", "provider": "TEST_ISP", "circuit_id": "TEST-CID-001", "bandwidth_mbps": 100, "status": "up"}
        r = requests.post(f"{BASE_URL}/api/circuits", json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        # Cleanup
        d = requests.delete(f"{BASE_URL}/api/circuits/{cid}")
        assert d.status_code == 200

    def test_update_circuit(self):
        # Create
        r = requests.post(f"{BASE_URL}/api/circuits", json={"site": "TEST_UpdateSite", "provider": "TEST_ISP2", "circuit_id": "TEST-UPD-001", "bandwidth_mbps": 50, "status": "up"})
        cid = r.json()["id"]
        # Update
        u = requests.put(f"{BASE_URL}/api/circuits/{cid}", json={"site": "TEST_UpdateSite", "provider": "TEST_ISP2", "circuit_id": "TEST-UPD-001", "bandwidth_mbps": 200, "status": "degraded"})
        assert u.status_code == 200
        assert u.json()["bandwidth_mbps"] == 200
        assert u.json()["status"] == "degraded"
        # Cleanup
        requests.delete(f"{BASE_URL}/api/circuits/{cid}")


class TestTickets:
    """Ticket Queue API tests"""

    def test_get_tickets(self):
        r = requests.get(f"{BASE_URL}/api/tickets")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 5
        assert "items" in data

    def test_filter_tickets_by_status(self):
        r = requests.get(f"{BASE_URL}/api/tickets?status=open")
        assert r.status_code == 200
        for t in r.json()["items"]:
            assert t["status"] == "open"

    def test_create_and_delete_ticket(self):
        r = requests.post(f"{BASE_URL}/api/tickets", json={"title": "TEST_Ticket", "description": "Test", "priority": "low", "status": "open"})
        assert r.status_code == 200
        tid = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/tickets/{tid}")
        assert d.status_code == 200

    def test_update_ticket(self):
        r = requests.post(f"{BASE_URL}/api/tickets", json={"title": "TEST_UpdateTicket", "priority": "medium", "status": "open"})
        tid = r.json()["id"]
        u = requests.put(f"{BASE_URL}/api/tickets/{tid}", json={"status": "in_progress"})
        assert u.status_code == 200
        assert u.json()["status"] == "in_progress"
        requests.delete(f"{BASE_URL}/api/tickets/{tid}")


class TestOtherAPIs:
    """Sites, Vendor Status, Settings"""

    def test_get_sites(self):
        r = requests.get(f"{BASE_URL}/api/sites")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 8
        for s in data:
            assert "status" in s
            assert "coordinates" in s

    def test_get_vendor_status(self):
        r = requests.get(f"{BASE_URL}/api/vendor-status")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 5
        names = [v["name"] for v in data]
        assert "CrowdStrike" in names
        assert "Microsoft 365" in names

    def test_get_settings(self):
        r = requests.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        data = r.json()
        assert "refresh_interval" in data

    def test_update_settings(self):
        r = requests.put(f"{BASE_URL}/api/settings", json={"refresh_interval": 60})
        assert r.status_code == 200
        assert r.json()["refresh_interval"] == 60
        # Restore
        requests.put(f"{BASE_URL}/api/settings", json={"refresh_interval": 30})
