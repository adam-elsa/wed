import sys, math, random
from PIL import Image, ImageDraw, ImageFilter
O=sys.argv[1]; N=256; random.seed(7)
def tiled(draw_fn, bg, n=N, ss=2):
    big=Image.new('RGB',(n*ss,n*ss),bg); d=ImageDraw.Draw(big)
    # draw 3x3 copies so motifs wrap seamlessly
    for ox in (-n*ss,0,n*ss):
        for oy in (-n*ss,0,n*ss): draw_fn(d,ox,oy,ss)
    return big.resize((n,n),Image.LANCZOS)
def parang(d,ox,oy,s):  # diagonal bands of S-shaped blades: green/brown shirt (ref 3)
    for k in range(-4,6):
        b=k*64*s
        d.polygon([(ox+b,oy),(ox+b+40*s,oy),(ox+b+40*s+256*s,oy+256*s),(ox+b+256*s,oy+256*s)],fill='#7a4526')
        for j in range(0,256,32):
            cx,cy=ox+b+20*s+j*s,oy+j*s
            d.ellipse([cx-11*s,cy-7*s,cx+11*s,cy+7*s],fill='#d8c08a'); d.ellipse([cx-5*s,cy-3*s,cx+5*s,cy+3*s],fill='#3d4a2a')
def kawung(d,ox,oy,s):  # four-petal kawung grid: beige/blue skirt (ref 2)
    for i in range(4):
        for j in range(4):
            cx,cy=ox+(i*64+32)*s,oy+(j*64+32)*s
            for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                px,py=cx+dx*15*s,cy+dy*15*s; rx,ry=(13,8) if dx else (8,13)
                d.ellipse([px-rx*s,py-ry*s,px+rx*s,py+ry*s],fill='#4f5f80',outline='#2c3550',width=2*s)
            d.ellipse([cx-4*s,cy-4*s,cx+4*s,cy+4*s],fill='#8a6a4a')
            ex,ey=cx+32*s,cy+32*s; d.ellipse([ex-5*s,ey-5*s,ex+5*s,ey+5*s],fill='#8a7a64')
def maroon(d,ox,oy,s):  # small gold lozenges on maroon: pleated skirt (ref 6)
    for i in range(8):
        for j in range(8):
            cx,cy=ox+(i*32+(16 if j%2 else 0))*s,oy+(j*32+16)*s
            d.polygon([(cx,cy-10*s),(cx+7*s,cy),(cx,cy+10*s),(cx-7*s,cy)],fill='#c99a5a')
            d.ellipse([cx-2*s,cy-2*s,cx+2*s,cy+2*s],fill='#5a1e2a')
            d.line([(cx+16*s,cy-16*s),(cx+16*s,cy+16*s)],fill='#9a4a50',width=s)
def floral(d,ox,oy,s):  # embroidered flowers on cream: kebaya (ref 1)
    rnd=random.Random(3)
    for _ in range(26):
        cx,cy=ox+rnd.randrange(256)*s,oy+rnd.randrange(256)*s; c=rnd.choice(['#e58a9a','#e8a07a','#7fb0c8','#c47aa0'])
        for a in range(5):
            t=a*2*math.pi/5; px,py=cx+math.cos(t)*6*s,cy+math.sin(t)*6*s; d.ellipse([px-4*s,py-4*s,px+4*s,py+4*s],fill=c)
        d.ellipse([cx-3*s,cy-3*s,cx+3*s,cy+3*s],fill='#f2c84a')
        for a in (0.6,2.4):
            px,py=cx+math.cos(a)*13*s,cy+math.sin(a)*13*s; d.ellipse([px-5*s,py-2.5*s,px+5*s,py+2.5*s],fill='#7aa86a')
def trim(d,ox,oy,s):  # white with a vertical batik band: shirt (ref 3, right)
    for x0 in (40,):
        d.rectangle([ox+x0*s,oy,ox+(x0+44)*s,oy+256*s],fill='#ffffff')
        for j in range(0,256,22):
            cx,cy=ox+(x0+22)*s,oy+(j+11)*s
            d.polygon([(cx,cy-9*s),(cx+12*s,cy),(cx,cy+9*s),(cx-12*s,cy)],outline='#4a5568',width=2*s)
            d.ellipse([cx-3*s,cy-3*s,cx+3*s,cy+3*s],fill='#4a5568')
        d.line([(ox+x0*s,oy),(ox+x0*s,oy+256*s)],fill='#4a5568',width=2*s); d.line([(ox+(x0+44)*s,oy),(ox+(x0+44)*s,oy+256*s)],fill='#4a5568',width=2*s)
def tweed(d,ox,oy,s):  # light blue/white check: mini skirt (ref 4)
    for i in range(0,256,16):
        d.rectangle([ox+i*s,oy,ox+(i+7)*s,oy+256*s],fill='#c6d3e8'); d.rectangle([ox,oy+i*s,ox+256*s,oy+(i+7)*s],fill='#c6d3e8')
        d.line([(ox+(i+3)*s,oy),(ox+(i+3)*s,oy+256*s)],fill='#8ea4c8',width=s)
for name,fn,bg in [('parang',parang,'#4b4a2c'),('kawung',kawung,'#d3c4a4'),('maroon',maroon,'#74263a'),('floral',floral,'#f3eee2'),('trim',trim,'#f6f6f4'),('tweed',tweed,'#eef1f6')]:
    tiled(fn,bg).save(f"{O}/{name}.png")
