from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict
from typing import Optional
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import os, logging, asyncio, httpx, imaplib, email as emaillib, re, uuid
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]

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
    aruba_api_url: Optional[str] = None
    aruba_api_key: Optional[str] = None
    unifi_syslog_port: Optional[int] = None
    unifi_syslog_enabled: Optional[bool] = None

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

    lower = raw.lower()
    if any(k in lower for k in ["emerg", "crit", "attack", "intrusion", "brute"]):
        severity = "critical"
    elif any(k in lower for k in ["error", "fail", "block", "deny", "reject", "drop", "deauth", "disconnect", "unreachable"]):
        if severity == "info":
            severity = "warning"

    # Extract hostname from RFC3164: <PRI>Mon DD HH:MM:SS HOSTNAME …
    device = None
    clean = re.sub(r'^<\d+>', '', raw).strip()
    parts = clean.split()
    if len(parts) >= 4:
        device = parts[3]

    # Strip timestamp prefix to get message
    msg_match = re.match(r'^\w+\s+\d+\s+\d+:\d+:\d+\s+\S+\s+(.*)', clean)
    message = msg_match.group(1) if msg_match else clean

    return {"severity": severity, "device": device, "message": message[:1000]}


class UnifiSyslogProtocol(asyncio.DatagramProtocol):
    """UDP datagram receiver for UniFi syslog traffic."""

    def __init__(self, db_ref):
        self.db = db_ref

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
        await self.db.unifi_events.insert_one(doc)
        logger.info(f"UniFi [{parsed['severity'].upper()}] {source_ip} – {parsed['message'][:60]}")

    def error_received(self, exc):
        logger.warning(f"UniFi syslog protocol error: {exc}")

    def connection_lost(self, _exc):
        logger.info("UniFi syslog UDP listener closed")


# ─── Vendor Status ────────────────────────────────────────────────
VENDORS = [
    {"id": "crowdstrike", "name": "CrowdStrike", "status_url": "https://status.crowdstrike.com/api/v2/summary.json", "web_url": "https://status.crowdstrike.com"},
    {"id": "ninjaone", "name": "NinjaOne (RMM)", "status_url": "https://status.ninjarmm.com/api/v2/summary.json", "web_url": "https://status.ninjarmm.com"},
    {"id": "zscaler", "name": "Zscaler", "status_url": "https://trust.zscaler.com/api/v2/summary.json", "web_url": "https://trust.zscaler.com"},
    {"id": "microsoft365", "name": "Microsoft 365", "status_url": "https://status.office365.com/api/v2/summary.json", "web_url": "https://status.office365.com"},
    {"id": "dynamics365", "name": "Dynamics 365", "status_url": None, "web_url": "https://admin.powerplatform.microsoft.com/"},
]

async def check_vendor_status(vendor: dict) -> dict:
    result = {"id": vendor["id"], "name": vendor["name"], "status": "unknown", "description": "Status unavailable", "last_checked": datetime.now(timezone.utc).isoformat(), "web_url": vendor["web_url"], "incidents": []}
    if not vendor.get("status_url"):
        result["description"] = "No public status page configured"
        return result
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(vendor["status_url"])
            if resp.status_code == 200:
                data = resp.json()
                indicator = data.get("status", {}).get("indicator", "none")
                description = data.get("status", {}).get("description", "All Systems Operational")
                status_map = {"none": "operational", "minor": "minor_outage", "major": "major_outage", "critical": "major_outage", "maintenance": "maintenance"}
                result["status"] = status_map.get(indicator, "unknown")
                result["description"] = description
                incidents = data.get("incidents", [])
                result["incidents"] = [{"name": i.get("name", ""), "status": i.get("status", "")} for i in incidents[:3]]
    except Exception as e:
        logger.warning(f"Could not check {vendor['name']}: {e}")
        result["description"] = "Could not reach status page"
    return result

# ─── Email Parser ─────────────────────────────────────────────────
def parse_wug_email(subject: str, body: str) -> dict:
    severity = "info"
    if re.search(r"(critical|down|error|fail|unreachable)", subject.lower()):
        severity = "critical"
    elif re.search(r"(warning|warn|high|degraded|slow)", subject.lower()):
        severity = "warning"
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

# ─── Seed Data ────────────────────────────────────────────────────
async def seed_demo_data():
    now = datetime.now(timezone.utc)

    if await db.alerts.count_documents({}) == 0:
        alerts = [
            {"id": str(uuid.uuid4()), "title": "WAN Circuit Down - Remus Site", "message": "DIA circuit at Remus is unresponsive. Provider AT&T. Circuit ID: ATT-MR-4521. Ping response lost.", "severity": "critical", "source": "wug", "site": "Remus", "device": "REMUS-WAN-RTR", "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": (now - timedelta(minutes=15)).isoformat()},
            {"id": str(uuid.uuid4()), "title": "High CPU Alert - Constantine Core Switch", "message": "CPU utilization at 94% for 10+ minutes. Possible traffic storm or runaway process. Device: CONST-CORE-SW01", "severity": "warning", "source": "wug", "site": "Constantine", "device": "CONST-CORE-SW01", "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": (now - timedelta(hours=1)).isoformat()},
            {"id": str(uuid.uuid4()), "title": "UPS Battery Critical - Canton Plant", "message": "UPS battery at 12% charge. Estimated runtime 8 minutes. Immediate attention required.", "severity": "critical", "source": "wug", "site": "Canton Plant", "device": "CANTON-P-UPS01", "acknowledged": True, "acknowledged_by": "admin", "acknowledged_at": (now - timedelta(hours=1, minutes=30)).isoformat(), "created_at": (now - timedelta(hours=2)).isoformat()},
            {"id": str(uuid.uuid4()), "title": "Disk Space Warning - Novi File Server", "message": "Drive D: at 87% capacity. 134GB free of 1TB. Server: NOVI-FS01", "severity": "warning", "source": "wug", "site": "Novi", "device": "NOVI-FS01", "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": (now - timedelta(hours=3)).isoformat()},
            {"id": str(uuid.uuid4()), "title": "Backup Completed - Nightly Cycle", "message": "Nightly backup completed successfully on NOVI-BACKUP01. Duration: 2h 14m. Total: 842GB.", "severity": "info", "source": "manual", "site": "Novi", "device": "NOVI-BACKUP01", "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": (now - timedelta(hours=5)).isoformat()},
        ]
        await db.alerts.insert_many(alerts)

    if await db.circuits.count_documents({}) == 0:
        ts = now.isoformat()
        circuits = [
            {"id": str(uuid.uuid4()), "site": "Remus", "provider": "AT&T", "circuit_id": "ATT-MR-4521", "bandwidth_mbps": 100, "ip_address": "203.0.113.1", "status": "down", "notes": "Circuit reported down by WUG", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Ovid", "provider": "Comcast Business", "circuit_id": "CMCST-OV-8832", "bandwidth_mbps": 100, "ip_address": "198.51.100.2", "status": "up", "notes": "", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Mt. Pleasant", "provider": "AT&T", "circuit_id": "ATT-MTP-9912", "bandwidth_mbps": 200, "ip_address": "203.0.113.10", "status": "up", "notes": "", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Constantine", "provider": "Spectrum Business", "circuit_id": "SPEC-CN-1145", "bandwidth_mbps": 50, "ip_address": "192.0.2.5", "status": "degraded", "notes": "Intermittent packet loss reported", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Novi", "provider": "AT&T", "circuit_id": "ATT-NV-0034", "bandwidth_mbps": 1000, "ip_address": "203.0.113.20", "status": "up", "notes": "Primary HQ - 1Gbps dedicated fiber", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Canton Plant", "provider": "Spectrum Business", "circuit_id": "SPEC-CP-7721", "bandwidth_mbps": 200, "ip_address": "192.0.2.30", "status": "up", "notes": "", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Canton Warehouse", "provider": "Comcast Business", "circuit_id": "CMCST-CW-5543", "bandwidth_mbps": 100, "ip_address": "198.51.100.40", "status": "up", "notes": "", "last_checked": ts, "created_at": ts},
            {"id": str(uuid.uuid4()), "site": "Middlebury", "provider": "AT&T", "circuit_id": "ATT-MB-2267", "bandwidth_mbps": 100, "ip_address": "203.0.113.50", "status": "up", "notes": "", "last_checked": ts, "created_at": ts},
        ]
        await db.circuits.insert_many(circuits)

    if await db.tickets.count_documents({}) == 0:
        ts = now.isoformat()
        tickets = [
            {"id": str(uuid.uuid4()), "ticket_number": "TKT-1041", "title": "Replace failing HDD on REMUS-FS01", "description": "SMART errors detected. Users reporting slow file access. Schedule replacement and data migration.", "priority": "high", "status": "open", "category": "Hardware", "assigned_to": "John D.", "site": "Remus", "source": "manual", "created_at": (now - timedelta(days=1)).isoformat(), "updated_at": ts},
            {"id": str(uuid.uuid4()), "ticket_number": "TKT-1042", "title": "Investigate packet loss at Constantine", "description": "Users reporting intermittent connectivity. Packet loss detected on WAN circuit.", "priority": "critical", "status": "in_progress", "category": "Network", "assigned_to": "Sarah M.", "site": "Constantine", "source": "manual", "created_at": (now - timedelta(hours=6)).isoformat(), "updated_at": ts},
            {"id": str(uuid.uuid4()), "ticket_number": "TKT-1043", "title": "Setup workstations - 3 new hires Novi", "description": "3 new workstations for IT dept expansion. Image with standard build and deploy.", "priority": "medium", "status": "in_progress", "category": "Hardware", "assigned_to": "Mike R.", "site": "Novi", "source": "manual", "created_at": (now - timedelta(days=2)).isoformat(), "updated_at": ts},
            {"id": str(uuid.uuid4()), "ticket_number": "TKT-1044", "title": "SSL Certificate renewal - internal portal", "description": "Certificate expires in 15 days. Renew and deploy to web servers.", "priority": "medium", "status": "open", "category": "Security", "assigned_to": None, "site": None, "source": "manual", "created_at": (now - timedelta(days=3)).isoformat(), "updated_at": ts},
            {"id": str(uuid.uuid4()), "ticket_number": "TKT-1045", "title": "Printer setup - Canton Warehouse", "description": "New HP LaserJet Pro needs to be added to network print server.", "priority": "low", "status": "open", "category": "Hardware", "assigned_to": None, "site": "Canton Warehouse", "source": "manual", "created_at": (now - timedelta(days=4)).isoformat(), "updated_at": ts},
        ]
        await db.tickets.insert_many(tickets)

    if await db.settings.count_documents({}) == 0:
        await db.settings.insert_one({
            "_id": "app_settings", "refresh_interval": 30, "email_enabled": False,
            "email_host": "", "email_port": 993, "email_username": "", "email_password": "",
            "email_folder": "INBOX", "wug_sender_filter": "whatsupgold",
            "vivantio_api_url": "", "vivantio_api_key": "", "aruba_api_url": "", "aruba_api_key": "",
            "unifi_syslog_port": 5140, "unifi_syslog_enabled": True,
        })

    if await db.unifi_events.count_documents({}) == 0:
        unifi_seed = [
            {"id": str(uuid.uuid4()), "raw": "<30>Jan  1 10:15:32 NOVI-UAP-PRO hostapd: STA aa:bb:cc:dd:ee:ff IEEE 802.11: authenticated", "source_ip": "192.168.1.100", "severity": "info",     "device": "NOVI-UAP-PRO",    "message": "hostapd: STA aa:bb:cc:dd:ee:ff IEEE 802.11: authenticated", "created_at": (now - timedelta(minutes=2)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<28>Jan  1 10:14:01 REMUS-UDM kernel: [WAN_LOCAL-default-D]IN=eth8 SRC=45.33.32.156 DST=203.0.113.1 PROTO=TCP DPT=22 DROP", "source_ip": "192.168.2.1", "severity": "warning",  "device": "REMUS-UDM",        "message": "kernel: [WAN_LOCAL-default-D] SRC=45.33.32.156 DST=203.0.113.1 PROTO=TCP DPT=22 DROP", "created_at": (now - timedelta(minutes=8)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<26>Jan  1 10:10:44 CONST-SW01 kernel: [WAN_IN-3-A]IN=eth8 OUT=eth0 SRC=10.0.0.1 DST=10.0.0.2 PROTO=UDP block", "source_ip": "192.168.3.1", "severity": "warning",  "device": "CONST-SW01",       "message": "kernel: [WAN_IN-3-A] SRC=10.0.0.1 DST=10.0.0.2 PROTO=UDP block", "created_at": (now - timedelta(minutes=15)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<134>Jan  1 10:05:12 NOVI-UDM mcad: ath0: STA 11:22:33:44:55:66 deauthenticated due to inactivity", "source_ip": "192.168.1.1", "severity": "info",     "device": "NOVI-UDM",         "message": "mcad: ath0: STA 11:22:33:44:55:66 deauthenticated due to inactivity", "created_at": (now - timedelta(minutes=20)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<0>Jan  1 10:00:00 CANTON-P-FW01 kernel: CRITICAL port scan detected 185.220.101.45 – 142 ports in 30s", "source_ip": "10.100.1.1",  "severity": "critical", "device": "CANTON-P-FW01",    "message": "kernel: CRITICAL port scan detected from 185.220.101.45 – 142 ports in 30s", "created_at": (now - timedelta(minutes=25)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<30>Jan  1 09:55:00 NOVI-UAP-PRO hostapd: STA cc:dd:ee:ff:00:11 IEEE 802.11: associated (AID 3)", "source_ip": "192.168.1.100", "severity": "info",     "device": "NOVI-UAP-PRO",    "message": "hostapd: STA cc:dd:ee:ff:00:11 IEEE 802.11: associated (AID 3)", "created_at": (now - timedelta(minutes=30)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<28>Jan  1 09:50:11 MT-PLEASANT-UDM firewall: deny SRC=203.0.113.99 DST=10.50.0.1 DPT=3389 DROP", "source_ip": "10.50.0.254",  "severity": "warning",  "device": "MT-PLEASANT-UDM",  "message": "firewall: deny SRC=203.0.113.99 DST=10.50.0.1 DPT=3389 DROP", "created_at": (now - timedelta(minutes=40)).isoformat()},
            {"id": str(uuid.uuid4()), "raw": "<30>Jan  1 09:45:00 MIDDLEBURY-AP hostapd: STA ff:ee:dd:cc:bb:aa IEEE 802.11: disassociated", "source_ip": "10.80.0.10",   "severity": "info",     "device": "MIDDLEBURY-AP",    "message": "hostapd: STA ff:ee:dd:cc:bb:aa IEEE 802.11: disassociated", "created_at": (now - timedelta(minutes=50)).isoformat()},
        ]
        await db.unifi_events.insert_many(unifi_seed)

    logger.info("Demo data seeded")

# ─── Background Tasks ─────────────────────────────────────────────
async def background_email_poller():
    while True:
        try:
            settings = await db.settings.find_one({"_id": "app_settings"}, {"_id": 0})
            if settings and settings.get("email_enabled") and settings.get("email_host"):
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
        _, messages = mail.search(None, f'UNSEEN SUBJECT "{sender_filter}"')
        for num in (messages[0].split() if messages[0] else []):
            _, msg_data = mail.fetch(num, "(RFC822)")
            email_msg = emaillib.message_from_bytes(msg_data[0][1])
            subject = email_msg.get("Subject", "WUG Alert")
            body = ""
            if email_msg.is_multipart():
                for part in email_msg.walk():
                    if part.get_content_type() == "text/plain":
                        body = part.get_payload(decode=True).decode(errors="ignore")
                        break
            else:
                body = email_msg.get_payload(decode=True).decode(errors="ignore")
            alert_data = parse_wug_email(subject, body)
            doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert_data}
            await db.alerts.insert_one(doc)
            mail.store(num, "+FLAGS", "\\Seen")
        mail.logout()
    except Exception as e:
        logger.error(f"IMAP error: {e}")

# ─── Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_demo_data()
    email_task = asyncio.create_task(background_email_poller())

    # Start UniFi syslog UDP listener
    syslog_port = int(os.environ.get("UNIFI_SYSLOG_PORT", "5140"))
    transport = None
    try:
        loop = asyncio.get_event_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: UnifiSyslogProtocol(db),
            local_addr=("0.0.0.0", syslog_port),
        )
        logger.info(f"UniFi syslog listener active on UDP:{syslog_port}")
    except Exception as exc:
        logger.warning(f"Could not start UniFi syslog listener on UDP:{syslog_port} – {exc}")

    yield

    email_task.cancel()
    if transport:
        transport.close()
    try:
        await email_task
    except asyncio.CancelledError:
        pass
    mongo_client.close()

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
    return {"status": "IT Dashboard API online", "version": "1.0.0"}

@api_router.get("/dashboard/summary")
async def dashboard_summary():
    alerts = await db.alerts.find({}, {"_id": 0}).to_list(1000)
    circuits = await db.circuits.find({}, {"_id": 0}).to_list(1000)
    tickets = await db.tickets.find({}, {"_id": 0}).to_list(1000)
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
            "total": len(tickets),
            "open": sum(1 for t in tickets if t["status"] == "open"),
            "in_progress": sum(1 for t in tickets if t["status"] == "in_progress"),
            "critical": sum(1 for t in tickets if t["priority"] == "critical"),
        },
    }

@api_router.get("/alerts")
async def get_alerts(severity: str = None, site: str = None, acknowledged: bool = None):
    query = {}
    if severity:
        query["severity"] = severity
    if site:
        query["site"] = site
    if acknowledged is not None:
        query["acknowledged"] = acknowledged
    alerts = await db.alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": alerts, "total": len(alerts)}

@api_router.post("/alerts")
async def create_alert(alert: AlertCreate):
    doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert.model_dump()}
    await db.alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/alerts/email-webhook")
async def email_webhook(payload: dict):
    subject = payload.get("subject", "WUG Alert")
    body = payload.get("body", "")
    alert_data = parse_wug_email(subject, body)
    doc = {"id": str(uuid.uuid4()), "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None, "created_at": datetime.now(timezone.utc).isoformat(), **alert_data}
    await db.alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, by: str = "admin"):
    result = await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"acknowledged": True, "acknowledged_by": by, "acknowledged_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    result = await db.alerts.delete_one({"id": alert_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True}

@api_router.get("/circuits")
async def get_circuits():
    return await db.circuits.find({}, {"_id": 0}).sort("site", 1).to_list(100)

@api_router.post("/circuits")
async def create_circuit(circuit: CircuitCreate):
    ts = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "last_checked": ts, "created_at": ts, **circuit.model_dump()}
    await db.circuits.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/circuits/{circuit_id}")
async def update_circuit(circuit_id: str, data: CircuitCreate):
    update = {**data.model_dump(), "last_checked": datetime.now(timezone.utc).isoformat()}
    result = await db.circuits.update_one({"id": circuit_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Circuit not found")
    return await db.circuits.find_one({"id": circuit_id}, {"_id": 0})

@api_router.delete("/circuits/{circuit_id}")
async def delete_circuit(circuit_id: str):
    result = await db.circuits.delete_one({"id": circuit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Circuit not found")
    return {"success": True}

@api_router.get("/tickets")
async def get_tickets(status: str = None, priority: str = None):
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    tickets = await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": tickets, "total": len(tickets)}

@api_router.post("/tickets")
async def create_ticket(ticket: TicketCreate):
    count = await db.tickets.count_documents({})
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "ticket_number": f"TKT-{1046 + count}", "source": "manual", "created_at": now, "updated_at": now, **ticket.model_dump()}
    await db.tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, data: dict):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.tickets.update_one({"id": ticket_id}, {"$set": data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return await db.tickets.find_one({"id": ticket_id}, {"_id": 0})

@api_router.delete("/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str):
    result = await db.tickets.delete_one({"id": ticket_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"success": True}

@api_router.get("/vendor-status")
async def get_vendor_status():
    tasks = [check_vendor_status(v) for v in VENDORS]
    results = await asyncio.gather(*tasks)
    return list(results)

SITES_DATA = [
    {"id": "remus", "name": "Remus", "state": "MI", "coordinates": [-85.147, 43.598], "type": "office"},
    {"id": "ovid", "name": "Ovid", "state": "MI", "coordinates": [-84.371, 43.001], "type": "office"},
    {"id": "mt-pleasant", "name": "Mt. Pleasant", "state": "MI", "coordinates": [-84.774, 43.598], "type": "office"},
    {"id": "constantine", "name": "Constantine", "state": "MI", "coordinates": [-85.667, 41.841], "type": "office"},
    {"id": "novi", "name": "Novi", "state": "MI", "coordinates": [-83.476, 42.481], "type": "hq"},
    {"id": "canton-plant", "name": "Canton Plant", "state": "OH", "coordinates": [-81.378, 40.799], "type": "plant"},
    {"id": "canton-warehouse", "name": "Canton Warehouse", "state": "OH", "coordinates": [-81.390, 40.870], "type": "warehouse"},
    {"id": "middlebury", "name": "Middlebury", "state": "IN", "coordinates": [-85.707, 41.676], "type": "office"},
]

@api_router.get("/sites")
async def get_sites():
    circuits = await db.circuits.find({}, {"_id": 0}).to_list(100)
    alerts = await db.alerts.find({"acknowledged": False}, {"_id": 0}).to_list(100)
    sites = []
    for sd in SITES_DATA:
        site_circuits = [c for c in circuits if c["site"].lower() == sd["name"].lower()]
        site_alerts = [a for a in alerts if (a.get("site") or "").lower() == sd["name"].lower()]
        if any(c["status"] == "down" for c in site_circuits):
            status = "offline"
        elif any(c["status"] == "degraded" for c in site_circuits) or any(a["severity"] == "critical" for a in site_alerts):
            status = "degraded"
        else:
            status = "online"
        sites.append({**sd, "status": status, "circuit_count": len(site_circuits), "alert_count": len(site_alerts)})
    return sites

@api_router.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"_id": "app_settings"}, {"_id": 0, "email_password": 0})
    return s or {}

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.settings.update_one({"_id": "app_settings"}, {"$set": update_data}, upsert=True)
    return await db.settings.find_one({"_id": "app_settings"}, {"_id": 0, "email_password": 0})

@api_router.get("/unifi-events")
async def get_unifi_events(severity: str = None, limit: int = 200):
    query = {}
    if severity:
        query["severity"] = severity
    events = await db.unifi_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"items": events, "total": len(events)}

@api_router.delete("/unifi-events")
async def clear_unifi_events():
    result = await db.unifi_events.delete_many({})
    return {"deleted": result.deleted_count}

app.include_router(api_router)
