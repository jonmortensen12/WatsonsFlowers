/* Watson's Flowers - drawing a bouquet from the real flowers.

   WBouquet.draw(ctx, x, y, size, b) paints a hand-tied bouquet into a 2D
   canvas: fern fanned out behind, the back of the paper cone, the blooms
   in a dome (big ones in the middle, a little shadow under each), the
   front flaps of the paper with their folds, and the ribbon bow at the
   pinch. x, y is the top-left of a box `size` wide and 1.3 x size tall.

   b = {st: [rose, sunflower, mum, lily, carnation, daisy, greens] counts,
        wrap: 'kraft'|'pink'|'white'|'green'|null, rib: 'gold'|...|null,
        seed: any number (the same seed draws the same bouquet)}

   The flowers are photos cut out by tools/flowers.py (public domain; see
   web/flowers/credits.json). Call WBouquet.load(onReady) once; anything
   drawn before they arrive simply draws again when onReady fires. */
(function(root){
'use strict';

var KEYS = ['rose', 'sunflower', 'mum', 'lily', 'carnation', 'daisy', 'greens'];
// how big each bloom is in a bouquet, as a share of its width
var SIZE = {rose: 0.24, sunflower: 0.27, mum: 0.25, lily: 0.31, carnation: 0.23, daisy: 0.2};
var WRAP = {kraft: ['#c49563', '#a87a4a', '#dcb588'], pink: ['#f6b6c8', '#e08fa8', '#fbd3df'],
            white: ['#f7f4ee', '#d9d4ca', '#ffffff'], green: ['#79b28a', '#5a9070', '#9fd0ad']};
var RIB = {gold: ['#e2b33c', '#a67c16'], red: ['#c8202f', '#7d1019'], pink: ['#ff6fa6', '#c43e74'], white: ['#ffffff', '#bdbdbd']};
var IMG = {}, ready = false, waiting = [];

function load(onReady, base){
  if(onReady) waiting.push(onReady);
  if(Object.keys(IMG).length) return;
  var left = KEYS.length;
  KEYS.forEach(function(k){
    var im = new Image();
    im.onload = im.onerror = function(){
      if(--left === 0){ ready = true; var w = waiting; waiting = []; w.forEach(function(f){ try { f(); } catch(e){} }); }
    };
    im.src = (base || '') + 'flowers/' + k + '.png';
    IMG[k] = im;
  });
}
function ok(k){ var im = IMG[k]; return im && im.complete && im.naturalWidth > 0; }

function rng(seed){
  var s = (Math.floor(Math.abs(seed || 1) * 9973) >>> 0) || 1;
  return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function paper(g, pts, cols, fold){
  g.beginPath();
  pts.forEach(function(p, i){ if(i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
  g.closePath();
  var ys = pts.map(function(p){ return p[1]; }), xs = pts.map(function(p){ return p[0]; });
  var gr = g.createLinearGradient(Math.min.apply(null, xs), 0, Math.max.apply(null, xs), 0);
  gr.addColorStop(0, cols[1]); gr.addColorStop(fold || 0.45, cols[2]); gr.addColorStop(1, cols[0]);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.stroke();
}

function draw(g, x, y, size, b){
  b = b || {};
  var st = b.st || [0, 0, 0, 0, 0, 0, 0];
  var R = rng(b.seed || 1);
  var S = size, cx = x + S / 2, top = y;
  var domeY = top + S * 0.38, pinchY = top + S * 1.06, lip = top + S * 0.6;
  var wrap = b.wrap && WRAP[b.wrap] ? WRAP[b.wrap] : null;
  var blooms = [];
  KEYS.forEach(function(k, i){ if(k !== 'greens') for(var n = 0; n < (st[i] || 0); n++) blooms.push(k); });
  var nb = blooms.length;
  var pos = b.pos && b.pos.length ? b.pos : null;
  var placedGreens = pos ? pos.filter(function(q){ return q[0] === 6 && q[1] !== null; }) : [];
  var greens = pos ? (st[6] || 0) - placedGreens.length + (nb ? 3 : 0) : (st[6] || 0) * 2 + (nb ? 3 : 0);
  var dome = Math.max(S * 0.1, Math.min(S * 0.33, S * 0.15 * Math.sqrt(Math.max(1, nb))));
  g.save();

  // the back sheet of paper, taller than the front
  if(wrap) paper(g, [[cx - S * 0.47, top + S * 0.24], [cx - S * 0.2, top + S * 0.12], [cx + S * 0.22, top + S * 0.1], [cx + S * 0.48, top + S * 0.22],
                     [cx + S * 0.07, pinchY], [cx - S * 0.07, pinchY]], [wrap[1], wrap[1], wrap[0]], 0.5);
  // fern, fanned out behind the flowers
  if(ok('greens')){
    var gi = IMG.greens;
    for(var f = 0; f < greens; f++){
      var a = -0.62 + (greens > 1 ? f / (greens - 1) : 0.5) * 1.24 + (R() - 0.5) * 0.16;
      var len = S * (0.72 + R() * 0.14);
      g.save();
      g.translate(cx + a * S * 0.04, pinchY - S * 0.1);
      g.rotate(a);
      var w = len * gi.naturalWidth / gi.naturalHeight;
      if(f % 2) g.scale(-1, 1);
      g.drawImage(gi, -w / 2, -len, w, len);
      g.restore();
    }
    // fern put somewhere by hand: a frond from the pinch out to that spot
    placedGreens.forEach(function(q){
      var tx = x + q[1] * S, ty = top + q[2] * S, fx = cx, fy = pinchY - S * 0.1;
      var len2 = Math.max(S * 0.3, Math.hypot(tx - fx, ty - fy) + S * 0.12);
      g.save(); g.translate(fx, fy); g.rotate(Math.atan2(tx - fx, -(ty - fy)));
      var w2 = len2 * gi.naturalWidth / gi.naturalHeight;
      g.drawImage(gi, -w2 / 2, -len2, w2, len2);
      g.restore();
    });
  }
  // the blooms: biggest in the middle, a golden-angle spiral outwards,
  // the back ones a little higher and a little darker
  blooms.sort(function(p, q){ return SIZE[q] - SIZE[p] + (R() - 0.5) * 0.04; });
  var spots = blooms.map(function(k, i){
    var r = nb > 1 ? dome * Math.sqrt((i + 0.35) / nb) : 0;
    var t = i * 2.39996 + (b.seed || 1) * 0.7;
    var sx = Math.cos(t), sy = Math.sin(t);
    return {k: k, x: cx + sx * r * 1.12, y: domeY + sy * r * 0.7 + (r / (dome + 1)) * S * 0.05,
            s: S * SIZE[k] * 1.45 * (0.9 + R() * 0.18) * (nb > 10 ? 0.85 : 1), rot: (R() - 0.5) * 0.5 + sx * 0.25, back: sy < -0.3};
  });
  // flowers put by hand go where they were put, in the order they were put
  if(pos){
    var auto = spots.slice(), out = [];
    pos.forEach(function(q, n){
      if(q[0] === 6) return;
      var k = KEYS[q[0]];
      if(q[1] === null){
        var j = -1; for(var m = 0; m < auto.length; m++) if(auto[m].k === k){ j = m; break; }
        if(j >= 0){ out.push(auto[j]); auto.splice(j, 1); }
        return;
      }
      out.push({k: k, x: x + q[1] * S, y: top + q[2] * S, s: S * SIZE[k] * 1.45, rot: q[3] || 0, n: n, hand: true});
    });
    spots = out;
  } else spots.sort(function(p, q){ return p.y - q.y; });
  spots.forEach(function(p){
    if(!ok(p.k)) return;
    var im = IMG[p.k], w = p.s, h = w * im.naturalHeight / im.naturalWidth;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.shadowColor = 'rgba(0,0,0,0.38)'; g.shadowBlur = S * 0.035; g.shadowOffsetY = S * 0.015;
    if(p.back) g.filter = 'brightness(0.88)';
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
  });
  if(!wrap){
    g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - S * 0.42, lip); g.lineTo(cx - S * 0.07, pinchY); g.lineTo(cx + S * 0.07, pinchY); g.lineTo(cx + S * 0.42, lip); g.stroke();
    g.setLineDash([]);
  }
  // stems below the pinch
  g.strokeStyle = '#4c7a31'; g.lineWidth = Math.max(1.5, S * 0.012);
  for(var s2 = -3; s2 <= 3; s2++){ g.beginPath(); g.moveTo(cx + s2 * S * 0.008, pinchY - S * 0.05); g.lineTo(cx + s2 * S * 0.013, top + S * 1.27); g.stroke(); }
  // the front: two soft folded flaps
  if(wrap){
    paper(g, [[cx - S * 0.46, lip - S * 0.04], [cx - S * 0.2, lip + S * 0.02], [cx + S * 0.04, lip + S * 0.12], [cx + S * 0.06, pinchY], [cx - S * 0.08, pinchY]], wrap, 0.35);
    paper(g, [[cx + S * 0.47, lip - S * 0.08], [cx + S * 0.08, pinchY], [cx - S * 0.05, pinchY], [cx - S * 0.08, lip + S * 0.16], [cx + S * 0.18, lip]], [wrap[0], wrap[1], wrap[2]], 0.65);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, S * 0.006);
    g.beginPath(); g.moveTo(cx - S * 0.46, lip - S * 0.04); g.lineTo(cx - S * 0.2, lip + S * 0.02); g.lineTo(cx + S * 0.04, lip + S * 0.12); g.stroke();
    g.beginPath(); g.moveTo(cx + S * 0.47, lip - S * 0.08); g.lineTo(cx + S * 0.18, lip); g.lineTo(cx - S * 0.08, lip + S * 0.16); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.beginPath(); g.moveTo(cx - S * 0.25, lip + S * 0.06); g.lineTo(cx - S * 0.03, pinchY - S * 0.04); g.stroke();
    g.beginPath(); g.moveTo(cx + S * 0.25, lip + S * 0.04); g.lineTo(cx + S * 0.04, pinchY - S * 0.04); g.stroke();
  }
  // the ribbon
  if(b.rib && RIB[b.rib]){
    var rc = RIB[b.rib], ry = pinchY - S * 0.06, rw = S * 0.11;
    g.fillStyle = rc[0]; g.strokeStyle = rc[1]; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - rw * 0.1, ry); g.quadraticCurveTo(cx - rw * 0.5, ry + rw * 0.7, cx - rw * 0.65, ry + rw * 1.25); g.lineTo(cx - rw * 0.4, ry + rw * 1.2); g.quadraticCurveTo(cx - rw * 0.2, ry + rw * 0.6, cx, ry + rw * 0.15); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(cx + rw * 0.1, ry); g.quadraticCurveTo(cx + rw * 0.45, ry + rw * 0.8, cx + rw * 0.7, ry + rw * 1.2); g.lineTo(cx + rw * 0.45, ry + rw * 1.28); g.quadraticCurveTo(cx + rw * 0.2, ry + rw * 0.6, cx, ry + rw * 0.15); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx - rw * 0.55, ry - rw * 0.05, rw * 0.6, rw * 0.32, -0.3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx + rw * 0.55, ry - rw * 0.05, rw * 0.6, rw * 0.32, 0.3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath(); g.ellipse(cx - rw * 0.65, ry - rw * 0.15, rw * 0.28, rw * 0.08, -0.3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + rw * 0.45, ry - rw * 0.15, rw * 0.28, rw * 0.08, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = rc[1]; g.beginPath(); g.ellipse(cx, ry, rw * 0.2, rw * 0.24, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/* what a recipe looks like when it is made right */
function fromRecipe(r, seed){
  return {st: KEYS.map(function(k){ return r.st[k] || 0; }), wrap: r.wrap, rib: r.rib, seed: seed || 1};
}
/* a canvas with one bouquet on it (for cards, the TV's cooler, 3D sprites) */
function canvas(b, w){
  var c = document.createElement('canvas');
  c.width = w || 200; c.height = Math.round((w || 200) * 1.3);
  draw(c.getContext('2d'), c.width * 0.04, c.height * 0.02, c.width * 0.92, b);
  return c;
}

root.WBouquet = {SIZE: SIZE, load: load, draw: draw, fromRecipe: fromRecipe, canvas: canvas, KEYS: KEYS, img: IMG, isReady: function(){ return ready; }};
})(typeof window !== 'undefined' ? window : globalThis);
