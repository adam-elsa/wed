# Textures for the peci (add_peci.py):  python peci_textures.py <tex folder>
#   songkok_side.png  black velvet with the gold embroidered band (tiles around the cap)
#   songkok_top.png   the crown: black with a gold star and ring
#   velvet.png        plain black velvet, for the plain peci
#   knit_<colour>.png a knitted stitch (tiles), one per colour of peci rajut
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
GOLD, GOLD_D, WHITE = (214, 172, 84), (150, 112, 46), (236, 232, 222)

def velvet(w, h, base=(22, 20, 26), seed=1):
    rnd = random.Random(seed); im = Image.new("RGB", (w, h), base); px = im.load()
    for y in range(h):
        for x in range(w):
            n = rnd.randint(-5, 5); px[x, y] = tuple(max(0, c + n) for c in base)
    return im

# ---- the side: velvet, a gold band low down with a vine, and a white starburst on each repeat
W, H = 512, 128
side = velvet(W, H); d = ImageDraw.Draw(side)
b0, b1 = int(H * 0.50), int(H * 0.92)          # the band, near the brim (v runs bottom -> top, rows top -> bottom)
for y in (b0, b0 + 4, b1 - 4, b1):
    d.line([(0, y), (W, y)], fill=GOLD, width=2)
mid = (b0 + b1) / 2; amp = (b1 - b0) * 0.22
REP = 4                                       # ornaments per tile
pts = [(x, mid + amp * math.sin(x / W * REP * 2 * math.pi * 2)) for x in range(W + 1)]
d.line(pts, fill=GOLD, width=3)
for k in range(REP * 4):                      # leaves along the vine
    x = (k + 0.5) * W / (REP * 4); y = mid + amp * math.sin(x / W * REP * 2 * math.pi * 2)
    d.ellipse([x - 4, y - 9 if k % 2 else y + 3, x + 4, y - 3 if k % 2 else y + 9], fill=GOLD_D)
for k in range(REP):                          # starbursts between the vine's loops
    cx, cy, r = (k + 0.5) * W / REP, mid, (b1 - b0) * 0.36
    for a in range(16):
        t = a / 16 * 2 * math.pi; rr = r if a % 2 == 0 else r * 0.55
        d.line([(cx, cy), (cx + math.cos(t) * rr, cy + math.sin(t) * rr)], fill=WHITE, width=2)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=GOLD)
# a thin gold line round the top edge too
d.line([(0, 6), (W, 6)], fill=GOLD_D, width=2)
side.filter(ImageFilter.SMOOTH).save(out + "/songkok_side.png")

# ---- the crown
T = 256
top = velvet(T, T, seed=2); d = ImageDraw.Draw(top); c = T / 2
d.ellipse([10, 10, T - 10, T - 10], outline=GOLD, width=4)
d.ellipse([22, 22, T - 22, T - 22], outline=GOLD_D, width=2)
star = []
for a in range(16):
    t = a / 16 * 2 * math.pi - math.pi / 2; r = 62 if a % 2 == 0 else 26
    star.append((c + math.cos(t) * r, c + math.sin(t) * r))
d.polygon(star, fill=GOLD)
d.ellipse([c - 10, c - 10, c + 10, c + 10], fill=WHITE)
top.filter(ImageFilter.SMOOTH).save(out + "/songkok_top.png")

velvet(64, 64, seed=3).save(out + "/velvet.png")

# ---- knitting: columns of little Vs, row on row
KNIT = {"white": (236, 234, 228), "black": (34, 33, 36), "blue": (146, 166, 204), "brown": (122, 90, 64)}
S = 128; N = 8                                 # 8 stitches across, 8 rows down
for name, col in KNIT.items():
    dark = tuple(int(c * 0.72) for c in col); light = tuple(min(255, int(c * 1.08) + 6) for c in col)
    im = Image.new("RGB", (S, S), dark); d = ImageDraw.Draw(im); s = S / N
    for j in range(N):
        for i in range(N):
            x, y = i * s, j * s
            d.polygon([(x + 1, y), (x + s / 2, y + s * 0.75), (x + s / 2, y + s), (x + 1, y + s * 0.3)], fill=col)
            d.polygon([(x + s - 1, y), (x + s / 2, y + s * 0.75), (x + s / 2, y + s), (x + s - 1, y + s * 0.3)], fill=light)
    im.filter(ImageFilter.SMOOTH).save(out + "/knit_%s.png" % name)
print("PECI TEXTURES")
