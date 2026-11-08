#!/usr/bin/env python3
"""Cut the real flowers out of their photos for the game: web/flowers/*.png.

Every source is public domain (CC0 or Public Domain Mark), found through
Openverse; the list below is also the credit list. Originals are fetched
into tools/flowers/src/ (git-ignored) the first time.

Each flower gives a bloom (the head, for arranging) and some give a spray
(the greenery). Heads are trimmed, given soft edges and saved at most
360 px across.

    python3 tools/flowers.py          (needs Pillow, numpy and scipy)
"""
import os, json, urllib.request
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'flowers', 'src')
OUT = os.path.join(HERE, '..', 'web', 'flowers')
os.makedirs(SRC, exist_ok=True); os.makedirs(OUT, exist_ok=True)

# filled in from the search results kept beside this file
SOURCES = json.load(open(os.path.join(HERE, 'flowers', 'sources.json')))

def fetch(key):
    s = SOURCES[key]
    ext = '.png' if s['url'].split('?')[0].endswith('.png') else '.jpg'
    p = os.path.join(SRC, key + ext)
    if not os.path.exists(p):
        data = urllib.request.urlopen(urllib.request.Request(s['url'], headers={'User-Agent': 'watsons-game/0.1'}), timeout=60).read()
        open(p, 'wb').write(data)
    return Image.open(p).convert('RGBA')

def soften(a, r=1.2):
    return np.asarray(Image.fromarray(a).filter(ImageFilter.GaussianBlur(r)))

def largest(mask, near=None):
    lab, n = ndimage.label(mask)
    if n == 0: return mask
    if near is not None:
        k = lab[near[1], near[0]]
        if k: return lab == k
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))

def keyed_by_background(im, thr, box=None):
    """A photo on a plain background: whatever is close to the colour of
    the edges and joined to them goes."""
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(edge, axis=0)
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    near_bg = d < thr
    lab, n = ndimage.label(near_bg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(border))
    fg = ~bgmask
    fg = ndimage.binary_opening(fg, iterations=2)
    fg = largest(fg)
    fg = ndimage.binary_fill_holes(fg)
    alpha = soften((fg * 255).astype(np.uint8))
    out = a.copy(); out[..., 3] = alpha
    return Image.fromarray(out.astype(np.uint8))

def keyed_checker(im):
    """rawpixel's "png" stickers come with the transparency checkerboard
    painted in: light grey and white squares. Flood it away from the
    edges; the drawing's own outline stops the flood."""
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]
    sat = rgb.max(-1) - rgb.min(-1)
    # the squares are perfectly neutral (R=G=B, 238 and 255); painted
    # whites are a touch warm, so they survive
    light = (rgb.mean(-1) > 226) & (sat < 4)
    lab, n = ndimage.label(light)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    fg = ndimage.binary_opening(fg, iterations=1)
    fg = largest(fg)
    fg = ndimage.binary_fill_holes(fg)
    a[..., 3] = soften((fg * 255).astype(np.uint8), 0.9)
    return Image.fromarray(a.astype(np.uint8))

def keyed_by_colour(im, centre, radius, hue=(0.02, 0.17), smin=0.35, vmin=0.35):
    """One bloom out of a bed of them: the warm petals inside a circle,
    joined to the middle of the chosen bloom."""
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float32) / 255
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = (h >= hue[0]) & (h <= hue[1]) & (s >= smin) & (v >= vmin)
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    m &= (xx - centre[0]) ** 2 + (yy - centre[1]) ** 2 < radius ** 2
    m = ndimage.binary_closing(m, iterations=2)
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_opening(m, iterations=3)
    m = largest(m, near=centre)
    # a soft round edge where the neighbours were cut away
    rr = np.sqrt((xx - centre[0]) ** 2 + (yy - centre[1]) ** 2) / radius
    fade = np.clip((1.0 - rr) / 0.3, 0, 1) ** 0.7
    a = np.asarray(im).copy()
    a[..., 3] = (soften((m * 255).astype(np.uint8), 1.5) * fade).astype(np.uint8)
    return Image.fromarray(a)

def trim(im, pad=4, size=360):
    bb = im.getbbox()
    if bb: im = im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), bb[2] + pad, bb[3] + pad))
    im.thumbnail((size, size), Image.LANCZOS)
    return im

def save(im, name):
    p = os.path.join(OUT, name + '.png')
    im.save(p, optimize=True)
    print('wrote', os.path.relpath(p, os.path.join(HERE, '..')), im.size, os.path.getsize(p) // 1024, 'KB')

# the head of each; boxes are in the source's own pixels
rose = keyed_checker(fetch('rose')); save(trim(rose.crop((240, 0, 1140, 760))), 'rose')
sun = keyed_checker(fetch('sunflower')); save(trim(sun.crop((120, 0, 700, 560))), 'sunflower')
daisy = keyed_checker(fetch('daisy')); save(trim(daisy.crop((690, 0, 1270, 440))), 'daisy')
mum = fetch('mum'); save(trim(keyed_by_colour(mum.crop((180, 170, 570, 570)), (196, 192), 132)), 'mum')
lily = fetch('lily'); save(trim(keyed_by_background(lily, 70)), 'lily')
carn = fetch('carnation'); c = keyed_by_background(carn, 26); save(trim(c.crop((480, 40, 960, 560))), 'carnation')
greens = keyed_checker(fetch('greens')); save(trim(greens, size=420), 'greens')

json.dump({k: {'source': v['land'], 'license': v['lic'], 'title': v['title']} for k, v in SOURCES.items()},
          open(os.path.join(OUT, 'credits.json'), 'w'), indent=1)
print('credits -> web/flowers/credits.json')
