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
for(const f of ['web/geo.js', 'web/map.js', 'web/sim.js']) (0, eval)(fs.readFileSync(f, 'utf8'));
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
  place(v, h.x, h.z - 26, Math.PI / 2, 30); v.ghost = 0;
  let crashed = false, respawned = false;
  for(let i = 0; i < 60 * 5; i++){
    WSim.input(S, 0, {st: 0, gas: 1}); WSim.step(S);
    if(S.ev.some(e => e.k === 'crash')) crashed = true;
    if(S.ev.some(e => e.k === 'respawn')) respawned = true;
  }
  ok(crashed, 'driving into a house at 67 mph is a crash');
  ok(respawned && !v.crash, 'and the van comes back on a road');
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
  const v = WSim.localVan(L, h.x, h.z - 26, Math.PI / 2);
  v.ghost = 0; v.vz = 30;
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
  const S = WSim.create(M, {seed: opts.seed || 3, holiday: opts.holiday || 'thanksgiving', dayLen: opts.dayLen || WSim.DAY_LEN});
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
  ok(res.delivered >= want, `${n} van(s) deliver at least ${want}: ${res.delivered}`);
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

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
