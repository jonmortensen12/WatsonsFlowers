/* Watson's Flowers - the town, drawn.

   Builds everything that stands still from the map (map.js): the ground,
   the streets with their paint, the canals, the houses, the block walls,
   palms and palo verdes, the plazas, and the landmarks - Watson's and its
   neon sign on Main Street, the Mesa Temple, downtown and the Neon Garden,
   the Gilbert water tower, Grandpa's on Palo Verde Street, and the
   Superstitions on the horizon.

   The sky, sun and dust follow the clock (update()). Nothing here moves
   by itself except the pickups and the neon. */
import * as THREE from './lib/three.module.min.js';

const SURF_RGB = [[201, 168, 122], [62, 64, 68], [118, 152, 72], [58, 140, 150], [190, 184, 172], [186, 152, 108], [146, 112, 66]];

/* ---------------- little helpers ---------------- */
function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep){
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if(rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function noise(g, w, h, amt, alpha){
  const d = g.getImageData(0, 0, w, h);
  for(let i = 0; i < d.data.length; i += 4){
    const n = (Math.random() - 0.5) * amt;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
    if(alpha != null) d.data[i + 3] = alpha;
  }
  g.putImageData(d, 0, 0);
}

/* many boxes as one geometry, with vertex colours: list of {x0,z0,x1,z1,y0,h,color} */
function boxesGeo(list, uvScale){
  const n = list.length;
  const pos = new Float32Array(n * 24 * 3), nor = new Float32Array(n * 24 * 3), uv = new Float32Array(n * 24 * 2), col = new Float32Array(n * 24 * 3);
  const idx = new Uint32Array(n * 36);
  const c = new THREE.Color();
  let p = 0, q = 0, u = 0, k = 0;
  const s = uvScale || 1 / 4;
  list.forEach((b, bi) => {
    const x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1, y0 = b.y0 || 0, y1 = y0 + b.h;
    c.set(b.color || '#ffffff');
    const faces = [
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], z1 - z0],
      [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], z1 - z0],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], x1 - x0],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], x1 - x0],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], x1 - x0],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], x1 - x0]
    ];
    faces.forEach((f, fi) => {
      const base = p / 3;
      for(let v = 0; v < 4; v++){
        pos[p++] = f[v][0]; pos[p++] = f[v][1]; pos[p++] = f[v][2];
        nor[q++] = f[4][0]; nor[q++] = f[4][1]; nor[q++] = f[4][2];
        col[(base + v) * 3] = c.r; col[(base + v) * 3 + 1] = c.g; col[(base + v) * 3 + 2] = c.b;
      }
      const W = f[5] * s, H = (fi === 2 || fi === 3) ? (z1 - z0) * s : b.h * s;
      uv[u++] = 0; uv[u++] = 0; uv[u++] = W; uv[u++] = 0; uv[u++] = W; uv[u++] = H; uv[u++] = 0; uv[u++] = H;
      // wind each face so it faces out (some were inside out, and those
      // walls were culled - the "invisible walls")
      const a0 = f[0], a1 = f[1], a2 = f[2];
      const ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], vx = a2[0] - a0[0], vy = a2[1] - a0[1], vz = a2[2] - a0[2];
      const cxp = uy * vz - uz * vy, cyp = uz * vx - ux * vz, czp = ux * vy - uy * vx;
      if(cxp * f[4][0] + cyp * f[4][1] + czp * f[4][2] >= 0){ idx[k++] = base; idx[k++] = base + 1; idx[k++] = base + 2; idx[k++] = base; idx[k++] = base + 2; idx[k++] = base + 3; }
      else { idx[k++] = base; idx[k++] = base + 2; idx[k++] = base + 1; idx[k++] = base; idx[k++] = base + 3; idx[k++] = base + 2; }
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/* flat quads on the ground: list of {x0,z0,x1,z1,y, u0,v0,u1,v1, along:'x'|'z'} */
function quadsGeo(list){
  const n = list.length;
  const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), nor = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  list.forEach((r, i) => {
    const y = r.y || 0;
    const P = [[r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1]];
    // u runs across the road, v along it
    const U = r.along === 'z' ? [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]]
                              : [[r.u0, r.v0], [r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0]];
    for(let v = 0; v < 4; v++){
      pos.set(P[v], i * 12 + v * 3); uv.set(U[v], i * 8 + v * 2); nor.set([0, 1, 0], i * 12 + v * 3);
    }
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/* ---------------- textures ---------------- */
function asphalt(w, h, base){
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = base || '#3f4246'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 22);
  for(let i = 0; i < 40; i++){ g.fillStyle = 'rgba(20,20,22,0.18)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 3); }
  return {c, g};
}
/* a road texture: across = the road's width, along = `period` metres */
function roadTex(kind, width){
  const W = 256, H = 256, period = 12;
  const {c, g} = asphalt(W, H);
  const px = m => (m / width + 0.5) * W;   // metres from the centre line to pixels
  const lineW = m => Math.max(2, m / width * W);
  function solid(m, color, wd){ g.fillStyle = color; g.fillRect(px(m) - lineW(wd) / 2, 0, lineW(wd), H); }
  function dash(m, color, wd){ g.fillStyle = color; g.fillRect(px(m) - lineW(wd) / 2, 0, lineW(wd), H * 0.4); }
  const Y = '#e8c23a', Wt = '#e9e9e2';
  if(kind === 'art'){
    solid(-0.2, Y, 0.15); solid(0.2, Y, 0.15);
    dash(-4.8, Wt, 0.15); dash(4.8, Wt, 0.15);
    solid(-width / 2 + 0.6, Wt, 0.18); solid(width / 2 - 0.6, Wt, 0.18);
  } else if(kind === 'col'){
    dash(0, Y, 0.15);
    solid(-width / 2 + 0.5, Wt, 0.15); solid(width / 2 - 0.5, Wt, 0.15);
  } else if(kind === 'fwy'){
    solid(-0.6, Y, 0.18); solid(0.6, Y, 0.18);
    [5.3, 9.1].forEach(m => { dash(m, Wt, 0.18); dash(-m, Wt, 0.18); });
    solid(-width / 2 + 1, Wt, 0.2); solid(width / 2 - 1, Wt, 0.2);
  }
  const t = tex(c, true);
  t.userData = {period};
  return t;
}
function crossTex(){
  const {c, g} = asphalt(256, 256);
  g.fillStyle = '#e9e9e2';
  for(let i = 0; i < 12; i++){
    const a = 28 + i * 17;
    g.fillRect(a, 4, 9, 22); g.fillRect(a, 230, 9, 22); g.fillRect(4, a, 22, 9); g.fillRect(230, a, 22, 9);
  }
  return tex(c);
}
function stuccoTex(){
  const c = canvas(128, 64), g = c.getContext('2d');
  g.fillStyle = '#f2ece2'; g.fillRect(0, 0, 128, 64);
  noise(g, 128, 64, 14);
  g.fillStyle = '#4b5a6b';
  g.fillRect(12, 22, 18, 16); g.fillRect(96, 22, 18, 16);
  g.fillStyle = '#e8e2d6'; g.fillRect(44, 24, 38, 40);           // garage door
  g.strokeStyle = 'rgba(0,0,0,0.12)'; for(let y = 30; y < 64; y += 8){ g.beginPath(); g.moveTo(44, y); g.lineTo(82, y); g.stroke(); }
  g.fillStyle = '#7b4b2a'; g.fillRect(86, 34, 8, 30);
  return tex(c);
}
function blockTex(){
  const c = canvas(64, 32), g = c.getContext('2d');
  g.fillStyle = '#c7ad86'; g.fillRect(0, 0, 64, 32);
  g.strokeStyle = 'rgba(80,60,40,0.35)';
  for(let y = 0; y <= 32; y += 8){ g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
  for(let y = 0; y < 32; y += 8) for(let x = (y / 8) % 2 ? 8 : 0; x < 64; x += 16){ g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
  noise(g, 64, 32, 16);
  return tex(c, true);
}
function brickTex(){
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for(let y = 0; y < 64; y += 6){ g.fillRect(0, y, 64, 1); for(let x = (y / 6) % 2 ? 6 : 0; x < 64; x += 12) g.fillRect(x, y, 1, 6); }
  g.fillStyle = 'rgba(30,40,55,0.75)';
  for(let x = 6; x < 64; x += 20){ g.fillRect(x, 10, 10, 14); g.fillRect(x, 36, 10, 14); }
  noise(g, 64, 64, 18);
  return tex(c, true);
}
function storeTex(){
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  noise(g, 64, 64, 10);
  g.fillStyle = 'rgba(40,60,80,0.85)'; g.fillRect(2, 34, 60, 26);
  g.fillStyle = 'rgba(255,255,255,0.3)'; for(let x = 2; x < 64; x += 15) g.fillRect(x, 34, 1, 26);
  return tex(c, true);
}
function labelTex(text, opts){
  opts = opts || {};
  const W = opts.w || 512, H = opts.h || 128;
  const c = canvas(W, H), g = c.getContext('2d');
  if(opts.bg){ g.fillStyle = opts.bg; g.fillRect(0, 0, W, H); }
  g.font = (opts.weight || 'bold') + ' ' + (opts.size || 80) + 'px ' + (opts.font || 'Georgia, serif');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if(opts.stroke){ g.lineWidth = opts.strokeW || 8; g.strokeStyle = opts.stroke; g.strokeText(text, W / 2, H / 2 + 4); }
  g.fillStyle = opts.color || '#fff';
  g.fillText(text, W / 2, H / 2 + 4);
  return tex(c);
}

/* The sign: pink panel, gold FLOWERS, the white Watson's oval in black
   script, blossoms, and the green BEST since 1927 badge. */
function signTextures(){
  const panel = canvas(1024, 256), g = panel.getContext('2d');
  g.fillStyle = '#f2a7b4'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#d97a8c'; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 242);
  g.font = 'bold 190px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 16; g.strokeStyle = '#7a4a10'; g.strokeText('FLOWERS', 512, 136);
  g.fillStyle = '#f2c531'; g.fillText('FLOWERS', 512, 136);
  g.lineWidth = 3; g.strokeStyle = '#fff3a0'; g.strokeText('FLOWERS', 512, 136);
  const oval = canvas(512, 256), o = oval.getContext('2d');
  o.fillStyle = '#1b1b1b'; o.beginPath(); o.ellipse(256, 128, 250, 122, 0, 0, Math.PI * 2); o.fill();
  o.fillStyle = '#f6f3ea'; o.beginPath(); o.ellipse(256, 128, 236, 110, 0, 0, Math.PI * 2); o.fill();
  o.fillStyle = '#151515'; o.font = 'italic bold 118px "Brush Script MT", "Segoe Script", cursive'; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillText("Watson's", 256, 136);
  const bloom = canvas(256, 256), b = bloom.getContext('2d');
  b.translate(128, 128);
  for(let i = 0; i < 5; i++){
    b.rotate(Math.PI * 2 / 5);
    b.fillStyle = '#f7cfd6'; b.strokeStyle = '#c96a80'; b.lineWidth = 5;
    b.beginPath(); b.ellipse(0, -62, 42, 62, 0, 0, Math.PI * 2); b.fill(); b.stroke();
  }
  b.fillStyle = '#f2c531'; b.beginPath(); b.arc(0, 0, 28, 0, Math.PI * 2); b.fill();
  b.strokeStyle = '#a0701a'; b.lineWidth = 4; b.stroke();
  const badge = canvas(256, 256), d = badge.getContext('2d');
  d.fillStyle = '#1f6a45'; d.beginPath(); d.arc(128, 128, 124, 0, Math.PI * 2); d.fill();
  d.strokeStyle = '#e9e1c8'; d.lineWidth = 8; d.beginPath(); d.arc(128, 128, 112, 0, Math.PI * 2); d.stroke();
  d.fillStyle = '#f4ecd2'; d.textAlign = 'center';
  d.font = 'bold 30px Georgia, serif'; d.fillText('THE', 128, 70);
  d.font = 'bold 64px Georgia, serif'; d.fillText('BEST', 128, 128);
  d.font = 'italic bold 30px Georgia, serif'; d.fillText('Since', 128, 166);
  d.font = 'bold 40px Georgia, serif'; d.fillText('1927', 128, 206);
  return {panel: tex(panel), oval: tex(oval), bloom: tex(bloom), badge: tex(badge)};
}

/* the neon sign itself, as a group; scale 1 is the real thing (taller here) */
export function makeSign(T){
  const grp = new THREE.Group();
  const pole = new THREE.MeshLambertMaterial({color: '#8fd1b4'});
  [-1.6, 1.6].forEach(o => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 15, 10), pole);
    m.position.set(0, 7.5, o); grp.add(m);
  });
  const mat = (t, glow) => new THREE.MeshLambertMaterial({map: t, transparent: true, side: THREE.DoubleSide, emissive: glow ? '#ffffff' : '#000000', emissiveMap: glow ? t : null, emissiveIntensity: 0});
  const panelM = mat(T.panel, true), ovalM = mat(T.oval, true), bloomM = mat(T.bloom, true), badgeM = mat(T.badge, false);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), panelM);
  panel.rotation.y = Math.PI / 2; panel.position.set(0, 9, 0.6);
  panel.rotation.z = 0.06;
  grp.add(panel);
  const oval = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), ovalM);
  oval.rotation.y = Math.PI / 2; oval.position.set(0.05, 11.6, -0.6); grp.add(oval);
  [[12.6, 2.6, 2.2], [10.6, -2.8, 1.8], [6.4, -1.4, 1.5]].forEach(b => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b[2], b[2]), bloomM);
    m.rotation.y = Math.PI / 2; m.position.set(0.1, b[0], b[1]); grp.add(m);
  });
  const badge = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), badgeM);
  badge.rotation.y = Math.PI / 2; badge.position.set(0.1, 6.4, 1.4); grp.add(badge);
  grp.userData.glow = [panelM, ovalM, bloomM];
  return grp;
}

/* ---------------- the build ---------------- */
export function buildWorld(scene, M, opts){
  opts = opts || {};
  const W = {scene, M, glow: [], spin: [], pickups: [], propMesh: [], propIndex: [], dynamic: []};
  const RES = M.RES, GW = M.GW, GH = M.GH;
  const SX = GW * RES, SZ = GH * RES;

  /* the ground, painted from the surface raster; holes where the canals,
     ponds and basins dip below it */
  {
    const c = canvas(GW, GH), g = c.getContext('2d');
    const img = g.createImageData(GW, GH), d = img.data, sg = M.surfGrid;
    for(let j = 0; j < GH; j++) for(let i = 0; i < GW; i++){
      const s = sg[j * GW + i], o = (j * GW + i) * 4, rgb = SURF_RGB[s];
      const n = (Math.random() - 0.5) * (s === 2 ? 26 : s === 0 ? 20 : 12);
      let r = rgb[0] + n, gg = rgb[1] + n, b = rgb[2] + n;
      if(s === 6 && (j % 3 === 0)){ r -= 22; gg -= 18; b -= 12; }    // furrows
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      if(s === 3) d[o + 3] = 0;
    }
    // basins are holes too (their bowls are drawn below)
    M.basins.forEach(bs => {
      for(let j = Math.floor((bs.z - bs.rz) / RES); j <= Math.ceil((bs.z + bs.rz) / RES); j++)
        for(let i = Math.floor((bs.x - bs.rx) / RES); i <= Math.ceil((bs.x + bs.rx) / RES); i++){
          const dx = ((i + 0.5) * RES - bs.x) / bs.rx, dz = ((j + 0.5) * RES - bs.z) / bs.rz;
          if(dx * dx + dz * dz < 0.92 && i >= 0 && j >= 0 && i < GW && j < GH) d[(j * GW + i) * 4 + 3] = 0;
        }
    });
    g.putImageData(img, 0, 0);
    const t = tex(c);
    t.magFilter = THREE.LinearFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SX, SZ).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({map: t, alphaTest: 0.5}));
    ground.position.set(SX / 2, 0, SZ / 2);
    scene.add(ground);
    // the desert beyond the map: a frame round it, so nothing brown shows
    // through the holes in the ground
    const desert = new THREE.MeshLambertMaterial({color: '#c4a273'}), F = 7000;
    [[-F / 2 + 0, SZ / 2, F, SZ + 2 * F], [SX + F / 2, SZ / 2, F, SZ + 2 * F], [SX / 2, -F / 2, SX, F], [SX / 2, SZ + F / 2, SX, F]].forEach(([x, z, w, d]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), desert);
      m.position.set(x, -0.08, z); scene.add(m);
    });
    // and under the whole map, water: every hole in the ground (a canal,
    // a pond) shows blue
    const under = new THREE.Mesh(new THREE.PlaneGeometry(SX, SZ).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({color: '#2f7fb8', emissive: '#0b2a40'}));
    under.position.set(SX / 2, -1.7, SZ / 2); scene.add(under);
    W.groundTex = c;
  }

  /* basins: grass bowls */
  M.basins.forEach(bs => {
    const geo = new THREE.PlaneGeometry(bs.rx * 2, bs.rz * 2, 20, 20).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for(let i = 0; i < p.count; i++){ p.setY(i, M.height(bs.x + p.getX(i), bs.z + p.getZ(i))); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({color: '#6f9a45'}));
    m.position.set(bs.x, 0.01, bs.z);
    scene.add(m);
  });

  /* canals: concrete-lined channels with green-blue water */
  {
    const water = [], walls = [];
    
    M.canals.forEach(cn => {
      const p = cn.pts;
      for(let k = 0; k < p.length - 1; k++){
        const ax = p[k][0], az = p[k][1], bx = p[k + 1][0], bz = p[k + 1][1];
        const L = Math.hypot(bx - ax, bz - az); if(L < 0.1) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        const ext = 2;   // overlap the joints
        const ex = (bx - ax) / L * ext, ez = (bz - az) / L * ext;
        const A = [ax - ex, az - ez], B = [bx + ex, bz + ez];
        water.push([A, B, nx, nz]);
        walls.push([A, B, nx, nz]);
      }
    });
    function strip(segs, y0, y1, w0, w1, mat){
      const pos = [], idx = [];
      segs.forEach(([A, B, nx, nz]) => {
        [-1, 1].forEach(sd => {
          const b = pos.length / 3;
          pos.push(A[0] + nx * w0 * sd, y0, A[1] + nz * w0 * sd, B[0] + nx * w0 * sd, y0, B[1] + nz * w0 * sd,
                   B[0] + nx * w1 * sd, y1, B[1] + nz * w1 * sd, A[0] + nx * w1 * sd, y1, A[1] + nz * w1 * sd);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        });
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); scene.add(m); return m;
    }
    strip(walls, 0.02, -2.9, 4.6, 3.0, new THREE.MeshLambertMaterial({color: '#a7a299', side: THREE.DoubleSide}));
    const wpos = [], widx = [];
    water.forEach(([A, B, nx, nz]) => {
      const b = wpos.length / 3, w = 4.0, y = -1.6;
      wpos.push(A[0] - nx * w, y, A[1] - nz * w, B[0] - nx * w, y, B[1] - nz * w, B[0] + nx * w, y, B[1] + nz * w, A[0] + nx * w, y, A[1] + nz * w);
      widx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setIndex(widx); wg.computeVertexNormals();
    const wmesh = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({color: '#3a8fc8', emissive: '#0c2c44', side: THREE.DoubleSide}));
    scene.add(wmesh);
    W.water = wmesh;
  }
  /* ponds */
  M.ponds.forEach(p => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({color: '#3f95cc', emissive: '#0c2c44'}));
    m.scale.set(p.rx, 1, p.rz); m.position.set(p.x, p.shallow ? 0.05 : -0.6, p.z);
    scene.add(m);
  });

  /* streets */
  {
    const byKind = {art: [], col: [], fwy: []};
    M.lines.forEach(l => {
      const hw = l.w / 2, len = l.hi - l.lo, per = 12;
      const y = l.kind === 'fwy' ? 0.05 : l.kind === 'art' ? 0.045 : 0.04;
      if(l.axis === 'ns') byKind[l.kind].push({x0: l.p - hw, x1: l.p + hw, z0: l.lo, z1: l.hi, y, along: 'z', u0: 0, u1: 1, v0: 0, v1: len / per});
      else byKind[l.kind].push({x0: l.lo, x1: l.hi, z0: l.p - hw, z1: l.p + hw, y, along: 'x', u0: 0, u1: 1, v0: 0, v1: len / per});
    });
    Object.keys(byKind).forEach(k => {
      const w = k === 'art' ? 22 : k === 'col' ? 13 : 34;
      const m = new THREE.Mesh(quadsGeo(byKind[k]), new THREE.MeshLambertMaterial({map: roadTex(k, w), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}));
      scene.add(m);
    });
    // residential streets: plain asphalt
    const rt = asphalt(64, 64, '#46484b');
    const res = M.resRoads.map(r => ({x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: 0.035, along: 'z', u0: 0, u1: (r.x1 - r.x0) / 8, v0: 0, v1: (r.z1 - r.z0) / 8}));
    const rtex = tex(rt.c, true);
    scene.add(new THREE.Mesh(quadsGeo(res), new THREE.MeshLambertMaterial({map: rtex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1})));
    // intersections
    const xs = M.lights.map(L => ({x0: L.x - L.wa / 2, x1: L.x + L.wa / 2, z0: L.z - L.wb / 2, z1: L.z + L.wb / 2, y: 0.06, along: 'z', u0: 0, u1: 1, v0: 0, v1: 1}));
    scene.add(new THREE.Mesh(quadsGeo(xs), new THREE.MeshLambertMaterial({map: crossTex(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4})));
  }

  /* houses: stucco boxes and tile roofs, instanced */
  {
    const HOUSE = ['#efe3cf', '#e9d6b8', '#f3eadc', '#dcc7a5', '#e8d9c6', '#d9c2a2', '#f1e7d0', '#e2cfb4'];
    const ROOF = ['#b5523b', '#a9472f', '#8f5a3c', '#c0674a'];
    const n = M.houses.length;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({map: stuccoTex()}), n);
    const roofG = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const roof = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({color: '#ffffff'}), n);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    M.houses.forEach((h, i) => {
      const w = h.x1 - h.x0, d = h.z1 - h.z0;
      p.set(h.x, h.h / 2, h.z); s.set(w, h.h, d); q.identity();
      // turn the box so its garage faces the street
      const yaw = Math.atan2(h.fdx, h.fdz);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const ww = Math.abs(h.fdx) > 0 ? d : w, dd = Math.abs(h.fdx) > 0 ? w : d;
      s.set(ww, h.h, dd);
      mt.compose(p, q, s); body.setMatrixAt(i, mt);
      body.setColorAt(i, c.set(h.grandpa ? '#fff4e6' : HOUSE[h.color]));
      p.set(h.x, h.h, h.z); s.set(ww * 1.12, 2.4, dd * 1.12);
      mt.compose(p, q, s); roof.setMatrixAt(i, mt);
      roof.setColorAt(i, c.set(ROOF[h.roof]));
    });
    scene.add(body, roof);
    W.houseMesh = body;
  }

  /* block walls */
  {
    const n = M.walls.length;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: '#cdb38c', map: blockTex()}), n);
    const mt = new THREE.Matrix4();
    M.walls.forEach((b, i) => { mt.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2); im.setMatrixAt(i, mt); });
    scene.add(im);
    // a wall a van went through: gone (the bricks are thrown by the view)
    W.downWalls = new Set();
    W.setWall = function(bi, up){
      const b = M.boxes[bi]; if(!b || b.wi == null) return;
      if(up){ mt.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2); W.downWalls.delete(bi); }
      else { mt.makeScale(0, 0, 0); W.downWalls.add(bi); }
      im.setMatrixAt(b.wi, mt); im.instanceMatrix.needsUpdate = true;
    };
    W.syncWalls = function(down){
      // down: an object or Set of box indices that are knocked over now
      const want = down instanceof Set ? down : new Set(Object.keys(down || {}).map(Number));
      W.downWalls.forEach(bi => { if(!want.has(bi)) W.setWall(bi, true); });
      want.forEach(bi => { if(!W.downWalls.has(bi)) W.setWall(bi, false); });
    };
  }

  /* freeway sound walls are walls too (in M.walls); concrete lots and buildings */
  {
    const STORE = ['#e9dcc3', '#d7c4a3', '#efe7d8', '#c9b48f', '#e3d0b0', '#f2e6cc'];
    const BRICK = ['#9b4a32', '#a85a3c', '#8a3f2c', '#b06446', '#7f3a2a'];
    const stores = [], bricks = [], campus = [], misc = [];
    M.buildings.forEach(b => {
      if(b.k === 'store') stores.push({...b, color: STORE[b.color % STORE.length]});
      else if(b.k === 'brick') bricks.push({...b, color: BRICK[b.color % BRICK.length]});
      else if(b.k === 'campus') campus.push({...b, color: '#cbbba0'});
      else if(b.k === 'school') campus.push({...b, color: '#d6b98f'});
      else if(b.k === 'barn') misc.push({...b, color: '#9b3b2c'});
      else if(b.k === 'cabin') misc.push({...b, color: '#f3efe6'});
      else if(b.k === 'ramada') misc.push({...b, y0: 2.6, h: 0.5, color: '#8b6a4b'});
      else if(b.k === 'arts') {
        misc.push({...b, color: '#e1592f'});
        misc.push({x0: b.x0 + 4, x1: b.x1 - 10, z0: b.z0 + 2, z1: b.z1 - 2, y0: b.h, h: 4, color: '#3aa0c8'});
      }
    });
    if(stores.length) scene.add(new THREE.Mesh(boxesGeo(stores, 1 / 6), new THREE.MeshLambertMaterial({vertexColors: true, map: storeTex()})));
    if(bricks.length) scene.add(new THREE.Mesh(boxesGeo(bricks, 1 / 4), new THREE.MeshLambertMaterial({vertexColors: true, map: brickTex()})));
    if(campus.length) scene.add(new THREE.Mesh(boxesGeo(campus, 1 / 6), new THREE.MeshLambertMaterial({vertexColors: true, map: storeTex()})));
    if(misc.length) scene.add(new THREE.Mesh(boxesGeo(misc), new THREE.MeshLambertMaterial({vertexColors: true})));
    // ramada posts
    M.buildings.filter(b => b.k === 'ramada').forEach(b => {
      [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].forEach(([x, z]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), new THREE.MeshLambertMaterial({color: '#6b5038'}));
        m.position.set(x, 1.3, z); scene.add(m);
      });
    });
    // parked cars in the plazas
    const parked = M.boxes.filter(b => b.k === 'parked');
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: '#fff'}), parked.length);
    const CAR = ['#c8312f', '#2f5fc8', '#e8e8e8', '#222', '#9aa3ad', '#2f8a4c', '#d8b23a', '#6b3fa0'];
    const mt = new THREE.Matrix4(), c = new THREE.Color();
    parked.forEach((b, i) => { mt.makeScale(b.x1 - b.x0, 1.45, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, 0.75, (b.z0 + b.z1) / 2); pm.setMatrixAt(i, mt); pm.setColorAt(i, c.set(CAR[b.color % CAR.length])); });
    scene.add(pm);
  }

  /* store signs: one atlas, one geometry */
  {
    const names = [...new Set(M.signs.map(s => s.label))];
    const rowH = 64, cw = 512, c = canvas(cw, rowH * names.length), g = c.getContext('2d');
    const BG = ['#b8242c', '#1f5fa8', '#2a8a4a', '#d98a1a', '#6b2fa0', '#1a1a1a', '#c4366e'];
    names.forEach((n, i) => {
      g.fillStyle = BG[i % BG.length]; g.fillRect(0, i * rowH, cw, rowH);
      g.fillStyle = '#fff'; g.font = 'bold 44px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(n, cw / 2, i * rowH + rowH / 2 + 2);
    });
    const pos = [], uv = [], idx = [];
    M.signs.forEach(s => {
      const r = names.indexOf(s.label), v0 = 1 - (r + 1) / names.length, v1 = 1 - r / names.length;
      const hw = s.w / 2, y0 = s.y - 0.6, y1 = s.y + 0.6, o = 0.08;
      let P;
      if(s.face === 'n') P = [[s.x + hw, y0, s.z - o], [s.x - hw, y0, s.z - o], [s.x - hw, y1, s.z - o], [s.x + hw, y1, s.z - o]];
      else if(s.face === 's') P = [[s.x - hw, y0, s.z + o], [s.x + hw, y0, s.z + o], [s.x + hw, y1, s.z + o], [s.x - hw, y1, s.z + o]];
      else if(s.face === 'w') P = [[s.x - o, y0, s.z - hw], [s.x - o, y0, s.z + hw], [s.x - o, y1, s.z + hw], [s.x - o, y1, s.z - hw]];
      else P = [[s.x + o, y0, s.z + hw], [s.x + o, y0, s.z - hw], [s.x + o, y1, s.z - hw], [s.x + o, y1, s.z + hw]];
      const b = pos.length / 3;
      P.forEach(p => pos.push(...p));
      uv.push(0, v0, 1, v0, 1, v1, 0, v1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const st = tex(c);
    const mat = new THREE.MeshLambertMaterial({map: st, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0.15});
    scene.add(new THREE.Mesh(geo, mat));
    W.glow.push({m: mat, base: 0.15, night: 0.9});
  }

  /* trees */
  {
    const by = {palm: [], pv: [], orange: [], saguaro: [], pine: [], olive: []};
    M.trees.forEach(t => (by[t.k] || by.pv).push(t));
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    function inst(list, geo, mat, place){
      if(!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => { place(t, p, q, s); mt.compose(p, q, s); im.setMatrixAt(i, mt); });
      scene.add(im);
    }
    const trunk = new THREE.MeshLambertMaterial({color: '#8a6a4a'});
    inst(by.palm, new THREE.CylinderGeometry(0.22, 0.35, 1, 6).translate(0, 0.5, 0), trunk, (t, p, q, s) => { p.set(t.x, 0, t.z); q.setFromAxisAngle(up, t.x); s.set(1, 11 * t.s, 1); });
    const fr = new THREE.ConeGeometry(3.2, 1.6, 7, 1, true).translate(0, -0.6, 0);
    inst(by.palm, fr, new THREE.MeshLambertMaterial({color: '#4f7f2f', side: THREE.DoubleSide}), (t, p, q, s) => { p.set(t.x, 11 * t.s, t.z); q.setFromAxisAngle(up, t.z); s.set(t.s, t.s, t.s); });
    inst(by.pv, new THREE.CylinderGeometry(0.12, 0.2, 2, 5).translate(0, 1, 0), new THREE.MeshLambertMaterial({color: '#7f9a3a'}), (t, p, q, s) => { p.set(t.x, 0, t.z); q.identity(); s.set(1, t.s, 1); });
    inst(by.pv, new THREE.IcosahedronGeometry(2.4, 0), new THREE.MeshLambertMaterial({color: '#9bb34a', flatShading: true}), (t, p, q, s) => { p.set(t.x, 3 * t.s, t.z); q.setFromAxisAngle(up, t.x); s.set(t.s * 1.3, t.s * 0.75, t.s * 1.3); });
    inst(by.orange, new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshLambertMaterial({color: '#2f6b2a', flatShading: true}), (t, p, q, s) => { p.set(t.x, 1.7, t.z); q.identity(); s.set(t.s, t.s, t.s); });
    inst(by.pine, new THREE.ConeGeometry(2, 8, 7).translate(0, 4, 0), new THREE.MeshLambertMaterial({color: '#3f6b3a', flatShading: true}), (t, p, q, s) => { p.set(t.x, 0.5, t.z); q.identity(); s.set(t.s, t.s, t.s); });
    // saguaros: a trunk and two arms, one geometry
    const sg = new THREE.CylinderGeometry(0.35, 0.4, 5, 8).translate(0, 2.5, 0);
    const arm1 = new THREE.CylinderGeometry(0.25, 0.25, 1.8, 6).translate(0.75, 3.2, 0);
    const arm2 = new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6).translate(-0.75, 2.6, 0);
    const conn1 = new THREE.CylinderGeometry(0.22, 0.22, 0.8, 6).rotateZ(Math.PI / 2).translate(0.4, 2.4, 0);
    const conn2 = new THREE.CylinderGeometry(0.22, 0.22, 0.8, 6).rotateZ(Math.PI / 2).translate(-0.4, 2.0, 0);
    const sag = mergeGeos([sg, arm1, arm2, conn1, conn2]);
    inst(by.saguaro, sag, new THREE.MeshLambertMaterial({color: '#4c7a3c'}), (t, p, q, s) => { p.set(t.x, 0, t.z); q.setFromAxisAngle(up, t.x * 3); s.set(t.s, t.s, t.s); });
  }

  /* props: bins, bushes, light poles, bales - breakable, so they can vanish */
  {
    const kinds = {bin: [], bush: [], pole: [], bale: []};
    M.props.forEach(p => (kinds[p.k] || kinds.bush).push(p));
    const geos = {
      bin: [new THREE.CylinderGeometry(0.35, 0.3, 1.1, 8).translate(0, 0.55, 0), '#2f6b3f'],
      bush: [new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.6, 0), '#7a9a4a'],
      pole: [new THREE.CylinderGeometry(0.1, 0.14, 8, 6).translate(0, 4, 0), '#8d8d8d'],
      bale: [new THREE.BoxGeometry(1.4, 0.9, 0.9).translate(0, 0.45, 0), '#d8b45a']
    };
    const mt = new THREE.Matrix4();
    W.props = {};
    Object.keys(kinds).forEach(k => {
      const list = kinds[k]; if(!list.length) return;
      const im = new THREE.InstancedMesh(geos[k][0], new THREE.MeshLambertMaterial({color: geos[k][1], flatShading: k === 'bush'}), list.length);
      list.forEach((p, i) => { mt.makeTranslation(p.x, 0, p.z); im.setMatrixAt(i, mt); p._im = im; p._i = i; });
      scene.add(im);
      W.props[k] = im;
    });
    W.setProp = function(id, visible){
      const p = M.props[id]; if(!p || !p._im) return;
      if(visible) mt.makeTranslation(p.x, 0, p.z); else mt.makeScale(0, 0, 0);
      p._im.setMatrixAt(p._i, mt); p._im.instanceMatrix.needsUpdate = true;
    };
  }

  /* ramps: striped boards with a JUMP! sign and flashing lights, so they
     read from a long way off */
  {
    const c = canvas(128, 256), g = c.getContext('2d');
    for(let i = 0; i < 8; i++){ g.fillStyle = i % 2 ? '#1b1b1b' : '#f5c21b'; g.beginPath(); g.moveTo(0, i * 32 + 32); g.lineTo(64, i * 32); g.lineTo(128, i * 32 + 32); g.lineTo(128, i * 32 + 48); g.lineTo(64, i * 32 + 16); g.lineTo(0, i * 32 + 48); g.fill(); }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#e8501b'; g.fillRect(0, 0, 128, 256);
    const chev = tex(c);
    const pos = [], uv = [], idx = [], side = [], sidx = [];
    M.ramps.forEach(r => {
      let lo0, lo1, hi0, hi1;
      if(r.dz){
        const lo = r.s0, hi = r.s0 + r.dz * r.len;
        lo0 = [r.x0, 0.03, lo]; lo1 = [r.x1, 0.03, lo]; hi0 = [r.x0, r.h, hi]; hi1 = [r.x1, r.h, hi];
      } else {
        const lo = r.s0, hi = r.s0 + r.dx * r.len;
        lo0 = [lo, 0.03, r.z0]; lo1 = [lo, 0.03, r.z1]; hi0 = [hi, r.h, r.z0]; hi1 = [hi, r.h, r.z1];
      }
      const b = pos.length / 3;
      pos.push(...lo0, ...lo1, ...hi1, ...hi0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
      // the sides and the lip, orange
      const s0 = side.length / 3;
      const g0 = [hi0[0], 0, hi0[2]], g1 = [hi1[0], 0, hi1[2]];
      side.push(...lo0, ...hi0, ...g0, ...lo1, ...hi1, ...g1, ...hi0, ...hi1, ...g1, ...g0);
      sidx.push(s0, s0 + 1, s0 + 2, s0 + 3, s0 + 5, s0 + 4, s0 + 6, s0 + 7, s0 + 8, s0 + 6, s0 + 8, s0 + 9);
    });
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g1.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g1.setIndex(idx); g1.computeVertexNormals();
    scene.add(new THREE.Mesh(g1, new THREE.MeshLambertMaterial({map: chev, emissive: '#ffffff', emissiveMap: chev, emissiveIntensity: 0.25})));
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    g2.setIndex(sidx); g2.computeVertexNormals();
    scene.add(new THREE.Mesh(g2, new THREE.MeshLambertMaterial({color: '#e8501b', side: THREE.DoubleSide})));
    // the sign at the foot of each ramp, and two lights that blink
    const signT = labelTex('JUMP!', {bg: '#f5c21b', color: '#1b1b1b', size: 92, font: 'Arial Black, sans-serif', w: 256, h: 128});
    const signM = new THREE.MeshBasicMaterial({map: signT});
    const postM = new THREE.MeshLambertMaterial({color: '#444'});
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({color: '#ff8a1a'}), M.ramps.length * 2);
    const mt = new THREE.Matrix4();
    M.ramps.forEach((r, i) => {
      const along = r.dz ? [0, r.dz] : [r.dx, 0];
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // to the outside of the ramp, a little before it
      const px = r.dz ? cx + (r.x1 - r.x0) / 2 + 1.2 : r.s0 - along[0] * 3;
      const pz = r.dz ? r.s0 - along[1] * 3 : cz + (r.z1 - r.z0) / 2 + 1.2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15), postM); post.position.set(px, 1.7, pz); scene.add(post);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), signM); sg.position.set(px, 3.6, pz);
      sg.rotation.y = r.dz ? (r.dz > 0 ? Math.PI : 0) : (r.dx > 0 ? -Math.PI / 2 : Math.PI / 2);
      scene.add(sg);
      // the back of the board reads the right way round too
      const sg2 = sg.clone(); sg2.rotation.y += Math.PI; scene.add(sg2);
      const hx = r.dz ? cx : r.s0 + along[0] * r.len, hz = r.dz ? r.s0 + along[1] * r.len : cz;
      const ox = r.dz ? (r.x1 - r.x0) / 2 : 0, oz = r.dz ? 0 : (r.z1 - r.z0) / 2;
      mt.makeTranslation(hx - ox, r.h + 0.4, hz - oz); lights.setMatrixAt(i * 2, mt);
      mt.makeTranslation(hx + ox, r.h + 0.4, hz + oz); lights.setMatrixAt(i * 2 + 1, mt);
    });
    scene.add(lights);
    W.rampLights = lights;
  }

  /* traffic lights: a pole and a head per signalised corner */
  {
    const sig = M.lights.filter(L => L.sig);
    const n = sig.length * 2;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6).translate(0, 3, 0), new THREE.MeshLambertMaterial({color: '#5d6066'}), n);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshBasicMaterial({color: '#fff'}), n);
    const mt = new THREE.Matrix4();
    sig.forEach((L, i) => {
      const a = [L.x - L.wa / 2 - 1.5, L.z - L.wb / 2 - 1.5], b = [L.x + L.wa / 2 + 1.5, L.z + L.wb / 2 + 1.5];
      [a, b].forEach((pt, j) => {
        mt.makeTranslation(pt[0], 0, pt[1]); poles.setMatrixAt(i * 2 + j, mt);
        mt.makeTranslation(pt[0], 5.4, pt[1]); heads.setMatrixAt(i * 2 + j, mt);
      });
    });
    scene.add(poles, heads);
    W.sig = {list: sig, heads};
  }

  /* ---------------- the landmarks ---------------- */
  const T = signTextures();
  W.signTex = T;
  // Watson's: the shop, the lettering, the sign
  {
    const b = M.buildings.find(q => q.k === 'watsons');
    const c = canvas(1024, 256), g = c.getContext('2d');
    g.fillStyle = '#f5f3ee'; g.fillRect(0, 0, 1024, 256); noise(g, 1024, 256, 8);
    g.fillStyle = '#b8302c'; g.font = 'bold 74px Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText("WATSON'S", 40, 120);
    g.fillStyle = '#1d7a52'; g.font = 'italic bold 150px "Brush Script MT", "Segoe Script", cursive';
    g.fillText('Flowers', 430, 128);
    g.fillStyle = '#2f3a44'; g.fillRect(40, 196, 940, 44);
    const front = tex(c);
    const mats = [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshLambertMaterial({color: '#f5f3ee'}));
    mats[5] = new THREE.MeshLambertMaterial({map: front});   // -z face: the front on Main Street
    const shop = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.h, b.z1 - b.z0), mats);
    shop.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
    scene.add(shop);
    const sign = makeSign(T);
    sign.position.set(M.watsonsSign.x, 0, M.watsonsSign.z);
    scene.add(sign);
    W.glow.push({sign: sign});
    W.watsonsSign = sign;
    // the rose garden behind
    const rg = M.fields.find(f => f.k === 'roses');
    if(rg){
      const list = [];
      for(let z = rg.z0 + 2; z < rg.z1 - 1; z += 3) for(let x = rg.x0 + 2; x < rg.x1 - 1; x += 1.6) list.push([x, z]);
      const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({color: '#fff', flatShading: true}), list.length);
      const mt = new THREE.Matrix4(), cc = new THREE.Color();
      list.forEach(([x, z], i) => { mt.makeTranslation(x, 0.5, z); im.setMatrixAt(i, mt); im.setColorAt(i, cc.set(i % 3 ? '#3f7a32' : ['#d81b3c', '#f3a6c0', '#ffffff'][i % 9 / 3 | 0])); });
      scene.add(im);
    }
  }
  // Grandpa's: a flag, and a yard sign
  {
    const h = M.houses[M.grandpaHouse];
    if(h){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), new THREE.MeshLambertMaterial({color: '#ddd'}));
      const fx = h.porch.x + h.fdx * 3 + (h.fdz ? 5 : 0), fz = h.porch.z + h.fdz * 3 + (h.fdx ? 5 : 0);
      pole.position.set(fx, 3.5, fz); scene.add(pole);
      const fc = canvas(256, 136), g = fc.getContext('2d');
      for(let i = 0; i < 13; i++){ g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * 136 / 13, 256, 136 / 13 + 1); }
      g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 104, 73);
      g.fillStyle = '#fff'; for(let y = 0; y < 5; y++) for(let x = 0; x < 6; x++) g.fillRect(8 + x * 16, 6 + y * 14, 3, 3);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshLambertMaterial({map: tex(fc), side: THREE.DoubleSide}));
      flag.position.set(fx + 1.2, 6.2, fz); scene.add(flag);
      W.flag = flag;
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshLambertMaterial({map: labelTex("Watson's - Gilbert", {bg: '#f2a7b4', color: '#7a1f3a', size: 60}), side: THREE.DoubleSide}));
      yard.position.set(h.front.x - h.fdx * 6.5 + (h.fdz ? -4 : 0), 1.2, h.front.z - h.fdz * 6.5 + (h.fdx ? -4 : 0));
      yard.rotation.y = Math.atan2(h.fdx, h.fdz);
      scene.add(yard);
    }
  }
  // the Mesa Temple: white, terraced, a gold band
  {
    const b = M.buildings.find(q => q.k === 'temple');
    if(b){
      const white = new THREE.MeshLambertMaterial({color: '#f7f4ec'});
      const base = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 10, 2, b.z1 - b.z0 + 10), white);
      base.position.set((b.x0 + b.x1) / 2, 1, (b.z0 + b.z1) / 2); scene.add(base);
      const main = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.h, b.z1 - b.z0), white);
      main.position.set((b.x0 + b.x1) / 2, b.h / 2 + 2, (b.z0 + b.z1) / 2); scene.add(main);
      const band = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.4, 1.2, b.z1 - b.z0 + 0.4), new THREE.MeshLambertMaterial({color: '#d9b45a'}));
      band.position.set((b.x0 + b.x1) / 2, b.h + 1.4, (b.z0 + b.z1) / 2); scene.add(band);
      const top = new THREE.Mesh(new THREE.BoxGeometry((b.x1 - b.x0) * 0.6, 4, (b.z1 - b.z0) * 0.5), white);
      top.position.set((b.x0 + b.x1) / 2, b.h + 4, (b.z0 + b.z1) / 2); scene.add(top);
      for(let i = 0; i < 9; i++){
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, b.h - 2, 10), white);
        col.position.set(b.x0 + 2 + i * (b.x1 - b.x0 - 4) / 8, b.h / 2 + 1, b.z0 - 1.2); scene.add(col);
      }
    }
  }
  // the Neon Garden, downtown: where the real Watson's sign lives now
  if(M.neon){
    const sign = makeSign(T);
    sign.scale.setScalar(0.5);
    sign.position.set(M.neon.x - 14, 0, M.neon.z);
    scene.add(sign);
    W.glow.push({sign});
    const NAMES = [['MOTEL', '#ff3b6b'], ['DINER', '#3bd1ff'], ['VACANCY', '#ff9a3b'], ['COCKTAILS', '#c86bff'], ['MESA', '#7dff6b']];
    NAMES.forEach((nm, i) => {
      const t = labelTex(nm[0], {color: nm[1], size: 70, font: 'Arial Black, sans-serif', stroke: '#111', strokeW: 6, bg: '#151515'});
      const m = new THREE.MeshLambertMaterial({map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3, side: THREE.DoubleSide});
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), m);
      pl.position.set(M.neon.x - 6 + i * 5, 6.5, M.neon.z + (i % 2) * 6 - 3);
      scene.add(pl);
      W.glow.push({m, base: 0.3, night: 1.4});
    });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshLambertMaterial({map: labelTex('THE NEON GARDEN', {bg: '#222', color: '#f2c531', size: 64}), side: THREE.DoubleSide}));
    lab.position.set(M.neon.x, 2.2, M.neon.z + 8); scene.add(lab);
  }
  // the Gilbert water tower
  if(M.tower){
    const t = M.tower, grp = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({color: '#e8e4da'});
    [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 22, 8), steel);
      leg.position.set(x, 11, z); grp.add(leg);
    });
    const ct = canvas(1024, 256), g = ct.getContext('2d');
    g.fillStyle = '#efe9dc'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#2a4a7a'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GILBERT', 256, 128); g.fillText('GILBERT', 768, 128);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 7, 24), new THREE.MeshLambertMaterial({map: tex(ct)}));
    tank.position.y = 25.5; grp.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3, 24), steel);
    cap.position.y = 30.5; grp.add(cap);
    grp.position.set(t.x, 0, t.z);
    scene.add(grp);
  }
  // the Superstition Mountains, purple on the eastern horizon
  {
    const pts = [];
    let x = -1800;
    const R = M.seed;
    for(let i = 0; i <= 60; i++){
      const h = 260 + Math.abs(Math.sin(i * 0.7 + 1.3) * 300) + Math.abs(Math.sin(i * 2.3)) * 160 + (i > 20 && i < 34 ? 260 * Math.sin((i - 20) / 14 * Math.PI) : 0);
      pts.push([x, h]); x += 120;
    }
    const pos = [], idx = [];
    pts.forEach(([z, h], i) => { pos.push(0, -20, z, 0, h, z + (i % 2 ? 30 : -30)); if(i > 0){ const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mtn = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#8c6a86', fog: false, side: THREE.DoubleSide}));
    mtn.position.set(M.W + 2600, 0, M.H / 2);
    scene.add(mtn);
    W.mountains = mtn;
    // and South Mountain-ish low hills to the west
    const hills = mtn.clone(); hills.material = mtn.material.clone(); hills.scale.set(1, 0.45, 1.2); hills.position.set(-2400, 0, M.H / 2);
    scene.add(hills);
    W.hills = hills;
  }

  /* pickups: black powder kegs, ice chests, Grandpa's crate */
  {
    const keg = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), new THREE.MeshLambertMaterial({color: '#6b4524'}));
    barrel.position.y = 0.55; keg.add(barrel);
    const bandM = new THREE.MeshLambertMaterial({color: '#2a2a2a'});
    [0.2, 0.9].forEach(y => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.1, 12), bandM); b.position.y = y; keg.add(b); });
    const kl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), new THREE.MeshBasicMaterial({map: labelTex('POWDER', {bg: '#f4e6c4', color: '#a21', size: 90, font: 'Arial Black'}), side: THREE.DoubleSide}));
    kl.position.set(0, 0.6, 0.58); keg.add(kl);
    const ice = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), new THREE.MeshLambertMaterial({color: '#2f7fd0'}));
    chest.position.y = 0.4; ice.add(chest);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 0.95), new THREE.MeshLambertMaterial({color: '#f4f4f4'}));
    lid.position.y = 0.88; ice.add(lid);
    M.pickups.forEach(p => {
      let o;
      if(p.k === 'keg') o = keg.clone();
      else if(p.k === 'ice') o = ice.clone();
      else {
        o = new THREE.Group();
        const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), new THREE.MeshLambertMaterial({map: labelTex('DANGER  BLACK POWDER', {bg: '#c0281f', color: '#ffe9a0', size: 44, font: 'Arial Black'})}));
        crate.position.y = 0.8; o.add(crate);
        const bd = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.5), new THREE.MeshLambertMaterial({map: labelTex("Grandpa's canal, 1950s", {bg: '#f4e6c4', color: '#3a2a1a', size: 50}), side: THREE.DoubleSide}));
        bd.position.set(0, 3, 0); o.add(bd);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), new THREE.MeshLambertMaterial({color: '#6b4524'}));
        post.position.y = 1.2; o.add(post);
        o.scale.setScalar(1.2);
      }
      o.position.set(p.x, 0, p.z);
      // a soft glow beam so pickups read from far off
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 8, 1, true), new THREE.MeshBasicMaterial({color: p.k === 'keg' ? '#ff7a1a' : p.k === 'ice' ? '#7fd8ff' : '#ff2a2a', transparent: true, opacity: 0.18, depthWrite: false}));
      beam.position.y = 7; o.add(beam);
      scene.add(o);
      W.pickups.push({p, o});
    });
  }

  /* ---------------- sky, sun, light ---------------- */
  const hemi = new THREE.HemisphereLight('#cfe6ff', '#b38e5c', 0.9);
  const sun = new THREE.DirectionalLight('#fff3dc', 1.6);
  scene.add(hemi, sun, sun.target);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {top: {value: new THREE.Color('#3f86d6')}, bot: {value: new THREE.Color('#cfe3f0')}, sun: {value: new THREE.Vector3(0, 1, 0)}, sunC: {value: new THREE.Color('#fff2c8')}, dust: {value: 0}},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 sun; uniform vec3 sunC; uniform float dust; varying vec3 vP;' +
      'void main(){ float h = clamp(vP.y * 1.6, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.7));' +
      'float s = max(0.0, dot(vP, normalize(sun))); c += sunC * (pow(s, 600.0) * 2.5 + pow(s, 8.0) * 0.25);' +
      'c = mix(c, vec3(0.62, 0.45, 0.30), dust); gl_FragColor = vec4(c, 1.0); }'
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog('#cfe3f0', 120, 650);
  W.sky = sky; W.sun = sun; W.hemi = hemi;

  const KEYS = [
    // hour, sky top, horizon, sun colour, sun intensity, hemi sky, hemi ground
    [6, '#2b3f6b', '#f0a676', '#ffb27a', 0.6],
    [8, '#4a8fd8', '#d8e6ee', '#fff0d0', 1.4],
    [12, '#3f86d6', '#e4eef2', '#ffffff', 1.9],
    [15.5, '#4c8fd3', '#f1efe2', '#fff7e2', 2.0],
    [18, '#5b7fc0', '#f3c89a', '#ffc98a', 1.4],
    [19.3, '#4d4d8f', '#f58b6a', '#ff8a5a', 0.9],
    [20.5, '#22264a', '#c4607a', '#ff7a6a', 0.45]
  ];
  const ca = new THREE.Color(), cb = new THREE.Color();
  W.update = function(hour, dust, t, camPos){
    let i = 0;
    while(i < KEYS.length - 2 && hour > KEYS[i + 1][0]) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const f = Math.max(0, Math.min(1, (hour - A[0]) / (B[0] - A[0])));
    sky.material.uniforms.top.value.copy(ca.set(A[1])).lerp(cb.set(B[1]), f);
    sky.material.uniforms.bot.value.copy(ca.set(A[2])).lerp(cb.set(B[2]), f);
    sky.material.uniforms.sunC.value.copy(ca.set(A[3])).lerp(cb.set(B[3]), f);
    sky.material.uniforms.dust.value = dust * 0.85;
    const inten = A[4] + (B[4] - A[4]) * f;
    // the sun crosses from the Superstitions to the west
    const ang = (hour - 6) / 14 * Math.PI;
    const dir = new THREE.Vector3(Math.cos(ang) * 0.9, Math.max(0.08, Math.sin(ang)), 0.35).normalize();
    sky.material.uniforms.sun.value.copy(dir);
    sun.position.copy(camPos || new THREE.Vector3()).addScaledVector(dir, 200);
    sun.target.position.copy(camPos || new THREE.Vector3());
    sun.color.copy(sky.material.uniforms.sunC.value);
    sun.intensity = inten * (1 - dust * 0.6);
    hemi.intensity = 0.55 + inten * 0.25;
    hemi.color.copy(sky.material.uniforms.top.value).lerp(ca.set('#ffffff'), 0.5);
    const fogC = sky.material.uniforms.bot.value.clone().lerp(ca.set('#a77c52'), dust * 0.9);
    scene.fog.color.copy(fogC);
    scene.fog.near = 140 - dust * 120;
    scene.fog.far = 700 - dust * 560;
    W.mountains.material.color.copy(ca.set('#8c6a86')).lerp(fogC, 0.45 + dust * 0.5);
    W.hills.material.color.copy(W.mountains.material.color);
    sky.position.copy(camPos || sky.position);
    // neon comes on as the sun goes down
    const night = Math.max(0, Math.min(1, (hour - 17.5) / 2)) + dust * 0.5;
    const flick = 0.92 + 0.08 * Math.sin(t * 23) * Math.sin(t * 7.1);
    W.glow.forEach(g => {
      if(g.sign) g.sign.userData.glow.forEach(m => { m.emissiveIntensity = (0.25 + night * 1.1) * flick; });
      else g.m.emissiveIntensity = g.base + (g.night - g.base) * night;
    });
    if(W.flag) W.flag.rotation.y = Math.sin(t * 2) * 0.25;
    if(W.rampLights) W.rampLights.material.color.set(Math.floor(t * 3) % 2 ? '#ff8a1a' : '#5a2a00');
  };
  W.updateLights = function(S){
    if(!S) return;
    const mt = new THREE.Matrix4(), c = new THREE.Color();
    W.sig.list.forEach((L, i) => {
      const tt = (S.t + (L.off || 0)) % 16;
      const ns = tt < 7, ew = tt >= 8 && tt < 15;
      W.sig.heads.setColorAt(i * 2, c.set(ns ? '#36e06a' : (tt < 8 && tt >= 7) || tt >= 15 ? '#ffb21a' : '#ff3030'));
      W.sig.heads.setColorAt(i * 2 + 1, c.set(ew ? '#36e06a' : '#ff3030'));
    });
    if(W.sig.heads.instanceColor) W.sig.heads.instanceColor.needsUpdate = true;
  };
  W.updatePickups = function(S, t){
    W.pickups.forEach(({p, o}) => {
      const hidden = S && (((S.pickupT[p.id] || 0) > S.t) || (p.k === 'boom' && S.boomUsed));
      o.visible = !hidden;
      if(p.k !== 'boom'){ o.rotation.y = t * 1.5 + p.id; o.position.y = 0.3 + Math.sin(t * 3 + p.id) * 0.2; }
    });
  };
  return W;
}

export function mergeGeos(list){
  let n = 0, ni = 0;
  list.forEach(g => { g = g.index ? g : g; n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  list.forEach(g => {
    pos.set(g.attributes.position.array, o * 3);
    if(g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if(g.index) for(let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o;
    else for(let i = 0; i < g.attributes.position.count; i++) idx[oi++] = i + o;
    o += g.attributes.position.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export {labelTex, canvas, tex, signTextures};
