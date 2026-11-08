/* Watson's Flowers - driving, on the driver's own phone.

   The phone runs its own van with the same physics as the TV (sim.js's
   WSim.local / localStep), so the steering never waits on the wifi. It
   tells the TV where the van is about 30 times a second, and what it hit;
   the TV tells it about the traffic, the other vans, the goons, the
   bouquets and the clock, and it draws all of that around the van with
   the chase camera.

   start({canvas, hud, send, norender}) -> {input(IN), world(w), drv(d), fx(f), stop()} */
import * as THREE from './lib/three.module.min.js';
import {buildWorld} from './world.js';
import {createView} from './view.js';

const SIM = window.WSim;

export function start(opts){
  const M = WMap.build(WGEO, 1927);
  const L = SIM.local(M);
  let v = null, myI = -1, phase = 'lobby', srvT = 0, clk = 8, dust = 0, gust = {x: 0, z: 0}, hol = 'thanksgiving';
  const carMap = new Map();          // id -> car, kept between updates so near-misses count once
  let others = [], goons = [], pickupsOff = new Set(), route = null, routeT = 0, tgtKey = '';
  let lastSend = 0, info = null;

  /* ---- drawing ---- */
  let renderer = null, scene = null, world = null, V = null, cam = null;
  if(!opts.norender){
    renderer = new THREE.WebGLRenderer({canvas: opts.canvas, antialias: false, powerPreference: 'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    world = buildWorld(scene, M);
    V = createView(scene, M, {petals: 2500});
    cam = new THREE.PerspectiveCamera(68, 1, 0.8, 6000);
  }

  function resetVan(d){
    myI = d.i;
    v = SIM.localVan(L, d.x, d.z, d.h);
    v.i = d.i; v.ghost = 1.5; v.boost = d.boost != null ? d.boost : 0.35;
    if(V){ V.dropAll(); V.van(0, d.color, ''); }
    tgtKey = ''; route = null;
  }

  /* ---- the clock: physics at 60 Hz ---- */
  let last = performance.now(), acc = 0;
  const physics = setInterval(() => {
    const now = performance.now();
    // the first second and a half of a crash plays in slow motion (on this phone only)
    const slow = v && v.crash && v.crash.t < 1.4 ? 0.35 : 1;
    acc += Math.min(0.25, (now - last) / 1000) * slow; last = now;
    while(acc >= SIM.DT){
      acc -= SIM.DT;
      if(!v) continue;
      updateCars(SIM.DT);
      if(phase !== 'day'){ v.vx = v.vz = 0; v.gas = v.brk = v.bst = 0; continue; }
      v.px = v.x; v.pz = v.z; v.py = v.y; v.ph = v.h;
      SIM.localStep(L);
      L.ev.forEach(onLocal);
    }
    if(v && phase === 'day' && now - lastSend > 33){
      lastSend = now;
      opts.send({t: 'vs', a: SIM.packVan(v)});
    }
  }, 1000 / 60);

  function snd(k, v){ if(window.WSound) WSound.fx(k, v); }
  function onLocal(e){
    // things the TV needs to know, and things to see right here
    if(e.k === 'wall'){
      opts.send({t: 've', e: {k: 'wall', b: e.b}});
      if(V){ V.event(e); world.setWall(e.b, false); }
      snd('wall'); buzz(30);
      return;
    }
    if(e.k === 'dent'){ snd('dent'); if(V) V.event(e); opts.hud.flash(e.dmg >= 0.75 ? 'The van is in bad shape!' : 'Ouch - a dent', '#ffb23a'); buzz(40); return; }
    if(e.k === 'crash'){
      snd('crash', e.imp);
      opts.send({t: 've', e: {k: 'crash', cause: e.cause, imp: Math.round(e.imp * 10) / 10, car: e.car, vx: e.vx, vz: e.vz, kaboom: e.kaboom}});
      if(V){ V.event(e); V.shake(0, 1.4); }
      opts.hud.flash('CRASH!', '#ff5a5a', true);
      buzz([60, 40, 120]);
    } else if(e.k === 'near'){
      opts.send({t: 've', e: {k: 'near', x: Math.round(e.x), z: Math.round(e.z), rel: Math.round(e.rel)}});
      snd('near');
      opts.hud.flash('NEAR MISS!', '#7fe0ff');
      buzz(25);
    } else if(e.k === 'smash'){
      opts.send({t: 've', e: {k: 'smash', p: e.p}});
      snd('smash');
      if(V){ V.event(e); world.setProp(e.p, false); }
    } else if(e.k === 'land' && !e.how){
      if(e.air > 0.55) opts.send({t: 've', e: {k: 'land', air: Math.round(e.air * 100) / 100}});
      if(e.air > 0.55) snd('land');
      if(e.air > 0.9){ opts.hud.flash(e.air.toFixed(1) + 's of air!', '#ffd23f'); if(V) V.event(e); }
    } else if(e.k === 'air'){ opts.hud.flash('AIRTIME!', '#ffd23f'); }
    else if(e.k === 'respawn'){ opts.send({t: 've', e: {k: 'respawn'}}); }
    else if(e.k === 'bump'){ if(V) V.shake(0, Math.min(1, e.imp / 12)); snd('bump', e.imp); if(e.imp > 8) buzz(20); }
    else if(e.k === 'carhit'){ if(V) V.event(e); snd('carhit', e.big > 0.6); if(e.boom) snd('boom'); }
    else if(e.k === 'carbounce' || e.k === 'thud'){ if(V) V.event(e); snd(e.k === 'thud' ? 'thud' : 'carbounce'); }
  }
  function buzz(p){ try { if(navigator.vibrate) navigator.vibrate(p); } catch(e){} }

  /* ---- what the TV says ---- */
  function updateCars(dt){
    carMap.forEach(c => {
      if(c.wreck) return;
      c.x += Math.cos(c.h) * c.v * dt; c.z += Math.sin(c.h) * c.v * dt;
    });
  }
  function world_(w){
    srvT = w.t; clk = w.clk; dust = w.dust; gust = {x: w.gx || 0, z: w.gz || 0}; phase = w.ph; hol = w.hol || hol;
    L.dust = dust; L.gust.x = gust.x; L.gust.z = gust.z;
    // traffic
    const seen = new Set();
    (w.cars || []).forEach(a => {
      const id = a[0]; seen.add(id);
      let c = carMap.get(id);
      const K = SIM.CAR_KINDS[a[5]] || SIM.CAR_KINDS[0];
      if(!c){ c = {id, nm: 0, L: K.L, W: K.W, kind: a[5], color: a[6]}; carMap.set(id, c); }
      c.x = a[1]; c.z = a[2]; c.h = a[3]; c.v = a[4];
      c.wreck = a.length > 7 ? (c.wreck || {}) : null;
      if(c.wreck){ c.wreck.y = a[7]; c.wreck.ax = a[8]; c.wreck.ay = a[9]; c.wreck.az = a[10]; c.wreck.vx = 0; c.wreck.vz = 0; }
    });
    carMap.forEach((c, id) => { if(!seen.has(id)) carMap.delete(id); });
    L.cars = [...carMap.values()];
    others = w.vans || [];
    goons = w.goons || [];
    // smashed bins and bushes everyone can see
    const br = new Set(w.br || []);
    if(world){
      Object.keys(L.broken).forEach(k => { if(!br.has(+k) && L.broken[k] > 1e8){ delete L.broken[k]; world.setProp(+k, true); } });
      br.forEach(id => { if(!L.broken[id]){ L.broken[id] = 1e9; world.setProp(id, false); } });
    } else br.forEach(id => { L.broken[id] = 1e9; });
    pickupsOff = new Set(w.pk || []);
    const bw = new Set(w.bw || []);
    Object.keys(L.wallsDown).forEach(k => { if(!bw.has(+k) && L.t - L.wallsDown[k] > -110) delete L.wallsDown[k]; });
    bw.forEach(b => { if(!L.wallsDown[b]) L.wallsDown[b] = L.t + 120; });
    if(world) world.syncWalls(new Set(Object.keys(L.wallsDown).map(Number)));
    if(v && w.tgt){ v.tgt = w.tgt; const k = w.tgt.k + w.tgt.id; if(k !== tgtKey){ tgtKey = k; routeT = 0; } }
    else if(v){ v.tgt = null; }
    (w.ev || []).forEach(e => {
      if(V){ V.holiday = hol; V.event(e); }
      if(e.k === 'smash' && world) world.setProp(e.p, false);
      if(e.k === 'toss') snd('toss');
      else if(e.k === 'crash') snd('crash', e.imp);
      else if(e.k === 'carhit') snd('carhit');
      else if(e.k === 'boom') snd('boom');
    });
  }
  function drv(d){ resetVan(d); }
  function fx(f){
    if(!v) return;
    const S2 = {powder: 'powder', boom: 'boom', ice: 'cash', goonhit: 'bonk', gooned: 'gooned', mist: 'water', load: 'load'};
    if(S2[f.k]) snd(S2[f.k]);
    if(f.k === 'land' && f.how) snd(f.how);
    if(f.k === 'powder'){ v.powder = 4; v.boost = 1; opts.hud.flash('BLACK POWDER!', '#ff7a1a', true); buzz([30, 20, 30, 20, 200]); }
    else if(f.k === 'boom'){ v.vy = 15; v.y += 0.5; v.air = 0.01; v.boost = 1; const sp = Math.hypot(v.vx, v.vz) || 1; v.vx += v.vx / sp * 8; v.vz += v.vz / sp * 8; opts.hud.flash("GRANDPA'S CANAL BLAST!", '#ff7a1a', true); buzz([30, 20, 30, 20, 300]); }
    else if(f.k === 'ice'){ v.boost = Math.min(1, v.boost + 0.2); opts.hud.flash('ICE! Fresh as a daisy', '#9fe8ff'); }
    else if(f.k === 'goonhit'){ v.boost = Math.min(1, v.boost + 0.15); opts.hud.flash(f.rec ? 'GOT IT BACK! +$5' : 'GOON DOWN! +$5', '#7dff6b'); }
    else if(f.k === 'crash' && f.lost && f.lost.length && V){ V.holiday = hol; V.event({k: 'spill', x: v.x, y: v.y, z: v.z, vx: 0, vz: 0, lost: f.lost}); opts.hud.flash(f.lost.length + (f.lost.length > 1 ? ' bouquets' : ' bouquet') + ' everywhere', '#f2a7b4'); }
    else if(f.k === 'mist') opts.hud.flash('Misters! Flowers perk up', '#9fe8ff');
    else if(f.k === 'load') opts.hud.flash('Loaded ' + f.n + (f.n > 1 ? ' bouquets' : ' bouquet'), '#f2a7b4');
    else if(f.k === 'gooned'){ opts.hud.flash('GOONED!', '#ff5a5a', true); buzz([100, 50, 100]); }
    else if(f.k === 'land' && f.how) opts.hud.flash(f.how === 'perfect' ? 'ON THE PORCH! $' + f.pay : f.how === 'miss' ? 'MISSED!' : 'Delivered! $' + f.pay, f.how === 'perfect' ? '#7dff6b' : f.how === 'miss' ? '#ff8a8a' : '#fff', f.how === 'perfect');
  }
  function input(IN){ if(v){ v.st = IN.st; v.gas = IN.gas; v.brk = IN.brk; v.bst = IN.bst; } }

  /* ---- the engine and the tyres ---- */
  let eng = null, wasBoost = false;
  function engineSound(){
    const a = window.WSound && WSound.ctx();
    if(!a || a.state !== 'running' || !v) return;
    if(!eng){
      const o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 9; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(WSound.out()); o.start(); o2.start();
      const nb = a.createBuffer(1, a.sampleRate, a.sampleRate), d = nb.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const sq = a.createBufferSource(); sq.buffer = nb; sq.loop = true;
      const sf = a.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 7;
      const sg = a.createGain(); sg.gain.value = 0; sq.connect(sf); sf.connect(sg); sg.connect(WSound.out()); sq.start();
      eng = {o, o2, f, g, sg};
    }
    const t = a.currentTime, on = phase === 'day' && !v.crash && !WSound.muted();
    const base = 40 + v.spd * 2.3 + (v.boosting ? 40 : 0);
    eng.o.frequency.setTargetAtTime(base, t, 0.04); eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    eng.f.frequency.setTargetAtTime(380 + v.spd * 28 + (v.gas ? 450 : 0), t, 0.05);
    eng.g.gain.setTargetAtTime(on ? 0.035 + (v.gas ? 0.03 : 0) + (v.boosting ? 0.03 : 0) : 0, t, 0.06);
    eng.sg.gain.setTargetAtTime(on && v.drift && v.spd > 12 ? 0.07 : 0, t, 0.04);
    if(v.boosting && !wasBoost) snd('boost');
    wasBoost = v.boosting;
  }

  /* ---- drawing, at the screen's own rate ---- */
  let frameT = performance.now(), t = 0, raf = 0;
  function frame(){
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - frameT) / 1000); frameT = now; t += dt;
    if(v && phase === 'day'){
      routeT -= dt;
      if(routeT <= 0 && v.tgt){ routeT = 1.5; const place = v.tgt.k === 'house' ? M.housePlace(v.tgt.id) : M.shopPlace(v.tgt.id); route = M.route(v.x, v.z, place); }
    }
    opts.hud.update(v, info, cam, t);
    engineSound();
    if(!renderer || !v) return;
    const W = opts.canvas.clientWidth, H = opts.canvas.clientHeight;
    if(opts.canvas.width !== Math.round(W * renderer.getPixelRatio()) || opts.canvas.height !== Math.round(H * renderer.getPixelRatio())) renderer.setSize(W, H, false);
    const a = Math.max(0, Math.min(1, acc / SIM.DT));
    const x = v.px != null ? v.px + (v.x - v.px) * a : v.x, z = v.pz != null ? v.pz + (v.z - v.pz) * a : v.z, y = v.py != null ? v.py + (v.y - v.py) * a : v.y;
    let h = v.h; if(v.ph != null){ let d = v.h - v.ph; d = Math.atan2(Math.sin(d), Math.cos(d)); h = v.ph + d * a; }
    const me = {x, y, z, h, crash: v.crash, boosting: v.boosting, powder: v.powder > 0, drift: v.drift, spd: v.spd, ghost: v.ghost > 0, yaw: v.yaw, air: v.air > 0.3, vy: v.vy, vx: v.vx, vz: v.vz, dmg: v.dmg};
    V.placeVan(0, me, dt, t);
    // the other vans
    others.forEach(o => {
      const k = o[0] + 1;
      V.van(k, SIM.VAN_COLORS[o[5] % SIM.VAN_COLORS.length], o[6] || '');
      V.placeVan(k, {x: o[1], z: o[2], y: o[3], h: o[4], crash: o.length > 8 ? {ax: o[7], ay: o[8], az: o[9], h: o[4]} : null, spd: 10}, dt, t);
    });
    V.vans.forEach((ob, k) => { if(ob && k > 0 && !others.some(o => o[0] + 1 === k)) V.dropVan(k); });
    V.traffic(L.cars);
    V.goons(goons.map(g => ({x: g[0], y: g[1], z: g[2], h: g[3], st: g[4], spin: g[5], color: g[6], carry: g[7]})), t);
    const tp = v.tgt ? SIM.targetPoint(L, v) : null;
    V.target(0, phase === 'day' ? tp : null, t);
    V.route(0, phase === 'day' ? route : null);
    V.tick(dt, {x: gust.x * dust * 2, z: gust.z * dust * 2});
    world.updateLights({t: srvT});
    world.updatePickups({pickupT: new Proxy({}, {get: (o, k) => pickupsOff.has(+k) ? 1e9 : 0}), t: 0, boomUsed: pickupsOff.has(-1)}, t);
    V.chase(cam, me, 0, dt, W / Math.max(1, H), opts.view ? opts.view() : 'chase');
    world.update(clk, dust, t, cam.position);
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  return {
    input, world: world_, drv, fx,
    info: i => { info = i; },
    get van(){ return v; }, get index(){ return myI; },
    stop(){ clearInterval(physics); cancelAnimationFrame(raf); if(renderer) renderer.dispose(); }
  };
}
