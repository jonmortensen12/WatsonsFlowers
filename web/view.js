/* Watson's Flowers - the moving parts, drawn.

   Shared by the driver's phone (its own chase view) and the TV (the action
   cam, the lobby and the parade): the vans in their livery, the traffic,
   the Gilbert Goons, bouquets flying and left on porches (drawn from the
   real flowers by bouquet.js), petals, smoke, fireballs and geysers, the
   beam over the next porch, the route along the road, and the chase
   camera. It draws what it is given; it decides nothing. */
import * as THREE from './lib/three.module.min.js';
import {canvas as mkCanvas, tex} from './world.js';

const CAR_COLORS = ['#c8312f', '#2f5fc8', '#e8e8e8', '#222222', '#9aa3ad', '#2f8a4c', '#d8b23a', '#6b3fa0', '#f2f2f2', '#8a2b2b'];
const HOODIES = ['#2b2b2b', '#c43c3c', '#3c6fc4', '#3ca85a', '#e2a33a', '#8a4fc4'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _v3 = new THREE.Vector3();

function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------------- the van ---------------- */
function liveryTex(color){
  const c = mkCanvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#f2a7b4'; g.fillRect(0, 150, 512, 60);
  g.fillStyle = color; g.fillRect(0, 210, 512, 14);
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(170, 80, 128, 58, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6f3ea'; g.beginPath(); g.ellipse(170, 80, 120, 50, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#151515'; g.font = 'italic bold 66px "Brush Script MT", "Segoe Script", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText("Watson's", 170, 86);
  g.font = 'bold 50px "Arial Black", Impact, sans-serif'; g.lineWidth = 6; g.strokeStyle = '#7a4a10'; g.strokeText('FLOWERS', 256, 181); g.fillStyle = '#f2c531'; g.fillText('FLOWERS', 256, 181);
  const rose = window.WBouquet && WBouquet.img.rose;
  if(rose && rose.complete && rose.naturalWidth) g.drawImage(rose, 340, 20, 120, 120 * rose.naturalHeight / rose.naturalWidth);
  g.fillStyle = '#555'; g.font = 'bold 18px Georgia'; g.fillText('The Best Since 1927', 400, 130);
  return tex(c);
}
function plainTex(draw){ const c = mkCanvas(256, 256), g = c.getContext('2d'); draw(g); return tex(c); }
const FRONT = plainTex(g => { g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#26323d'; g.fillRect(14, 20, 228, 100); g.fillStyle = '#ddd'; g.fillRect(40, 170, 176, 30); g.fillStyle = '#fff6c8'; g.fillRect(8, 160, 40, 26); g.fillRect(208, 160, 40, 26); });
function backTex(color){
  return plainTex(g => {
    g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#26323d'; g.fillRect(30, 30, 80, 60); g.fillRect(146, 30, 80, 60);
    g.fillStyle = '#999'; g.fillRect(126, 20, 4, 220);
    g.fillStyle = '#d0202a'; g.fillRect(8, 150, 26, 40); g.fillRect(222, 150, 26, 40);
    g.fillStyle = color; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.fillText('Fragile!', 128, 220);
    g.fillStyle = '#333'; g.font = 'bold 18px Georgia'; g.fillText('How am I driving?', 128, 130);
  });
}
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14).rotateX(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({color: '#1c1c1c'});

/* ---------------- traffic ---------------- */
function carGeo(kind){
  const parts = [];
  function bx(w, h, d, x, y, z, shade){ const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3)); parts.push(g); }
  if(kind === 'car'){ bx(4.6, 0.8, 1.9, 0, 0.75, 0, 1); bx(2.4, 0.7, 1.7, -0.2, 1.5, 0, 0.35); }
  else if(kind === 'pickup'){ bx(5.4, 0.9, 2.0, 0, 0.85, 0, 1); bx(1.8, 0.8, 1.9, 0.9, 1.7, 0, 0.35); }
  else if(kind === 'truck'){ bx(2, 2, 2.3, 2.6, 1.3, 0, 1); bx(5.3, 2.8, 2.5, -1.0, 1.9, 0, 1.25); }
  else { bx(11, 2.8, 2.6, 0, 1.8, 0, 1.15); bx(10.6, 0.8, 2.62, 0, 2.3, 0, 0.3); }
  [[1.5, 0.9], [1.5, -0.9], [-1.5, 0.9], [-1.5, -0.9]].forEach(([x, z]) => bx(0.8, 0.8, 0.3, x * (kind === 'bus' ? 3 : kind === 'truck' ? 1.6 : 1), 0.4, z * 1.05, 0.08));
  let n = 0; parts.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  let o = 0;
  parts.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); for(let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + o); o += g.attributes.position.count; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
export const KIND_INDEX = {car: 0, pickup: 1, truck: 2, bus: 3};
const KINDS = ['car', 'pickup', 'truck', 'bus'];

export function createView(scene, M, opts){
  opts = opts || {};
  const V = {scene, M, vans: [], petMax: opts.petals || 5000};

  /* ---- vans ---- */
  V.van = function(i, color, name){
    let o = V.vans[i];
    if(o && o.color === color) { if(name != null && o.tagName !== name) V.tag(i, name); return o; }
    if(o) V.dropVan(i);
    const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
    const liv = liveryTex(color), white = new THREE.MeshLambertMaterial({color: '#fbfbf7'});
    const mats = [new THREE.MeshLambertMaterial({map: FRONT}), new THREE.MeshLambertMaterial({map: backTex(color)}), white, new THREE.MeshLambertMaterial({color: '#333'}), new THREE.MeshLambertMaterial({map: liv}), new THREE.MeshLambertMaterial({map: liv})];
    const box = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.3, 2.15), mats); box.position.set(-0.55, 1.6, 0); body.add(box);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 2.05), white); hood.position.set(2.2, 0.95, 0); body.add(hood);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.9), new THREE.MeshLambertMaterial({color: '#26323d'})); glass.position.set(1.66, 1.95, 0); glass.rotation.z = -0.35; body.add(glass);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 2.18), new THREE.MeshLambertMaterial({color})); stripe.position.set(0, 0.5, 0); body.add(stripe);
    const wheels = [];
    [[1.85, 1.05], [1.85, -1.05], [-1.9, 1.05], [-1.9, -1.05]].forEach(([x, z]) => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.42, z); body.add(w); wheels.push(w); });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 10).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({color: '#7fd0ff', transparent: true, opacity: 0.85}));
    flame.position.set(-3.6, 0.7, 0.6); body.add(flame);
    const flame2 = flame.clone(); flame2.position.z = -0.6; body.add(flame2);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: '#000', transparent: true, opacity: 0.35, depthWrite: false}));
    scene.add(shadow);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({depthTest: false, transparent: true}));
    tag.scale.set(6, 1.5, 1); tag.position.set(0, 4.6, 0); grp.add(tag);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 16, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide}));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.9, depthWrite: false}));
    ring.position.y = 0.15;
    const mark = new THREE.Group(); mark.add(beam, ring); mark.visible = false; scene.add(mark);
    const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.55, depthWrite: false}));
    ribbon.frustumCulled = false; ribbon.visible = false; scene.add(ribbon);
    scene.add(grp);
    o = V.vans[i] = {grp, body, wheels, flame, flame2, tag, mark, ribbon, routeRef: null, shadow, color, camYaw: null, shake: 0, fov: 68, orbit: 0, tagName: null};
    V.tag(i, name || '');
    return o;
  };
  V.tag = function(i, name){
    const o = V.vans[i]; if(!o) return;
    const c = mkCanvas(256, 64), g = c.getContext('2d');
    if(name){ g.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(g, 4, 8, 248, 48, 20); g.fill(); g.fillStyle = o.color; g.font = 'bold 32px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(name).slice(0, 14), 128, 33); }
    if(o.tag.material.map) o.tag.material.map.dispose();
    o.tag.material.map = tex(c); o.tag.material.needsUpdate = true;
    o.tagName = name;
  };
  V.dropVan = function(i){ const o = V.vans[i]; if(!o) return; [o.grp, o.mark, o.ribbon, o.shadow].forEach(x => scene.remove(x)); V.vans[i] = null; };
  V.dropAll = function(){ V.vans.forEach((o, i) => V.dropVan(i)); V.vans.length = 0; };
  /* place a van: s = {x,y,z,h, crash:{ax,ay,az,h}|null, boosting, powder, drift, spd, ghost, yaw, air, vy} */
  V.placeVan = function(i, s, dt, t){
    const o = V.vans[i]; if(!o) return;
    o.grp.position.set(s.x, s.y, s.z);
    if(s.crash) o.grp.rotation.set(s.crash.ax || 0, -(s.crash.h != null ? s.crash.h : s.h) + (s.crash.ay || 0), s.crash.az || 0, 'YXZ');
    else {
      const lean = -(s.yaw || 0) * Math.min(1, (s.spd || 0) / 30) * 0.06 * (s.drift ? 2 : 1);
      const pitch = s.air ? Math.max(-0.4, Math.min(0.3, (s.vy || 0) * 0.03)) : 0;
      o.grp.rotation.set(lean, -s.h, pitch, 'YXZ');
    }
    o.wheels.forEach(w => { w.rotation.z -= (s.spd || 0) * dt / 0.42; });
    const fl = s.boosting && !s.crash;
    o.flame.visible = o.flame2.visible = fl;
    if(fl){ const k = 0.8 + Math.random() * 0.5; o.flame.scale.set(k, 1, 1); o.flame2.scale.set(k, 1, 1); o.flame.material.color.set(s.powder ? '#ff8a2a' : '#7fd0ff'); }
    o.body.visible = !(s.ghost && !s.crash && Math.floor(t * 12) % 2 === 0);
    const gy = M.height(s.x, s.z);
    o.shadow.position.set(s.x, gy + 0.07, s.z); o.shadow.rotation.y = -s.h; o.shadow.material.opacity = Math.max(0.05, 0.35 - (s.y - gy) * 0.04);
    if(s.drift && s.spd > 12 && Math.random() < 0.6) V.puff(s.x - Math.cos(s.h) * 2.2, 0.4, s.z - Math.sin(s.h) * 2.2, 1, '#e6e1d8', 0.8, 0.8);
    if(s.powder && Math.random() < 0.5) V.puff(s.x - Math.cos(s.h) * 3, 1, s.z - Math.sin(s.h) * 3, 1, '#444', 0.9, 1.5);
    if((s.dmg || 0) > 0.55 && !s.crash && Math.random() < (s.dmg - 0.45) * 0.6) V.puff(s.x + Math.cos(s.h) * 2.2, s.y + 1.6, s.z + Math.sin(s.h) * 2.2, 1, s.dmg > 0.8 ? '#333' : '#888', 0.7, 2);
  };
  V.target = function(i, tp, t){
    const o = V.vans[i]; if(!o) return;
    o.mark.visible = !!tp;
    if(tp){ o.mark.position.set(tp.x, 0, tp.z); o.mark.children[1].scale.setScalar(1 + 0.15 * Math.sin(t * 6)); }
  };
  V.route = function(i, r){
    const o = V.vans[i]; if(!o) return;
    if(o.routeRef === r) return;
    o.routeRef = r;
    if(!r || r.length < 2){ o.ribbon.visible = false; return; }
    o.ribbon.visible = true;
    const pos = [], idx = [];
    for(let k = 0; k < r.length - 1; k++){
      const a = r[k], b = r[k + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if(L < 0.1) continue;
      const nx = -(b.z - a.z) / L * 0.9, nz = (b.x - a.x) / L * 0.9, base = pos.length / 3;
      pos.push(a.x + nx, 0.2, a.z + nz, b.x + nx, 0.2, b.z + nz, b.x - nx, 0.2, b.z - nz, a.x - nx, 0.2, a.z - nz);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    o.ribbon.geometry.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    o.ribbon.geometry = g;
  };

  /* ---- traffic: cars = [{x,z,h,kind,color,wreck:{y,ax,ay,az}|null}] ---- */
  const traffic = {};
  KINDS.forEach(k => { const im = new THREE.InstancedMesh(carGeo(k), new THREE.MeshLambertMaterial({vertexColors: true}), 160); im.count = 0; im.frustumCulled = false; scene.add(im); traffic[k] = im; });
  V.traffic = function(cars){
    const n = {car: 0, pickup: 0, truck: 0, bus: 0};
    cars.forEach(c => {
      const k = typeof c.kind === 'number' ? KINDS[c.kind] : c.kind, im = traffic[k]; if(!im) return;
      const i = n[k]++; if(i >= 160) return;
      if(c.wreck){ _e.set(c.wreck.ax, -c.h + c.wreck.ay, c.wreck.az, 'YXZ'); _p.set(c.x, c.wreck.y, c.z); }
      else { _e.set(0, -c.h, 0); _p.set(c.x, 0, c.z); }
      _q.setFromEuler(_e); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
      im.setColorAt(i, _c.set(k === 'bus' ? '#f2f2f2' : k === 'truck' ? '#ececec' : CAR_COLORS[c.color % CAR_COLORS.length]));
    });
    KINDS.forEach(k => { const im = traffic[k]; im.count = Math.min(160, n[k]); im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true; });
  };

  /* ---- goons: [{x,y,z,h,st,spin,color,carry,id}] ---- */
  const goonPool = [];
  function goonMesh(){
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), new THREE.MeshLambertMaterial({color: '#222'})); deck.position.y = 0.2; g.add(deck);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1), new THREE.MeshLambertMaterial({color: '#aaa'})); stem.position.set(0.5, 0.75, 0); stem.rotation.z = -0.15; g.add(stem);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), new THREE.MeshLambertMaterial({color: '#3a4a6a'})); legs.position.set(0, 0.7, 0); g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.5), new THREE.MeshLambertMaterial({color: '#c43c3c'})); torso.position.set(0.05, 1.42, 0); g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({color: '#e2b48c'})); head.position.set(0.08, 1.95, 0); g.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), torso.material); hood.position.set(0.04, 1.97, 0); g.add(hood);
    const loot = new THREE.Sprite(new THREE.SpriteMaterial({map: bouquetTex(0), transparent: true})); loot.scale.set(0.8, 1.04, 1); loot.position.set(0.3, 1.6, 0.35); g.add(loot);
    g.userData = {torso, loot};
    scene.add(g);
    return g;
  }
  V.goons = function(list, t){
    let i = 0;
    list.forEach(gn => {
      const g = goonPool[i] || (goonPool[i] = goonMesh()); i++;
      g.visible = true;
      g.userData.torso.material.color.set(HOODIES[gn.color % HOODIES.length]);
      g.userData.loot.visible = !!gn.carry;
      if(gn.st === 'flung' || gn.st === 2){ g.position.set(gn.x, gn.y, gn.z); g.rotation.set(gn.spin, -gn.h, gn.spin * 0.7); }
      else { g.position.set(gn.x, M.height(gn.x, gn.z), gn.z); g.rotation.set(0, -gn.h, Math.sin(t * 6 + (gn.id || i)) * 0.06); }
    });
    for(; i < goonPool.length; i++) goonPool[i].visible = false;
  };

  /* ---- bouquets: sprites drawn from the real flowers ---- */
  const bqTex = {};
  function bouquetTex(ri, hol){
    const key = (hol || '') + ':' + ri;
    if(bqTex[key]) return bqTex[key];
    const H = window.WSim && WSim.HOLIDAYS[hol || 'thanksgiving'] || WSim.HOLIDAYS.thanksgiving;
    const r = H.recipes[ri] || H.recipes[0];
    const t = new THREE.CanvasTexture(WBouquet.canvas(WBouquet.fromRecipe(r, ri + 3), 160));
    t.colorSpace = THREE.SRGBColorSpace;
    bqTex[key] = t;
    return t;
  }
  V.holiday = 'thanksgiving';
  function bouquetSprite(ri, scale){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: bouquetTex(ri, V.holiday), transparent: true}));
    s.scale.set(1.4 * (scale || 1), 1.82 * (scale || 1), 1);
    s.center.set(0.5, 0.05);
    return s;
  }
  const flying = [], porches = [];
  V.addShot = function(e){
    const m = bouquetSprite(e.ri);
    scene.add(m);
    flying.push({m, x0: e.x, z0: e.z, tx: e.tx, tz: e.tz, T: e.T, t: 0, y0: e.y0 || 2.2});
  };
  V.leaveOnPorch = function(x, z, ri){
    const m = bouquetSprite(ri, 0.8);
    m.position.set(x, 0.05, z);
    scene.add(m); porches.push({m, t: 40});
    if(porches.length > 40){ scene.remove(porches[0].m); porches.shift(); }
  };
  function drawFlying(dt){
    for(let i = flying.length - 1; i >= 0; i--){
      const f = flying[i]; f.t += dt;
      const u = Math.min(1, f.t / f.T);
      const y = f.y0 * (1 - u) + 0.3 * u + Math.sin(u * Math.PI) * (3 + f.T * 2.5);
      f.m.position.set(f.x0 + (f.tx - f.x0) * u, y, f.z0 + (f.tz - f.z0) * u);
      f.m.material.rotation = u * 9;
      if(u >= 1){ scene.remove(f.m); flying.splice(i, 1); }
    }
    for(let i = porches.length - 1; i >= 0; i--){ porches[i].t -= dt; if(porches[i].t <= 0){ scene.remove(porches[i].m); porches.splice(i, 1); } }
  }

  /* ---- petals, smoke, fireballs, geysers ---- */
  const PET_MAX = V.petMax;
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshLambertMaterial({side: THREE.DoubleSide}), PET_MAX);
  petals.count = 0; petals.frustumCulled = false; petals.setColorAt(0, new THREE.Color('#fff')); scene.add(petals);
  const P = [];
  V.burst = function(x, y, z, vx, vz, n, colors, spread){
    for(let i = 0; i < n; i++){
      if(P.length >= PET_MAX) P.shift();
      const a = Math.random() * Math.PI * 2, sp = Math.random() * (spread || 9);
      P.push({x, y: y + Math.random(), z, vx: vx * 0.5 + Math.cos(a) * sp, vy: 3 + Math.random() * 9, vz: vz * 0.5 + Math.sin(a) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14,
        life: 22 + Math.random() * 10, c: colors[i % colors.length], s: 0.7 + Math.random() * 0.8});
    }
  };
  V.flowerColors = function(ris){
    const out = [], H = WSim.HOLIDAYS[V.holiday] || WSim.HOLIDAYS.thanksgiving;
    (ris && ris.length ? ris : [0]).forEach(ri => {
      const r = H.recipes[ri] || H.recipes[0];
      Object.keys(r.st).forEach(k => { const f = WSim.FLOWERS.find(x => x.k === k); out.push(f.c, f.c, f.c2); });
    });
    return out;
  };
  function drawPetals(dt, wind){
    for(let i = P.length - 1; i >= 0; i--){
      const p = P[i]; p.life -= dt;
      if(p.life <= 0){ P.splice(i, 1); continue; }
      if(p.y > 0.05){
        p.vy -= 9 * dt;
        const drag = Math.exp(-1.6 * dt);
        p.vx = p.vx * drag + wind.x * dt; p.vz = p.vz * drag + wind.z * dt;
        if(p.vy < -2.5) p.vy = -2.5;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.ry += p.wy * dt;
        if(p.y <= 0.05){ p.y = 0.05; p.rx = Math.PI / 2; }
      }
    }
    let n = 0;
    for(let i = 0; i < P.length; i++){
      const p = P[i], s = p.s * Math.min(1, p.life / 3);
      _e.set(p.rx, p.ry, 0); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(s, s, s);
      _m.compose(_p, _q, _s); petals.setMatrixAt(n, _m); petals.setColorAt(n, _c.set(p.c)); n++;
    }
    petals.count = n; petals.instanceMatrix.needsUpdate = true; if(petals.instanceColor) petals.instanceColor.needsUpdate = true;
  }
  const SM_MAX = 400;
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({transparent: true, opacity: 0.55, flatShading: true, depthWrite: false}), SM_MAX);
  smoke.count = 0; smoke.frustumCulled = false; smoke.setColorAt(0, new THREE.Color('#fff')); scene.add(smoke);
  const SM = [];
  V.puff = function(x, y, z, n, color, size, up){
    for(let i = 0; i < n; i++){
      if(SM.length >= SM_MAX) SM.shift();
      SM.push({x: x + (Math.random() - 0.5) * 2, y: y + Math.random(), z: z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 3, vy: (up || 1.5) * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 3,
        s: (size || 1) * (0.6 + Math.random() * 0.6), life: 1.5 + Math.random() * 1.5, c: color || '#cfc6b8'});
    }
  };
  function drawSmoke(dt){
    let n = 0;
    for(let i = SM.length - 1; i >= 0; i--){ const p = SM[i]; p.life -= dt; if(p.life <= 0){ SM.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.s += dt * 1.2; }
    SM.forEach(p => { const s = p.s * Math.min(1, p.life); _m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); smoke.setMatrixAt(n, _m); smoke.setColorAt(n, _c.set(p.c)); n++; });
    smoke.count = n; smoke.instanceMatrix.needsUpdate = true; if(smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
  }
  /* chunks: bricks, body panels, glass - little boxes that fly, bounce and lie there */
  const CH_MAX = 900;
  const chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: '#fff'}), CH_MAX);
  chunks.count = 0; chunks.frustumCulled = false; chunks.setColorAt(0, new THREE.Color('#fff')); scene.add(chunks);
  const CH = [];
  V.chunks = function(x, y, z, vx, vz, n, colors, size, spread, up){
    for(let i = 0; i < n; i++){
      if(CH.length >= CH_MAX) CH.shift();
      const a = Math.random() * Math.PI * 2, sp = Math.random() * (spread || 6);
      const sz = (size || 0.35) * (0.6 + Math.random() * 0.8);
      CH.push({x: x + (Math.random() - 0.5) * 1.5, y: y + Math.random() * 0.8, z: z + (Math.random() - 0.5) * 1.5,
        vx: vx * 0.7 + Math.cos(a) * sp, vy: (up || 5) * (0.5 + Math.random()), vz: vz * 0.7 + Math.sin(a) * sp,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: 0, wx: (Math.random() - 0.5) * 16, wy: (Math.random() - 0.5) * 16,
        sx: sz * 1.6, sy: sz * 0.8, sz: sz, c: colors[i % colors.length], life: 18 + Math.random() * 6});
    }
  };
  function drawChunks(dt){
    let n = 0;
    for(let i = CH.length - 1; i >= 0; i--){
      const p = CH[i]; p.life -= dt;
      if(p.life <= 0){ CH.splice(i, 1); continue; }
      if(p.y > p.sy / 2 || p.vy > 0){
        p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.ry += p.wy * dt;
        if(p.y < p.sy / 2){ p.y = p.sy / 2; if(p.vy < -3){ p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; p.wx *= 0.5; } else { p.vy = 0; p.vx = p.vz = 0; p.rx = Math.round(p.rx / Math.PI) * Math.PI; } }
      }
    }
    for(let i = 0; i < CH.length; i++){
      const p = CH[i], k = Math.min(1, p.life / 2);
      _e.set(p.rx, p.ry, 0); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(p.sx * k, p.sy * k, p.sz * k);
      _m.compose(_p, _q, _s); chunks.setMatrixAt(n, _m); chunks.setColorAt(n, _c.set(p.c)); n++;
    }
    chunks.count = n; chunks.instanceMatrix.needsUpdate = true; if(chunks.instanceColor) chunks.instanceColor.needsUpdate = true;
  }
  /* sparks: short bright streaks */
  V.sparks = function(x, y, z, n){ V.burst(x, y, z, 0, 0, n, ['#fff6a0', '#ffd23f', '#ff9a2a'], 9); };

  const booms = [];
  V.fireball = function(x, y, z, size, color){
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({color: color || '#ffa63a', transparent: true, opacity: 0.95}));
    m.position.set(x, y, z); scene.add(m);
    booms.push({m, t: 0, T: 0.9, size: size || 6});
    const light = new THREE.PointLight(color || '#ffa63a', 40, 60); light.position.set(x, y + 3, z); scene.add(light);
    booms.push({light, t: 0, T: 0.6});
  };
  V.geyser = function(x, z, h){
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, 1, 16, 1, true).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({color: '#cfeff2', transparent: true, opacity: 0.8, side: THREE.DoubleSide}));
    m.position.set(x, -1.5, z); scene.add(m);
    booms.push({m, t: 0, T: 3, geyser: h || 28});
  };
  function drawBooms(dt){
    for(let i = booms.length - 1; i >= 0; i--){
      const b = booms[i]; b.t += dt;
      const u = b.t / b.T;
      if(b.light){ b.light.intensity = 40 * (1 - u); if(u >= 1){ scene.remove(b.light); booms.splice(i, 1); } continue; }
      if(b.geyser){ const h = b.geyser * Math.sin(Math.min(1, u * 1.4) * Math.PI); b.m.scale.set(1 + u, Math.max(0.1, h), 1 + u); b.m.material.opacity = 0.8 * (1 - u * 0.7); if(Math.random() < 0.5) V.burst(b.m.position.x, Math.max(0, h * 0.8), b.m.position.z, 0, 0, 3, ['#d9f4f7', '#ffffff', '#9fdde3'], 6); }
      else { const s = b.size * (0.4 + u * 1.2); b.m.scale.setScalar(s); b.m.material.opacity = 0.95 * (1 - u); b.m.material.color.set(u < 0.3 ? '#fff2a0' : '#ff7a2a'); }
      if(u >= 1){ scene.remove(b.m); booms.splice(i, 1); }
    }
  }
  V.clear = function(){
    P.length = 0; SM.length = 0; CH.length = 0;
    flying.forEach(f => scene.remove(f.m)); flying.length = 0;
    porches.forEach(f => scene.remove(f.m)); porches.length = 0;
    booms.forEach(b => { if(b.m) scene.remove(b.m); if(b.light) scene.remove(b.light); }); booms.length = 0;
  };
  V.tick = function(dt, wind){
    drawFlying(dt); drawPetals(dt, wind || {x: 0, z: 0}); drawSmoke(dt); drawBooms(dt); drawChunks(dt);
  };

  /* ---- what an event looks like (both screens) ---- */
  V.event = function(e, flowers){
    switch(e.k){
      case 'crash':
        V.burst(e.x, (e.y || 0) + 1.5, e.z, e.vx || 0, e.vz || 0, 220 + (e.lost ? e.lost.length : 0) * 120, e.lost && e.lost.length ? V.flowerColors(e.lost) : ['#e8e8e8', '#cccccc', '#f2a7b4'], 10);
        V.puff(e.x, (e.y || 0) + 0.5, e.z, 14, '#8a8a8a', 1.6, 2);
        if(e.cause === 'canal') V.burst(e.x, 0, e.z, 0, 0, 160, ['#d9f4f7', '#ffffff', '#9fdde3'], 7);
        if(e.kaboom) V.fireball(e.x, (e.y || 0) + 1, e.z, 9);
        // the van comes apart a bit: white panels, glass, sparks, a hubcap
        V.chunks(e.x, (e.y || 0) + 1, e.z, e.vx || 0, e.vz || 0, 26, ['#fbfbf7', '#fbfbf7', '#f2a7b4', '#26323d', '#bfe3ff', '#1c1c1c'], 0.45, 8, 8);
        V.sparks(e.x, (e.y || 0) + 0.8, e.z, 40);
        if(e.imp > 30) V.fireball(e.x, (e.y || 0) + 1, e.z, 5, '#ffb04a');
        break;
      case 'wall':
        // a block wall going over: bricks and dust
        V.chunks(e.x, 1, e.z, e.vx || 0, e.vz || 0, 34, ['#cdb38c', '#c4a77d', '#b8996e', '#d8c29c'], 0.38, 4, 5);
        V.puff(e.x, 0.8, e.z, 8, '#d8c6a8', 1.4, 1.2);
        break;
      case 'dent': V.puff(e.x, 1.5, e.z, 4, '#666', 0.8, 1.5); V.sparks(e.x, 1, e.z, 12); break;
      case 'carbounce': V.puff(e.x, 0.3, e.z, 3, '#c8b49a'); V.chunks(e.x, 0.6, e.z, 0, 0, 4, ['#222', '#9aa3ad', '#bfe3ff'], 0.3, 3, 3); break;
      case 'spill': V.burst(e.x, (e.y || 0) + 1.5, e.z, e.vx || 0, e.vz || 0, e.lost.length * 120, V.flowerColors(e.lost), 10); break;
      case 'carhit':
        V.puff(e.x, 0.5, e.z, 8, '#9a9a9a');
        V.chunks(e.x, 1, e.z, e.vx || 0, e.vz || 0, 10 + Math.round((e.big || 0.5) * 20), ['#c8312f', '#2f5fc8', '#9aa3ad', '#222', '#bfe3ff', '#e8e8e8'], 0.4, 7, 7);
        V.sparks(e.x, 0.8, e.z, 30);
        if(e.boom){ V.fireball(e.x, 1.2, e.z, 8); V.puff(e.x, 2, e.z, 16, '#333', 2, 3); }
        break;
      case 'thud': V.puff(e.x, 0.3, e.z, 4, '#c8b49a'); break;
      case 'smash': {
        const col = e.kind === 'bin' ? ['#2f6b3f', '#e8e8e8', '#7a6a5a'] : e.kind === 'bush' ? ['#7a9a4a', '#5f7f3a'] : e.kind === 'bale' ? ['#d8b45a', '#e8c86a'] : ['#8d8d8d', '#bbb'];
        V.burst(e.x, 0.8, e.z, e.vx || 0, e.vz || 0, 24, col, 5);
        break;
      }
      case 'land':
        if(e.how){
          V.burst(e.x, 0.6, e.z, 0, 0, e.how === 'perfect' ? 60 : e.how === 'miss' ? 60 : 30, V.flowerColors([e.ri]), e.how === 'miss' ? 4 : 3);
          if(e.how !== 'miss') V.leaveOnPorch(e.x, e.z, e.ri);
        } else if(e.air > 0.9) V.puff(e.x, 0.2, e.z, 5, '#c8b49a');
        break;
      case 'toss': V.addShot(e); break;
      case 'ptoss': V.addShot(Object.assign({}, e, {ri: Math.floor(Math.random() * 5), y0: 4})); break;
      case 'mist': V.puff(e.x, 2.5, e.z, 10, '#ffffff', 1.4, 0.3); break;
      case 'powder': V.puff(e.x, 1, e.z, 8, '#555', 1, 3); break;
      case 'boom': V.fireball(e.x, 0, e.z, 16); V.geyser(e.x, e.z, 30); break;
      case 'goonhit': V.burst(e.x, 1.2, e.z, 0, 0, 20, ['#ffffff', '#c43c3c'], 5); break;
      case 'splash': V.burst(e.x, 0, e.z, 0, 0, 40, ['#d9f4f7', '#ffffff'], 4); break;
      case 'pland': if(e.hit) V.burst(e.x, 1.5, e.z, 0, 0, 20, ['#ffffff', '#f7cfd6', '#d81b3c'], 3); break;
    }
  };

  /* ---- the chase camera ---- */
  /* views: 'chase' (up and back, sees over the van), 'high' (well above
     it, for seeing the streets ahead), 'low' (close behind), 'hood'
     (from the driver's seat). */
  const VIEWS = {chase: {back: 11.5, up: 5.8, ahead: 16, lookY: 1.0, fov: 64},
                 high: {back: 17, up: 11, ahead: 26, lookY: 0.5, fov: 60},
                 low: {back: 8.5, up: 3.4, ahead: 6, lookY: 1.6, fov: 66}};
  V.chase = function(cam, s, i, dt, aspect, mode){
    const o = V.vans[i];
    mode = mode || 'chase';
    if(o) o.body.visible = mode !== 'hood' || !!s.crash;
    if(o.camYaw == null) o.camYaw = s.h;
    const k = 1 - Math.exp(-dt * 7);
    if(s.crash){
      o.orbit += dt * 0.6;
      const c = s.crash, a = -(c.h != null ? c.h : s.h) + Math.PI * 0.75 + o.orbit;
      _v3.set(s.x + Math.cos(a) * 11, s.y + 4.5, s.z + Math.sin(a) * 11);
      cam.position.lerp(_v3, 1 - Math.exp(-dt * 4));
      cam.lookAt(s.x, s.y + 1, s.z);
      o.fov += (58 - o.fov) * k;
    } else {
      o.orbit = 0;
      const sp = s.spd || 0;
      let want = s.h;
      if(sp > 6){ const mv = Math.atan2(s.vz, s.vx); let d = mv - s.h; d = Math.atan2(Math.sin(d), Math.cos(d)); want = s.h + d * 0.55; }
      let dy = want - o.camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      o.camYaw += dy * (1 - Math.exp(-dt * 6));
      if(mode === 'hood'){
        // the driver's seat: up front, looking down the road
        _v3.set(s.x + Math.cos(s.h) * 1.4, s.y + 2.5, s.z + Math.sin(s.h) * 1.4);
        cam.position.copy(_v3);
        cam.lookAt(s.x + Math.cos(o.camYaw) * 40, s.y + 1.6, s.z + Math.sin(o.camYaw) * 40);
      } else {
        const P = VIEWS[mode] || VIEWS.chase;
        const back = P.back + Math.min(4, sp * 0.06), up = P.up + (s.air ? 2 : 0);
        _v3.set(s.x - Math.cos(o.camYaw) * back, s.y + up, s.z - Math.sin(o.camYaw) * back);
        cam.position.lerp(_v3, 1 - Math.exp(-dt * 10));
        const gy = M.height(cam.position.x, cam.position.z) + 1.2; if(cam.position.y < gy) cam.position.y = gy;
        cam.lookAt(s.x + Math.cos(o.camYaw) * P.ahead, s.y + P.lookY, s.z + Math.sin(o.camYaw) * P.ahead);
      }
      const base = mode === 'hood' ? 72 : (VIEWS[mode] || VIEWS.chase).fov;
      const wantFov = base + Math.min(18, sp * 0.28) + (s.boosting ? 8 : 0);
      o.fov += (wantFov - o.fov) * k;
      if(s.boosting) o.shake = Math.max(o.shake, 0.18);
    }
    if(o.shake > 0){ cam.position.x += (Math.random() - 0.5) * o.shake * 0.6; cam.position.y += (Math.random() - 0.5) * o.shake * 0.5; o.shake = Math.max(0, o.shake - dt * 2.5); }
    cam.fov = o.fov; cam.aspect = aspect; cam.updateProjectionMatrix();
    return cam;
  };
  V.shake = function(i, a){ const o = V.vans[i]; if(o) o.shake = Math.max(o.shake, a); };
  return V;
}
