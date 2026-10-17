# More batik for the character creator (add_batik.py):  python batik_textures.py <tex folder>
# Seamless 256 px tiles, drawn like textures.py (each motif drawn 3x3 so it wraps).
import sys, math, random
from PIL import Image, ImageDraw
O = sys.argv[1]; N = 256
def tiled(draw_fn, bg, n=N, ss=2):
    big = Image.new('RGB', (n * ss, n * ss), bg); d = ImageDraw.Draw(big)
    for ox in (-n * ss, 0, n * ss):
        for oy in (-n * ss, 0, n * ss): draw_fn(d, ox, oy, ss)
    return big.resize((n, n), Image.LANCZOS)
def circ(d, x, y, r, fill, outline=None, w=1):
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=w)

def mega_mendung(d, ox, oy, s):  # Cirebon's clouds: rings of blue from dark to pale, on indigo
    shades = ['#16325e', '#28508a', '#3f6eaa', '#6f98cc', '#a9c4e6', '#e4edf7']
    for cx, cy in ((64, 64), (192, 192), (192, 64), (64, 192)):
        for k, c in enumerate(shades):
            r = (len(shades) - k) * 6.5
            for dx, dy, f in ((-22, 6, 0.9), (0, -8, 1.15), (22, 6, 0.9), (0, 12, 0.8)):
                circ(d, ox + (cx + dx) * s, oy + (cy + dy) * s, r * f * s, c)
        circ(d, ox + cx * s, oy + (cy + 2) * s, 5 * s, '#16325e')
def truntum(d, ox, oy, s):  # small cream star-flowers, scattered evenly on dark sogan brown
    for j in range(8):
        for i in range(8):
            cx, cy = (i * 32 + (16 if j % 2 else 0)) * s, (j * 32 + 16) * s
            for a in range(8):
                t = a * math.pi / 4; px, py = cx + math.cos(t) * 6 * s, cy + math.sin(t) * 6 * s
                circ(d, ox + px, oy + py, 2.6 * s, '#ead9b4')
            circ(d, ox + cx, oy + cy, 2.4 * s, '#b8843e')
            circ(d, ox + cx + 16 * s, oy + cy + 16 * s, 1.4 * s, '#a07a52')
def sidomukti(d, ox, oy, s):  # a lattice of diamonds, each with a little four-petal flower
    for j in range(5):
        for i in range(5):
            cx, cy = ox + i * 64 * s, oy + j * 64 * s
            d.polygon([(cx, cy - 32 * s), (cx + 32 * s, cy), (cx, cy + 32 * s), (cx - 32 * s, cy)], outline='#4e2f18', width=3 * s)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                circ(d, cx + dx * 10 * s, cy + dy * 10 * s, 7 * s, '#7a4a26')
            circ(d, cx, cy, 4 * s, '#e9d8b2')
            ex, ey = cx + 32 * s, cy + 32 * s
            d.polygon([(ex, ey - 9 * s), (ex + 9 * s, ey), (ex, ey + 9 * s), (ex - 9 * s, ey)], fill='#a8743e')
def parang_blue(d, ox, oy, s):  # the parang's diagonal blades, in indigo and white
    for k in range(-4, 6):
        b = k * 64 * s
        d.polygon([(ox + b, oy), (ox + b + 36 * s, oy), (ox + b + 36 * s + 256 * s, oy + 256 * s), (ox + b + 256 * s, oy + 256 * s)], fill='#e9e6dc')
        for j in range(0, 256, 32):
            cx, cy = ox + b + 18 * s + j * s, oy + j * s
            d.ellipse([cx - 10 * s, cy - 6 * s, cx + 10 * s, cy + 6 * s], fill='#2a3d66'); circ(d, cx, cy, 3 * s, '#e9e6dc')
def kawung_brown(d, ox, oy, s):  # kawung in sogan browns
    for i in range(4):
        for j in range(4):
            cx, cy = ox + (i * 64 + 32) * s, oy + (j * 64 + 32) * s
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                px, py = cx + dx * 15 * s, cy + dy * 15 * s; rx, ry = (13, 8) if dx else (8, 13)
                d.ellipse([px - rx * s, py - ry * s, px + rx * s, py + ry * s], fill='#6b4226', outline='#3e2414', width=2 * s)
            circ(d, cx, cy, 4 * s, '#d9b878')
            circ(d, cx + 32 * s, cy + 32 * s, 5 * s, '#8a5a32')
def buketan(d, ox, oy, s):  # Pekalongan bouquets: pink flowers and leaves on cream
    rnd = random.Random(11)
    for _ in range(9):
        cx, cy = ox + rnd.randrange(256) * s, oy + rnd.randrange(256) * s; c = rnd.choice(['#d9708a', '#e48a6a', '#c95a7a'])
        for a in (0.3, 1.9, 3.6, 5.0):
            px, py = cx + math.cos(a) * 18 * s, cy + math.sin(a) * 18 * s
            d.ellipse([px - 11 * s, py - 5 * s, px + 11 * s, py + 5 * s], fill='#5f8f5a')
        for a in range(6):
            t = a * math.pi / 3; circ(d, cx + math.cos(t) * 8 * s, cy + math.sin(t) * 8 * s, 6.5 * s, c)
        circ(d, cx, cy, 5 * s, '#f1c75a')
    for _ in range(30):
        circ(d, ox + rnd.randrange(256) * s, oy + rnd.randrange(256) * s, 2 * s, '#7fa8c8')

for name, fn, bg in [('mega_mendung', mega_mendung, '#16325e'), ('truntum', truntum, '#3a2418'), ('sidomukti', sidomukti, '#d8c398'),
                     ('parang_blue', parang_blue, '#24365c'), ('kawung_brown', kawung_brown, '#e2cfa4'), ('buketan', buketan, '#f1e6d2')]:
    tiled(fn, bg).save(f"{O}/{name}.png")
print("BATIK TEXTURES")
