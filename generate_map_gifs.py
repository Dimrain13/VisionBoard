#!/usr/bin/env python3
"""
Generate animated mesh map GIFs for the IT Command Center NOC dashboard.
Produces: maps/map-all-up.gif  +  maps/map-{site}-down.gif per site.
Run once from repo root:  python3 generate_map_gifs.py
"""
import json, math, os
from PIL import Image, ImageDraw

# ── Canvas & animation config ─────────────────────────────────────────────────
W, H       = 900, 486     # 16:9, sized for the dashboard panel
FRAMES     = 24           # frames per loop
FRAME_MS   = 70           # ms/frame → ~1.7 s loop
DOT_R      = 2            # dot radius (pixels)
DOT_GAP    = 22           # gap between dots (pixels) — matches stroke-dasharray "4 20"
OUTPUT     = os.path.join(os.path.dirname(__file__), "frontend", "public", "maps")
GEO_FILE   = os.path.join(os.path.dirname(__file__), "frontend", "public", "us-states-10m.json")
os.makedirs(OUTPUT, exist_ok=True)

# ── Mercator projection (matches MapEmbed react-simple-maps config) ──────────
SCALE       = 4050        # react-simple-maps scale=4500 → adjusted for 900px width
CENTER_LNG  = -84.8
CENTER_LAT  = 42.4

def _my(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

_CY = _my(CENTER_LAT)

def project(lng, lat):
    x = SCALE * math.radians(lng - CENTER_LNG) + W / 2
    y = -SCALE * (_my(lat) - _CY) + H / 2
    return (x, y)

# ── Color palette ─────────────────────────────────────────────────────────────
BG      = (3,   3,   5  )
PRI_F   = (10,  26,  10 )   # MI/OH/IN/IL fill
CTX_F   = (19,  19,  31 )   # WI/KY/PA/WV fill
PRI_S   = (26,  58,  26 )   # primary stroke
CTX_S   = (44,  44,  64 )   # context stroke
GREEN   = (0,   255, 102)
RED     = (255, 42,  42 )
CYAN    = (0,   229, 255)

def dim(c, factor=0.10):
    return tuple(max(0, int(v * factor)) for v in c)

# ── Sites (matches MapEmbed.jsx exactly) ─────────────────────────────────────
SITES = {
    "Novi":             {"coords": [-83.476, 42.481], "hub":   True },
    "Remus":            {"coords": [-85.147, 43.742]                },
    "Mt. Pleasant":     {"coords": [-84.774, 43.603]                },
    "Ovid":             {"coords": [-84.370, 43.009]                },
    "Middlebury":       {"coords": [-85.960, 41.630]                },
    "Canton Warehouse": {"coords": [-81.560, 40.550]                },
    "Constantine":      {"coords": [-85.480, 41.950]                },
    "Canton":           {"coords": [-81.350, 40.870]                },
    "Azure":            {"coords": [-87.63,  41.88 ], "cloud": True },
}

SITE_NAMES  = list(SITES.keys())
FULL_MESH   = [(SITE_NAMES[i], SITE_NAMES[j])
               for i in range(len(SITE_NAMES))
               for j in range(i + 1, len(SITE_NAMES))]

# Pre-project all site positions
SITE_PX = {name: project(*s["coords"]) for name, s in SITES.items()}

# ── Topojson decode ───────────────────────────────────────────────────────────
with open(GEO_FILE) as f:
    topo = json.load(f)

tf  = topo.get("transform", {})
ts  = tf.get("scale",     [1, 1])
tt  = tf.get("translate", [0, 0])

def decode_arc(arc):
    pts, x, y = [], 0, 0
    for d in arc:
        x += d[0]; y += d[1]
        pts.append((x * ts[0] + tt[0], y * ts[1] + tt[1]))
    return pts

decoded_arcs = [decode_arc(a) for a in topo["arcs"]]

PRIMARY = {"26", "39", "18", "17"}   # MI OH IN IL
CONTEXT = {"55", "21", "42", "54"}   # WI KY PA WV

def rings_for(geom):
    def process(arc_list):
        pts = []
        for idx in arc_list:
            seg = decoded_arcs[idx] if idx >= 0 else list(reversed(decoded_arcs[~idx]))
            pts.extend(seg)
        return [(int(round(project(p[0], p[1])[0])),
                 int(round(project(p[0], p[1])[1]))) for p in pts]
    rings = []
    if geom["type"] == "Polygon":
        for ring in geom["arcs"]:
            rings.append(process(ring))
    elif geom["type"] == "MultiPolygon":
        for poly in geom["arcs"]:
            for ring in poly:
                rings.append(process(ring))
    return rings

obj = list(topo["objects"].values())[0]
STATE_RINGS = {}
for feat in obj["geometries"]:
    fid = str(feat.get("id", ""))
    if fid in PRIMARY or fid in CONTEXT:
        STATE_RINGS[fid] = {"rings": rings_for(feat), "primary": fid in PRIMARY}

# ── Base image (states, no animation) ────────────────────────────────────────
def make_base():
    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    for fid, d in STATE_RINGS.items():
        fill   = PRI_F if d["primary"] else CTX_F
        stroke = PRI_S if d["primary"] else CTX_S
        for ring in d["rings"]:
            if len(ring) >= 3:
                draw.polygon(ring, fill=fill, outline=stroke)
    return img

BASE = make_base()
print("Base map drawn.")

# ── Draw one animation frame ──────────────────────────────────────────────────
def draw_frame(frame_num, down_site=None):
    img  = BASE.copy()
    draw = ImageDraw.Draw(img)
    phase = (frame_num / FRAMES) * DOT_GAP   # phase offset in pixels

    for src, dst in FULL_MESH:
        is_down = (src == down_site or dst == down_site)
        color   = RED if is_down else GREEN
        base_c  = dim(color, 0.12)

        ax, ay = SITE_PX[src]
        bx, by = SITE_PX[dst]

        # Dim static base line
        draw.line([(ax, ay), (bx, by)], fill=base_c, width=1)

        # Flowing dots along the line
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        if L < 1:
            continue
        ux, uy = dx / L, dy / L
        t = phase % DOT_GAP
        while t < L:
            cx = ax + ux * t
            cy = ay + uy * t
            draw.ellipse([cx - DOT_R, cy - DOT_R,
                          cx + DOT_R, cy + DOT_R], fill=color)
            t += DOT_GAP

    # Site nodes (drawn on top of lines)
    for name, s in SITES.items():
        x, y = SITE_PX[name]
        if s.get("cloud"):
            draw.rectangle([int(x) - 20, int(y) - 11,
                            int(x) + 20, int(y) + 11],
                           fill=(11, 11, 18), outline=CYAN)
        else:
            r = 5 if s.get("hub") else 3
            draw.ellipse([x - r, y - r, x + r, y + r], fill=GREEN)
            rr = 9 if s.get("hub") else 7
            draw.ellipse([x - rr, y - rr, x + rr, y + rr],
                         outline=dim(GREEN, 0.25), width=1)

    return img

# ── Assemble & save GIF ───────────────────────────────────────────────────────
def save_gif(filename, down_site=None):
    frames = []
    for f in range(FRAMES):
        rgb = draw_frame(f, down_site=down_site)
        # Convert to 64-colour palette (keeps file small, looks clean on dark bg)
        pal = rgb.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=0)
        frames.append(pal)

    path = os.path.join(OUTPUT, filename)
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=FRAME_MS,
        optimize=True,
    )
    kb = os.path.getsize(path) // 1024
    print(f"  {filename}  {kb} KB")

# ── Generate all GIFs ─────────────────────────────────────────────────────────
print("Generating all-up GIF...")
save_gif("map-all-up.gif")

print("Generating per-site down GIFs...")
for name, s in SITES.items():
    if s.get("cloud"):          # Azure handled separately (not a DIA circuit)
        continue
    slug = (name.lower()
            .replace(" ", "-")
            .replace(".", "")
            .replace("warehouse", "wh"))
    save_gif(f"map-{slug}-down.gif", down_site=name)

print(f"\nDone — files in {OUTPUT}/")
