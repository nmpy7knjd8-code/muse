# Generates PWA icons (PNG) with Pillow: a piano-key + note glyph on a dark gradient.
from PIL import Image, ImageDraw
import os
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(out, exist_ok=True)

def icon(size, maskable=False):
    img = Image.new('RGB', (size, size), '#121117')
    d = ImageDraw.Draw(img)
    for y in range(size):  # vertical gradient purple → indigo
        t = y / size
        d.line([(0, y), (size, y)], fill=(int(70 + 60 * (1 - t)), int(40 + 20 * t), int(140 + 60 * t)))
    pad = int(size * (0.2 if maskable else 0.12))
    kw = (size - 2 * pad) / 5
    top, bottom = pad + int(size * 0.18), size - pad
    for i in range(5):  # white keys
        x0 = pad + i * kw
        d.rounded_rectangle([x0 + size * 0.006, top, x0 + kw - size * 0.006, bottom], radius=int(size * 0.02), fill='#F6F3FF')
    for i in (0, 1, 3):  # black keys
        x0 = pad + (i + 1) * kw - kw * 0.3
        d.rounded_rectangle([x0, top, x0 + kw * 0.6, top + (bottom - top) * 0.6], radius=int(size * 0.012), fill='#1C1A26')
    colors = ['#9C7CF4', '#FFD54F', '#7986CB', '#FF9800', '#81D4FA']  # mood colours on keys
    for i, c in enumerate(colors):
        cx = pad + i * kw + kw / 2
        r = kw * 0.22
        d.ellipse([cx - r, bottom - kw * 0.7 - r, cx + r, bottom - kw * 0.7 + r], fill=c)
    # note glyph
    nx, ny, r = size * 0.62, pad + size * 0.06, size * 0.07
    d.ellipse([nx - r * 1.3, ny + r * 0.6, nx + r * 0.7, ny + r * 2.2], fill='#FFFFFF')
    return img

icon(192).save(os.path.join(out, 'icon-192.png'))
icon(512).save(os.path.join(out, 'icon-512.png'))
icon(512, True).save(os.path.join(out, 'icon-maskable-512.png'))
icon(180).save(os.path.join(out, 'apple-touch-icon.png'))
print('icons written to', out)
