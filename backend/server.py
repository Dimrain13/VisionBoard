from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import os, logging, asyncio, httpx, imaplib, email as emaillib, re, uuid, base64, time
import yaml, threading
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ─── YAML File Helpers ────────────────────────────────────────────
SETTINGS_FILE = ROOT_DIR / "settings.yml"
CIRCUITS_FILE  = ROOT_DIR / "circuits.yml"
_settings_lock = threading.Lock()
_circuits_lock  = threading.Lock()

DEFAULT_SETTINGS: dict = {
    "refresh_interval": 30, "kiosk_enabled": False, "kiosk_interval": 30,
    "kiosk_pages": ["/dashboard", "/map", "/alerts", "/status", "/circuits", "/unifi-devices", "/tickets", "/wug-topology", "/wazuh"],
    "email_enabled": False, "email_host": "", "email_port": 993,
    "email_username": "", "email_password": "", "email_folder": "INBOX",
    "wug_sender_filter": "whatsupgold",
    "vivantio_api_url": "", "vivantio_api_key": "", "vivantio_password": "",
    "aruba_api_url": "", "aruba_api_key": "",
    "wazuh_enabled": False, "wazuh_url": "10.202.10.70", "wazuh_api_port": 55000,
    "wazuh_indexer_port": 9200, "wazuh_username": "", "wazuh_password": "",
    "wazuh_indexer_username": "", "wazuh_indexer_password": "",
    "wug_url": "", "wug_username": "", "wug_password": "", "wug_poll_interval": 60,
    "downdetector_client_id": "", "downdetector_client_secret": "",
    "unifi_syslog_port": 5140, "unifi_syslog_enabled": True,
    "unifi_controller1_url": "", "unifi_controller1_username": "",
    "unifi_controller1_password": "", "unifi_controller1_site": "default",
    "unifi_controller1_label": "Site 1",
    "unifi_controller2_url": "", "unifi_controller2_username": "",
    "unifi_controller2_password": "", "unifi_controller2_site": "default",
    "unifi_controller2_label": "Site 2",
}

def load_settings() -> dict:
    """Load settings.yml, creating it with defaults if it doesn't exist."""
    with _settings_lock:
        if not SETTINGS_FILE.exists():
            _write_settings(DEFAULT_SETTINGS.copy())
            return DEFAULT_SETTINGS.copy()
        with open(SETTINGS_FILE, "r") as f:
            data = yaml.safe_load(f) or {}
        return {**DEFAULT_SETTINGS, **data}

def _write_settings(data: dict):
    with open(SETTINGS_FILE, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

def save_settings(update: dict) -> dict:
    """Merge update into existing settings.yml and return the new full dict."""
    with _settings_lock:
        current = load_settings()
        current.update({k: v for k, v in update.items() if v is not None})
        _write_settings(current)
        return current


def load_circuits() -> list:
    """Load circuits.yml, returning an empty list if it doesn't exist."""
    with _circuits_lock:
        if not CIRCUITS_FILE.exists():
            return []
        with open(CIRCUITS_FILE, "r") as f:
            data = yaml.safe_load(f) or {}
        return data.get("circuits", [])

def save_circuits(circuits: list):
    """Write full circuits list to circuits.yml."""
    with _circuits_lock:
        with open(CIRCUITS_FILE, "w") as f:
            yaml.dump({"circuits": circuits}, f, default_flow_style=False,
                      allow_unicode=True, sort_keys=False)


# ─── In-memory stores (reset on restart — seeded at startup) ──────
_alerts_store: list = []
_tickets_store: list = []
_unifi_events_store: list = []  # ring buffer, max 500
_vendor_cache: dict = {"vendors": [], "ts": 0}  # background-refreshed every 120s


# ─── Models ───────────────────────────────────────────────────────
class AlertCreate(BaseModel):
    title: str
    message: str
    severity: str = "info"
    source: str = "manual"
    site: Optional[str] = None
    device: Optional[str] = None

class CircuitCreate(BaseModel):
    site: str
    provider: str
    circuit_id: str
    bandwidth_mbps: int = 100
    ip_address: Optional[str] = None
    status: str = "unknown"
    notes: Optional[str] = None

class TicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    status: str = "open"
    category: Optional[str] = None
    assigned_to: Optional[str] = None
    site: Optional[str] = None

class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    refresh_interval: Optional[int] = None
    email_enabled: Optional[bool] = None
    email_host: Optional[str] = None
    email_port: Optional[int] = None
    email_username: Optional[str] = None
    email_password: Optional[str] = None
    email_folder: Optional[str] = None
    wug_sender_filter: Optional[str] = None
    vivantio_api_url: Optional[str] = None
    vivantio_api_key: Optional[str] = None
    vivantio_password: Optional[str] = None
    aruba_api_url: Optional[str] = None
    aruba_api_key: Optional[str] = None
    unifi_syslog_port: Optional[int] = None
    unifi_syslog_enabled: Optional[bool] = None
    wazuh_url: Optional[str] = None
    wazuh_api_port: Optional[int] = None
    wazuh_indexer_port: Optional[int] = None
    wazuh_username: Optional[str] = None
    wazuh_password: Optional[str] = None
    wazuh_indexer_username: Optional[str] = None
    wazuh_indexer_password: Optional[str] = None
    wazuh_enabled: Optional[bool] = None
    kiosk_enabled: Optional[bool] = None
    kiosk_interval: Optional[int] = None
    kiosk_pages: Optional[List[str]] = None
    downdetector_client_id: Optional[str] = None
    downdetector_client_secret: Optional[str] = None
    unifi_controller1_url: Optional[str] = None
    unifi_controller1_username: Optional[str] = None
    unifi_controller1_password: Optional[str] = None
    unifi_controller1_site: Optional[str] = None
    unifi_controller1_label: Optional[str] = None
    unifi_controller2_url: Optional[str] = None
    unifi_controller2_username: Optional[str] = None
    unifi_controller2_password: Optional[str] = None
    unifi_controller2_site: Optional[str] = None
    unifi_controller2_label: Optional[str] = None


# ─── UniFi Syslog ─────────────────────────────────────────────────
def parse_unifi_syslog(raw: str) -> dict:
    """Parse RFC3164 syslog from UniFi devices and classify severity."""
    severity = "info"
    pri_match = re.match(r'^<(\d+)>', raw)
    if pri_match:
        level = int(pri_match.group(1)) & 7  # 0=emerg … 7=debug
        if level <= 3:
            severity = "critical"
        elif level == 4:
            severity = "warning"

    # Extract hostname/device from syslog header: <PRI>Mon DD HH:MM:SS hostname message
    msg = re.sub(r'^<\d+>', '', raw).strip()
    parts = msg.split()
    device = parts[3] if len(parts) > 3 else None
    message = " ".join(parts[4:]) if len(parts) > 4 else msg
    return {"severity": severity, "device": device, "message": message[:500]}


class UnifiSyslogProtocol(asyncio.DatagramProtocol):
    """UDP datagram receiver for UniFi syslog traffic."""

    def connection_made(self, transport):
        self.transport = transport
        logger.info("UniFi syslog UDP listener ready")

    def datagram_received(self, data: bytes, addr: tuple):
        try:
            raw = data.decode("utf-8", errors="replace").strip()
            if raw:
                asyncio.ensure_future(self._store(raw, str(addr[0])))
        except Exception as exc:
            logger.warning(f"Syslog decode error: {exc}")

    async def _store(self, raw: str, source_ip: str):
        parsed = parse_unifi_syslog(raw)
        doc = {
            "id": str(uuid.uuid4()),
            "raw": raw[:2000],
            "source_ip": source_ip,
            "severity": parsed["severity"],
            "device": parsed.get("device"),
            "message": parsed["message"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _unifi_events_store.append(doc)
        if len(_unifi_events_store) > 500:
            _unifi_events_store.pop(0)
        logger.info(f"UniFi [{parsed['severity'].upper()}] {source_ip} – {parsed['message'][:60]}")

    def error_received(self, exc):
        logger.warning(f"UniFi syslog protocol error: {exc}")

    def connection_lost(self, _exc):
        logger.info("UniFi syslog UDP listener closed")


# ─── Wazuh SIEM Client ────────────────────────────────────────────
_wazuh_token_cache: dict = {}   # {"token": str, "expires_at": float}


async def _wazuh_get_token(settings: dict) -> str:
    """Authenticate to Wazuh REST API and cache the JWT token."""
    global _wazuh_token_cache
    if _wazuh_token_cache.get("token") and time.time() < _wazuh_token_cache.get("expires_at", 0):
        return _wazuh_token_cache["token"]

    base_url = f"https://{settings['wazuh_url']}:{settings.get('wazuh_api_port', 55000)}"
    creds = base64.b64encode(f"{settings['wazuh_username']}:{settings['wazuh_password']}".encode()).decode()

    async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
        resp = await client.post(
            f"{base_url}/security/user/authenticate",
            headers={"Authorization": f"Basic {creds}"}
        )
        resp.raise_for_status()
        token = resp.json()["data"]["token"]
        _wazuh_token_cache = {"token": token, "expires_at": time.time() + 840}
        logger.info("Wazuh JWT token refreshed")
        return token


async def _wazuh_fetch_alerts(settings: dict, min_level: int = 3, hours_back: int = 24, limit: int = 200, group_filter: str = None) -> list:
    """Query Wazuh Indexer (OpenSearch) for alerts."""
    idx_url  = f"https://{settings['wazuh_url']}:{settings.get('wazuh_indexer_port', 9200)}"
    idx_user = settings.get("wazuh_indexer_username") or settings.get("wazuh_username", "")
    idx_pass = settings.get("wazuh_indexer_password") or settings.get("wazuh_password", "")

    filters = [
        {"range": {"rule.level": {"gte": min_level}}},
        {"range": {"timestamp": {"gte": f"now-{hours_back}h", "lte": "now"}}},
    ]
    if group_filter:
        filters.append({"term": {"rule.groups": group_filter}})

    body = {
        "query": {"bool": {"filter": filters}},
        "sort":  [{"timestamp": {"order": "desc"}}],
        "size":  limit,
        "_source": ["timestamp", "rule", "agent", "location", "full_log"],
    }

    async with httpx.AsyncClient(verify=False, timeout=15.0) as client:
        resp = await client.post(
            f"{idx_url}/wazuh-alerts-*/_search",
            auth=(idx_user, idx_pass),
            json=body,
        )
        resp.raise_for_status()
        hits = resp.json().get("hits", {}).get("hits", [])
        return [h["_source"] for h in hits]


async def _wazuh_fetch_agents(settings: dict) -> list:
    """Retrieve agent list from Wazuh REST API."""
    token    = await _wazuh_get_token(settings)
    base_url = f"https://{settings['wazuh_url']}:{settings.get('wazuh_api_port', 55000)}"

    async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
        resp = await client.get(
            f"{base_url}/agents",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 500, "sort": "+name"},
        )
        resp.raise_for_status()
        return resp.json().get("data", {}).get("affected_items", [])


# ─── Vendor Status ────────────────────────────────────────────────
# ping_url: a public endpoint owned by the vendor — HTTP HEAD checked as fallback.
#   Any 1xx–4xx response = operational (service is answering, auth walls are fine).
#   5xx = major_outage. Timeout = unknown (conservative — won't false-alarm).
#   DD Enterprise is always tried first when credentials are configured.
# dd_slug: slug used by Downdetector — matches the path segment on downdetector.com/status/{slug}/
VENDORS = [
    # ── Security & Endpoint ────────────────────────────────────────────────────────
    {"id": "crowdstrike",  "name": "CrowdStrike",       "category": "Security",  "dd_slug": "crowdstrike",            "ping_url": "https://api.crowdstrike.com",                        "web_url": "https://status.crowdstrike.com"},
    {"id": "ninjaone",     "name": "NinjaOne",           "category": "Security",  "dd_slug": "ninjaone",               "ping_url": "https://app.ninjarmm.com",                           "web_url": "https://status.ninjarmm.com"},
    {"id": "zscaler",      "name": "Zscaler",            "category": "Security",  "dd_slug": "zscaler",                "ping_url": "https://www.zscaler.com",                           "web_url": "https://trust.zscaler.com"},
    {"id": "keeper",       "name": "Keeper",             "category": "Security",  "dd_slug": "keeper",                 "ping_url": "https://keepersecurity.com",                         "web_url": "https://statuspage.keeper.io"},
    {"id": "mimecast",     "name": "Mimecast",           "category": "Security",  "dd_slug": "mimecast",               "ping_url": "https://login.mimecast.com",                         "web_url": "https://status.mimecast.com"},
    {"id": "cloudflare",   "name": "Cloudflare",         "category": "Security",  "dd_slug": "cloudflare",             "ping_url": "https://cloudflare.com",                            "web_url": "https://www.cloudflarestatus.com"},
    # ── Microsoft ─────────────────────────────────────────────────────────────────
    {"id": "microsoft365", "name": "Microsoft 365",      "category": "Microsoft", "dd_slug": "microsoft-365",          "ping_url": "https://portal.office.com",                         "web_url": "https://status.office365.com"},
    {"id": "dynamics365",  "name": "Dynamics 365",       "category": "Microsoft", "dd_slug": "microsoft-dynamics-365", "ping_url": "https://admin.powerplatform.microsoft.com",         "web_url": "https://admin.powerplatform.microsoft.com/"},
    {"id": "outlook",      "name": "Outlook",            "category": "Microsoft", "dd_slug": "outlook",                "ping_url": "https://outlook.office365.com",                     "web_url": "https://status.office365.com"},
    {"id": "teams",        "name": "Microsoft Teams",    "category": "Microsoft", "dd_slug": "teams",                  "ping_url": "https://teams.microsoft.com",                       "web_url": "https://status.office365.com"},
    # ── AI Services ───────────────────────────────────────────────────────────────
    {"id": "openai",       "name": "OpenAI",             "category": "AI",        "dd_slug": "openai",                 "ping_url": "https://api.openai.com",                            "web_url": "https://status.openai.com"},
    {"id": "gemini",       "name": "Google Gemini",      "category": "AI",        "dd_slug": "google-bard",            "ping_url": "https://generativelanguage.googleapis.com",         "web_url": "https://gemini.google.com"},
    {"id": "claude",       "name": "Claude (Anthropic)", "category": "AI",        "dd_slug": "claude",                 "ping_url": "https://api.anthropic.com",                         "web_url": "https://anthropicstatus.com"},
    # ── Cloud & Infrastructure ────────────────────────────────────────────────────
    {"id": "aws",          "name": "AWS",                "category": "Cloud",     "dd_slug": "amazon-web-services",    "ping_url": "https://aws.amazon.com",                            "web_url": "https://health.aws.amazon.com/health/status"},
    {"id": "google",       "name": "Google",             "category": "Cloud",     "dd_slug": "google",                 "ping_url": "https://www.google.com",                            "web_url": "https://workspace.google.com/status"},
    {"id": "unifi",        "name": "UniFi (Ubiquiti)",   "category": "Cloud",     "dd_slug": "ubiquiti",               "ping_url": "https://unifi.ui.com",                              "web_url": "https://status.ui.com"},
    # ── Telecom ───────────────────────────────────────────────────────────────────
    {"id": "att",          "name": "AT&T",               "category": "Telecom",   "dd_slug": "att",                    "ping_url": "https://www.att.com",                               "web_url": "https://downdetector.com/status/att/"},
    {"id": "verizon",      "name": "Verizon",            "category": "Telecom",   "dd_slug": "verizon",                "ping_url": "https://www.verizon.com",                           "web_url": "https://downdetector.com/status/verizon/"},
    {"id": "tmobile",      "name": "T-Mobile",           "category": "Telecom",   "dd_slug": "t-mobile",               "ping_url": "https://www.t-mobile.com",                          "web_url": "https://downdetector.com/status/t-mobile/"},
    # ── Other ─────────────────────────────────────────────────────────────────────
    {"id": "apple",        "name": "Apple",              "category": "Other",     "dd_slug": "apple",                  "ping_url": "https://www.apple.com",                             "web_url": "https://www.apple.com/support/systemstatus/"},
    {"id": "chase",        "name": "J.P. Morgan Chase",  "category": "Other",     "dd_slug": "chase",                  "ping_url": "https://www.chase.com",                             "web_url": "https://downdetector.com/status/chase/"},
]

# ─── Downdetector API helpers ──────────────────────────────────────────────────

_dd_token_cache: dict = {"token": None, "expires_at": 0.0}
_dd_company_id_cache: dict = {}  # vendor_id -> Downdetector company_id (cached per process)

async def _dd_get_token(client_id: str, client_secret: str, force: bool = False) -> Optional[str]:
    """Obtain (or return cached) Downdetector Bearer token. Expires in 1 h."""
    now = time.time()
    if not force and _dd_token_cache["token"] and now < _dd_token_cache["expires_at"] - 60:
        return _dd_token_cache["token"]
    try:
        encoded = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://downdetectorapi.com/v2/tokens?grant_type=client_credentials",
                headers={"Authorization": f"Basic {encoded}"}
            )
            if r.status_code == 200:
                data = r.json()
                _dd_token_cache["token"]      = data["access_token"]
                _dd_token_cache["expires_at"] = now + data.get("expires_in", 3600)
                logger.info("Downdetector token obtained (expires_in=%ss)", data.get("expires_in", 3600))
                return _dd_token_cache["token"]
            logger.warning(f"Downdetector token HTTP {r.status_code}: {r.text[:120]}")
    except Exception as e:
        logger.warning(f"Downdetector token error: {e}")
    return None

async def background_dd_token_refresher():
    """Proactively refresh the Downdetector Bearer token every 45 minutes.
    On failure, retries up to 3 times (10 s apart) before logging an error."""
    await asyncio.sleep(12)
    while True:
        try:
            settings  = load_settings()
            dd_id     = settings.get("downdetector_client_id", "")
            dd_secret = settings.get("downdetector_client_secret", "")
            if dd_id and dd_secret:
                token = None
                for attempt in range(1, 4):
                    token = await _dd_get_token(dd_id, dd_secret, force=True)
                    if token:
                        logger.info("Downdetector token refreshed (attempt %d)", attempt)
                        break
                    if attempt < 3:
                        await asyncio.sleep(10)
                if not token:
                    logger.error("Downdetector token refresh failed after 3 attempts — will retry in 45 min")
            else:
                logger.debug("Downdetector credentials not configured — skipping token refresh")
        except Exception as e:
            logger.error(f"Downdetector token refresher unexpected error: {e}")
        await asyncio.sleep(2700)  # 45 minutes


async def _dd_get_company_id(vendor_id: str, slug: str, token: str) -> Optional[int]:
    if vendor_id in _dd_company_id_cache:
        return _dd_company_id_cache[vendor_id]
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"https://downdetectorapi.com/v2/slugs/{slug}/companies",
                headers={"Authorization": f"Bearer {token}"}
            )
            if r.status_code == 200:
                items = r.json()
                if items:
                    cid = items[0].get("id")
                    _dd_company_id_cache[vendor_id] = cid
                    return cid
    except Exception:
        pass
    return None


async def check_vendor_status(vendor: dict, dd_token: Optional[str]) -> dict:
    vendor_id = vendor["id"]
    status    = "unknown"
    source    = "none"
    now_iso   = datetime.now(timezone.utc).isoformat()

    # 1. Downdetector Enterprise — highest fidelity (crowd-sourced, real-time)
    if dd_token and vendor.get("dd_slug"):
        try:
            company_id = await _dd_get_company_id(vendor_id, vendor["dd_slug"], dd_token)
            if company_id:
                async with httpx.AsyncClient(timeout=8, verify=False, follow_redirects=True) as c:
                    r = await c.get(
                        f"https://downdetectorapi.com/v2/companies/{company_id}/status/current",
                        headers={"Authorization": f"Bearer {dd_token}"}
                    )
                    if r.status_code == 200:
                        dd_status = r.json().get("status", "")
                        status = {"success": "operational", "warning": "minor_outage", "danger": "major_outage"}.get(dd_status, "unknown")
                        source = "downdetector"
                        return {**vendor, "status": status, "source": source, "last_checked": now_iso}
        except Exception as e:
            logger.debug(f"DD check failed for {vendor_id}: {e}")

    # 2. HTTP ping against the vendor's own public endpoint
    #    1xx–4xx = operational (service responding; auth walls count as up)
    #    5xx     = major_outage
    #    timeout / error = unknown (conservative — won't false-alarm)
    ping_url = vendor.get("ping_url")
    if ping_url:
        try:
            async with httpx.AsyncClient(timeout=6, verify=False, follow_redirects=True) as c:
                r = await c.head(ping_url)
                status = "major_outage" if r.status_code >= 500 else "operational"
                source = "http_check"
        except httpx.TimeoutException:
            status  = "unknown"
            source  = "http_check"
        except Exception as e:
            logger.debug(f"HTTP ping failed for {vendor_id} ({ping_url}): {e}")
            status = "unknown"
            source = "http_check"

    return {**vendor, "status": status, "source": source, "last_checked": now_iso}


# ─── UniFi Network Controller ─────────────────────────────────────────────────

UNIFI_TYPE_MAP = {
    "uap": "access_point", "usw": "switch", "ugw": "gateway",
    "uvc": "camera",       "udm": "gateway", "upd": "poe_switch",
    "ulte": "lte_router",  "uas": "app_server",
}

def _fmt_uptime(seconds: int) -> str:
    if not seconds:
        return ""
    d, rem = divmod(int(seconds), 86400)
    h = rem // 3600
    return f"{d}d {h}h" if d else f"{h}h"

def _norm_unifi_device(d: dict, label: str) -> dict:
    type_raw = (d.get("type") or "").lower()
    uptime   = d.get("uptime", 0) or 0
    return {
        "id":        d.get("_id", str(uuid.uuid4())),
        "name":      d.get("name") or d.get("hostname") or "Unknown",
        "model":     d.get("model", ""),
        "type":      UNIFI_TYPE_MAP.get(type_raw, "device"),
        "type_raw":  type_raw,
        "status":    "online" if d.get("state") == 1 else "offline",
        "ip":        d.get("ip", ""),
        "mac":       d.get("mac", ""),
        "uptime":    uptime,
        "uptime_str": _fmt_uptime(uptime),
        "version":   d.get("version", ""),
        "controller": label,
        "num_sta":   d.get("num_sta", 0),
        "num_port":  d.get("num_port", 0),
    }

async def _fetch_unifi_controller(url: str, username: str, password: str, site: str, label: str) -> list:
    """Fetch all devices from one UniFi Network controller.
    Auto-detects UniFi OS (UDM/UXG) vs legacy (CloudKey/USG) API path."""
    try:
        async with httpx.AsyncClient(verify=False, timeout=10) as c:
            # 1. Try UniFi OS (Dream Machine, UXG, etc.) — /api/auth/login
            r1 = await c.post(f"{url}/api/auth/login", json={"username": username, "password": password})
            if r1.status_code in (200, 201):
                dr = await c.get(f"{url}/proxy/network/api/s/{site}/stat/device")
            else:
                # 2. Fall back to legacy — /api/login
                r2 = await c.post(f"{url}/api/login", json={"username": username, "password": password})
                if r2.status_code not in (200, 201):
                    logger.warning(f"UniFi login failed for {url}: {r2.status_code}")
                    return []
                dr = await c.get(f"{url}/api/s/{site}/stat/device")
            if dr.status_code != 200:
                logger.warning(f"UniFi devices HTTP {dr.status_code} from {url}")
                return []
            return [_norm_unifi_device(d, label) for d in dr.json().get("data", [])]
    except Exception as e:
        logger.warning(f"UniFi controller {url} error: {e}")
        return []

_unifi_cache: dict = {}

async def background_unifi_warmer():
    """Refresh UniFi device list from both controllers every 60 s."""
    await asyncio.sleep(15)
    while True:
        try:
            s = load_settings()
            tasks = []
            if s.get("unifi_controller1_url") and s.get("unifi_controller1_username"):
                tasks.append(_fetch_unifi_controller(
                    s["unifi_controller1_url"], s["unifi_controller1_username"],
                    s.get("unifi_controller1_password", ""),
                    s.get("unifi_controller1_site", "default"),
                    s.get("unifi_controller1_label", "Site 1"),
                ))
            if s.get("unifi_controller2_url") and s.get("unifi_controller2_username"):
                tasks.append(_fetch_unifi_controller(
                    s["unifi_controller2_url"], s["unifi_controller2_username"],
                    s.get("unifi_controller2_password", ""),
                    s.get("unifi_controller2_site", "default"),
                    s.get("unifi_controller2_label", "Site 2"),
                ))
            if tasks:
                results = await asyncio.gather(*tasks)
                devices = [d for sub in results for d in sub]
                _unifi_cache["devices"] = devices
                _unifi_cache["updated"] = datetime.now(timezone.utc).isoformat()
                logger.info(f"UniFi warmer: {len(devices)} devices cached")
        except Exception as e:
            logger.warning(f"UniFi warmer error: {e}")
        await asyncio.sleep(60)


# ─── Seed Data ────────────────────────────────────────────────────
# ─── WAN Circuit Ping Check ───────────────────────────────────────────────────
# Pings each circuit's WAN IP every 60s.
# Only overrides YAML status once at least ONE successful ping has been seen
# (meaning we're on the correct network with real IPs — i.e. the Raspberry Pi).
# In cloud preview (with placeholder IPs) pings always fail, so YAML status is
# left untouched.

_circuit_ping_cache: dict = {}  # site → {status, ever_up, consecutive_failures, checked_at}


async def ping_host(ip: str) -> bool:
    """Single ICMP ping with a 2-second timeout. Returns True if reachable."""
    if not ip:
        return False
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "2", ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=5.0)
        return proc.returncode == 0
    except Exception:
        return False


async def _ping_and_cache(site: str, ip: str):
    reachable  = await ping_host(ip)
    existing   = _circuit_ping_cache.get(site, {"ever_up": False, "consecutive_failures": 0, "status": "unknown"})
    ever_up    = existing["ever_up"] or reachable
    failures   = 0 if reachable else existing["consecutive_failures"] + 1

    if reachable:
        status = "up"
    elif ever_up and failures >= 2:
        # Only declare DOWN after 2 consecutive misses on a network where pings work
        status = "down"
    else:
        status = existing["status"]  # keep previous / unknown

    _circuit_ping_cache[site] = {
        "status": status, "ever_up": ever_up,
        "consecutive_failures": failures,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    if status == "down":
        logger.warning(f"WAN PING DOWN: {site} ({ip}) — {failures} consecutive failures")
    elif reachable and existing.get("status") == "down":
        logger.info(f"WAN PING RECOVERED: {site} ({ip})")


async def background_circuit_pinger():
    """Ping every circuit's WAN IP every 60s and cache live reachability."""
    await asyncio.sleep(20)
    while True:
        try:
            circuits = load_circuits()
            tasks = [
                _ping_and_cache(c["site"], c.get("ip_address") or c.get("ip", ""))
                for c in circuits if c.get("ip_address") or c.get("ip")
            ]
            if tasks:
                await asyncio.gather(*tasks)
        except Exception as e:
            logger.warning(f"Circuit pinger error: {e}")
        await asyncio.sleep(60)


def apply_ping_overlay(circuits: list) -> list:
    """Overlay live ping status on circuit data. Only active when on a network
    where at least one circuit has ever been successfully pinged."""
    if not _circuit_ping_cache:
        return circuits
    result = []
    for c in circuits:
        ping = _circuit_ping_cache.get(c["site"])
        # Only override if we've confirmed this environment can reach circuit IPs
        if ping and ping["ever_up"]:
            result.append({**c, "status": ping["status"], "ping_checked_at": ping["checked_at"]})
        else:
            result.append(c)
    return result


def seed_demo_data():
    """Seed in-memory stores with demo data on startup."""
    now = datetime.now(timezone.utc)

    # Alerts are NOT pre-seeded — they come from WUG email polling, Wazuh, or manual entry.
    # This avoids showing phantom/stale alerts on the NOC wall display.

    # Tickets are not pre-seeded — real tickets come from Vivantio (auto-refreshed every 60s).
    # Local /api/tickets CRUD is available for manually created tickets.

    if not _unifi_events_store:
        _unifi_events_store.extend([
            {"id": str(uuid.uuid4()), "raw": "<30>Jan  1 10:15:32 NOVI-UAP-PRO hostapd: STA aa:bb:cc:dd:ee:ff IEEE 802.11: authenticated", "source_ip": "192.168.1.100", "severity": "info",     "device": "NOVI-UAP-PRO",    "message": "hostapd: STA aa:bb:cc:dd:ee:ff IEEE 802.11: authenticated", "created_at": (now - timedelta(minutes=2)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<28>Jan  1 10:14:01 REMUS-UDM kernel: [WAN_LOCAL-default-D] SRC=45.33.32.156 DROP", "source_ip": "192.168.2.1", "severity": "warning",  "device": "REMUS-UDM",        "message": "kernel: [WAN_LOCAL-default-D] SRC=45.33.32.156 DPT=22 DROP", "created_at": (now - timedelta(minutes=8)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<0>Jan  1 10:00:00 CANTON-P-FW01 kernel: CRITICAL port scan detected 185.220.101.45", "source_ip": "10.100.1.1",  "severity": "critical", "device": "CANTON-P-FW01",    "message": "kernel: CRITICAL port scan detected from 185.220.101.45 – 142 ports in 30s", "created_at": (now - timedelta(minutes=25)).isoformat()},
        ])

    # Ensure circuits.yml exists with seed data if empty
    if not CIRCUITS_FILE.exists():
        ts = datetime.now(timezone.utc).isoformat()
        save_circuits([
            {"id": str(uuid.uuid4()), "site": "Remus",           "provider": "AT&T",            "circuit_id": "ATT-MR-4521",   "bandwidth_mbps": 100,  "ip_address": "203.0.113.1",   "status": "down",     "notes": "Circuit reported down by WUG",    "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Ovid",            "provider": "Comcast Business", "circuit_id": "CMCST-OV-8832", "bandwidth_mbps": 100,  "ip_address": "198.51.100.2",  "status": "up",       "notes": "",                                 "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Mt. Pleasant",    "provider": "AT&T",            "circuit_id": "ATT-MTP-9912",  "bandwidth_mbps": 200,  "ip_address": "203.0.113.10",  "status": "up",       "notes": "",                                 "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Constantine",     "provider": "Spectrum Business","circuit_id": "SPEC-CN-1145",  "bandwidth_mbps": 50,   "ip_address": "192.0.2.5",     "status": "degraded", "notes": "Intermittent packet loss reported", "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Novi",            "provider": "AT&T",            "circuit_id": "ATT-NV-0034",   "bandwidth_mbps": 1000, "ip_address": "203.0.113.20",  "status": "up",       "notes": "Primary HQ - 1Gbps dedicated fiber","created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Canton Plant",    "provider": "Spectrum Business","circuit_id": "SPEC-CP-7721",  "bandwidth_mbps": 200,  "ip_address": "192.0.2.30",    "status": "up",       "notes": "",                                 "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Canton Warehouse","provider": "Comcast Business", "circuit_id": "CMCST-CW-5543", "bandwidth_mbps": 100,  "ip_address": "198.51.100.40", "status": "up",       "notes": "",                                 "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Middlebury",      "provider": "AT&T",            "circuit_id": "ATT-MB-2267",   "bandwidth_mbps": 100,  "ip_address": "203.0.113.50",  "status": "up",       "notes": "",                                 "created_at": ts},
        ])

    # Ensure circuits in YAML have UUIDs
    circuits = load_circuits()
    changed = False
    for c in circuits:
        if not c.get("id"):
            c["id"] = str(uuid.uuid4())
            changed = True
        if not c.get("created_at"):
            c["created_at"] = datetime.now(timezone.utc).isoformat()
            changed = True
    if changed:
        save_circuits(circuits)

    logger.info("Demo data seeded (in-memory stores + circuits.yml)")


# ─── Background Tasks ─────────────────────────────────────────────
async def background_email_poller():
    while True:
        try:
            settings = load_settings()
            if settings.get("email_enabled") and settings.get("email_host"):
                await poll_email_for_alerts(settings)
        except Exception as e:
            logger.error(f"Email poll error: {e}")
        await asyncio.sleep(120)

async def poll_email_for_alerts(settings: dict):
    try:
        mail = imaplib.IMAP4_SSL(settings["email_host"], int(settings.get("email_port", 993)))
        mail.login(settings["email_username"], settings["email_password"])
        mail.select(settings.get("email_folder", "INBOX"))
        sender_filter = settings.get("wug_sender_filter", "whatsupgold")
        _, nums = mail.search(None, f'(UNSEEN FROM "{sender_filter}")')
        for num in (nums[0].split() if nums[0] else []):
            _, data = mail.fetch(num, "(RFC822)")
            msg = emaillib.message_from_bytes(data[0][1])
            subject = str(msg.get("Subject", "WUG Alert"))
            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                        break
            else:
                body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
            alert_data = parse_wug_email(subject, body)
            doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert_data}
            _alerts_store.append(doc)
            mail.store(num, "+FLAGS", "\\Seen")
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP error: {e}")


def parse_wug_email(subject: str, body: str) -> dict:
    """Parse WUG email alert into severity/title/message."""
    severity = "warning"
    sub_lower = subject.lower()
    if any(w in sub_lower for w in ["down", "critical", "unreachable", "failed"]):
        severity = "critical"
    elif any(w in sub_lower for w in ["up", "resolved", "ok", "success"]):
        severity = "info"
    device_match = re.search(r"(?:device|host)[:\s]+([^\n\r,]+)", body, re.I)
    site_match = re.search(r"(?:site|location)[:\s]+([^\n\r,]+)", body, re.I)
    return {
        "title": subject[:200],
        "message": body[:1000],
        "severity": severity,
        "source": "wug",
        "device": device_match.group(1).strip() if device_match else None,
        "site": site_match.group(1).strip() if site_match else None,
    }


# ─── Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_demo_data()
    email_task   = asyncio.create_task(background_email_poller())
    aruba_task   = asyncio.create_task(background_aruba_warmer())
    vivantio_task= asyncio.create_task(background_vivantio_warmer())
    dd_task      = asyncio.create_task(background_dd_token_refresher())
    unifi_task   = asyncio.create_task(background_unifi_warmer())
    ping_task    = asyncio.create_task(background_circuit_pinger())
    vendor_task  = asyncio.create_task(background_vendor_warmer())
    wug_task     = asyncio.create_task(_wug_background_poller())

    syslog_port = int(load_settings().get("unifi_syslog_port", 5140))
    transport = None
    try:
        loop = asyncio.get_event_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: UnifiSyslogProtocol(),
            local_addr=("0.0.0.0", syslog_port),
        )
        logger.info(f"UniFi syslog listener active on UDP:{syslog_port}")
    except Exception as exc:
        logger.warning(f"Could not start UniFi syslog listener on UDP:{syslog_port} – {exc}")

    yield

    for task in (email_task, aruba_task, vivantio_task, dd_task, unifi_task, ping_task, vendor_task):
        task.cancel()
    if transport:
        transport.close()
    for task in (email_task, aruba_task, vivantio_task, dd_task, unifi_task, ping_task, vendor_task):
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Routes ───────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"status": "IT Dashboard API online", "version": "2.0.0", "storage": "yaml"}

@api_router.get("/dashboard/summary")
async def dashboard_summary():
    alerts   = _alerts_store
    circuits = (await get_aruba_circuits_live()) or load_circuits()
    # Use Vivantio cache for ticket counts (populated by background warmer)
    vivantio_tickets = _vivantio_cache.get("tickets") or []
    tickets_all = vivantio_tickets + _tickets_store  # vivantio + any manual tickets
    return {
        "alerts": {
            "total": len(alerts),
            "critical": sum(1 for a in alerts if a["severity"] == "critical"),
            "warning": sum(1 for a in alerts if a["severity"] == "warning"),
            "info": sum(1 for a in alerts if a["severity"] == "info"),
            "unacknowledged": sum(1 for a in alerts if not a.get("acknowledged")),
        },
        "circuits": {
            "total": len(circuits),
            "up": sum(1 for c in circuits if c["status"] == "up"),
            "down": sum(1 for c in circuits if c["status"] == "down"),
            "degraded": sum(1 for c in circuits if c["status"] == "degraded"),
        },
        "tickets": {
            "total": len(tickets_all),
            "open": sum(1 for t in tickets_all if t.get("status") == "open"),
            "in_progress": sum(1 for t in tickets_all if t.get("status") == "in_progress"),
            "critical": sum(1 for t in tickets_all if t.get("priority") == "critical"),
        },
    }

@api_router.get("/alerts")
async def get_alerts(severity: str = None, site: str = None, acknowledged: bool = None):
    items = _alerts_store
    if severity:
        items = [a for a in items if a.get("severity") == severity]
    if site:
        items = [a for a in items if a.get("site") == site]
    if acknowledged is not None:
        items = [a for a in items if a.get("acknowledged") == acknowledged]
    items = sorted(items, key=lambda a: a.get("created_at", ""), reverse=True)[:200]
    return {"items": items, "total": len(items)}

@api_router.post("/alerts")
async def create_alert(alert: AlertCreate):
    doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert.model_dump()}
    _alerts_store.append(doc)
    return doc

@api_router.post("/alerts/email-webhook")
async def email_webhook(payload: dict):
    subject = payload.get("subject", "WUG Alert")
    body = payload.get("body", "")
    alert_data = parse_wug_email(subject, body)
    doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert_data}
    _alerts_store.append(doc)
    return doc

@api_router.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, by: str = "admin"):
    for a in _alerts_store:
        if a["id"] == alert_id:
            a.update({"acknowledged": True, "acknowledged_by": by, "acknowledged_at": datetime.now(timezone.utc).isoformat()})
            return {"success": True}
    raise HTTPException(status_code=404, detail="Alert not found")

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    for i, a in enumerate(_alerts_store):
        if a["id"] == alert_id:
            _alerts_store.pop(i)
            return {"success": True}
    raise HTTPException(status_code=404, detail="Alert not found")


# ─── Aruba SD-WAN Helpers ─────────────────────────────────────────────────────

ARUBA_STATE_MAP = {1: "up", 2: "degraded", 3: "down", 4: "unknown", 0: "unknown"}

SITE_NAME_MAP = {
    "cantonment":          "Canton",
    "cantonwhs-edge-01":   "Canton Warehouse",
    "mt pleasant":         "Mt. Pleasant",
    "mt. pleasant":        "Mt. Pleasant",
}

def normalize_site(name: str) -> str:
    return SITE_NAME_MAP.get(name.lower(), name)

_aruba_cache: dict = {}
ARUBA_CACHE_TTL = 300

def _cache_get(key: str):
    entry = _aruba_cache.get(key)
    if entry and (time.time() - entry["ts"]) < ARUBA_CACHE_TTL:
        return entry["data"]
    return None

def _cache_set(key: str, data):
    _aruba_cache[key] = {"data": data, "ts": time.time()}

async def aruba_request(method: str, endpoint: str, body=None):
    cfg  = load_settings()
    base = (cfg.get("aruba_api_url") or "").rstrip("/")
    key  = cfg.get("aruba_api_key") or ""
    if not base or not key:
        return None
    url  = f"{base}/gms/rest{endpoint}"
    hdrs = {"X-Auth-Token": key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(verify=False, timeout=20) as client:
            if method == "GET":
                r = await client.get(url, headers=hdrs)
            else:
                r = await client.post(url, json=body or {}, headers=hdrs)
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        logger.warning(f"Aruba request {endpoint} failed: {e}")
        return None

async def background_aruba_warmer():
    """Warm Aruba caches on startup and refresh every 5 minutes."""
    await asyncio.sleep(5)
    while True:
        try:
            await get_aruba_circuits_live()
            apps = await aruba_request("GET", "/appliance")
            if apps:
                ne_to_site = {a["id"]: normalize_site(a["site"]) for a in apps}
                id_to_ne   = {a["applianceId"]: a["id"] for a in apps}
                nePks      = [a["id"] for a in apps]
                tunnels    = await aruba_request("POST", "/tunnels/physical/state", {"nePks": nePks})
                if tunnels:
                    links = {}
                    for ne, data in tunnels.items():
                        src = ne_to_site.get(ne)
                        if not src:
                            continue
                        for t in data.get("allTunnelState", {}).values():
                            remote_ne = id_to_ne.get(t.get("remote_id"))
                            if not remote_ne:
                                continue
                            dst = ne_to_site.get(remote_ne)
                            if not dst or src == dst:
                                continue
                            pair   = tuple(sorted([src, dst]))
                            oper   = t.get("oper", "")
                            status = "up" if "Up" in oper else ("down" if "Down" in oper else "degraded")
                            cur    = links.get(pair, {}).get("status", "up")
                            if status == "down" or (status == "degraded" and cur == "up"):
                                links[pair] = {"src": pair[0], "dst": pair[1], "status": status}
                            elif pair not in links:
                                links[pair] = {"src": pair[0], "dst": pair[1], "status": status}
                    _cache_set("mesh", list(links.values()))
                    logger.info(f"Aruba cache refreshed: {len(links)} mesh links")
        except Exception as e:
            logger.warning(f"Aruba background warmer error: {e}")
        await asyncio.sleep(300)


async def get_aruba_circuits_live():
    cached = _cache_get("circuits")
    if cached is not None:
        return cached

    apps = await aruba_request("GET", "/appliance")
    if not apps:
        return None

    site_status: dict = {}
    for a in apps:
        if a.get("site", "").lower() == "azure":
            continue
        site   = normalize_site(a.get("site", ""))
        state  = a.get("state", 0)
        status = ARUBA_STATE_MAP.get(state, "unknown")
        existing = site_status.get(site)
        if existing is None or status == "down" or (status == "degraded" and existing == "up"):
            site_status[site] = status

    # Fetch static circuit data from YAML and ONLY overlay the live status from Aruba
    yaml_circuits = load_circuits()
    now = datetime.now(timezone.utc).isoformat()
    merged = []
    for c in sorted(yaml_circuits, key=lambda x: x.get("site", "")):
        site         = c.get("site", "")
        aruba_status = site_status.get(site)
        merged.append({
            **c,
            "status":       aruba_status if aruba_status is not None else c.get("status", "unknown"),
            "last_checked": now,
        })

    _cache_set("circuits", merged)
    return merged


# ─── Aruba API Endpoints ───────────────────────────────────────────────────────

@api_router.get("/aruba/status")
async def aruba_status():
    result = await aruba_request("GET", "/alarm/summary")
    if result is None:
        return {"connected": False, "reason": "Cannot reach Aruba Orchestrator — check URL and API key in Settings"}
    return {"connected": True, "alarms": result}

@api_router.get("/aruba/mesh")
async def aruba_mesh():
    cached = _cache_get("mesh")
    if cached is not None:
        return cached

    apps = await aruba_request("GET", "/appliance")
    if not apps:
        return []
    ne_to_site   = {a["id"]: normalize_site(a["site"]) for a in apps}
    id_to_ne     = {a["applianceId"]: a["id"] for a in apps}
    nePks        = [a["id"] for a in apps]

    tunnels = await aruba_request("POST", "/tunnels/physical/state", {"nePks": nePks})
    if not tunnels:
        return []

    links = {}
    for ne, data in tunnels.items():
        src = ne_to_site.get(ne)
        if not src:
            continue
        for t in data.get("allTunnelState", {}).values():
            remote_ne  = id_to_ne.get(t.get("remote_id"))
            if not remote_ne:
                continue
            dst = ne_to_site.get(remote_ne)
            if not dst or src == dst:
                continue
            pair   = tuple(sorted([src, dst]))
            oper   = t.get("oper", "")
            status = "up" if "Up" in oper else ("down" if "Down" in oper else "degraded")
            cur    = links.get(pair, {}).get("status", "up")
            if status == "down" or (status == "degraded" and cur == "up"):
                links[pair] = {"src": pair[0], "dst": pair[1], "status": status}
            elif pair not in links:
                links[pair] = {"src": pair[0], "dst": pair[1], "status": status}

    result = list(links.values())
    _cache_set("mesh", result)
    return result


# ─── Circuit CRUD (circuits.yml) ──────────────────────────────────

@api_router.get("/circuits")
async def get_circuits():
    live = await get_aruba_circuits_live()
    if live is not None:
        return apply_ping_overlay(live)
    return apply_ping_overlay(sorted(load_circuits(), key=lambda c: c.get("site", "")))

@api_router.post("/circuits")
async def create_circuit(circuit: CircuitCreate):
    ts = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "last_checked": ts, "created_at": ts, **circuit.model_dump()}
    circuits = load_circuits()
    circuits.append(doc)
    save_circuits(circuits)
    _aruba_cache.pop("circuits", None)
    return doc

@api_router.put("/circuits/{circuit_id}")
async def update_circuit(circuit_id: str, data: CircuitCreate):
    circuits = load_circuits()
    for i, c in enumerate(circuits):
        if c.get("id") == circuit_id:
            circuits[i] = {**c, **data.model_dump(), "last_checked": datetime.now(timezone.utc).isoformat()}
            save_circuits(circuits)
            _aruba_cache.pop("circuits", None)
            return circuits[i]
    raise HTTPException(status_code=404, detail="Circuit not found")

@api_router.delete("/circuits/{circuit_id}")
async def delete_circuit(circuit_id: str):
    circuits = load_circuits()
    new = [c for c in circuits if c.get("id") != circuit_id]
    if len(new) == len(circuits):
        raise HTTPException(status_code=404, detail="Circuit not found")
    save_circuits(new)
    _aruba_cache.pop("circuits", None)
    return {"success": True}


# ─── Tickets (in-memory) ──────────────────────────────────────────

@api_router.get("/tickets")
async def get_tickets(status: str = None, priority: str = None):
    items = _tickets_store
    if status:
        items = [t for t in items if t.get("status") == status]
    if priority:
        items = [t for t in items if t.get("priority") == priority]
    items = sorted(items, key=lambda t: t.get("created_at", ""), reverse=True)[:200]
    return {"items": items, "total": len(items)}

@api_router.post("/tickets")
async def create_ticket(ticket: TicketCreate):
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "ticket_number": f"TKT-{1046 + len(_tickets_store)}", "source": "manual", "created_at": now, "updated_at": now, **ticket.model_dump()}
    _tickets_store.append(doc)
    return doc

@api_router.put("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, data: dict):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    for t in _tickets_store:
        if t["id"] == ticket_id:
            t.update(data)
            return t
    raise HTTPException(status_code=404, detail="Ticket not found")

@api_router.delete("/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str):
    for i, t in enumerate(_tickets_store):
        if t["id"] == ticket_id:
            _tickets_store.pop(i)
            return {"success": True}
    raise HTTPException(status_code=404, detail="Ticket not found")


# ─── WUG (WhatsUp Gold) REST API ─────────────────────────────────────────────

_wug_token_cache: dict = {}
_wug_data_cache:  dict = {"topology": None, "alerts": [], "ts": 0.0}


async def _wug_get_token(url: str, username: str, password: str) -> str:
    """Fetch or return a cached WUG bearer token (refreshes 5 min before expiry)."""
    now    = time.time()
    cached = _wug_token_cache.get(url)
    if cached and now < cached.get("expires_at", 0) - 300:
        return cached["token"]
    async with httpx.AsyncClient(verify=False, timeout=15) as client:
        resp = await client.post(
            f"{url.rstrip('/')}/api/v1/token",
            data={"grant_type": "password", "username": username, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()
    token = data["access_token"]
    _wug_token_cache[url] = {"token": token, "expires_at": now + data.get("expires_in", 86399)}
    return token


async def _wug_get(url: str, path: str, token: str, params: dict | None = None) -> dict:
    """Authenticated GET against the WUG REST API."""
    async with httpx.AsyncClient(verify=False, timeout=20) as client:
        resp = await client.get(
            f"{url.rstrip('/')}/api/v1/{path.lstrip('/')}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {},
        )
        resp.raise_for_status()
        return resp.json()


async def _wug_all_devices(url: str, token: str, group_id: int = -1) -> list:
    """Fetch every device from a group, handling WUG pagination."""
    devices, page_id = [], None
    while True:
        params = {"pageSize": 200}
        if page_id:
            params["nextPageId"] = page_id
        data    = await _wug_get(url, f"device-groups/{group_id}/devices", token, params)
        batch   = data.get("data") or []
        devices.extend(batch)
        page_id = (data.get("paging") or {}).get("nextPageId")
        if not page_id:
            break
    return devices


async def _wug_child_groups(url: str, token: str, group_id: int = -1) -> list:
    """Return immediate child groups of a group."""
    data = await _wug_get(url, f"device-groups/{group_id}/childGroups", token)
    return data.get("data") or []


def _wug_map_type(role: str) -> str:
    r = (role or "").lower()
    if any(x in r for x in ["router", "firewall", "gateway", "udm", "usg", "edge"]):
        return "gateway"
    if any(x in r for x in ["access point", "ap ", "wireless", "wifi"]):
        return "ap"
    if any(x in r for x in ["core", "distribution"]):
        return "switch_core"
    if "switch" in r:
        return "switch"
    return "switch"


def _wug_map_status(worst: str) -> str:
    w = (worst or "").lower()
    if w == "down":                          return "down"
    if w in ("maintenance", "acknowledge"):  return "maintenance"
    if w == "up":                            return "up"
    return "unknown"


def _wug_make_location(group: dict, raw_devs: list) -> dict:
    """Convert a WUG group + its raw device list into a LocationCard-compatible dict."""
    # Find first gateway to use as root parent
    gw_id = None
    for d in raw_devs:
        if _wug_map_type(d.get("role", "")) == "gateway":
            gw_id = str(d.get("id"))
            break

    devices = []
    for d in raw_devs:
        did    = str(d.get("id", ""))
        dtype  = _wug_map_type(d.get("role", ""))
        parent = None if (dtype == "gateway" or gw_id is None) else gw_id
        devices.append({
            "id":        did,
            "name":      d.get("displayName") or d.get("hostName") or d.get("networkAddress") or did,
            "type":      dtype,
            "parent_id": parent,
            "ip":        d.get("networkAddress") or d.get("hostName") or "",
            "status":    _wug_map_status(d.get("worstState")),
            "alert":     (d.get("worstState") or "").lower() == "down",
        })
    return {
        "id":      str(group.get("id")),
        "name":    group.get("name", f"Group {group.get('id')}"),
        "devices": devices,
    }


async def _wug_fetch_topology(url: str, username: str, password: str) -> dict:
    """Build full topology: device groups as locations, devices inside each."""
    try:
        token  = await _wug_get_token(url, username, password)
        groups = await _wug_child_groups(url, token, -1)

        locations = []
        if groups:
            # Build per-group device lists concurrently
            tasks = [_wug_all_devices(url, token, int(g["id"])) for g in groups]
            group_devs = await asyncio.gather(*tasks, return_exceptions=True)
            for g, devs in zip(groups, group_devs):
                if isinstance(devs, Exception) or not devs:
                    continue
                locations.append(_wug_make_location(g, devs))
        else:
            # No sub-groups — show all devices as one flat location
            all_devs = await _wug_all_devices(url, token, -1)
            if all_devs:
                locations.append(_wug_make_location({"id": "all", "name": "All Devices"}, all_devs))

        # Build alert list from any down device across all locations
        alerts = [
            {
                "id":       d["id"],
                "device":   d["name"],
                "ip":       d["ip"],
                "location": loc["name"],
                "status":   d["status"],
            }
            for loc in locations
            for d in loc["devices"]
            if d["alert"]
        ]
        return {"locations": locations, "alerts": alerts, "source": "live"}

    except Exception as exc:
        logger.error("WUG topology fetch failed: %s", exc)
        return {"locations": [], "alerts": [], "source": "error", "message": str(exc)}


async def _wug_background_poller():
    """Refresh WUG topology every wug_poll_interval seconds and inject alerts for down devices."""
    await asyncio.sleep(20)
    known_down: set = set()   # track already-alerted device IDs so we don't duplicate
    while True:
        try:
            s    = load_settings()
            url  = s.get("wug_url", "").strip()
            user = s.get("wug_username", "").strip()
            pwd  = s.get("wug_password", "").strip()
            if url and user and pwd:
                result = await _wug_fetch_topology(url, user, pwd)
                _wug_data_cache["topology"] = result
                _wug_data_cache["alerts"]   = result.get("alerts", [])
                _wug_data_cache["ts"]        = time.time()

                # Inject new down-device alerts into the shared _alerts_store
                current_down = {a["id"] for a in result.get("alerts", [])}
                for alert in result.get("alerts", []):
                    dev_id = alert["id"]
                    if dev_id not in known_down:
                        from datetime import datetime, timezone
                        doc = {
                            "id":           f"wug-{dev_id}",
                            "title":        f"WUG: {alert['device']} is DOWN",
                            "message":      f"Device {alert['device']} ({alert['ip']}) at {alert['location']} reported DOWN by WhatsUp Gold",
                            "severity":     "critical",
                            "site":         alert.get("location", ""),
                            "device":       alert.get("device", ""),
                            "acknowledged": False,
                            "source":       "wug",
                            "ts":           datetime.now(timezone.utc).isoformat(),
                        }
                        # Avoid duplicates if alert already exists in store
                        if not any(a.get("id") == doc["id"] for a in _alerts_store):
                            _alerts_store.append(doc)
                # Remove auto-resolved WUG alerts from store
                for a in list(_alerts_store):
                    if a.get("source") == "wug" and a["id"].replace("wug-", "") not in current_down:
                        _alerts_store.remove(a)
                known_down = current_down
        except Exception as exc:
            logger.warning("WUG background poll error: %s", exc)
        interval = load_settings().get("wug_poll_interval", 60)
        await asyncio.sleep(max(30, interval))


@api_router.get("/wug/topology")
async def wug_topology():
    """
    Returns network topology grouped by WUG device-group (= location).
    Schema: { locations: [ { id, name, devices: [...] } ], source, alerts }
    """
    s    = load_settings()
    url  = s.get("wug_url", "").strip()
    user = s.get("wug_username", "").strip()
    pwd  = s.get("wug_password", "").strip()

    if not (url and user and pwd):
        return {"locations": [], "alerts": [], "source": "pending",
                "message": "WUG credentials not configured — set wug_url, wug_username, wug_password in Settings"}

    # Serve from background cache if fresh (< 2× poll interval)
    cached = _wug_data_cache.get("topology")
    if cached and time.time() - _wug_data_cache["ts"] < s.get("wug_poll_interval", 60) * 2:
        return cached

    # Otherwise fetch live (first hit, or cache stale)
    result = await _wug_fetch_topology(url, user, pwd)
    _wug_data_cache["topology"] = result
    _wug_data_cache["alerts"]   = result.get("alerts", [])
    _wug_data_cache["ts"]        = time.time()
    return result


@api_router.get("/wug/alerts")
async def wug_alerts():
    """Returns only the down-device alerts from the last WUG topology poll."""
    s    = load_settings()
    url  = s.get("wug_url", "").strip()
    user = s.get("wug_username", "").strip()
    pwd  = s.get("wug_password", "").strip()

    if not (url and user and pwd):
        return {"alerts": [], "source": "pending"}

    # Use background cache if available
    if _wug_data_cache["ts"] > 0:
        return {"alerts": _wug_data_cache["alerts"], "source": "live",
                "ts": _wug_data_cache["ts"]}

    # Cold start — fetch now
    result = await _wug_fetch_topology(url, user, pwd)
    _wug_data_cache["topology"] = result
    _wug_data_cache["alerts"]   = result.get("alerts", [])
    _wug_data_cache["ts"]        = time.time()
    return {"alerts": _wug_data_cache["alerts"], "source": "live"}


# ─── Vendor Status ─────────────────────────────────────────────────

@api_router.get("/vendor-status")
async def get_vendor_status():
    settings  = load_settings()
    dd_id     = settings.get("downdetector_client_id", "")
    dd_secret = settings.get("downdetector_client_secret", "")

    now = time.time()
    dd_status = {
        "configured": bool(dd_id and dd_secret),
        "token_active": bool(_dd_token_cache.get("token") and now < _dd_token_cache.get("expires_at", 0)),
        "next_refresh_in_s": max(0, int(_dd_token_cache.get("expires_at", 0) - now - 60)) if _dd_token_cache.get("expires_at") else None,
    }

    # Return from background cache if available (avoids 21 live requests per call)
    if _vendor_cache["vendors"]:
        return {"vendors": _vendor_cache["vendors"], "dd_status": dd_status}

    # First-ever call: fetch live and warm the cache
    dd_token = None
    if dd_id and dd_secret:
        dd_token = await _dd_get_token(dd_id, dd_secret)
    tasks = [check_vendor_status(v, dd_token) for v in VENDORS]
    results = await asyncio.gather(*tasks)
    _vendor_cache["vendors"] = list(results)
    _vendor_cache["ts"] = time.time()
    return {"vendors": list(results), "dd_status": dd_status}


async def background_vendor_warmer():
    """Refresh vendor HTTP-ping status every 120s in the background."""
    await asyncio.sleep(15)  # let other warmers start first
    while True:
        try:
            settings  = load_settings()
            dd_id     = settings.get("downdetector_client_id", "")
            dd_secret = settings.get("downdetector_client_secret", "")
            dd_token  = None
            if dd_id and dd_secret:
                dd_token = await _dd_get_token(dd_id, dd_secret)
            tasks   = [check_vendor_status(v, dd_token) for v in VENDORS]
            results = await asyncio.gather(*tasks)
            _vendor_cache["vendors"] = list(results)
            _vendor_cache["ts"]      = time.time()
            logger.info(f"Vendor cache refreshed: {len(results)} vendors")
        except Exception as e:
            logger.warning(f"Vendor warmer error: {e}")
        await asyncio.sleep(120)


# ─── Sites ────────────────────────────────────────────────────────

SITES_DATA = [
    {"id": "remus",           "name": "Remus",            "state": "MI", "coordinates": [-85.147, 43.598], "type": "office"},
    {"id": "ovid",            "name": "Ovid",             "state": "MI", "coordinates": [-84.371, 43.001], "type": "office"},
    {"id": "mt-pleasant",    "name": "Mt. Pleasant",     "state": "MI", "coordinates": [-84.774, 43.598], "type": "office"},
    {"id": "constantine",    "name": "Constantine",      "state": "MI", "coordinates": [-85.667, 41.841], "type": "office"},
    {"id": "novi",            "name": "Novi",             "state": "MI", "coordinates": [-83.476, 42.481], "type": "hq"},
    {"id": "canton",          "name": "Canton",           "state": "OH", "coordinates": [-81.378, 40.799], "type": "plant"},
    {"id": "canton-warehouse","name": "Canton Warehouse", "state": "OH", "coordinates": [-81.390, 40.870], "type": "warehouse"},
    {"id": "middlebury",      "name": "Middlebury",       "state": "IN", "coordinates": [-85.707, 41.676], "type": "office"},
]

@api_router.get("/sites")
async def get_sites():
    live_circuits = await get_aruba_circuits_live()
    circuits      = live_circuits if live_circuits is not None else load_circuits()
    alerts        = [a for a in _alerts_store if not a.get("acknowledged")]
    sites = []
    for sd in SITES_DATA:
        site_circuits = [c for c in circuits if c["site"].lower() == sd["name"].lower()]
        site_alerts   = [a for a in alerts if (a.get("site") or "").lower() == sd["name"].lower()]
        if any(c["status"] == "down" for c in site_circuits):
            status = "offline"
        elif any(c["status"] == "degraded" for c in site_circuits) or any(a["severity"] == "critical" for a in site_alerts):
            status = "degraded"
        else:
            status = "online"
        sites.append({**sd, "status": status, "circuit_count": len(site_circuits), "alert_count": len(site_alerts)})
    return sites


# ─── Settings (settings.yml) ──────────────────────────────────────

HIDDEN_FIELDS = {"email_password", "wazuh_password", "wazuh_indexer_password", "downdetector_client_secret"}

@api_router.get("/settings")
async def get_settings():
    s = load_settings()
    return {k: v for k, v in s.items() if k not in HIDDEN_FIELDS}

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    new_settings = save_settings(update)
    return {k: v for k, v in new_settings.items() if k not in {"email_password", "wazuh_password", "wazuh_indexer_password"}}


# ─── Wazuh API Endpoints ───────────────────────────────────────────

@api_router.get("/wazuh/status")
async def wazuh_connectivity():
    settings = load_settings()
    if not settings.get("wazuh_url") or not settings.get("wazuh_username"):
        return {"connected": False, "reason": "not_configured"}
    try:
        _wazuh_token_cache.clear()
        await _wazuh_get_token(settings)
        return {"connected": True, "reason": "ok", "url": settings["wazuh_url"]}
    except httpx.ConnectTimeout:
        return {"connected": False, "reason": f"Connection timeout – is {settings['wazuh_url']} reachable?"}
    except httpx.ConnectError:
        return {"connected": False, "reason": "Connection refused – check IP/port and that Wazuh API is running"}
    except httpx.HTTPStatusError as exc:
        return {"connected": False, "reason": f"HTTP {exc.response.status_code} – check credentials"}
    except Exception as exc:
        return {"connected": False, "reason": str(exc)[:200]}

@api_router.get("/wazuh/alerts")
async def get_wazuh_alerts(min_level: int = 3, hours_back: int = 24, limit: int = 200, group: str = None):
    settings = load_settings()
    if not settings.get("wazuh_url") or not settings.get("wazuh_username"):
        raise HTTPException(status_code=503, detail="Wazuh not configured")
    try:
        alerts = await _wazuh_fetch_alerts(settings, min_level, hours_back, limit, group)
        return {"items": alerts, "total": len(alerts)}
    except Exception as exc:
        logger.error(f"Wazuh alerts error: {exc}")
        raise HTTPException(status_code=503, detail=f"Wazuh indexer: {str(exc)[:200]}")

@api_router.get("/wazuh/agents")
async def get_wazuh_agents():
    settings = load_settings()
    if not settings.get("wazuh_url") or not settings.get("wazuh_username"):
        raise HTTPException(status_code=503, detail="Wazuh not configured")
    try:
        agents = await _wazuh_fetch_agents(settings)
        return {"items": agents, "total": len(agents)}
    except Exception as exc:
        logger.error(f"Wazuh agents error: {exc}")
        raise HTTPException(status_code=503, detail=f"Wazuh API: {str(exc)[:200]}")

@api_router.get("/wazuh/summary")
async def wazuh_summary():
    settings = load_settings()
    empty = {"configured": False, "connected": False, "critical": 0, "high": 0, "medium": 0, "low": 0, "total_agents": 0}
    if not settings.get("wazuh_url") or not settings.get("wazuh_username"):
        return empty
    try:
        alerts = await _wazuh_fetch_alerts(settings, min_level=1, hours_back=24, limit=500)
        agents = await _wazuh_fetch_agents(settings)
        def lvl(a): return int((a.get("rule") or {}).get("level", 0))
        return {
            "configured": True, "connected": True,
            "critical": sum(1 for a in alerts if lvl(a) >= 15),
            "high":     sum(1 for a in alerts if 11 <= lvl(a) <= 14),
            "medium":   sum(1 for a in alerts if 6 <= lvl(a) <= 10),
            "low":      sum(1 for a in alerts if lvl(a) <= 5),
            "total":    len(alerts),
            "total_agents":  len(agents),
            "active_agents": sum(1 for ag in agents if ag.get("status") == "active"),
        }
    except Exception as exc:
        logger.error(f"Wazuh summary error: {exc}")
        return {**empty, "configured": True, "error": str(exc)[:120]}


# ─── UniFi Syslog Events ──────────────────────────────────────────

@api_router.get("/unifi-events")
async def get_unifi_events(severity: str = None, limit: int = 200):
    items = _unifi_events_store
    if severity:
        items = [e for e in items if e.get("severity") == severity]
    items = sorted(items, key=lambda e: e.get("created_at", ""), reverse=True)[:limit]
    return {"items": items, "total": len(items)}

@api_router.delete("/unifi-events")
async def clear_unifi_events():
    count = len(_unifi_events_store)
    _unifi_events_store.clear()
    return {"deleted": count}


# ─── UniFi Network Devices ────────────────────────────────────────

@api_router.get("/unifi/devices")
async def get_unifi_devices_endpoint(demo: bool = False):
    """Return all UniFi devices from both configured controllers (cache-first).
    Pass ?demo=true to return sample data for UI preview."""
    if demo:
        return {"devices": [
            {"id":"sw01","name":"SW-CORE-01","model":"USW-Pro-24-POE","type":"switch","type_raw":"usw","status":"online","ip":"10.202.1.1","mac":"aa:bb:cc:01","uptime":2592000,"uptime_str":"30d 0h","version":"6.5.59","controller":"Mimilk","num_sta":0,"num_port":24},
            {"id":"sw02","name":"SW-DIST-02","model":"USW-48-POE","type":"switch","type_raw":"usw","status":"online","ip":"10.202.1.2","mac":"aa:bb:cc:02","uptime":1296000,"uptime_str":"15d 0h","version":"6.5.59","controller":"Mimilk","num_sta":0,"num_port":48},
            {"id":"sw03","name":"SW-IDF-PLANT","model":"USW-24","type":"switch","type_raw":"usw","status":"offline","ip":"10.202.1.3","mac":"aa:bb:cc:03","uptime":0,"uptime_str":"","version":"6.5.59","controller":"Mimilk","num_sta":0,"num_port":24},
            {"id":"ap01","name":"AP-LOBBY","model":"U6-Pro","type":"access_point","type_raw":"uap","status":"online","ip":"10.202.2.1","mac":"dd:ee:ff:01","uptime":864000,"uptime_str":"10d 0h","version":"6.2.49","controller":"Mimilk","num_sta":14,"num_port":0},
            {"id":"ap02","name":"AP-OFFICE","model":"U6-LR","type":"access_point","type_raw":"uap","status":"online","ip":"10.202.2.2","mac":"dd:ee:ff:02","uptime":432000,"uptime_str":"5d 0h","version":"6.2.49","controller":"Mimilk","num_sta":8,"num_port":0},
            {"id":"ap03","name":"AP-WAREHOUSE","model":"U6-Mesh","type":"access_point","type_raw":"uap","status":"online","ip":"10.202.2.3","mac":"dd:ee:ff:03","uptime":259200,"uptime_str":"3d 0h","version":"6.2.49","controller":"Mimilk","num_sta":3,"num_port":0},
            {"id":"ap04","name":"AP-CONF-ROOM","model":"U6-Pro","type":"access_point","type_raw":"uap","status":"offline","ip":"10.202.2.4","mac":"dd:ee:ff:04","uptime":0,"uptime_str":"","version":"6.2.49","controller":"Mimilk","num_sta":0,"num_port":0},
            {"id":"cam01","name":"CAM-ENTRY","model":"G4-Dome","type":"camera","type_raw":"uvc","status":"online","ip":"10.202.3.1","mac":"cc:00:11:01","uptime":604800,"uptime_str":"7d 0h","version":"4.69.55","controller":"CloudKey","num_sta":0,"num_port":0},
            {"id":"cam02","name":"CAM-PARKING","model":"G4-Bullet","type":"camera","type_raw":"uvc","status":"online","ip":"10.202.3.2","mac":"cc:00:11:02","uptime":604800,"uptime_str":"7d 0h","version":"4.69.55","controller":"CloudKey","num_sta":0,"num_port":0},
            {"id":"cam03","name":"CAM-SERVER-ROOM","model":"G3-Instant","type":"camera","type_raw":"uvc","status":"offline","ip":"10.202.3.3","mac":"cc:00:11:03","uptime":0,"uptime_str":"","version":"4.69.55","controller":"CloudKey","num_sta":0,"num_port":0},
        ], "updated": datetime.now(timezone.utc).isoformat()}

    if "devices" in _unifi_cache:
        return {"devices": _unifi_cache["devices"], "updated": _unifi_cache.get("updated")}

    s = load_settings()
    tasks = []
    if s.get("unifi_controller1_url") and s.get("unifi_controller1_username"):
        tasks.append(_fetch_unifi_controller(
            s["unifi_controller1_url"], s["unifi_controller1_username"],
            s.get("unifi_controller1_password", ""),
            s.get("unifi_controller1_site", "default"),
            s.get("unifi_controller1_label", "Site 1"),
        ))
    if s.get("unifi_controller2_url") and s.get("unifi_controller2_username"):
        tasks.append(_fetch_unifi_controller(
            s["unifi_controller2_url"], s["unifi_controller2_username"],
            s.get("unifi_controller2_password", ""),
            s.get("unifi_controller2_site", "default"),
            s.get("unifi_controller2_label", "Site 2"),
        ))
    devices = []
    if tasks:
        for sub in await asyncio.gather(*tasks):
            devices.extend(sub)
    now = datetime.now(timezone.utc).isoformat()
    _unifi_cache["devices"] = devices
    _unifi_cache["updated"] = now
    return {"devices": devices, "updated": now}


# ─── Vivantio Ticketing ───────────────────────────────────────────────────────

_vivantio_cache: dict = {"tickets": None, "ts": 0, "max_id": 27400}
VIVANTIO_CACHE_TTL = 60

VIVANTIO_PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
VIVANTIO_CLOSED_STATUSES = {"Closed", "Resolved", "Cancelled", "Canceled", "Complete", "Completed"}

def _normalize_priority(raw: str) -> str:
    if not raw:
        return "Medium"
    m = {"critical": "Critical", "1": "Critical",
         "high": "High", "2": "High",
         "medium": "Medium", "3": "Medium", "standard": "Medium",
         "low": "Low", "4": "Low"}
    return m.get(raw.lower(), "Medium")


async def _vivantio_request(url: str, username: str, password: str, path: str, body=None):
    """Authenticated POST to the Vivantio API."""
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    headers = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.post(f"{url.rstrip('/')}/api/{path}", headers=headers, json=body or {})
        r.raise_for_status()
        return r.json()


async def _vivantio_find_max_id(url: str, username: str, password: str, start: int) -> int:
    """Binary-search the highest existing Vivantio ticket ID from start."""
    step = 100
    current = start
    for _ in range(20):
        data = await _vivantio_request(url, username, password, f"Ticket/SelectById/{current + step}")
        if data.get("Found"):
            current += step
        else:
            break
    lo, hi = current, current + step
    for _ in range(10):
        if hi - lo <= 1:
            break
        mid = (lo + hi) // 2
        data = await _vivantio_request(url, username, password, f"Ticket/SelectById/{mid}")
        if data.get("Found"):
            lo = mid
        else:
            hi = mid
    return lo


async def _vivantio_fetch_tickets(url: str, username: str, password: str) -> list:
    """Scan last 200 ticket IDs; return active (non-closed) tickets sorted by priority."""
    max_id = _vivantio_cache["max_id"]

    # Probe ahead to find the latest ticket ID
    probe = max_id + 50
    data = await _vivantio_request(url, username, password, f"Ticket/SelectById/{probe}")
    if data.get("Found"):
        max_id = await _vivantio_find_max_id(url, username, password, probe)
        _vivantio_cache["max_id"] = max_id

    # Batch-fetch last 200 IDs — API returns {"Results": [...]}
    ids = list(range(max_id, max(max_id - 200, 0), -1))
    raw = await _vivantio_request(url, username, password, "Ticket/SelectList", ids)
    all_tickets = raw.get("Results", []) if isinstance(raw, dict) else []

    active = []
    for t in all_tickets:
        if not isinstance(t, dict):
            continue
        if t.get("StatusType") == 4:
            continue
        if t.get("StatusName") in VIVANTIO_CLOSED_STATUSES:
            continue
        priority_raw = t.get("PriorityName", "") or ""
        active.append({
            "id":           str(t.get("Id", "")),
            "ticket_number": str(t.get("DisplayId") or t.get("Id", "")),
            "title":        t.get("Title", ""),
            "status":       t.get("StatusName", "open"),
            "priority":     _normalize_priority(priority_raw),
            "priority_raw": priority_raw,
            "assignee":     t.get("TakenByName") or t.get("OwnerName") or "",
            "category":     t.get("CategoryLineage", ""),
            "type":         t.get("RecordTypeNameSingular", "Ticket"),
            "opened":       t.get("OpenDate", ""),
            "updated":      t.get("LastModifiedDate", ""),
        })

    active.sort(key=lambda x: (
        VIVANTIO_PRIORITY_ORDER.get(x["priority"], 99),
        -(int(x["id"] or 0))
    ))
    return active


async def background_vivantio_warmer():
    """Warm Vivantio ticket cache on startup and refresh every 60s."""
    await asyncio.sleep(8)
    while True:
        try:
            settings = load_settings()
            url      = settings.get("vivantio_api_url", "")
            username = settings.get("vivantio_api_key", "")
            password = settings.get("vivantio_password", "")
            if url and username and password:
                tickets = await _vivantio_fetch_tickets(url, username, password)
                _vivantio_cache["tickets"] = tickets
                _vivantio_cache["ts"]      = time.time()
                logger.info(f"Vivantio cache refreshed: {len(tickets)} active tickets")
        except Exception as e:
            logger.warning(f"Vivantio warmer error: {e}")
        await asyncio.sleep(60)

@api_router.get("/vivantio/tickets")
async def get_vivantio_tickets():
    settings = load_settings()
    url      = settings.get("vivantio_api_url", "")
    username = settings.get("vivantio_api_key", "")
    password = settings.get("vivantio_password", "")

    if not url or not username or not password:
        return {"configured": False, "tickets": [], "total": 0, "by_priority": {}, "by_status": {}}

    if _vivantio_cache["tickets"] is not None and \
       (time.time() - _vivantio_cache["ts"]) < VIVANTIO_CACHE_TTL:
        return _vivantio_summary(_vivantio_cache["tickets"], configured=True)

    try:
        tickets = await _vivantio_fetch_tickets(url, username, password)
        _vivantio_cache["tickets"] = tickets
        _vivantio_cache["ts"]      = time.time()
        return _vivantio_summary(tickets, configured=True)
    except Exception as e:
        logger.error(f"Vivantio tickets error: {e}")
        cached = _vivantio_cache.get("tickets")
        if cached:
            return {**_vivantio_summary(cached, configured=True), "stale": True}
        return {"configured": True, "error": str(e)[:120], "tickets": [], "total": 0,
                "by_priority": {}, "by_status": {}}

def _vivantio_summary(tickets: list, configured: bool) -> dict:
    by_priority = {}
    by_status   = {}
    for t in tickets:
        by_priority[t["priority"]] = by_priority.get(t["priority"], 0) + 1
        by_status[t["status"]]     = by_status.get(t["status"], 0) + 1
    return {
        "configured":  configured,
        "tickets":     tickets,
        "total":       len(tickets),
        "by_priority": by_priority,
        "by_status":   by_status,
    }


app.include_router(api_router)

# ─── Serve built React frontend (Pi / production deployment) ──────
# When `frontend/build/` exists (i.e. after `yarn build`), FastAPI serves the
# full SPA on port 8001 so no separate Node dev-server is needed on the Pi.
_BUILD = Path(__file__).parent.parent / "frontend" / "build"
if _BUILD.is_dir():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse as _FileResponse

    _STATIC = _BUILD / "static"
    if _STATIC.is_dir():
        app.mount("/static", StaticFiles(directory=str(_STATIC)), name="react_static")

    @app.get("/favicon.ico", include_in_schema=False)
    async def _favicon():
        return _FileResponse(str(_BUILD / "favicon.ico"))

    @app.get("/manifest.json", include_in_schema=False)
    async def _manifest():
        return _FileResponse(str(_BUILD / "manifest.json"))

    @app.get("/us-states-10m.json", include_in_schema=False)
    async def _geo_json():
        return _FileResponse(str(_BUILD / "us-states-10m.json"), media_type="application/json")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str):
        """Catch-all: return index.html so React Router handles all paths."""
        return _FileResponse(str(_BUILD / "index.html"))

    logger.info("Serving built React app from %s", _BUILD)
