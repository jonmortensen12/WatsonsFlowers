/* Watson's Flowers - the simulation.

   Decides everything that happens and draws nothing. The TV runs it at a
   fixed 60 steps a second; simcheck.mjs runs it headless with computer
   players. Deterministic for a given seed and the same inputs.

   One working day at the shop, 8 a.m. to 8 p.m., squeezed into seven
   minutes: orders come in, arrangers make them, vans carry them, tossers
   land them on porches. The sun climbs and the bouquets wilt; at three the
   Gilbert Goons are out of school; at six a haboob rolls in.

   Everybody's money is the team's money. */
(function(root){
'use strict';

var DT = 1 / 60;
var DAY_LEN = 420;                 // seconds, 8:00 to 20:00
var CAP = 6;                       // bouquets a van carries
var CRASH_V = 24;                  // m/s into something solid (less than this dents the van)
var CRASH_CAR = 20;                // m/s closing on a car
var G = 22;                        // gravity, a little arcade-heavy
var MAX_VANS = 6;

var FLOWERS = [
  {k: 'rose', name: 'Roses', c: '#d81b3c', c2: '#8e0f26'},
  {k: 'sunflower', name: 'Sunflowers', c: '#f6c21c', c2: '#6b3d12'},
  {k: 'mum', name: 'Mums', c: '#e8781e', c2: '#b4510c'},
  {k: 'lily', name: 'Lilies', c: '#f7f1e3', c2: '#e9b8c8'},
  {k: 'carnation', name: 'Carnations', c: '#ef7fa6', c2: '#c9406e'},
  {k: 'daisy', name: 'Daisies', c: '#ffffff', c2: '#f4c430'},
  {k: 'greens', name: 'Greenery', c: '#5b8f3a', c2: '#3d6b26'}
];
var FI = {}; FLOWERS.forEach(function(f, i){ FI[f.k] = i; });
var WRAPS = [{k: 'kraft', name: 'Kraft', c: '#b98a57'}, {k: 'pink', name: 'Pink', c: '#f3a6c0'},
             {k: 'white', name: 'White', c: '#f4f4f0'}, {k: 'green', name: 'Green', c: '#5f9e6e'}];
var RIBBONS = [{k: 'gold', name: 'Gold', c: '#e2b33c'}, {k: 'red', name: 'Red', c: '#c8202f'},
               {k: 'pink', name: 'Pink', c: '#ff6fa6'}, {k: 'white', name: 'White', c: '#ffffff'}];

function rec(name, st, wrap, rib, base){ return {name: name, st: st, wrap: wrap, rib: rib, base: base}; }
var HOLIDAYS = {
  thanksgiving: {name: 'Thanksgiving Eve', blurb: 'Centerpieces for every table in town.', recipes: [
    rec('Thanksgiving centerpiece', {sunflower: 3, mum: 3, greens: 2}, 'kraft', 'gold', 65),
    rec('Harvest bouquet', {sunflower: 2, mum: 2, rose: 2}, 'kraft', 'red', 55),
    rec('Hostess gift', {mum: 3, daisy: 2, greens: 1}, 'green', 'gold', 45),
    rec("Grandma's roses", {rose: 6, greens: 2}, 'white', 'red', 70),
    rec('Table runner', {mum: 2, carnation: 2, greens: 3, sunflower: 1}, 'kraft', 'gold', 75),
    rec('Pumpkin pie posy', {mum: 2, daisy: 2}, 'kraft', 'white', 35)]},
  everyday: {name: 'A Day on Main Street', blurb: 'Birthdays, get-wells, sympathy sprays.', recipes: [
    rec('Birthday bunch', {daisy: 3, carnation: 2, sunflower: 1}, 'pink', 'pink', 45),
    rec('Get well soon', {sunflower: 3, daisy: 2, greens: 1}, 'green', 'gold', 50),
    rec('Sympathy spray', {lily: 4, rose: 2, greens: 2}, 'white', 'white', 80),
    rec('Anniversary roses', {rose: 6, greens: 1}, 'white', 'red', 70),
    rec('New baby', {carnation: 3, daisy: 3}, 'pink', 'white', 45),
    rec('Thank you', {carnation: 2, lily: 2, greens: 2}, 'kraft', 'gold', 50)]},
  valentines: {name: "Valentine's Day", blurb: 'Every rose in the Valley, by tonight.', recipes: [
    rec('A dozen roses', {rose: 8, greens: 2}, 'white', 'red', 90),
    rec('Sweetheart bunch', {rose: 4, carnation: 3}, 'pink', 'pink', 60),
    rec('Secret admirer', {rose: 3, lily: 2, greens: 1}, 'pink', 'red', 55),
    rec('Puppy love', {carnation: 3, daisy: 2}, 'pink', 'white', 35),
    rec('Grandpa to Grandma', {rose: 6, lily: 2}, 'white', 'gold', 85)]},
  mothers: {name: "Mother's Day", blurb: 'Every mom in Mesa and Gilbert.', recipes: [
    rec('Mom deserves it', {lily: 3, carnation: 3, greens: 1}, 'pink', 'pink', 65),
    rec('Garden basket', {daisy: 3, sunflower: 2, mum: 2}, 'kraft', 'gold', 55),
    rec('Classic roses', {rose: 6, greens: 2}, 'white', 'pink', 70),
    rec('From the grandkids', {carnation: 4, daisy: 2}, 'green', 'pink', 45),
    rec('Lily of the Valley', {lily: 5, greens: 2}, 'white', 'white', 75)]}
};
var HOLIDAY_KEYS = ['thanksgiving', 'everyday', 'valentines', 'mothers'];

var SURNAMES = ['Johnson', 'Jensen', 'Larsen', 'Peterson', 'Hansen', 'Christensen', 'Allred', 'Mortensen',
  'Quist', 'Openshaw', 'Udall', 'LeSueur', 'Pomeroy', 'Robson', 'Kimball', 'Brimhall', 'Ellsworth', 'Hibbert',
  'Crismon', 'Rogers', 'Mendoza', 'Nguyen', 'Garcia', 'Martinez', 'Lopez', 'Tanner', 'Shumway', 'Stapley',
  'Dana', 'Phelps', 'Sirrine', 'Mesa', 'Gilbert', 'Lund', 'Wright', 'Young', 'Hunsaker', 'Flake', 'Romney'];
var TITLES = ['Sister', 'Brother', 'Mrs.', 'Mr.', 'Dr.', 'Grandma', 'Bishop', 'Coach', 'Ms.'];

var GOON_NAMES = ['Brayden', 'Jaxon', 'Kaden', 'Tanner', 'Ryker', 'Colt', 'Maverick', 'Bodie', 'Hayden', 'Kash', 'Paxton', 'Bentley'];

/* ---------------- setup ---------------- */
function create(M, opts){
  opts = opts || {};
  var S = {
    M: M, opts: opts, R: root.WMap.rng((opts.seed || 1) * 7919 + 13),
    holiday: HOLIDAYS[opts.holiday] ? opts.holiday : 'thanksgiving',
    dayLen: opts.dayLen || DAY_LEN,
    ph: 'lobby', t: 0, dt: 0, clock: 8, count: 0, paused: false,
    vans: [], cars: [], goons: [], orders: [], shots: [], pings: [], wreckId: 0, wallsDown: {}, gardenN: 12,
    stock: FLOWERS.map(function(){ return 16; }),
    garden: [], broken: {}, pickupT: {}, boomUsed: false,
    money: 0, rep: 3, delivered: 0, perfect: 0, crashes: 0, roses: 0, cheers: 0,
    damage: 0, walkins: 0, missed: 0, cancelled: 0, goonsHit: 0, stolen: 0,
    ppl: {}, roles: {arr: 0, grow: 0, disp: 0, cart: 0},
    ev: [], q: [], nextId: 1, carId: 1, goonId: 1,
    sigT: 0, dust: 0, gust: {t: 0, x: 0, z: 0}, rushT: 40,
    compArrT: 4, wholesaleT: 0, orderT: 2, walkT: 0, spawnCarT: 0,
    parade: null, results: null, best: {crash: null, air: null, drift: null}
  };
  setGarden(S, 12);
  M.lights.forEach(function(L, i){ L.off = ((i * 7919) % 16); });
  return S;
}

function emit(S, e){ S.q.push(e); }

function person(S, id, name){
  if(id == null) return null;
  var p = S.ppl[id];
  if(!p) p = S.ppl[id] = {id: id, name: name || 'Someone', del: 0, perfect: 0, money: 0, arranged: 0, q: 0,
    harvested: 0, watered: 0, roses: 0, crashes: 0, near: 0, goons: 0, air: 0, top: 0, drift: 0, cheers: 0,
    tosses: 0, miss: 0, assigned: 0, dist: 0, walkins: 0};
  if(name) p.name = name;
  return p;
}

/* ---------------- vans ---------------- */
var VAN_COLORS = ['#ff5fa2', '#3fc6ff', '#ffd23f', '#7bdc5a', '#b58cff', '#ff8a3d'];
function addVan(S, owner, name){
  if(S.vans.length >= MAX_VANS) return -1;
  var M = S.M, i = S.vans.length;
  var sh = M.shops[i % 2 === 0 ? 0 : M.shops.length - 1];
  var spot = startSpot(S, sh, i);
  var v = {i: i, owner: owner || null, name: name || 'Van ' + (i + 1), color: VAN_COLORS[i % VAN_COLORS.length],
    x: spot.x, z: spot.z, y: 0, vy: 0, h: spot.h, vx: 0, vz: 0, yaw: 0, g: 0,
    st: 0, gas: 0, brk: 0, bst: 0, boost: 0.35, boosting: false, drift: 0, driftT: 0, powder: 0,
    air: 0, ghost: 1.5, crash: null, cargo: [], tgt: null, route: null, wp: 0, routeT: 0,
    prio: null, ai: {stuck: 0, rev: 0, tossT: 0, patience: 0, hold: 0}, spd: 0, street: '', nmT: 0,
    stats: {del: 0, perfect: 0, crashes: 0, near: 0, air: 0, top: 0, drift: 0, goons: 0, dist: 0, money: 0, boosts: 0},
    msg: null, lastToss: 0, mist: 0, dmg: 0};
  S.vans.push(v);
  return i;
}
function startSpot(S, sh, i){
  if(sh.key === 'watsons') return {x: sh.x - 18 + (i % 3) * 12, z: sh.z + 2, h: 0};
  var h = S.M.houses[sh.house];
  return {x: sh.front.x + (i % 3) * 8 - 8, z: sh.front.z, h: Math.abs(h.fdx) > 0 ? Math.PI / 2 : 0};
}
function setOwner(S, i, owner, name, remote){
  var v = S.vans[i]; if(!v) return;
  v.owner = owner || null;
  v.remote = !!(owner && remote);
  if(!v.remote && v.crash && v.crash.remote) v.crash = null;
  if(name) v.name = name;
  v.st = v.gas = v.brk = v.bst = 0;
}
function input(S, i, inp){
  var v = S.vans[i]; if(!v || !inp) return;
  v.st = Math.max(-1, Math.min(1, +inp.st || 0));
  v.gas = inp.gas ? 1 : 0; v.brk = inp.brk ? 1 : 0; v.bst = inp.bst ? 1 : 0;
}

/* ---------------- the day ---------------- */
function start(S, holiday){
  if(holiday && HOLIDAYS[holiday]) S.holiday = holiday;
  S.ph = 'count'; S.count = 3; S.t = 0; S.clock = 8;
  if(!S.vans.length) addVan(S, null, 'Computer');
  emit(S, {k: 'count', n: 3});
}

function hourAt(S){ return 8 + 12 * Math.min(1, S.t / S.dayLen); }
function tempAt(h){
  if(h <= 15.5) return 72 + 45 * Math.sin(Math.max(0, (h - 8) / 7.5) * Math.PI / 2);
  return 117 - (h - 15.5) / 4.5 * 17;
}
function heat01(S){ return Math.max(0, Math.min(1, (tempAt(S.clock) - 70) / 47)); }

function recipes(S){ return HOLIDAYS[S.holiday].recipes; }

function newOrder(S, kind){
  var R = S.R, M = S.M, rs = recipes(S);
  var ri = Math.floor(R() * rs.length);
  var o = {id: S.nextId++, kind: kind, ri: ri, state: 'new', born: S.t, by: null, arr: null,
    q: 0, fresh: 1, van: -1, pref: -1, prio: false,
    who: TITLES[Math.floor(R() * TITLES.length)] + ' ' + SURNAMES[Math.floor(R() * SURNAMES.length)]};
  if(kind === 'del'){
    // mostly near one of the two shops
    var sh = M.shops[R() < 0.55 ? 0 : M.shops.length - 1];
    var h = null, reach = R() < 0.8 ? 650 : 1400;
    for(var tries = 0; tries < 60; tries++){
      var c = M.houses[Math.floor(R() * M.houses.length)];
      if(c.grandpa) continue;
      var d = Math.hypot(c.x - sh.x, c.z - sh.z);
      if(d < reach || tries > 50){ h = c; break; }
    }
    o.house = h.id;
    o.patience = 230;
    o.value = rs[ri].base;
  } else {
    o.house = -1;
    o.patience = 55;
    o.value = Math.round(rs[ri].base * 0.5);
  }
  S.orders.push(o);
  emit(S, {k: 'order', id: o.id, kind: kind});
  return o;
}

function activeDel(S){ return S.orders.filter(function(o){ return o.kind === 'del' && (o.state === 'new' || o.state === 'arr' || o.state === 'ready' || o.state === 'van' || o.state === 'air' || o.state === 'stolen'); }).length; }

function orderTick(S){
  var nv = S.vans.length;
  // delivery orders, paced to the vans
  var shape = S.clock < 10 ? 0.8 : S.clock < 15 ? 1.1 : S.clock < 18.5 ? 1.25 : 0.9;
  var rate = (0.02 + 0.034 * nv) * shape;
  S.orderT -= DT * rate * 10;
  if(S.orderT <= 0 && activeDel(S) < 5 + 6 * nv && S.clock < 19.4){
    S.orderT = 10 * (0.5 + S.R());
    newOrder(S, 'del');
  }
  // a rush: three orders at once ("the ward Relief Society needs centerpieces")
  S.rushT -= DT;
  if(S.rushT <= 0 && S.clock < 18.5){
    S.rushT = 70 + S.R() * 50;
    var n = 2 + Math.min(3, nv);
    for(var k = 0; k < n; k++) newOrder(S, 'del');
    emit(S, {k: 'rush', n: n});
  }
  // walk-ins keep the human arrangers busy
  var walk = S.orders.filter(function(o){ return o.kind === 'walk' && (o.state === 'new' || o.state === 'arr'); }).length;
  S.walkT -= DT;
  if(S.roles.arr > 0 && walk < Math.ceil(S.roles.arr * 0.75) && S.walkT <= 0 && S.clock < 19.7){
    S.walkT = 5 + S.R() * 5;
    newOrder(S, 'walk');
  }
  // patience
  S.orders.forEach(function(o){
    if(o.state === 'done' || o.state === 'lost') return;
    if(o.state === 'air') return;
    if(S.t - o.born > o.patience && o.state !== 'van' && o.state !== 'arr'){
      // a bouquet in a van, or on somebody's bench, always gets its chance
      cancel(S, o);
    }
  });
  // forget old finished orders
  if(S.orders.length > 160) S.orders = S.orders.filter(function(o){ return (o.state !== 'done' && o.state !== 'lost') || S.t - (o.endT || 0) < 30; });
}

function cancel(S, o){
  if(o.state === 'arr') refundArr(S, o);
  if(o.state === 'van'){ var v = S.vans[o.van]; if(v) v.cargo = v.cargo.filter(function(id){ return id !== o.id; }); }
  o.state = 'lost'; o.endT = S.t;
  if(o.kind === 'del'){ S.cancelled++; S.rep = Math.max(0, S.rep - 0.12); }
  emit(S, {k: 'cancel', id: o.id, kind: o.kind, who: o.who});
}

function orderById(S, id){
  for(var i = S.orders.length - 1; i >= 0; i--) if(S.orders[i].id === id) return S.orders[i];
  return null;
}

/* ---------------- arranging ---------------- */
function refundArr(S, o){
  if(!o.arr) return;
  for(var k in o.arr.st) S.stock[k] += o.arr.st[k];
  o.arr = null;
}
function quality(S, o){
  var r = recipes(S)[o.ri], q = 1, a = o.arr;
  FLOWERS.forEach(function(f, i){
    var want = r.st[f.k] || 0, have = a.st[i] || 0;
    q -= 0.12 * Math.abs(want - have);
  });
  if(a.wrap !== r.wrap) q -= 0.12;
  if(a.rib !== r.rib) q -= 0.12;
  var t = S.t - a.t0;
  if(t < 20) q += 0.1; else if(t < 35) q += 0.05;
  // arranged by hand, and arranged well: balanced, and not all in a heap
  var placed = (a.pos || []).filter(function(q2){ return q2[1] !== null; });
  if(placed.length >= 3){
    var mx = 0; placed.forEach(function(q2){ mx += q2[1]; }); mx /= placed.length;
    var sx = 0; placed.forEach(function(q2){ sx += (q2[1] - mx) * (q2[1] - mx); }); sx = Math.sqrt(sx / placed.length);
    if(Math.abs(mx - 0.5) < 0.12 && sx > 0.07) q += 0.06;
  }
  return Math.max(0.3, Math.min(1.2, q));
}
function finish(S, o, q, who){
  o.q = q; o.fresh = 1; o.arr = null;
  if(o.kind === 'walk'){
    var pay = Math.round(o.value * q * repMult(S));
    S.money += pay; S.walkins++;
    o.state = 'done'; o.endT = S.t;
    var p = person(S, who); if(p){ p.money += pay; p.walkins++; }
    emit(S, {k: 'walkin', id: o.id, pay: pay, who: who, q: q});
  } else {
    o.state = 'ready';
    emit(S, {k: 'ready', id: o.id, q: q, who: who});
  }
  var pp = person(S, who); if(pp){ pp.arranged++; pp.q += q; }
}
function repMult(S){ return 0.7 + 0.1 * S.rep; }

function computerArranger(S){
  var humans = S.roles.arr;
  if(humans >= 2) return;
  S.compArrT -= DT * (humans === 1 ? 0.5 : 1);
  if(S.compArrT > 0) return;
  S.compArrT = 7.5 / Math.max(1, S.vans.length * 0.65);
  var cand = S.orders.filter(function(o){ return o.kind === 'del' && o.state === 'new'; });
  if(!cand.length) return;
  cand.sort(function(a, b){ return (b.prio - a.prio) || (a.born - b.born); });
  var o = cand[0], r = recipes(S)[o.ri], q = 0.82, short = false;
  FLOWERS.forEach(function(f, i){
    var want = r.st[f.k] || 0;
    if(S.stock[i] >= want) S.stock[i] -= want; else { short = true; S.stock[i] = 0; }
  });
  if(short) q = 0.6;
  finish(S, o, q, null);
}

/* ---------------- the garden and the wholesaler ---------------- */
/* 12 plots fits one screen; 24 and 36 make a field to walk around */
var PLOT_ORDER = ['rose', 'sunflower', 'mum', 'lily', 'carnation', 'daisy', 'greens', 'rose', 'sunflower', 'daisy', 'mum', 'greens'];
function setGarden(S, n){
  n = n === 36 ? 36 : n === 24 ? 24 : 12;
  var old = S.garden || [];
  S.garden = [];
  for(var i = 0; i < n; i++){
    S.garden.push(old[i] || {i: i, f: FI[PLOT_ORDER[(i * 5 + Math.floor(i / 6)) % PLOT_ORDER.length]], water: 0.7, grow: 0.3 + (i % 3) * 0.2});
  }
  S.gardenN = n;
}
function gardenTick(S){
  var hot = heat01(S);
  if(S.roles.grow > 0){
    S.garden.forEach(function(p){
      p.water = Math.max(0, p.water - DT * (0.02 + 0.045 * hot));
      if(p.water > 0) p.grow = Math.min(1, p.grow + DT * 0.05);
      else p.grow = Math.max(0, p.grow - DT * 0.06);
    });
  }
  // the wholesale truck: steady when nobody gardens, a trickle when they do
  S.wholesaleT -= DT;
  if(S.wholesaleT <= 0){
    S.wholesaleT = S.roles.grow > 0 ? 3.2 : Math.max(0.35, 1.3 / Math.max(1, S.vans.length * 0.7));
    var lo = 0;
    for(var i = 1; i < S.stock.length; i++) if(S.stock[i] < S.stock[lo]) lo = i;
    if(S.stock[lo] < 30) S.stock[lo]++;
  }
}

/* ---------------- actions from phones ---------------- */
function act(S, who, name, a){
  if(!a || !a.a) return;
  var p = person(S, who, name), o;
  var day = S.ph === 'day';
  switch(a.a){
    case 'claim':
      if(!day) return;
      o = orderById(S, a.o);
      if(!o || o.state !== 'new') return;
      // one at a time
      S.orders.forEach(function(x){ if(x.state === 'arr' && x.by === who){ refundArr(S, x); x.state = 'new'; x.by = null; } });
      o.state = 'arr'; o.by = who; o.arr = {st: FLOWERS.map(function(){ return 0; }), pos: [], wrap: null, rib: null, t0: S.t};
      emit(S, {k: 'claim', id: o.id, who: who});
      break;
    case 'stem':
      o = orderById(S, a.o);
      if(!o || o.state !== 'arr' || o.by !== who) return;
      var i = +a.f;
      if(!(i >= 0 && i < FLOWERS.length)) return;
      var pos = o.arr.pos || (o.arr.pos = []);
      if(a.d > 0){
        if(S.stock[i] <= 0){ emit(S, {k: 'out', f: i, who: who}); return; }
        if(o.arr.st[i] >= 12) return;
        S.stock[i]--; o.arr.st[i]++;
        // where it was put, if it was put somewhere (null: wherever looks right)
        var px = isFinite(a.x) && a.x !== null ? Math.max(0, Math.min(1, +a.x)) : null;
        pos.push([i, px, px === null ? null : Math.max(0, Math.min(1.3, +a.y || 0)), Math.max(-3, Math.min(3, +a.r || 0))]);
      } else if(o.arr.st[i] > 0){
        S.stock[i]++; o.arr.st[i]--;
        var at = (a.idx | 0) >= 0 && pos[a.idx | 0] && pos[a.idx | 0][0] === i ? a.idx | 0 : -1;
        if(at < 0) for(var q = pos.length - 1; q >= 0; q--) if(pos[q][0] === i){ at = q; break; }
        if(at >= 0) pos.splice(at, 1);
      }
      break;
    case 'move':
      o = orderById(S, a.o);
      if(!o || o.state !== 'arr' || o.by !== who || !o.arr.pos) return;
      var mv = o.arr.pos[a.idx | 0]; if(!mv) return;
      mv[1] = Math.max(0, Math.min(1, +a.x || 0)); mv[2] = Math.max(0, Math.min(1.3, +a.y || 0));
      if(isFinite(a.r)) mv[3] = Math.max(-3, Math.min(3, +a.r));
      break;
    case 'wrap':
      o = orderById(S, a.o);
      if(o && o.state === 'arr' && o.by === who && WRAPS.some(function(w){ return w.k === a.k; })) o.arr.wrap = a.k;
      break;
    case 'ribbon':
      o = orderById(S, a.o);
      if(o && o.state === 'arr' && o.by === who && RIBBONS.some(function(w){ return w.k === a.k; })) o.arr.rib = a.k;
      break;
    case 'done':
      o = orderById(S, a.o);
      if(!o || o.state !== 'arr' || o.by !== who) return;
      var tot = o.arr.st.reduce(function(s, n){ return s + n; }, 0);
      if(tot < 1) return;
      o.made = {wrap: o.arr.wrap, rib: o.arr.rib};
      // the bouquet keeps the layout it was made with
      o.pos = (o.arr.pos || []).filter(function(q){ return q[1] !== null; }).length ? o.arr.pos.map(function(q){ return q.slice(); }) : null;
      finish(S, o, quality(S, o), who);
      break;
    case 'drop':
      o = orderById(S, a.o);
      if(!o || o.state !== 'arr' || o.by !== who) return;
      refundArr(S, o); o.state = 'new'; o.by = null;
      break;
    case 'gsize':
      setGarden(S, a.n | 0);
      emit(S, {k: 'gsize', n: S.gardenN, who: who});
      break;
    case 'water':
      if(!day) return;
      var g = S.garden[a.i | 0]; if(!g) return;
      if(g.water < 0.95){ g.water = 1; p.watered++; emit(S, {k: 'water', i: g.i, who: who}); }
      break;
    case 'harvest':
      if(!day) return;
      var g2 = S.garden[a.i | 0]; if(!g2 || g2.grow < 1) return;
      g2.grow = 0; S.stock[g2.f] += 5; p.harvested += 5;
      emit(S, {k: 'harvest', i: g2.i, f: g2.f, who: who});
      break;
    case 'rose':
      if(!day) return;
      if(S.t - (p.roseT || -9) < 0.8) return;
      p.roseT = S.t; p.roses++; S.roses++; S.money += 2; p.money += 2;
      emit(S, {k: 'rose', who: who, name: p.name});
      break;
    case 'assign':
      o = orderById(S, a.o);
      if(!o || !S.vans[a.v]) return;
      if(o.state === 'van' && o.van === a.v){ S.vans[a.v].prio = o.id; S.vans[a.v].routeT = 0; }
      else if(o.state === 'new' || o.state === 'arr' || o.state === 'ready') { o.pref = a.v; o.prio = true; }
      p.assigned++;
      emit(S, {k: 'assign', id: o.id, v: a.v, who: who});
      break;
    case 'prio':
      o = orderById(S, a.o); if(o) o.prio = !o.prio;
      break;
    case 'ping':
      if(!(isFinite(a.x) && isFinite(a.z))) return;
      S.pings.push({x: +a.x, z: +a.z, t: 10, who: who, k: a.kind || 'look'});
      if(S.pings.length > 6) S.pings.shift();
      emit(S, {k: 'ping', x: +a.x, z: +a.z, who: who, kind: a.kind || 'look'});
      break;
    case 'toss':
      if(!day) return;
      var v = S.vans[a.v]; if(!v) return;
      toss(S, v, who, +a.ang || 0, Math.max(0, Math.min(1, +a.pow || 0.5)), a.auto ? 'auto' : 'swipe');
      break;
    case 'ptoss':
      if(!S.parade || S.ph !== 'parade') return;
      if(S.parade.t - (p.ptossT == null ? -9 : p.ptossT) < 0.35) return;
      p.ptossT = S.parade.t;
      paradeToss(S, who, +a.ang || 0, Math.max(0, Math.min(1, +a.pow || 0.5)));
      break;
  }
}

/* ---------------- tossing ---------------- */
function wrapA(a){ while(a > Math.PI) a -= 2 * Math.PI; while(a < -Math.PI) a += 2 * Math.PI; return a; }

/* The bouquet in the van nearest its own porch, if one is close enough. */
function tossTarget(S, v, reach){
  var M = S.M, best = null, bd = reach || 34;
  v.cargo.forEach(function(id){
    var o = orderById(S, id); if(!o) return;
    var h = M.houses[o.house];
    var d = Math.hypot(h.porch.x - v.x, h.porch.z - v.z);
    if(d < bd){ bd = d; best = o; }
  });
  return best;
}

function toss(S, v, who, ang, pow, style){
  if(v.crash) return;
  if(S.t - v.lastToss < 0.3) return;
  var o = tossTarget(S, v, 34);
  if(!o){ emit(S, {k: 'nothing', v: v.i, who: who}); return; }
  v.lastToss = S.t;
  var M = S.M, R = S.R, h = M.houses[o.house];
  var dx = h.porch.x - v.x, dz = h.porch.z - v.z, dist = Math.hypot(dx, dz);
  var idealAng = wrapA(Math.atan2(dz, dx) - v.h), idealPow = Math.max(0.12, Math.min(1, dist / 32));
  var spd = Math.hypot(v.vx, v.vz), err;
  if(style === 'auto') err = 0.6 + spd * 0.14;
  else {
    var ea = Math.min(Math.PI / 2, Math.abs(wrapA(ang - idealAng)));
    err = dist * ea * 0.32 + Math.abs(pow - idealPow) * 14 + spd * 0.035;
  }
  err *= 0.4 + R() * 0.75;
  var ea2 = R() * Math.PI * 2;
  var tx = h.porch.x + Math.cos(ea2) * err, tz = h.porch.z + Math.sin(ea2) * err;
  var T = 0.45 + dist / 30;
  var mult = spd > 36 ? 2 : spd > 22 ? 1.5 : 1;
  v.cargo = v.cargo.filter(function(id){ return id !== o.id; });
  if(v.prio === o.id) v.prio = null;
  o.state = 'air';
  S.shots.push({o: o.id, v: v.i, who: who, x0: v.x, z0: v.z, y0: 2.2, tx: tx, tz: tz, t: 0, T: T, mult: mult, spd: spd, ri: o.ri, kind: 'del'});
  var pp = person(S, who); if(pp) pp.tosses++;
  emit(S, {k: 'toss', v: v.i, id: o.id, who: who, x: v.x, z: v.z, tx: tx, tz: tz, T: T, ri: o.ri, mult: mult});
  v.routeT = 0;
}

function shotsTick(S){
  var M = S.M;
  for(var i = S.shots.length - 1; i >= 0; i--){
    var s = S.shots[i];
    s.t += DT;
    if(s.t < s.T) continue;
    S.shots.splice(i, 1);
    if(s.kind === 'parade'){
      if(s.hit){ S.cheers++; S.money += 3; var pp = person(S, s.who); if(pp) pp.cheers++; }
      emit(S, {k: 'pland', x: s.tx, z: s.tz, hit: s.hit, who: s.who, ri: s.ri});
      continue;
    }
    var o = orderById(S, s.o); if(!o) continue;
    var h = M.houses[o.house];
    var d = Math.hypot(s.tx - h.porch.x, s.tz - h.porch.z);
    var how = d < 1.3 ? 'perfect' : d < 3.2 ? 'porch' : d < 7 ? 'lawn' : 'miss';
    var v = S.vans[s.v], p = person(S, s.who);
    if(how === 'miss'){
      o.state = 'new'; o.by = null; o.van = -1; o.born = Math.max(o.born, S.t - o.patience + 60);
      S.missed++; S.rep = Math.max(0, S.rep - 0.08);
      if(p) p.miss++;
      emit(S, {k: 'land', how: how, id: o.id, x: s.tx, z: s.tz, v: s.v, who: s.who, ri: o.ri, pay: 0});
      continue;
    }
    var land = how === 'perfect' ? 1.3 : how === 'porch' ? 1 : 0.6;
    var pay = Math.round(o.value * o.q * (0.35 + 0.65 * o.fresh) * land * s.mult * repMult(S));
    o.state = 'done'; o.endT = S.t; o.paid = pay; o.how = how;
    S.money += pay; S.delivered++;
    if(how === 'perfect') S.perfect++;
    S.rep = Math.min(5, S.rep + (how === 'lawn' ? 0.02 : 0.06));
    if(v){ v.stats.del++; v.stats.money += pay; if(how === 'perfect') v.stats.perfect++; }
    if(p){ p.del++; p.money += pay; if(how === 'perfect') p.perfect++; }
    if(v && v.owner && v.owner !== s.who){ var dp = person(S, v.owner); if(dp){ dp.del++; } }
    emit(S, {k: 'land', how: how, id: o.id, x: s.tx, z: s.tz, v: s.v, who: s.who, ri: o.ri, pay: pay, mult: s.mult, fresh: o.fresh, addr: h.addr, cust: o.who});
  }
}

/* ---------------- van physics ---------------- */
var SURF_GRIP = [0.8, 1, 0.85, 1, 1, 0.95, 0.7];
var SURF_MAX = [0.78, 1, 0.82, 1, 1, 0.96, 0.66];
var SURF_DRAG = [2.4, 1, 2.0, 1, 1, 1.3, 3];
var scratch = {b: [], c: [], p: []};
var stamp = new Uint32Array(1 << 16), stampN = 1;

function vanPhysics(S, v){
  var M = S.M;
  var sf = M.surf(v.x, v.z);
  var gnd = M.height(v.x, v.z);
  var grounded = v.y - gnd < 0.35;
  var fx = Math.cos(v.h), fz = Math.sin(v.h), rx = -fz, rz = fx;
  var vf = v.vx * fx + v.vz * fz, vs = v.vx * rx + v.vz * rz;
  v.boosting = false;
  if(grounded){
    var wantBoost = v.bst && (v.boost > 0.03 || v.powder > 0);
    var maxV = (v.powder > 0 ? 74 : wantBoost ? 64 : 46) * SURF_MAX[sf] * (1 - 0.15 * (v.dmg || 0));
    var a = 0;
    if(v.gas || wantBoost){
      if(vf < 0) a = 30;
      else a = (wantBoost ? 32 : 23) * Math.max(0, 1 - (vf / maxV) * (vf / maxV));
      if(vf > maxV) a = -(vf - maxV) * 1.4;
    }
    if(wantBoost){
      v.boosting = true;
      if(v.powder <= 0) v.boost = Math.max(0, v.boost - DT * 0.3);
    }
    if(v.brk){
      if(vf > 0.8) a -= v.drift ? 5 : 34;
      else if(!v.gas && vf > -14) a = -16;
    }
    var drag = (0.9 + 0.0008 * vf * vf) * SURF_DRAG[sf];
    if(!v.gas && !wantBoost && !v.brk) drag += 2;
    a -= (vf >= 0 ? 1 : -1) * Math.min(Math.abs(vf) / DT, drag);
    vf += a * DT;
    // drifting: a dab of brake while turning hard at speed
    var st = v.st;
    if(!v.drift && v.brk && Math.abs(st) > 0.38 && vf > 15){ v.drift = st > 0 ? 1 : -1; v.driftT = 0; }
    if(v.drift){
      v.driftT += DT;
      if(Math.abs(st) < 0.1 || vf < 9 || (st * v.drift < -0.35)) v.drift = 0;
    }
    var spd = Math.abs(vf);
    var turnMax = spd < 1.5 ? spd / 1.5 * 1.6 : spd < 10 ? 1.6 + (spd - 1.5) / 8.5 * 0.75 : 2.35 - Math.min(1, (spd - 10) / 40) * 1.1;
    var target = st * turnMax * (v.drift ? 1.5 : 1) * (vf < -0.5 ? -1 : 1);
    v.yaw += (target - v.yaw) * Math.min(1, 16 * DT);
    var gripRate = (v.drift ? 1.7 : 11) * SURF_GRIP[sf];
    var vs0 = vs;
    vs *= Math.exp(-gripRate * DT);
    if(v.drift && vf > 15){
      var slip = Math.min(1, Math.abs(vs0) / 6);
      v.boost = Math.min(1, v.boost + DT * 0.24 * slip);
      v.stats.drift += DT;
    }
    // the haboob pushes you about
    if(S.dust > 0.2){ v.vx += S.gust.x * S.dust * DT; v.vz += S.gust.z * S.dust * DT; }
    // velocity stays in the old frame; only the nose turns, so grip has to
    // pull the van round - which is what lets it slide
    v.vx = fx * vf + rx * vs; v.vz = fz * vf + rz * vs;
    v.h += v.yaw * DT;
    // driving on the wrong side of an arterial at speed fills the boost
  } else {
    v.yaw *= 0.995;
    v.yaw += v.st * 0.6 * DT;
    v.h += v.yaw * DT;
    v.boost = Math.min(1, v.boost + DT * 0.28);
  }
  var ox = v.x, oz = v.z;
  v.x += v.vx * DT; v.z += v.vz * DT;
  // up and down
  var g1 = M.height(v.x, v.z);
  v.vy -= G * DT;
  v.y += v.vy * DT;
  if(v.y <= g1){
    var wasAir = v.air;
    var slopeV = (g1 - gnd) / DT;
    v.y = g1;
    if(grounded) v.vy = Math.max(-30, Math.min(30, slopeV));
    else v.vy = 0;
    if(wasAir > 0.55){
      v.stats.air += wasAir;
      emit(S, {k: 'land', v: v.i, air: wasAir, x: v.x, z: v.z});
      if(!S.best.air || wasAir > S.best.air.t) S.best.air = {t: wasAir, name: v.name, owner: v.owner};
      var pa = person(S, v.owner, v.owner ? v.name : null); if(pa) pa.air += wasAir;
    }
    v.air = 0;
    if(M.surf(v.x, v.z) === 3 && !v.ghostWater){ crash(S, v, 'canal', Math.hypot(v.vx, v.vz), 0, 0); return; }
  } else if(v.y - g1 > 0.35){
    v.air += DT;
    if(v.air > 0.3 && v.air - DT <= 0.3) emit(S, {k: 'air', v: v.i});
  }
  v.spd = Math.hypot(v.vx, v.vz);
  v.stats.dist += v.spd * DT;
  if(v.spd > v.stats.top) v.stats.top = v.spd;
  collideStatic(S, v, ox, oz);
}

function collideStatic(S, v, ox, oz){
  if(v.crash) return;
  var M = S.M;
  var fx = Math.cos(v.h), fz = Math.sin(v.h);
  var near = M.near(v.x, v.z, 5, scratch);
  stampN++; if(stampN > 4e9) stampN = 1;
  var worst = null;
  for(var c = -1; c <= 1; c += 2){
    var cx = v.x + fx * 1.35 * c, cz = v.z + fz * 1.35 * c, r = 1.15;
    var k, b, px, pz, dx, dz, d2, d, pen, nx, nz;
    for(k = 0; k < near.b.length; k++){
      var bi = near.b[k];
      b = M.boxes[bi];
      if(v.y > b.h - 0.15) continue;
      if(b.k === 'wall' && S.wallsDown[bi]) continue;
      px = cx < b.x0 ? b.x0 : cx > b.x1 ? b.x1 : cx;
      pz = cz < b.z0 ? b.z0 : cz > b.z1 ? b.z1 : cz;
      dx = cx - px; dz = cz - pz; d2 = dx * dx + dz * dz;
      if(d2 >= r * r) continue;
      if(d2 < 1e-8){
        // inside: out the nearest face
        var l = cx - b.x0, rr = b.x1 - cx, t = cz - b.z0, bb = b.z1 - cz, m = Math.min(l, rr, t, bb);
        nx = m === l ? -1 : m === rr ? 1 : 0; nz = m === t ? -1 : m === bb ? 1 : 0;
        pen = m + r;
      } else { d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
      var vn = v.vx * nx + v.vz * nz;
      // a low block wall goes over: bricks everywhere, the van slows, a dent
      if(b.k === 'wall' && v.spd > 5 && vn < -1.5){
        S.wallsDown[bi] = S.t + 120;
        var slow = Math.max(0.55, 0.85 - Math.min(0.3, -vn * 0.012));
        v.vx *= slow; v.vz *= slow;
        dent(S, v, 0.02 + -vn * 0.004);
        emit(S, {k: 'wall', b: bi, v: v.i, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, vx: v.vx, vz: v.vz});
        continue;
      }
      v.x += nx * pen; v.z += nz * pen; cx += nx * pen; cz += nz * pen;
      if(vn < 0 && (!worst || -vn > worst.imp)) worst = {imp: -vn, nx: nx, nz: nz, k: b.k};
    }
    for(k = 0; k < near.c.length; k++){
      var ci = M.circles[near.c[k]];
      if(v.y > ci.h - 0.15) continue;
      dx = cx - ci.x; dz = cz - ci.z; d2 = dx * dx + dz * dz;
      var rs = r + ci.r;
      if(d2 >= rs * rs || d2 < 1e-8) continue;
      d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = rs - d;
      v.x += nx * pen; v.z += nz * pen; cx += nx * pen; cz += nz * pen;
      var vn2 = v.vx * nx + v.vz * nz;
      if(vn2 < 0 && (!worst || -vn2 > worst.imp)) worst = {imp: -vn2, nx: nx, nz: nz, k: ci.k};
    }
    for(k = 0; k < near.p.length; k++){
      var pi = near.p[k], pr = M.props[pi];
      if(S.broken[pi] || v.y > 1.6) continue;
      dx = cx - pr.x; dz = cz - pr.z;
      if(dx * dx + dz * dz > (r + pr.r) * (r + pr.r)) continue;
      if(v.spd < 2.5){ var dd = Math.hypot(dx, dz) || 1; v.x += dx / dd * 0.05; v.z += dz / dd * 0.05; continue; }
      S.broken[pi] = S.t + 60;
      v.boost = Math.min(1, v.boost + 0.025);
      v.vx *= 0.985; v.vz *= 0.985;
      emit(S, {k: 'smash', p: pi, kind: pr.k, x: pr.x, z: pr.z, vx: v.vx, vz: v.vz});
    }
  }
  if(!worst) return;
  if(worst.imp > CRASH_V && v.ghost <= 0){ crash(S, v, worst.k, worst.imp, worst.nx, worst.nz); return; }
  // under that, it dents; dent it enough and it is a wreck anyway
  if(worst.imp > 4 && v.ghost <= 0){
    dent(S, v, worst.imp * 0.009);
    if(v.dmg >= 1){ crash(S, v, 'wrecked', Math.max(worst.imp, 20), worst.nx, worst.nz); return; }
  }
  // a glancing blow: bounce off, keep going along the wall
  // take away the speed into the wall (and a little more, a bounce), scrape along it
  v.vx += worst.nx * worst.imp * 1.15; v.vz += worst.nz * worst.imp * 1.15;
  v.vx *= 0.97; v.vz *= 0.97;
  if(worst.imp > 5) emit(S, {k: 'bump', v: v.i, imp: worst.imp, x: v.x, z: v.z});
}

/* ---------------- damage ---------------- */
function dent(S, v, amt){
  var before = v.dmg || 0;
  v.dmg = Math.min(1, before + amt);
  if(Math.floor(before * 4) !== Math.floor(v.dmg * 4)) emit(S, {k: 'dent', v: v.i, dmg: v.dmg, x: v.x, z: v.z});
}

/* ---------------- crashes ---------------- */
/* the bouquets a crash costs (the TV's side of a crash) */
function crashCargo(S, v, cause, imp){
  var R = S.R, lost = [];
  var n = v.cargo.length;
  var nLose = cause === 'canal' ? n : n ? Math.max(1, Math.ceil(n * 0.5)) : 0;
  for(var k = 0; k < nLose; k++){
    var idx = Math.floor(R() * v.cargo.length);
    var o = orderById(S, v.cargo[idx]);
    v.cargo.splice(idx, 1);
    if(o){ o.state = 'new'; o.van = -1; o.by = null; o.born = Math.max(o.born, S.t - o.patience + 75); lost.push(o.ri); }
  }
  if(v.prio != null && v.cargo.indexOf(v.prio) < 0) v.prio = null;
  var cost = Math.round(800 + imp * 260);
  S.crashes++; S.damage += cost;
  S.rep = Math.max(0, S.rep - 0.03 * lost.length);
  v.stats.crashes++;
  var p = person(S, v.owner, v.owner ? v.name : null); if(p) p.crashes++;
  if(!S.best.crash || imp > S.best.crash.imp) S.best.crash = {imp: imp, name: v.name, owner: v.owner, cause: cause, lost: lost.length, street: v.street};
  return {lost: lost, cost: cost};
}

function crash(S, v, cause, imp, nx, nz){
  if(v.crash) return;
  var R = S.R;
  // on a phone (S.local) the van only tumbles; the TV is told and does the rest
  var cc = S.local ? {lost: [], cost: 0} : crashCargo(S, v, cause, imp);
  var lost = cc.lost, cost = cc.cost;
  // bounce back off what was hit, then tumble
  var vx = v.vx, vz = v.vz;
  if(cause !== 'canal'){
    var vn = vx * nx + vz * nz;
    vx -= nx * vn * 1.4; vz -= nz * vn * 1.4;
    vx *= 0.55; vz *= 0.55;
  } else { vx *= 0.3; vz *= 0.3; }
  var big = Math.min(1, imp / 50);
  v.crash = {t: 0, dur: cause === 'canal' ? 3 : 2.8, cause: cause, imp: imp, x: v.x, z: v.z, y: Math.max(v.y, 0.2),
    vx: vx, vz: vz, vy: cause === 'canal' ? -1 : 4 + imp * 0.16, h: v.h,
    ax: 0, ay: 0, az: 0,
    wx: (R() - 0.5) * (4 + 14 * big), wy: (R() - 0.5) * (3 + 8 * big), wz: (R() - 0.5) * (4 + 12 * big) + (R() < 0.5 ? -4 : 4) * big,
    kaboom: v.powder > 0, lost: lost.length};
  v.vx = v.vz = v.vy = 0; v.boosting = false; v.drift = 0;
  emit(S, {k: 'crash', v: v.i, cause: cause, imp: imp, x: v.x, y: v.y, z: v.z, vx: vx, vz: vz, lost: lost, kaboom: v.powder > 0, cost: cost, car: S.hitCar || null});
  S.hitCar = null;
}

function crashTick(S, v){
  var c = v.crash, M = S.M;
  c.t += DT;
  c.vy -= G * DT;
  c.x += c.vx * DT; c.z += c.vz * DT; c.y += c.vy * DT;
  var g = M.height(c.x, c.z);
  if(c.cause === 'canal'){ g = Math.max(g, -2.4); c.vy = Math.max(c.vy, -3); c.vx *= 0.97; c.vz *= 0.97; }
  if(c.y < g){
    c.y = g;
    if(c.vy < -3){ c.vy = -c.vy * 0.35; c.wx *= 0.6; c.wz *= 0.6; emit(S, {k: 'thud', v: v.i, x: c.x, z: c.z}); }
    else c.vy = 0;
    var sp = Math.hypot(c.vx, c.vz);
    if(sp > 0){ var f = Math.max(0, sp - 14 * DT) / sp; c.vx *= f; c.vz *= f; }
  }
  // keep the wreck out of buildings
  var near = M.near(c.x, c.z, 3, scratch);
  for(var k = 0; k < near.b.length; k++){
    var b = M.boxes[near.b[k]];
    if(c.y > b.h) continue;
    if(c.x > b.x0 - 1 && c.x < b.x1 + 1 && c.z > b.z0 - 1 && c.z < b.z1 + 1){
      var l = c.x - b.x0 + 1, r = b.x1 + 1 - c.x, t = c.z - b.z0 + 1, bb = b.z1 + 1 - c.z, m = Math.min(l, r, t, bb);
      if(m === l){ c.x = b.x0 - 1; c.vx = -Math.abs(c.vx) * 0.3; } else if(m === r){ c.x = b.x1 + 1; c.vx = Math.abs(c.vx) * 0.3; }
      else if(m === t){ c.z = b.z0 - 1; c.vz = -Math.abs(c.vz) * 0.3; } else { c.z = b.z1 + 1; c.vz = Math.abs(c.vz) * 0.3; }
    }
  }
  var damp = c.y <= g + 0.05 ? 0.94 : 0.995;
  c.wx *= damp; c.wy *= damp; c.wz *= damp;
  c.ax += c.wx * DT; c.ay += c.wy * DT; c.az += c.wz * DT;
  v.x = c.x; v.z = c.z; v.y = c.y;
  if(c.t >= c.dur) respawn(S, v);
}

function respawn(S, v){
  var M = S.M, c = v.crash;
  var spot = M.roadSpot(c ? c.x : v.x, c ? c.z : v.z);
  // face along the road, the way that heads for the target
  var tgt = targetPoint(S, v);
  var h = spot.h;
  if(tgt){ var want = Math.atan2(tgt.z - spot.z, tgt.x - spot.x); if(Math.abs(wrapA(want - h)) > Math.PI / 2) h += Math.PI; }
  v.x = spot.x; v.z = spot.z; v.y = 0; v.vy = 0; v.h = h; v.vx = v.vz = 0; v.yaw = 0;
  v.crash = null; v.ghost = 2.2; v.air = 0; v.powder = 0; v.routeT = 0; v.drift = 0;
  if((v.dmg || 0) > 0.3) v.dmg = 0.3;
  emit(S, {k: 'respawn', v: v.i});
}

/* ---------------- where a van is going ---------------- */
function targetPoint(S, v){
  if(!v.tgt) return null;
  var M = S.M;
  if(v.tgt.k === 'house'){ var h = M.houses[v.tgt.id]; return {x: h.porch.x, z: h.porch.z}; }
  var sh = M.shops[v.tgt.id]; return {x: sh.x, z: sh.z};
}

function chooseTarget(S, v){
  var M = S.M, best = null, bd = 1e9;
  if(v.cargo.length){
    if(v.prio != null && v.cargo.indexOf(v.prio) >= 0){ var po = orderById(S, v.prio); if(po) return {k: 'house', id: po.house, o: po.id}; }
    v.cargo.forEach(function(id){
      var o = orderById(S, id); if(!o) return;
      var h = M.houses[o.house];
      var d = Math.hypot(h.x - v.x, h.z - v.z);
      if(d < bd){ bd = d; best = {k: 'house', id: o.house, o: o.id}; }
    });
    return best;
  }
  M.shops.forEach(function(sh, i){
    var d = Math.hypot(sh.x - v.x, sh.z - v.z);
    if(d < bd){ bd = d; best = {k: 'shop', id: i}; }
  });
  return best;
}

function routeTick(S, v){
  v.routeT -= DT;
  var t = chooseTarget(S, v);
  var changed = !v.tgt || !t || t.k !== v.tgt.k || t.id !== v.tgt.id;
  if(changed || v.routeT <= 0 || !v.route){
    v.tgt = t;
    if(t){
      var place = t.k === 'house' ? S.M.housePlace(t.id) : S.M.shopPlace(t.id);
      v.route = S.M.route(v.x, v.z, place);
      v.wp = 1;
    } else v.route = null;
    v.routeT = 1.2;
  }
  // advance along the route
  if(v.route){
    while(v.wp < v.route.length - 1){
      var p = v.route[v.wp], q = v.route[v.wp - 1] || p;
      var d = Math.hypot(p.x - v.x, p.z - v.z);
      var sx = p.x - q.x, sz = p.z - q.z;
      var passed = (v.x - p.x) * sx + (v.z - p.z) * sz > 0;
      if(d < 9 || passed) v.wp++; else break;
    }
  }
}

/* ---------------- the computer driver ---------------- */
function aiDrive(S, v){
  var ai = v.ai;
  if(!v.route || v.route.length < 2){ v.gas = 0; v.brk = 1; v.st = 0; v.bst = 0; return; }
  var spd = Math.hypot(v.vx, v.vz);
  var fx = Math.cos(v.h), fz = Math.sin(v.h);
  var vf = v.vx * fx + v.vz * fz;
  // a point a little way down the route
  var look = 7 + 0.32 * spd, px = v.x, pz = v.z, rem = look, i = v.wp, lx = v.x, lz = v.z, sdx = fx, sdz = fz;
  while(i < v.route.length){
    var p = v.route[i];
    var seg = Math.hypot(p.x - lx, p.z - lz);
    if(seg > 0.01){ sdx = (p.x - lx) / seg; sdz = (p.z - lz) / seg; }
    if(seg >= rem){ px = lx + (p.x - lx) * rem / seg; pz = lz + (p.z - lz) * rem / seg; rem = 0; break; }
    rem -= seg; lx = p.x; lz = p.z; px = p.x; pz = p.z; i++;
  }
  // keep right, in a lane, not on the yellow line
  var keep = i >= v.route.length - 1 ? 1 : 2.4;
  px += -sdz * keep; pz += sdx * keep;
  var want = Math.atan2(pz - v.z, px - v.x);
  var diff = wrapA(want - v.h);
  var st = Math.max(-1, Math.min(1, diff * 2.4));
  // the next real corner, and how fast to take it
  var dist = Math.hypot(v.route[v.wp].x - v.x, v.route[v.wp].z - v.z), vt = 36, k;
  for(k = v.wp; k < v.route.length - 1 && dist < 220; k++){
    var a = v.route[k], b = v.route[k + 1], pr = k > 0 ? v.route[k - 1] : {x: v.x, z: v.z};
    var ang = Math.abs(wrapA(Math.atan2(b.z - a.z, b.x - a.x) - Math.atan2(a.z - pr.z, a.x - pr.x)));
    if(ang > 0.4){
      var vTurn = 10 + (1 - Math.min(1, ang / 1.57)) * 14;
      vt = Math.min(vt, Math.sqrt(vTurn * vTurn + 2 * 15 * Math.max(0, dist - 8)));
      break;
    }
    dist += Math.hypot(b.x - a.x, b.z - a.z);
  }
  var end = v.route[v.route.length - 1];
  var dEnd = Math.hypot(end.x - v.x, end.z - v.z);
  if(v.tgt && v.tgt.k === 'shop') vt = Math.min(vt, 5 + dEnd * 0.35);
  if(v.tgt && v.tgt.k === 'house') vt = Math.min(vt, 9 + dEnd * 0.4);
  if(Math.abs(diff) > 0.9) vt = Math.min(vt, 9);
  // traffic ahead, and anything about to cross our path
  for(k = 0; k < S.cars.length; k++){
    var c = S.cars[k];
    var dx = c.x - v.x, dz = c.z - v.z;
    if(dx * dx + dz * dz > 1600) continue;
    var cvx0 = c.wreck ? c.wreck.vx : Math.cos(c.h) * c.v, cvz0 = c.wreck ? c.wreck.vz : Math.sin(c.h) * c.v;
    var wx = cvx0 - v.vx, wz = cvz0 - v.vz, w2 = wx * wx + wz * wz;
    if(w2 > 1){
      var tc = -(dx * wx + dz * wz) / w2;
      if(tc > 0 && tc < 1.7){
        var mx = dx + wx * tc, mz = dz + wz * tc;
        if(mx * mx + mz * mz < 3.6 * 3.6 && ai.patience < 3) vt = Math.min(vt, spd * 0.3);
      }
    }
    var ahead = dx * fx + dz * fz, side = -dx * fz + dz * fx;
    var same = c.wreck ? 1 : Math.cos(c.h) * fx + Math.sin(c.h) * fz;
    if(ahead > 2 && ahead < 22 && Math.abs(side) < 2.0 && same > 0.5 && ai.patience < 3){
      var cv = c.wreck ? 0 : c.v * same;
      vt = Math.min(vt, Math.max(0, cv + (ahead - 8) * 0.6));
    }
  }
  // waited long enough: go round
  if(vt < 1) ai.patience = (ai.patience || 0) + DT; else if(ai.patience >= 3) { ai.patience += DT; if(ai.patience > 5) ai.patience = 0; } else ai.patience = 0;
  // waiting at the shop for the arrangers to finish a few more
  var shopNear = null;
  S.M.shops.forEach(function(sh){ if(Math.hypot(sh.x - v.x, sh.z - v.z) < sh.r * 0.8) shopNear = sh; });
  if(shopNear && v.cargo.length < CAP){
    var coming = S.orders.filter(function(o){ return o.kind === 'del' && (o.state === 'new' || o.state === 'arr' || o.state === 'ready'); }).length;
    ai.hold = (ai.hold || 0) + DT;
    if((v.cargo.length === 0 && coming > 0) || (v.cargo.length < 3 && coming > 0 && ai.hold < 12)){
      v.gas = 0; v.brk = v.spd > 0.5 ? 1 : 0; v.st = 0; v.bst = 0; return;
    }
  } else ai.hold = 0;
  ai.vt = vt;
  var gas = vf < vt - 0.5, brk = vf > vt + 2.5;
  // stuck against something: back up and try again
  if(ai.rev > 0){ ai.rev -= DT; v.gas = 0; v.brk = 1; v.st = -st; v.bst = 0; return; }
  if(gas && spd < 1.5){ ai.stuck += DT; if(ai.stuck > 1.4){ ai.stuck = 0; ai.rev = 1.1; } } else ai.stuck = 0;
  v.st = st; v.gas = gas ? 1 : 0; v.brk = brk ? 1 : 0;
  v.bst = (v.boost > 0.5 && vt >= 35 && Math.abs(diff) < 0.1 && dist > 150) ? 1 : 0;
  // throw it from the van
  ai.tossT -= DT;
  if(v.tgt && v.tgt.k === 'house' && ai.tossT <= 0){
    var o = tossTarget(S, v, 22);
    if(o && spd < 20){ ai.tossT = 0.8; toss(S, v, v.owner, 0, 0.5, 'auto'); }
  }
}

/* ---------------- shops, misters, pickups ---------------- */
function vanStops(S, v){
  var M = S.M;
  // loading at either shop: drive through slowly
  M.shops.forEach(function(sh){
    if(v.cargo.length >= CAP) return;
    if(Math.hypot(sh.x - v.x, sh.z - v.z) > sh.r || v.spd > 15) return;
    var ready = S.orders.filter(function(o){ return o.state === 'ready' && (o.pref < 0 || o.pref === v.i || !S.vans[o.pref]); });
    ready.sort(function(a, b){ return ((b.pref === v.i) - (a.pref === v.i)) || (b.prio - a.prio) || (a.born - b.born); });
    var n = 0;
    while(v.cargo.length < CAP && ready.length){
      var o = ready.shift();
      o.state = 'van'; o.van = v.i; o.fresh = Math.min(1, o.fresh); v.cargo.push(o.id); n++;
    }
    if(n){ emit(S, {k: 'load', v: v.i, n: n, shop: sh.key}); v.routeT = 0; }
  });
  // the sun
  var hot = heat01(S);
  v.cargo.forEach(function(id){
    var o = orderById(S, id); if(o) o.fresh = Math.max(0, o.fresh - DT * (0.003 + 0.012 * hot));
  });
  // patio misters
  v.mist = Math.max(0, v.mist - DT);
  M.misters.forEach(function(m){
    if(Math.hypot(m.x - v.x, m.z - v.z) < m.r){
      if(v.mist <= 0 && v.cargo.length) emit(S, {k: 'mist', v: v.i, x: m.x, z: m.z});
      v.mist = 1;
      v.cargo.forEach(function(id){ var o = orderById(S, id); if(o) o.fresh = Math.min(1, o.fresh + DT * 0.8); });
    }
  });
  // pickups
  M.pickups.forEach(function(p){
    if((S.pickupT[p.id] || 0) > S.t) return;
    if(p.k === 'boom' && S.boomUsed) return;
    if(Math.hypot(p.x - v.x, p.z - v.z) > (p.k === 'boom' ? 4.5 : 3.2) || v.y > 3) return;
    if(p.k === 'keg'){
      S.pickupT[p.id] = S.t + 45;
      v.powder = 4; v.boost = 1;
      emit(S, {k: 'powder', v: v.i, x: p.x, z: p.z});
    } else if(p.k === 'ice'){
      S.pickupT[p.id] = S.t + 40;
      v.cargo.forEach(function(id){ var o = orderById(S, id); if(o) o.fresh = 1; });
      v.boost = Math.min(1, v.boost + 0.2);
      emit(S, {k: 'ice', v: v.i, x: p.x, z: p.z});
    } else if(p.k === 'boom'){
      S.boomUsed = true;
      S.money += 100;
      v.vy = 15; v.y += 0.5; v.air = 0.01;
      var sp = Math.hypot(v.vx, v.vz) || 1;
      v.vx += v.vx / sp * 8; v.vz += v.vz / sp * 8;
      v.boost = 1;
      emit(S, {k: 'boom', v: v.i, x: p.cx, z: p.cz, name: v.name});
    }
  });
  if(v.powder > 0) v.powder = Math.max(0, v.powder - DT);
}

/* ---------------- traffic ---------------- */
var CAR_KINDS = [{k: 'car', L: 4.6, W: 2.0, p: 0.72}, {k: 'pickup', L: 5.4, W: 2.1, p: 0.14}, {k: 'truck', L: 7.5, W: 2.5, p: 0.07}, {k: 'bus', L: 11, W: 2.6, p: 0.07}];
function carPos(S, c){
  var l = S.M.lines[c.l];
  var off = S.M.laneOffsets(l)[c.lane];
  if(l.axis === 'ns'){ c.x = l.p - c.dir * off; c.z = c.s; c.h = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  else { c.x = c.s; c.z = l.p + c.dir * off; c.h = c.dir > 0 ? 0 : Math.PI; }
}
function spawnCar(S){
  var M = S.M, R = S.R;
  var vs = S.vans.filter(function(v){ return !v.crash; });
  if(!vs.length) return;
  var v = vs[Math.floor(R() * vs.length)];
  var cand = M.lines.filter(function(l){ return Math.abs((l.axis === 'ns' ? v.x : v.z) - l.p) < 280; });
  if(!cand.length) return;
  var l = cand[Math.floor(R() * cand.length)];
  var along = l.axis === 'ns' ? v.z : v.x;
  var s = along + (R() < 0.5 ? -1 : 1) * (90 + R() * 230);
  if(s < l.lo + 5 || s > l.hi - 5) return;
  var x = l.axis === 'ns' ? l.p : s, z = l.axis === 'ns' ? s : l.p;
  for(var k = 0; k < S.vans.length; k++) if(Math.hypot(S.vans[k].x - x, S.vans[k].z - z) < 85) return;
  var lanes = M.laneOffsets(l);
  var r = R(), kind = CAR_KINDS[0];
  for(var q = 0, acc = 0; q < CAR_KINDS.length; q++){ acc += CAR_KINDS[q].p; if(r < acc){ kind = CAR_KINDS[q]; break; } }
  if(kind.k === 'bus' && l.kind === 'col') kind = CAR_KINDS[0];
  var c = {id: S.carId++, l: l.id, dir: R() < 0.5 ? 1 : -1, lane: Math.floor(R() * lanes.length), s: s,
    kind: kind.k, L: kind.L, W: kind.W, vmax: M.speedLimit(l) * (0.85 + R() * 0.3), v: 0, color: Math.floor(R() * 10), nm: 0, wreck: null};
  c.v = c.vmax * 0.8;
  for(var j = 0; j < S.cars.length; j++){
    var o = S.cars[j];
    if(o.l === c.l && o.dir === c.dir && o.lane === c.lane && Math.abs(o.s - c.s) < 14) return;
  }
  carPos(S, c);
  S.cars.push(c);
}

function sigGreen(S, L, axis){
  if(!L.sig) return true;
  var t = (S.t + L.off) % 16;
  if(axis === 'ns') return t < 7;
  return t >= 8 && t < 15;
}

function trafficTick(S){
  var M = S.M;
  var want = Math.min(150, 22 * S.vans.length + 8);
  S.spawnCarT -= DT;
  if(S.cars.length < want && S.spawnCarT <= 0){ S.spawnCarT = 0.05; spawnCar(S); }
  // group by line for following
  var byLane = {};
  S.cars.forEach(function(c){ if(!c.wreck){ var key = c.l * 8 + (c.dir > 0 ? 4 : 0) + c.lane; (byLane[key] || (byLane[key] = [])).push(c); } });
  for(var key in byLane) byLane[key].sort(function(a, b){ return (a.s - b.s) * a.dir; });
  for(var i = S.cars.length - 1; i >= 0; i--){
    var c = S.cars[i];
    var far = true;
    for(var k = 0; k < S.vans.length; k++) if(Math.hypot(S.vans[k].x - c.x, S.vans[k].z - c.z) < 400){ far = false; break; }
    if(far){ S.cars.splice(i, 1); continue; }
    if(c.wreck){
      var w = c.wreck;
      w.t += DT; w.vy -= G * DT; w.y += w.vy * DT;
      if(w.y < 0){
        w.y = 0;
        if(w.vy < -3){ w.vy = -w.vy * 0.45; emit(S, {k: 'carbounce', x: c.x, z: c.z}); } else w.vy = 0;
      }
      var sp = Math.hypot(w.vx, w.vz);
      if(sp > 0 && w.y <= 0.01){ var f = Math.max(0, sp - 6 * DT) / sp; w.vx *= f; w.vz *= f; }
      c.x += w.vx * DT; c.z += w.vz * DT;
      w.ax += w.wx * DT; w.ay += w.wy * DT; w.az += w.wz * DT;
      // on the ground it keeps rolling while it is still moving, then settles
      if(w.y <= 0.01){ var roll = sp > 3 ? 0.992 : 0.9; w.wx *= roll; w.wz *= roll; w.wy *= 0.95; }
      if(w.t > 14) S.cars.splice(i, 1);
      continue;
    }
    var l = M.lines[c.l];
    var lane = byLane[c.l * 8 + (c.dir > 0 ? 4 : 0) + c.lane];
    var idx = lane.indexOf(c), lead = lane[idx + 1];
    var vt = c.vmax;
    if(lead){
      var gap = (lead.s - c.s) * c.dir - (lead.L + c.L) / 2;
      vt = Math.min(vt, Math.max(0, lead.v + (gap - 6) * 0.9));
      if(gap < 2) vt = 0;
    }
    // the lights
    for(var n = 0; n < l.nodes.length; n++){
      var at = l.nodes[n].at;
      var ahead = (at - c.s) * c.dir;
      if(ahead < 6 || ahead > 60) continue;
      var L = M.lights.filter(function(q){ return (l.axis === 'ns' ? q.x === l.p : q.z === l.p) && (l.axis === 'ns' ? q.z === at : q.x === at); })[0];
      if(!L) continue;
      if(!sigGreen(S, L, l.axis)){
        var stop = ahead - 15 - c.L / 2;
        vt = Math.min(vt, stop > 0 ? Math.sqrt(2 * 5 * stop) : 0);
      }
      break;
    }
    // vans in the lane ahead
    for(var j = 0; j < S.vans.length; j++){
      var v = S.vans[j];
      var dx = v.x - c.x, dz = v.z - c.z;
      var fwd = dx * Math.cos(c.h) + dz * Math.sin(c.h), lat = -dx * Math.sin(c.h) + dz * Math.cos(c.h);
      if(fwd > 0 && fwd < 18 && Math.abs(lat) < 1.8) vt = Math.min(vt, Math.max(0, (fwd - 6) * 0.8));
    }
    c.v += Math.max(-9 * DT, Math.min(3 * DT, vt - c.v));
    if(c.v < 0) c.v = 0;
    c.s += c.dir * c.v * DT;
    if(c.s < l.lo + 2 || c.s > l.hi - 2){ S.cars.splice(i, 1); continue; }
    carPos(S, c);
  }
}

function vanVsCars(S, v){
  if(v.crash) return;
  var fx = Math.cos(v.h), fz = Math.sin(v.h);
  for(var i = 0; i < S.cars.length; i++){
    var c = S.cars[i];
    var dx0 = c.x - v.x, dz0 = c.z - v.z;
    if(dx0 * dx0 + dz0 * dz0 > 100) continue;
    if(Math.abs(v.y - (c.wreck ? c.wreck.y : 0)) > 2.2) continue;
    var cx = Math.cos(c.h), cz = Math.sin(c.h);
    var cvx = c.wreck ? c.wreck.vx : cx * c.v, cvz = c.wreck ? c.wreck.vz : cz * c.v;
    var hit = null;
    for(var s = -1; s <= 1; s += 2){
      var px = v.x + fx * 1.35 * s, pz = v.z + fz * 1.35 * s;
      // into the car's frame
      var rx = px - c.x, rz = pz - c.z;
      var lx = rx * cx + rz * cz, lz = -rx * cz + rz * cx;
      var qx = Math.max(-c.L / 2, Math.min(c.L / 2, lx)), qz = Math.max(-c.W / 2, Math.min(c.W / 2, lz));
      var ddx = lx - qx, ddz = lz - qz, d2 = ddx * ddx + ddz * ddz;
      if(d2 < 1.15 * 1.15){
        var d = Math.sqrt(d2) || 0.001;
        var nlx = d2 > 1e-6 ? ddx / d : (Math.abs(lx) / (c.L / 2) > Math.abs(lz) / (c.W / 2) ? Math.sign(lx) : 0);
        var nlz = d2 > 1e-6 ? ddz / d : (nlx === 0 ? Math.sign(lz) || 1 : 0);
        var nx = nlx * cx - nlz * cz, nz = nlx * cz + nlz * cx;
        var pen = 1.15 - (d2 > 1e-6 ? d : 0);
        hit = {nx: nx, nz: nz, pen: pen};
        v.x += nx * pen; v.z += nz * pen;
      }
    }
    if(!hit){
      // a near miss: close, fast, untouched
      var dist = Math.sqrt(dx0 * dx0 + dz0 * dz0);
      var rel = Math.hypot(v.vx - cvx, v.vz - cvz);
      var bit = 1 << v.i;
      if(!c.wreck && dist < 3.9 && rel > 15 && !(c.nm & bit) && !v.crash && v.ghost <= 0){
        c.nm |= bit;
        v.boost = Math.min(1, v.boost + 0.1);
        v.stats.near++;
        var p = person(S, v.owner, v.owner ? v.name : null); if(p) p.near++;
        emit(S, {k: 'near', v: v.i, x: c.x, z: c.z, rel: rel, car: c.id});
      }
      continue;
    }
    var relN = (v.vx - cvx) * hit.nx + (v.vz - cvz) * hit.nz;
    if(-relN > CRASH_CAR && v.ghost <= 0){
      wreckCar(S, c, v, -relN);
      S.hitCar = c.id;
      crash(S, v, 'car', -relN, hit.nx, hit.nz);
      return;
    }
    if(relN < 0){ v.vx -= hit.nx * relN * 1.2; v.vz -= hit.nz * relN * 1.2; }
    if(-relN > 4) emit(S, {k: 'bump', v: v.i, imp: -relN, x: v.x, z: v.z});
    if(-relN > 4 && v.ghost <= 0){ dent(S, v, -relN * 0.012); if(v.dmg >= 1){ S.hitCar = c.id; crash(S, v, 'wrecked', 22, hit.nx, hit.nz); return; } }
    // a hard shove sends the car flying even when the van keeps going
    if(-relN > 6 && !c.wreck){ wreckCar(S, c, v, -relN * 0.8); S.hitCar = null; }
  }
}
function wreckCar(S, c, v, imp){
  if(c.wreck) return;
  var R = S.R;
  var cx = Math.cos(c.h), cz = Math.sin(c.h);
  // up, over and rolling: a hard hit throws the car end over end
  var big = Math.min(1, imp / 35);
  c.wreck = {t: 0, y: 0.2, vy: Math.min(20, 4 + imp * 0.42), vx: cx * c.v * 0.4 + v.vx * 0.95, vz: cz * c.v * 0.4 + v.vz * 0.95,
    ax: 0, ay: 0, az: 0, wx: (R() < 0.5 ? -1 : 1) * (3 + imp * 0.35 * (0.6 + R() * 0.6)), wy: (R() - 0.5) * imp * 0.25,
    wz: (R() < 0.5 ? -1 : 1) * (2 + imp * 0.3 * R()), boom: imp > 30 && R() < 0.45};
  emit(S, {k: 'carhit', id: c.id, x: c.x, z: c.z, imp: imp, vx: c.wreck.vx, vz: c.wreck.vz, boom: c.wreck.boom, big: big});
}

function vanVsVans(S){
  for(var i = 0; i < S.vans.length; i++) for(var j = i + 1; j < S.vans.length; j++){
    var a = S.vans[i], b = S.vans[j];
    if(a.crash || b.crash || a.ghost > 0 || b.ghost > 0 || a.remote || b.remote) continue;
    var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if(d > 3.4 || d < 1e-4 || Math.abs(a.y - b.y) > 2) continue;
    var nx = dx / d, nz = dz / d, pen = 3.4 - d;
    a.x -= nx * pen / 2; a.z -= nz * pen / 2; b.x += nx * pen / 2; b.z += nz * pen / 2;
    var rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if(rel < 0){
      if(-rel > 26){ crash(S, a, 'van', -rel, -nx, -nz); crash(S, b, 'van', -rel, nx, nz); continue; }
      a.vx += nx * rel * 0.55; a.vz += nz * rel * 0.55; b.vx -= nx * rel * 0.55; b.vz -= nz * rel * 0.55;
      if(-rel > 4) emit(S, {k: 'bump', v: a.i, imp: -rel, x: a.x, z: a.z});
    }
  }
}

/* ---------------- the Gilbert Goons ---------------- */
function goonTick(S){
  var M = S.M, R = S.R;
  var want = S.clock >= 15 && S.clock < 18.6 ? Math.min(12, 2 + Math.floor(S.vans.length * 1.5) + Math.floor((S.clock - 15) * 1.2)) : 0;
  var live = S.goons.filter(function(g){ return g.st !== 'gone'; });
  if(live.length < want && R() < DT * 0.8){
    var v = S.vans[Math.floor(R() * S.vans.length)];
    if(v){
      var a = R() * Math.PI * 2, d = 70 + R() * 90, cx = v.x, cz = v.z;
      // half of them wait round the corner from where that van is headed
      var tp = v.cargo.length && R() < 0.5 ? targetPoint(S, v) : null;
      if(tp && Math.hypot(tp.x - v.x, tp.z - v.z) > 90){ cx = tp.x; cz = tp.z; d = 25 + R() * 30; }
      var spot = M.roadSpot(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
      var gn = {id: S.goonId++, x: spot.x, z: spot.z, y: 0, h: spot.h, v: 0, st: 'ride', t: 0, grab: 0, carry: null,
        name: GOON_NAMES[Math.floor(R() * GOON_NAMES.length)], color: Math.floor(R() * 6), tv: -1};
      S.goons.push(gn);
      if(S.goons.filter(function(q){ return q.st !== 'gone'; }).length === 1) emit(S, {k: 'goons'});
    }
  }
  for(var i = S.goons.length - 1; i >= 0; i--){
    var g = S.goons[i];
    g.t += DT;
    if(g.st === 'gone'){ if(g.t > 1) S.goons.splice(i, 1); continue; }
    if(g.st === 'flung'){
      g.vy -= G * DT; g.x += g.vx * DT; g.z += g.vz * DT; g.y += g.vy * DT;
      g.spin += g.wspin * DT;
      var gh = M.height(g.x, g.z);
      if(g.y < gh){ g.y = gh; g.vy = g.vy < -4 ? -g.vy * 0.3 : 0; g.vx *= 0.8; g.vz *= 0.8;
        if(M.surf(g.x, g.z) === 3 && !g.splashed){ g.splashed = true; emit(S, {k: 'splash', x: g.x, z: g.z, small: true}); } }
      if(g.t > 3.5){ g.st = 'gone'; g.t = 0; }
      continue;
    }
    // go home when the dust comes in
    if(S.clock >= 18.6 && g.st === 'ride'){ g.st = 'gone'; g.t = 0; continue; }
    var tx, tz, sp;
    if(g.st === 'flee'){
      var nv = nearestVan(S, g.x, g.z);
      var away = nv ? Math.atan2(g.z - nv.z, g.x - nv.x) : g.h;
      tx = g.x + Math.cos(away) * 30; tz = g.z + Math.sin(away) * 30; sp = 11.5;
      if(g.t > 22){
        // got away with it
        var o = orderById(S, g.carry);
        if(o && o.state === 'stolen'){ o.state = 'new'; o.van = -1; o.born = Math.max(o.born, S.t - o.patience + 60); S.rep = Math.max(0, S.rep - 0.1); }
        emit(S, {k: 'getaway', name: g.name});
        g.st = 'gone'; g.t = 0; continue;
      }
    } else {
      // chase whichever loaded van is nearest
      // (an empty van gets pestered too, so everybody meets them)
      var best = null, bd = 1e9;
      S.vans.forEach(function(v){ if(v.crash) return; var d = Math.hypot(v.x - g.x, v.z - g.z) - (v.cargo.length ? 120 : 0); if(d < bd){ bd = d; best = v; } });
      if(best) bd = Math.hypot(best.x - g.x, best.z - g.z);
      if(!best || bd > 320){ tx = g.x + Math.cos(g.h) * 20; tz = g.z + Math.sin(g.h) * 20; sp = 6; g.tv = -1;
        if(R() < DT * 0.3) g.h += (R() - 0.5) * 2; }
      else {
        g.tv = best.i;
        tx = best.x + best.vx * 0.6; tz = best.z + best.vz * 0.6; sp = best.cargo.length ? 10.5 : 8.5;
        if(bd < 3.2 && best.spd < 12 && best.cargo.length){
          g.grab += DT;
          if(g.grab > 0.7){
            var idx = Math.floor(R() * best.cargo.length), oid = best.cargo[idx];
            best.cargo.splice(idx, 1);
            if(best.prio === oid) best.prio = null;
            var o2 = orderById(S, oid);
            if(o2){ o2.state = 'stolen'; o2.van = -1; }
            g.carry = oid; g.st = 'flee'; g.t = 0; g.grab = 0;
            S.stolen++;
            emit(S, {k: 'gooned', v: best.i, name: g.name, x: g.x, z: g.z, ri: o2 ? o2.ri : 0});
          }
        } else g.grab = Math.max(0, g.grab - DT);
      }
    }
    var want2 = Math.atan2(tz - g.z, tx - g.x);
    g.h += Math.max(-3 * DT, Math.min(3 * DT, wrapA(want2 - g.h)));
    g.v += Math.max(-8 * DT, Math.min(6 * DT, sp - g.v));
    g.x += Math.cos(g.h) * g.v * DT; g.z += Math.sin(g.h) * g.v * DT;
    // around buildings and walls
    var near = M.near(g.x, g.z, 2, scratch);
    for(var k = 0; k < near.b.length; k++){
      var b = M.boxes[near.b[k]];
      var px = Math.max(b.x0, Math.min(b.x1, g.x)), pz = Math.max(b.z0, Math.min(b.z1, g.z));
      var dx = g.x - px, dz = g.z - pz, d2 = dx * dx + dz * dz;
      if(d2 < 0.36 && d2 > 1e-8){ var d = Math.sqrt(d2); g.x += dx / d * (0.6 - d); g.z += dz / d * (0.6 - d); g.h += 0.08; }
    }
    if(M.surf(g.x, g.z) === 3){ g.h += Math.PI * 0.5; g.x -= Math.cos(g.h) * 0.5; }
    // hit by a van
    for(var j = 0; j < S.vans.length; j++){
      var v2 = S.vans[j];
      if(v2.crash || Math.abs(v2.y) > 2) continue;
      var ddx = g.x - v2.x, ddz = g.z - v2.z, dd = Math.hypot(ddx, ddz);
      if(dd < 2.3 && v2.spd > 5){
        g.st = 'flung'; g.t = 0;
        g.vx = v2.vx * 0.75 + ddx / (dd || 1) * 5; g.vz = v2.vz * 0.75 + ddz / (dd || 1) * 5; g.vy = 6 + v2.spd * 0.15;
        g.spin = 0; g.wspin = 10 + v2.spd * 0.3;
        S.goonsHit++; S.money += 5;
        v2.boost = Math.min(1, v2.boost + 0.15); v2.stats.goons++;
        var p = person(S, v2.owner, v2.owner ? v2.name : null); if(p) p.goons++;
        var rec = false;
        if(g.carry != null){
          var o3 = orderById(S, g.carry);
          if(o3 && o3.state === 'stolen' && v2.cargo.length < CAP){ o3.state = 'van'; o3.van = v2.i; v2.cargo.push(o3.id); rec = true; }
          else if(o3 && o3.state === 'stolen'){ o3.state = 'new'; o3.van = -1; }
          g.carry = null;
        }
        emit(S, {k: 'goonhit', v: v2.i, name: g.name, x: g.x, z: g.z, rec: rec});
        break;
      }
    }
  }
}
function nearestVan(S, x, z){
  var best = null, bd = 1e9;
  S.vans.forEach(function(v){ var d = Math.hypot(v.x - x, v.z - z); if(d < bd){ bd = d; best = v; } });
  return best;
}

/* ---------------- the haboob ---------------- */
function weatherTick(S){
  var R = S.R;
  var target = S.clock < 18 ? 0 : Math.min(1, (S.clock - 18) / 0.6);
  S.dust += (target - S.dust) * Math.min(1, DT * 0.6);
  S.gust.t -= DT;
  if(S.gust.t <= 0){
    S.gust.t = 2.5 + R() * 3.5;
    var a = R() * Math.PI * 2, f = 3 + R() * 7;
    S.gust.x = Math.cos(a) * f; S.gust.z = Math.sin(a) * f;
    if(S.dust > 0.3) emit(S, {k: 'gust', x: S.gust.x, z: S.gust.z});
  }
  if(S.dust > 0.05 && !S.dustSaid){ S.dustSaid = true; emit(S, {k: 'haboob'}); }
}

/* ---------------- the parade ---------------- */
function startParade(S){
  var M = S.M, l = M.gilbertLine;
  var z0 = M.G.ew[5].z - 40;   // just north of Guadalupe
  S.parade = {t: 0, dur: 40, x: l.p, z: z0, z0: z0, speed: 7, h: Math.PI / 2};
  S.ph = 'parade';
  emit(S, {k: 'parade'});
}
function paradeToss(S, who, ang, pow){
  var P = S.parade, R = S.R;
  var side = Math.sin(ang) >= 0 ? 1 : -1;     // right of the float's heading (it heads south: right is west)
  var reach = 6 + pow * 20;
  var fwd = Math.cos(ang) * 4;
  // the float heads +z; its right hand is -x
  var tx = P.x - side * reach + (R() - 0.5) * 2, tz = P.z + fwd + P.speed * 0.9 + (R() - 0.5) * 3;
  var road = S.M.gilbertLine.w / 2;
  var off = Math.abs(tx - S.M.gilbertLine.p);
  var hit = off > road + 1 && off < road + 11;
  S.shots.push({kind: 'parade', who: who, x0: P.x, z0: P.z, y0: 4, tx: tx, tz: tz, t: 0, T: 0.9, hit: hit, ri: Math.floor(R() * 6)});
  emit(S, {k: 'ptoss', who: who, x: P.x, z: P.z, tx: tx, tz: tz, T: 0.9, hit: hit});
}
function paradeTick(S){
  var P = S.parade;
  P.t += DT; P.z += P.speed * DT;
  shotsTick(S);
  if(P.t >= P.dur){ S.ph = 'results'; S.results.cheers = S.cheers; S.results.money = S.money; emit(S, {k: 'paradeEnd'}); }
}

/* ---------------- the end of the day ---------------- */
function endDay(S){
  S.ph = 'end';
  S.vans.forEach(function(v){
    v.cargo.forEach(function(id){ var o = orderById(S, id); if(o){ o.state = 'lost'; o.endT = S.t; } });
    v.cargo = []; v.gas = v.brk = v.bst = 0;
  });
  S.results = {money: S.money, delivered: S.delivered, perfect: S.perfect, crashes: S.crashes, damage: S.damage,
    roses: S.roses, walkins: S.walkins, cancelled: S.cancelled, missed: S.missed, goons: S.goonsHit,
    stolen: S.stolen, rep: S.rep, awards: awards(S), holiday: S.holiday, best: S.best,
    vans: S.vans.map(function(v){ return {name: v.name, owner: v.owner, del: v.stats.del, crashes: v.stats.crashes,
      top: v.stats.top, air: v.stats.air, near: v.stats.near, money: v.stats.money}; })};
  emit(S, {k: 'dayEnd'});
}

function awards(S){
  var ppl = Object.values(S.ppl);
  var out = [];
  function top(key, title, fmt, min){
    var best = null;
    ppl.forEach(function(p){ if((p[key] || 0) > (best ? best[key] : (min || 0))) best = p; });
    if(best) out.push({title: title, name: best.name, id: best.id, val: fmt(best[key], best)});
  }
  top('del', 'Most deliveries', function(n){ return n + ' bouquets'; });
  top('perfect', 'Right on the porch', function(n){ return n + ' perfect tosses'; });
  top('arranged', 'Best hands in the shop', function(n, p){ return n + ' arrangements, ' + Math.round(p.q / n * 100) + '% average'; });
  top('harvested', 'Green thumb', function(n){ return n + ' stems grown'; });
  top('roses', 'The Rose Lady', function(n){ return n + ' roses at 25 cents (well, $2)'; });
  top('crashes', 'Insurance nightmare', function(n){ return n + ' crashes'; });
  top('near', 'Too close for comfort', function(n){ return n + ' near misses'; });
  top('goons', 'Goon buster', function(n){ return n + ' Gilbert Goons sent flying'; });
  top('air', 'Frequent flyer', function(n){ return n.toFixed(1) + ' seconds of air'; }, 0.5);
  top('assigned', 'Dispatch', function(n){ return n + ' calls'; });
  top('cheers', 'Parade favourite', function(n){ return n + ' cheers'; });
  return out;
}

/* ---------------- the step ---------------- */
function step(S){
  S.ev = S.q; S.q = [];
  if(S.paused) return;
  S.dt = DT;
  if(S.ph === 'count'){
    S.count -= DT;
    if(S.count <= 0){ S.ph = 'day'; S.t = 0; emit(S, {k: 'go'}); }
    else if(Math.ceil(S.count) !== Math.ceil(S.count + DT)) emit(S, {k: 'count', n: Math.ceil(S.count)});
    S.vans.forEach(function(v){ v.ghost = 1.5; });
    return;
  }
  if(S.ph === 'parade'){ paradeTick(S); return; }
  if(S.ph !== 'day') return;
  S.t += DT;
  S.clock = hourAt(S);
  orderTick(S);
  computerArranger(S);
  gardenTick(S);
  weatherTick(S);
  trafficTick(S);
  for(var i = 0; i < S.vans.length; i++){
    var v = S.vans[i];
    if(v.ghost > 0) v.ghost -= DT;
    if(v.remote){
      // a phone drives this one: it sends where the van is; the TV still
      // routes it, loads it, wilts its flowers and lets the goons at it
      routeTick(S, v);
      if(!v.crash) vanStops(S, v);
      if(S.R() < 0.02) v.street = S.M.streetAt(v.x, v.z) || v.street;
      continue;
    }
    if(v.crash){ crashTick(S, v); continue; }
    routeTick(S, v);
    if(!v.owner) aiDrive(S, v);
    vanPhysics(S, v);
    if(v.crash) continue;
    vanVsCars(S, v);
    vanStops(S, v);
    if(S.R() < 0.02) v.street = S.M.streetAt(v.x, v.z) || v.street;
  }
  vanVsVans(S);
  goonTick(S);
  shotsTick(S);
  for(var k in S.broken) if(S.broken[k] < S.t){ delete S.broken[k]; }
  for(var w in S.wallsDown) if(S.wallsDown[w] < S.t){ delete S.wallsDown[w]; }
  S.pings.forEach(function(p){ p.t -= DT; });
  S.pings = S.pings.filter(function(p){ return p.t > 0; });
  if(S.t >= S.dayLen) endDay(S);
}

/* ---------------- vans driven by phones ---------------- */
/* The phone runs its own van (WSim.local / localStep) so the steering never
   waits on the wifi, and tells the TV where it is ~30 times a second. */
function remoteState(S, i, a){
  var v = S.vans[i]; if(!v || !v.remote || !a) return;
  var ox = v.x, oz = v.z;
  v.x = +a[0]; v.z = +a[1]; v.y = +a[2]; v.h = +a[3]; v.vx = +a[4]; v.vz = +a[5]; v.vy = +a[6]; v.yaw = +a[7];
  v.boost = +a[8]; var f = a[9] | 0; v.dmg = +a[10] || 0;
  v.boosting = !!(f & 1); v.drift = (f & 2) ? 1 : 0; v.air = (f & 4) ? 0.5 : 0; v.ghost = (f & 8) ? 0.5 : 0;
  v.powder = (f & 32) ? Math.max(v.powder, 0.1) : v.powder;
  v.spd = Math.hypot(v.vx, v.vz);
  if(v.spd > v.stats.top) v.stats.top = v.spd;
  var jump = Math.hypot(v.x - ox, v.z - oz);
  if(jump < 30) v.stats.dist += jump;
  if(f & 16){
    if(!v.crash) v.crash = {remote: true, t: 0, cause: 'crash', imp: 0, lost: 0, h: v.h};
    v.crash.x = v.x; v.crash.z = v.z; v.crash.y = v.y;
    v.crash.ax = +a[11] || 0; v.crash.ay = +a[12] || 0; v.crash.az = +a[13] || 0; v.crash.h = +a[14] || v.h;
  } else if(v.crash && v.crash.remote) v.crash = null;
}
function remoteEvent(S, i, e){
  var v = S.vans[i]; if(!v || !v.remote || !e || S.ph !== 'day') return;
  switch(e.k){
    case 'crash':
      var cc = crashCargo(S, v, e.cause, +e.imp || 20);
      v.crash = {remote: true, t: 0, cause: e.cause, imp: +e.imp || 20, lost: cc.lost.length, h: v.h, x: v.x, z: v.z, y: v.y, ax: 0, ay: 0, az: 0};
      if(e.car != null){ var c = S.cars.filter(function(q){ return q.id === e.car; })[0]; if(c) wreckCar(S, c, v, +e.imp || 20); }
      emit(S, {k: 'crash', v: v.i, cause: e.cause, imp: +e.imp || 20, x: v.x, y: v.y, z: v.z, vx: +e.vx || 0, vz: +e.vz || 0, lost: cc.lost, kaboom: !!e.kaboom, cost: cc.cost});
      break;
    case 'near':
      v.stats.near++;
      var p = person(S, v.owner, v.name); if(p) p.near++;
      emit(S, {k: 'near', v: v.i, x: +e.x || v.x, z: +e.z || v.z, rel: +e.rel || 20});
      break;
    case 'smash':
      var pr = S.M.props[e.p | 0]; if(!pr || S.broken[e.p | 0]) return;
      S.broken[e.p | 0] = S.t + 60;
      emit(S, {k: 'smash', p: e.p | 0, kind: pr.k, x: pr.x, z: pr.z, vx: v.vx, vz: v.vz});
      break;
    case 'land':
      var air = Math.min(8, +e.air || 0);
      v.stats.air += air;
      if(!S.best.air || air > S.best.air.t) S.best.air = {t: air, name: v.name, owner: v.owner};
      var pa = person(S, v.owner, v.name); if(pa) pa.air += air;
      emit(S, {k: 'land', v: v.i, air: air, x: v.x, z: v.z});
      break;
    case 'wall':
      var wb = S.M.boxes[e.b | 0]; if(!wb || wb.k !== 'wall' || S.wallsDown[e.b | 0]) return;
      S.wallsDown[e.b | 0] = S.t + 120;
      emit(S, {k: 'wall', b: e.b | 0, v: v.i, x: (wb.x0 + wb.x1) / 2, z: (wb.z0 + wb.z1) / 2, vx: v.vx, vz: v.vz});
      break;
    case 'respawn':
      v.crash = null; v.routeT = 0;
      emit(S, {k: 'respawn', v: v.i});
      break;
  }
}

/* A phone's own copy: the town, its van and the traffic it is told about. */
function local(M, v){
  var L = {M: M, local: true, R: root.WMap.rng(7), t: 0, q: [], ev: [], cars: [], broken: {}, wallsDown: {}, dust: 0, gust: {x: 0, z: 0, t: 0},
    vans: [], best: {}, ppl: {}, orders: [], hitCar: null};
  return L;
}
function localVan(L, x, z, h){
  var v = {i: 0, owner: 'me', name: 'me', x: x, z: z, y: 0, vy: 0, h: h || 0, vx: 0, vz: 0, yaw: 0, g: 0,
    st: 0, gas: 0, brk: 0, bst: 0, boost: 0.35, boosting: false, drift: 0, driftT: 0, powder: 0,
    air: 0, ghost: 1.5, crash: null, cargo: [], tgt: null, spd: 0, street: '', dmg: 0,
    stats: {del: 0, perfect: 0, crashes: 0, near: 0, air: 0, top: 0, drift: 0, goons: 0, dist: 0, money: 0, boosts: 0}};
  L.vans = [v];
  return v;
}
function localStep(L){
  L.ev = L.q; L.q = [];
  L.t += DT;
  var v = L.vans[0]; if(!v) return;
  if(v.ghost > 0) v.ghost -= DT;
  if(v.powder > 0) v.powder = Math.max(0, v.powder - DT);
  if(v.crash){ crashTick(L, v); return; }
  vanPhysics(L, v);
  if(!v.crash) vanVsCars(L, v);
}
/* the numbers a phone sends: see remoteState */
function packVan(v){
  var f = (v.boosting ? 1 : 0) | (v.drift ? 2 : 0) | (v.air > 0.3 ? 4 : 0) | (v.ghost > 0 ? 8 : 0) | (v.crash ? 16 : 0) | (v.powder > 0 ? 32 : 0);
  var r = function(n, k){ return Math.round(n * k) / k; };
  var a = [r(v.x, 100), r(v.z, 100), r(v.y, 100), r(v.h, 1000), r(v.vx, 100), r(v.vz, 100), r(v.vy, 100), r(v.yaw, 1000), r(v.boost, 1000), f, r(v.dmg || 0, 100)];
  if(v.crash) a.push(r(v.crash.ax, 100), r(v.crash.ay, 100), r(v.crash.az, 100), r(v.crash.h, 100));
  return a;
}

/* ---------------- what the phones are told ---------------- */
var STATE_CODE = {'new': 0, arr: 1, ready: 2, van: 3, air: 4, stolen: 5, done: 6, lost: 7};
function snap(S){
  var out = {ph: S.ph, clk: Math.round(S.clock * 100) / 100, tmp: Math.round(tempAt(S.clock)), $: S.money,
    rep: Math.round(S.rep * 10) / 10, dust: Math.round(S.dust * 100) / 100, hol: S.holiday,
    stk: S.stock.slice(), cnt: S.ph === 'count' ? Math.ceil(S.count) : 0,
    ord: [], vans: [], goons: [], pings: [], gar: null, del: S.delivered};
  S.orders.forEach(function(o){
    var sc = STATE_CODE[o.state];
    if(sc >= 6) return;
    var row = [o.id, o.kind === 'walk' ? 1 : 0, sc, o.ri, o.house, Math.round(o.fresh * 100), o.van, o.by || '', o.prio ? 1 : 0,
      Math.max(0, Math.round(o.patience - (S.t - o.born))), o.who, o.pref];
    if(o.state === 'arr' && o.arr) row.push(o.arr.st.join(','), o.arr.wrap || '', o.arr.rib || '',
      (o.arr.pos || []).map(function(q){ return [q[0], q[1] === null ? null : Math.round(q[1] * 1000) / 1000, q[2] === null ? null : Math.round(q[2] * 1000) / 1000, Math.round(q[3] * 100) / 100]; }));
    out.ord.push(row);
  });
  S.vans.forEach(function(v){ out.vans.push([Math.round(v.x), Math.round(v.z), Math.round(v.h * 100) / 100, v.cargo.length, v.name, v.owner || '', v.crash ? 1 : 0, v.tgt && v.tgt.k === 'house' ? v.tgt.id : -1]); });
  S.goons.forEach(function(g){ if(g.st !== 'gone') out.goons.push([Math.round(g.x), Math.round(g.z), g.carry != null ? 1 : 0]); });
  S.pings.forEach(function(p){ out.pings.push([Math.round(p.x), Math.round(p.z), p.k]); });
  if(S.roles.grow > 0){ out.gar = S.garden.map(function(p){ return [p.f, Math.round(p.water * 100), Math.round(p.grow * 100)]; }); out.gn = S.gardenN; }
  if(S.parade) out.par = {t: Math.round(S.parade.t), dur: S.parade.dur, ch: S.cheers};
  return out;
}

/* what a driver's or tosser's phone needs about its van */
function vanInfo(S, i){
  var v = S.vans[i]; if(!v) return null;
  var M = S.M, o = tossTarget(S, v, 60), tg = null;
  if(o){
    var h = M.houses[o.house];
    tg = {ang: Math.round(wrapA(Math.atan2(h.porch.z - v.z, h.porch.x - v.x) - v.h) * 100) / 100,
          d: Math.round(Math.hypot(h.porch.x - v.x, h.porch.z - v.z)), ok: Math.hypot(h.porch.x - v.x, h.porch.z - v.z) < 34, ri: o.ri, addr: h.addr};
  }
  var cargo = v.cargo.map(function(id){ var q = orderById(S, id); return q ? [q.ri, Math.round(q.fresh * 100)] : [0, 0]; });
  var tp = targetPoint(S, v), tgtInfo = null;
  if(tp){
    tgtInfo = {k: v.tgt.k, d: Math.round(Math.hypot(tp.x - v.x, tp.z - v.z)),
      name: v.tgt.k === 'house' ? M.houses[v.tgt.id].addr : M.shops[v.tgt.id].name};
  }
  return {dmg: Math.round((v.dmg || 0) * 100), spd: Math.round(v.spd * 2.237), bst: Math.round(v.boost * 100), b: v.boosting ? 1 : 0, pw: v.powder > 0 ? 1 : 0,
    cr: v.crash ? 1 : 0, cargo: cargo, toss: tg, tgt: tgtInfo, st: v.street, dr: v.drift ? 1 : 0, name: v.name, air: v.air > 0.3 ? 1 : 0};
}

root.WSim = {
  DT: DT, DAY_LEN: DAY_LEN, CAP: CAP, MAX_VANS: MAX_VANS, FLOWERS: FLOWERS, WRAPS: WRAPS, RIBBONS: RIBBONS,
  HOLIDAYS: HOLIDAYS, HOLIDAY_KEYS: HOLIDAY_KEYS, VAN_COLORS: VAN_COLORS, CAR_KINDS: CAR_KINDS,
  create: create, addVan: addVan, setOwner: setOwner, input: input, start: start, step: step, act: act,
  snap: snap, vanInfo: vanInfo, startParade: startParade, tempAt: tempAt, heat01: heat01, orderById: orderById,
  recipes: recipes, targetPoint: targetPoint, tossTarget: tossTarget, wrapA: wrapA, person: person,
  STATE_CODE: STATE_CODE, remoteState: remoteState, remoteEvent: remoteEvent, local: local, localVan: localVan,
  localStep: localStep, packVan: packVan, carPos: carPos, sigGreen: sigGreen
};
})(typeof window !== 'undefined' ? window : globalThis);
