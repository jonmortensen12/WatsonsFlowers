/* Watson's Flowers - the simulation, headless.

   Runs whole days with computer players and checks the numbers stay
   sensible: the van is quick and turns, crashes happen and recover, the
   computer van can drive the town and deliver, the goons come out at
   three, the haboob at six, the parade runs, a day with one van and a day
   with six both work, and a well-made, well-thrown bouquet pays.

   node simcheck.mjs            all of it (a minute or two)
   node simcheck.mjs --quick    one short day */
import fs from 'fs';
globalThis.window = globalThis;
for(const f of ['web/geo.js', 'web/ridge.js', 'web/map.js', 'web/sim.js']) (0, eval)(fs.readFileSync(f, 'utf8'));
const {WMap, WSim, WGEO} = globalThis;
const quick = process.argv.includes('--quick');
let fails = 0;
function ok(cond, msg){ console.log((cond ? '  ok   ' : '  FAIL ') + msg); if(!cond) fails++; }

const M = WMap.build(WGEO, 1927);
console.log('map', JSON.stringify(M.stats));
ok(M.shops.length === 2, "two shops: Watson's on Main and Grandpa's in Gilbert");
ok(M.houses[M.grandpaHouse].addr === '122 E Palo Verde Street', "Grandpa's address comes out right: " + M.houses[M.grandpaHouse].addr);
ok(M.houses.length > 1000, M.houses.length + ' houses to deliver to');
ok(M.ramps.length > 20, M.ramps.length + ' canal jumps');
ok(M.pickups.some(p => p.k === 'boom'), "Grandpa's black powder is on the Consolidated Canal");

const baseline = M.lines.find(l => l.axis === 'ew' && /Baseline/.test(l.names[0].name));
function testVan(seed){
  const S = WSim.create(M, {seed});
  WSim.addVan(S, 'me', 'Test');
  WSim.start(S);
  for(let i = 0; i < 200; i++) WSim.step(S);
  return S;
}
function place(v, x, z, h, sp){ v.x = x; v.z = z; v.h = h; v.vx = Math.cos(h) * sp; v.vz = Math.sin(h) * sp; v.y = 0; v.vy = 0; v.yaw = 0; v.drift = 0; }

/* the van: quick, turns, stops */
{
  const S = testVan(1), v = S.vans[0];
  S.cars.length = 0; S.opts.noTraffic = true;
  place(v, 1250, baseline.p + 3, 0, 0); v.ghost = 99;
  let t60 = null;
  for(let i = 0; i < 60 * 8; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 0, gas: 1}); WSim.step(S); if(t60 == null && v.spd > 26.8) t60 = i / 60; }
  ok(t60 != null && t60 < 2.8, '0-60 mph in ' + (t60 && t60.toFixed(2)) + ' s');
  const top = v.spd;
  ok(v.spd > 40 && v.spd < 48, 'top speed ' + (v.spd * 2.237).toFixed(0) + ' mph');
  for(let i = 0; i < 60 * 2; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 0, gas: 1, bst: 1}); WSim.step(S); }
  ok(v.spd > top + 2, 'boost ' + (v.spd * 2.237).toFixed(0) + ' mph');
  let stopT = 0;
  while(v.spd > 1 && stopT < 600){ S.cars.length = 0; WSim.input(S, 0, {st: 0, brk: 1}); WSim.step(S); stopT++; }
  ok(stopT / 60 < 2.4, 'stops from boost in ' + (stopT / 60).toFixed(2) + ' s');
  place(v, 1250, baseline.p + 3, 0, 13.4);
  let n = 0;
  while(v.h < Math.PI / 2 && n < 600){ S.cars.length = 0; WSim.input(S, 0, {st: 1, gas: 1}); WSim.step(S); n++; }
  ok(n / 60 < 1.0, 'a quarter turn at 30 mph in ' + (n / 60).toFixed(2) + ' s');
  place(v, 1250, baseline.p + 3, 0, 35); v.boost = 0;
  for(let i = 0; i < 6; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 1, gas: 1, brk: 1}); WSim.step(S); }
  for(let i = 0; i < 60; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 0.8, gas: 1}); WSim.step(S); }
  ok(v.boost > 0.08, 'a one-second drift fills ' + Math.round(v.boost * 100) + '% boost');
}

/* a crash, and back on the road */
{
  const S = testVan(2), v = S.vans[0];
  const h = M.houses.find(q => q.side === 'n' && M.canalDist(q.x, q.z) > 40);
  place(v, h.x, h.z - 9, Math.PI / 2, 32); v.ghost = 0;   // in the back yard, past the block wall
  let crashed = false, respawned = false;
  for(let i = 0; i < 60 * 5; i++){
    WSim.input(S, 0, {st: 0, gas: 1}); WSim.step(S);
    if(S.ev.some(e => e.k === 'crash')) crashed = true;
    if(S.ev.some(e => e.k === 'respawn')) respawned = true;
  }
  ok(crashed, 'driving into a house at 72 mph is a crash');
  ok(respawned && !v.crash, 'and the van comes back on a road');
}

/* a block wall goes over, and a gentle bump only dents */
{
  const S = testVan(3), v = S.vans[0];
  const w = M.walls.find(b => (b.x1 - b.x0) > (b.z1 - b.z0) && M.canalDist(b.x0, b.z0) > 40);
  const cx = (w.x0 + w.x1) / 2;
  place(v, cx, w.z0 - 12, Math.PI / 2, 20); v.ghost = 0; v.dmg = 0;
  let down = false, crashed = false;
  for(let i = 0; i < 60 && !down; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 0}); WSim.step(S); if(S.ev.some(e => e.k === 'wall')) down = true; if(S.ev.some(e => e.k === 'crash')) crashed = true; }
  ok(down && !crashed && v.spd < 18 && v.dmg > 0, 'a block wall goes over at 45 mph: no crash, slower (' + (v.spd * 2.237).toFixed(0) + ' mph), dented ' + Math.round(v.dmg * 100) + '%');
  const h = M.houses.find(q => q.side === 'n' && M.canalDist(q.x, q.z) > 40);
  place(v, h.x, h.z - 9, Math.PI / 2, 12); v.ghost = 0; v.dmg = 0; crashed = false;
  for(let i = 0; i < 90; i++){ S.cars.length = 0; WSim.input(S, 0, {st: 0}); WSim.step(S); if(S.ev.some(e => e.k === 'crash')) crashed = true; }
  ok(!crashed && v.dmg > 0.05, 'a house at 27 mph dents the van (' + Math.round(v.dmg * 100) + '%) but is not a crash');
}

/* a canal jump: up the ramp at speed and over */
{
  const S = testVan(4), v = S.vans[0];
  const r = M.ramps.find(q => q.dz !== 0);
  const lat = (r.x0 + r.x1) / 2;
  place(v, lat, r.s0 - r.dz * 12, r.dz > 0 ? Math.PI / 2 : -Math.PI / 2, 30); v.ghost = 99;
  let maxAir = 0, wet = false;
  for(let i = 0; i < 60 * 3; i++){
    S.cars.length = 0;
    WSim.input(S, 0, {st: 0, gas: 1}); WSim.step(S);
    maxAir = Math.max(maxAir, v.air);
    if(S.ev.some(e => e.k === 'crash' && e.cause === 'canal')) wet = true;
  }
  ok(maxAir > 0.6 && !wet, 'a ramp at 67 mph jumps the canal: ' + maxAir.toFixed(2) + ' s of air');
}

/* a phone drives its own copy; the TV takes its word for where it is */
{
  const S = WSim.create(M, {seed: 11});
  WSim.addVan(S, 'phone', 'Dad');
  WSim.setOwner(S, 0, 'phone', 'Dad', true);
  WSim.start(S);
  for(let i = 0; i < 200; i++) WSim.step(S);
  const o = S.orders.find(x => x.kind === 'del') || (() => { for(let i = 0; i < 2000; i++){ WSim.step(S); const q = S.orders.find(x => x.kind === 'del'); if(q) return q; } })();
  const tv = S.vans[0];
  o.state = 'van'; o.van = 0; tv.cargo.push(o.id);
  const L = WSim.local(M);
  const h = M.houses.find(q => q.side === 'n' && M.canalDist(q.x, q.z) > 40);
  const v = WSim.localVan(L, h.x, h.z - 9, Math.PI / 2);   // in the back yard, past the wall
  v.ghost = 0; v.vz = 32;
  let crashEv = null;
  for(let i = 0; i < 60 * 3 && !crashEv; i++){
    v.gas = 1; WSim.localStep(L);
    WSim.remoteState(S, 0, WSim.packVan(v)); WSim.step(S);
    crashEv = L.ev.find(e => e.k === 'crash');
  }
  ok(crashEv && !crashEv.lost.length, "the phone's copy crashes into the house, and leaves the bouquets to the TV");
  ok(Math.hypot(tv.x - v.x, tv.z - v.z) < 0.01, 'the TV van is where the phone says');
  WSim.remoteEvent(S, 0, {k: 'crash', cause: crashEv.cause, imp: crashEv.imp});
  WSim.step(S);
  ok(tv.cargo.length === 0 && S.ev.some(e => e.k === 'crash' && e.lost.length === 1), 'the TV spills the cargo when the phone says it crashed');
  for(let i = 0; i < 60 * 4; i++){ WSim.localStep(L); WSim.remoteState(S, 0, WSim.packVan(v)); if(L.ev.some(e => e.k === 'respawn')) WSim.remoteEvent(S, 0, {k: 'respawn'}); WSim.step(S); }
  ok(!v.crash && !tv.crash, 'both come back on the road');
}

/* whole days with computer vans */
function day(nVans, opts = {}){
  const S = WSim.create(opts.M || M, {seed: opts.seed || 3, holiday: opts.holiday || 'thanksgiving', dayLen: opts.dayLen || WSim.DAY_LEN});
  for(let i = 0; i < nVans; i++) WSim.addVan(S, null, 'Computer ' + (i + 1));
  Object.assign(S.roles, opts.roles || {});
  WSim.start(S);
  const seen = {};
  let steps = 0, minStock = 99, goonsAt = null, dustAt = null, tStart = Date.now();
  while(S.ph !== 'end' && steps < 60 * 900){
    WSim.step(S); steps++;
    S.ev.forEach(e => { seen[e.k] = (seen[e.k] || 0) + 1; if(e.k === 'goons' && goonsAt == null) goonsAt = S.clock; if(e.k === 'haboob' && dustAt == null) dustAt = S.clock; });
    minStock = Math.min(minStock, ...S.stock);
  }
  return {S, seen, ms: Date.now() - tStart, minStock, goonsAt, dustAt};
}

const runs = quick ? [[1, {dayLen: 260}]] : [[1, {}], [3, {}], [6, {}]];
for(const [n, o] of runs){
  const r = day(n, o);
  const S = r.S, res = S.results;
  console.log(`day with ${n} computer van(s): $${res.money}, ${res.delivered} delivered (${res.perfect} perfect), ${res.crashes} crashes, ${res.cancelled} cancelled, ${res.missed} missed, ${res.goons} goons hit, ${res.stolen} stolen, rep ${res.rep.toFixed(1)}, ${(r.ms / 1000).toFixed(1)} s to run`);
  console.log('   events', JSON.stringify(r.seen));
  ok(S.ph === 'end', 'the day ends');
  const want = o.dayLen ? 1 : [0, 4, 10, 18][Math.min(3, n)] || 18;
  // one day is one roll of the dice: with more than one van, judge the average of three
  const got = n > 1 && !o.dayLen ? Math.round([3, 5, 7].map(sd => sd === 3 ? res.delivered : day(n, Object.assign({}, o, {seed: sd})).S.results.delivered).reduce((a, b) => a + b) / 3) : res.delivered;
  ok(got >= want, `${n} van(s) deliver at least ${want}${n > 1 && !o.dayLen ? ' (average of three days)' : ''}: ${got}`);
  if(!o.dayLen){
    ok(r.goonsAt != null && r.goonsAt >= 15 && r.goonsAt < 16.5, 'the goons are out after school: ' + (r.goonsAt && r.goonsAt.toFixed(2)));
    ok(r.dustAt != null && r.dustAt >= 18, 'the haboob comes at six: ' + (r.dustAt && r.dustAt.toFixed(2)));
    ok((r.seen.near || 0) + (r.seen.bump || 0) + (r.seen.crash || 0) > 0, 'traffic is in the way sometimes');
    ok(r.ms < S.dayLen * 1000 / 4, 'runs at least 4x faster than real time');
  }
  ok(r.minStock >= 0, 'stock never goes negative (lowest ' + r.minStock + ')');
}

/* the parade */
{
  const S = WSim.create(M, {seed: 5, dayLen: 30});
  WSim.addVan(S, null, 'Computer');
  WSim.start(S);
  while(S.ph !== 'end') WSim.step(S);
  WSim.startParade(S);
  let hits = 0, n = 0;
  for(let i = 0; i < 60 * 45 && S.ph === 'parade'; i++){
    if(i % 30 === 0){ n++; WSim.act(S, 'kid', 'Kid', {a: 'ptoss', ang: (n % 2 ? 1 : -1) * Math.PI / 2, pow: 0.4}); }
    WSim.step(S);
    S.ev.forEach(e => { if(e.k === 'pland' && e.hit) hits++; });
  }
  ok(S.ph === 'results', 'the parade ends in the results');
  ok(hits > 20, 'flowers thrown sideways at the right strength reach the crowd: ' + hits + ' of ' + n);
}

/* an arranger and a tosser: a perfect bouquet thrown well pays */
{
  const S = WSim.create(M, {seed: 9});
  WSim.addVan(S, null, 'Computer');
  S.roles.arr = 2;
  WSim.start(S);
  let o = null;
  for(let i = 0; i < 60 * 30 && !o; i++){ WSim.step(S); o = S.orders.find(x => x.kind === 'del' && x.state === 'new'); }
  WSim.act(S, 'aunt', 'Aunt', {a: 'claim', o: o.id});
  const r = WSim.recipes(S)[o.ri];
  WSim.FLOWERS.forEach((f, i) => { for(let k = 0; k < (r.st[f.k] || 0); k++) WSim.act(S, 'aunt', 'Aunt', {a: 'stem', o: o.id, f: i, d: 1}); });
  WSim.act(S, 'aunt', 'Aunt', {a: 'wrap', o: o.id, k: r.wrap});
  WSim.act(S, 'aunt', 'Aunt', {a: 'ribbon', o: o.id, k: r.rib});
  WSim.act(S, 'aunt', 'Aunt', {a: 'done', o: o.id});
  ok(o.state === 'ready' && o.q > 1.05, 'a perfect, quick arrangement scores ' + Math.round(o.q * 100) + '%');
  const v = S.vans[0], h = M.houses[o.house];
  v.owner = 'dad';
  place(v, h.front.x, h.front.z, 0, 0);
  v.cargo = [o.id]; o.state = 'van'; o.van = 0;
  const ang = WSim.wrapA(Math.atan2(h.porch.z - v.z, h.porch.x - v.x) - v.h);
  const d = Math.hypot(h.porch.x - v.x, h.porch.z - v.z);
  WSim.act(S, 'kid', 'Kid', {a: 'toss', v: 0, ang, pow: Math.max(0.12, d / 32)});
  let land = null;
  for(let i = 0; i < 120 && !land; i++){ WSim.step(S); land = S.ev.find(e => e.k === 'land' && e.how); }
  ok(land && (land.how === 'perfect' || land.how === 'porch'), 'a well-aimed swipe lands on the porch: ' + (land && land.how) + ' $' + (land && land.pay));
  ok(S.ppl.kid && S.ppl.kid.del === 1, 'the tosser gets the credit');
}

/* Rattlesnake Ridge: the made-up town, curves and hills, built for driving */
{
  const F = WMap.town('ridge');
  console.log('\nRattlesnake Ridge', JSON.stringify(F.stats));
  ok(F.shops.length === 2, "Watson's and Grandpa's are both on the Ridge");
  ok(F.houses.length > 400, F.houses.length + ' houses to deliver to');
  ok(F.pickups.some(p => p.k === 'boom'), "Grandpa's black powder is on the river bank");
  ok(F.gilbertLine && F.mainLine, 'it has a Main Street and a Gilbert Road for the parade');
  ok(F.lines.filter(l => !l.axis).length >= 6, F.lines.filter(l => !l.axis).length + ' of its ' + F.lines.length + ' roads curve');
  const pass = F.lines.find(l => /Pass/.test(l.names[0].name)), top = Math.max(...pass.prof);
  ok(top > 35, 'Rattlesnake Pass climbs to ' + top.toFixed(0) + ' m');
  ok(F.ground(2060, 320) > 20, 'the airfield is up on the mesa: ' + F.ground(2060, 320).toFixed(0) + ' m');
  ok(F.ground(2157, 1480) < -8, 'the quarry is dug into a pit: ' + F.ground(2157, 1480).toFixed(0) + ' m');
  // the steepest a road gets, and every road joins its neighbours at one height
  let steep = 0;
  F.lines.forEach(l => { for(let k = 1; k < l.prof.length; k++){ const g = Math.abs(l.prof[k] - l.prof[k - 1]) / Math.max(0.1, l.cum[k] - l.cum[k - 1]); if(g > steep && !l.crests.length) steep = g; } });
  ok(steep < 0.22, 'no road steeper than ' + Math.round(steep * 100) + '% (crests aside)');
  let gap = 0;
  Object.values(F.G.junctions).forEach(p => { const hs = F.lines.filter(l => F.lineNear(l, p[0], p[1]).d < 1).map(l => { const n = F.lineNear(l, p[0], p[1]); return F.ground(n.x, n.z); }); gap = Math.max(gap, Math.max(...hs) - Math.min(...hs)); });
  ok(gap < 0.5, 'where roads meet they meet level (worst ' + gap.toFixed(2) + ' m)');
  const shut = F.loops.filter(l => !l.entries.length).map(l => l.name);
  ok(!shut.length, 'every neighbourhood has a road in' + (shut.length ? ' (not: ' + shut.join(', ') + ')' : ''));
  // every house can be reached from the shop
  const shop = F.shopPlace(0);
  let lost = 0;
  F.houses.forEach((h, i) => { const r = F.route(shop.front.x, shop.front.z, F.housePlace(i)); const e = r[r.length - 1]; if(Math.hypot(e.x - h.front.x, e.z - h.front.z) > 1) lost++; });
  ok(lost === 0, 'every house has a route from the shop (' + lost + ' without)');
  let endN = 0; F.nodes.forEach((nd, i) => { if(Math.hypot(nd.x - 1782, nd.z - 300) < Math.hypot(F.nodes[endN].x - 1782, F.nodes[endN].z - 300)) endN = i; });
  const r2 = F.route(shop.front.x, shop.front.z, {na: endN, nb: endN, front: {x: F.nodes[endN].x, z: F.nodes[endN].z}});
  ok(r2.length > 10, 'a route up the pass to the airfield: ' + r2.length + ' points');
  function drive(l, frac, sp, secs){
    const S = WSim.create(F, {seed: 4}); WSim.addVan(S, 'me', 'Test'); WSim.start(S);
    for(let i = 0; i < 200; i++) WSim.step(S);
    const v = S.vans[0]; S.opts.noTraffic = true;
    const p = F.linePoint(l, l.lo + (l.hi - l.lo) * frac);
    place(v, p.x, p.z, Math.atan2(p.dz, p.dx), sp); v.y = F.height(p.x, p.z); v.ghost = 0; v.boost = 0;
    let air = 0, crash = null, airs = 0, maxY = v.y, minY = v.y;
    for(let i = 0; i < 60 * secs; i++){
      S.cars.length = 0; S.goons.length = 0;
      // steer along the road
      const n = F.lineNear(l, v.x, v.z), q = F.linePoint(l, Math.min(l.hi, n.s + 25));
      const want = Math.atan2(q.z - v.z, q.x - v.x), da = WSim.wrapA(want - v.h);
      WSim.input(S, 0, {st: Math.max(-1, Math.min(1, da * 2)), gas: 1}); WSim.step(S);
      if(v.air > 0.3 && v.air - 1 / 60 <= 0.3) airs++;
      air = Math.max(air, v.air); maxY = Math.max(maxY, v.y); minY = Math.min(minY, v.y);
      const c = S.ev.find(e => e.k === 'crash'); if(c && !crash) crash = c.cause || 'crash';
      if(v.crash) break;
    }
    return {air, airs, crash, maxY, minY};
  }
  const rc = F.lines.find(l => /Rollercoaster/.test(l.names[0].name));
  const run = drive(rc, 0.02, 36, 22);
  ok(run.airs >= 3 && run.air > 0.6, 'Rollercoaster Road at 80 mph: ' + run.airs + ' crests with air, the best ' + run.air.toFixed(2) + ' s' + (run.crash ? ' (crashed: ' + run.crash + ')' : ''));
  const up = drive(pass, 0.01, 18, 25);
  ok(up.maxY - up.minY > 25 && !up.crash, 'up Rattlesnake Pass at 40 mph without crashing: climbed ' + (up.maxY - up.minY).toFixed(0) + ' m');
  function hit(r, sp, secs){
    const S = WSim.create(F, {seed: 4}); WSim.addVan(S, 'me', 'Test'); WSim.start(S);
    for(let i = 0; i < 200; i++) WSim.step(S);
    const v = S.vans[0]; S.opts.noTraffic = true;
    const h = r.dx ? (r.dx > 0 ? 0 : Math.PI) : (r.dz > 0 ? Math.PI / 2 : -Math.PI / 2);
    const lat = r.dx ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    if(r.dx) place(v, r.s0 - r.dx * 14, lat, h, sp); else place(v, lat, r.s0 - r.dz * 14, h, sp);
    v.y = F.height(v.x, v.z); v.ghost = 0; v.boost = 0;
    let air = 0, crash = null, roof = 0;
    for(let i = 0; i < 60 * (secs || 3); i++){
      S.cars.length = 0; S.goons.length = 0;
      WSim.input(S, 0, {st: 0, gas: 1}); WSim.step(S);
      air = Math.max(air, v.air);
      if(!v.air && v.y - F.ground(v.x, v.z) > 2.3) roof++;
      const c = S.ev.find(e => e.k === 'crash'); if(c && !crash) crash = c.cause || 'crash';
      if(v.crash) break;
    }
    return {air, crash, roof};
  }
  const mega = F.ramps.filter(r => r.h > 5).map(r => hit(r, 34, 5));
  ok(mega.length === 2 && mega.every(q => q.air > 1.4 && !q.crash), 'the mega ramps on the mesa: ' + mega.map(q => q.air.toFixed(2) + ' s').join(', ') + ' of air');
  const yard = F.ramps.filter(r => r.h === 2.6 && r.len === 12 && (r.dx ? r.z1 - r.z0 : r.x1 - r.x0) === 5).map(r => hit(r, 18, 4));
  ok(yard.length >= 3 && yard.filter(q => q.roof > 20).length >= yard.length * 0.8, 'up the ramps onto the container roofs: ' + yard.filter(q => q.roof > 20).length + ' of ' + yard.length);
  const all = F.ramps.map(r => hit(r, 30)), bad = all.filter(q => q.crash && q.crash !== 'canal').length;
  console.log('   every jump at 67 mph:', all.filter(q => q.air > 0.5).length, 'with real air,', bad, 'end in a crash');
  ok(bad <= F.ramps.length * 0.15, 'most jumps land somewhere you can drive (' + bad + ' of ' + F.ramps.length + ' crash)');
  // traffic on the curves
  {
    const S = WSim.create(F, {seed: 8}); WSim.addVan(S, null, 'C'); WSim.start(S);
    for(let i = 0; i < 60 * 20; i++) WSim.step(S);
    const off = S.cars.filter(c => !c.wreck && F.surf(c.x, c.z) !== 1).length;
    ok(S.cars.length > 10 && off === 0, S.cars.length + ' cars in traffic, all of them on the road (' + off + ' off it)');
  }
  // a day with three computer vans, and the parade
  const r = day(3, {M: F});
  const res = r.S.results;
  console.log(`   day with 3 computer vans: $${res.money}, ${res.delivered} delivered, ${res.crashes} crashes, ${res.cancelled} cancelled, ${(r.ms / 1000).toFixed(1)} s to run`);
  ok(r.S.ph === 'end' && res.delivered >= 10, 'three computer vans deliver on the Ridge: ' + res.delivered);
  const S = r.S;
  WSim.startParade(S);
  let hits = 0, n = 0;
  for(let i = 0; i < 60 * 45 && S.ph === 'parade'; i++){
    if(i % 30 === 0){ n++; WSim.act(S, 'kid', 'Kid', {a: 'ptoss', ang: (n % 2 ? 1 : -1) * Math.PI / 2, pow: 0.4}); }
    WSim.step(S); S.ev.forEach(e => { if(e.k === 'pland' && e.hit) hits++; });
  }
  ok(S.ph === 'results' && hits > 20, 'the parade goes down Gilbert Road on the Ridge too: ' + hits + ' of ' + n);
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
