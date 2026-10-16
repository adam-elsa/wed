import sys, json
from PIL import Image
O, view = sys.argv[1], sys.argv[2]; G = list(json.load(open(O + "/guests.json")))
s = Image.new('RGB', (240 * len(G), 440))
for i, k in enumerate(G): s.paste(Image.open(f"{O}/r_{view}_{k}.png").convert('RGB'), (i * 240, 0))
s.save(f"{O}/sheet_{view}.png")
