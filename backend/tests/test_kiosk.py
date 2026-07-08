"""Kiosk auto-rotation feature tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestKioskSettings:
    """Test kiosk_enabled and kiosk_interval settings persistence"""

    def test_get_settings_returns_kiosk_fields(self):
        res = requests.get(f"{BASE_URL}/api/settings")
        assert res.status_code == 200
        data = res.json()
        assert "kiosk_enabled" in data, "kiosk_enabled missing from GET /api/settings"
        assert "kiosk_interval" in data, "kiosk_interval missing from GET /api/settings"

    def test_save_kiosk_enabled_true(self):
        res = requests.put(f"{BASE_URL}/api/settings", json={"kiosk_enabled": True, "kiosk_interval": 10})
        assert res.status_code == 200

        # Verify persistence
        get_res = requests.get(f"{BASE_URL}/api/settings")
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["kiosk_enabled"] == True
        assert data["kiosk_interval"] == 10

    def test_save_kiosk_enabled_false(self):
        res = requests.put(f"{BASE_URL}/api/settings", json={"kiosk_enabled": False})
        assert res.status_code == 200

        get_res = requests.get(f"{BASE_URL}/api/settings")
        data = get_res.json()
        assert data["kiosk_enabled"] == False

    def test_kiosk_interval_range_min(self):
        res = requests.put(f"{BASE_URL}/api/settings", json={"kiosk_interval": 10})
        assert res.status_code == 200
        data = requests.get(f"{BASE_URL}/api/settings").json()
        assert data["kiosk_interval"] == 10

    def test_kiosk_interval_range_max(self):
        res = requests.put(f"{BASE_URL}/api/settings", json={"kiosk_interval": 300})
        assert res.status_code == 200
        data = requests.get(f"{BASE_URL}/api/settings").json()
        assert data["kiosk_interval"] == 300

    def test_reset_kiosk_for_ui_tests(self):
        """Set kiosk_enabled=true, interval=10 for UI testing"""
        res = requests.put(f"{BASE_URL}/api/settings", json={"kiosk_enabled": True, "kiosk_interval": 10})
        assert res.status_code == 200
        data = requests.get(f"{BASE_URL}/api/settings").json()
        assert data["kiosk_enabled"] == True
        assert data["kiosk_interval"] == 10
