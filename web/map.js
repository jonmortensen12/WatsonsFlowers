/* Watson's Flowers - the map.

   One function, WMap.build(WGEO, seed), turns the real positions baked into
   geo.js (the mile-road grid, the freeways, the canals, the landmarks) into
   the whole town: streets, neighbourhoods, houses with porches and
   addresses, block walls, palms, plazas, parks, the shop on Main Street
   and Grandpa's on Palo Verde Street.

   The TV, every phone and the headless checks all call it with the same
   seed and get the same town, so a house is just an index everywhere.
   It draws nothing. Coordinates are metres: x east, z south, y up.

   The mile roads, freeways and canals are where they really are (squeezed
   5x); everything between the mile roads is invented. */
(function(root){
'use strict';

function rng(seed){
  var s = (seed >>> 0) || 1;
  return function(){
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var SURF = {DIRT: 0, ROAD: 1, GRASS: 2, WATER: 3, CONCRETE: 4, BANK: 5, FIELD: 6};
var RES = 2;                       // metres per raster cell
var W_ART = 22, W_COL = 13, W_FWY = 34, W_RES = 9;
var CANAL_W = 9, BANK_W = 6, CANAL_CLEAR = 15;

var NS_COLLECTORS = ['Extension Road', 'Ironwood Drive', 'Center Street', 'Horne', 'Burk Street',
                     'Quist Lane', 'Ocotillo Road', 'Cholla Drive', 'Juniper Road'];
var EW_COLLECTORS = ['Rose Lady Lane', 'First Avenue', 'Irene Avenue', 'Mesquite Street',
                     'Juanita Avenue', 'Page Avenue', 'Knox Road', 'Bluebird Street'];
var LOOP_NAMES = ['Saguaro', 'Mesquite', 'Ocotillo', 'Agave', 'Cottonwood', 'Juniper', 'Desert Willow',
  'Bougainvillea', 'Oleander', 'Sage', 'Yucca', 'Ironwood', 'Cholla', 'Primrose', 'Lantana', 'Aloe',
  'Hackberry', 'Acacia', 'Jacaranda', 'Citrus', 'Orange Blossom', 'Lemon', 'Pecan', 'Olive',
  'Cactus Wren', 'Roadrunner', 'Quail', 'Coyote', 'Javelina', 'Dove', 'Hummingbird', 'Gila',
  'Superstition', 'Sunset', 'Monsoon', 'Canal', 'Orchard', 'Dairy', 'Pioneer', 'Temple View'];
var PROP_R = {bush: 0.9, pole: 0.3, bin: 0.5, bale: 0.5, cone: 0.4, crate: 0.8, gate: 1.1, tire: 0.7};
var SUFFIX = ['Street', 'Avenue', 'Drive', 'Circle', 'Lane', 'Way', 'Place', 'Court'];
var STORES = ['TACOS', 'DONUTS', 'PHARMACY', 'SNO-CONES', 'PIZZA', 'BOBA', 'TIRES', 'NAILS',
  'MATTRESS', 'BURGERS', 'HARDWARE', 'GROCERY', 'DENTIST', 'GYM', 'CAR WASH', 'TAMALES',
  'BBQ', 'YOGURT', 'BIKE SHOP', 'THRIFT'];

function build(G, seed){
  var R = rng(seed || 1927);
  var M = {G: G, SURF: SURF, RES: RES, seed: seed || 1927};

  /* A town is either the mile-road grid (Mesa: straight lines north-south
     and east-west, G.ns/G.ew) or free (G.roads: curves through control
     points, joined at named junctions, over hills from G.terrain). Every
     road is a "line" either way: a straight one has an axis and a fixed p;
     a curved one has pts, sampled every few metres. Positions along a line
     are s: the x or z for a straight line, metres along it for a curve. */
  var FREE = !!G.roads;
  M.free = FREE;

  /* ---------------- the grid lines ---------------- */
  var fNS = FREE ? null : G.fwy.filter(function(f){ return f.axis === 'ns'; })[0];
  var fEW = FREE ? null : G.fwy.filter(function(f){ return f.axis === 'ew'; })[0];
  var X0 = FREE ? 0 : fNS.x - W_FWY / 2 - 4, X1 = FREE ? G.size[0] : G.ns[G.ns.length - 1].x + 85;
  var Z0 = FREE ? 0 : G.ew[0].z - 68, Z1 = FREE ? G.size[1] : G.ew[G.ew.length - 1].z + 68;
  M.bounds = {x0: X0, x1: X1, z0: Z0, z1: Z1};
  M.W = X1; M.H = Z1;

  var lines = [];   // {axis, p, kind, w, names:[{name, z|x cut}], lo, hi}
  function addLine(axis, p, kind, names){
    var w = kind === 'fwy' ? W_FWY : kind === 'art' ? W_ART : W_COL;
    var l = {id: lines.length, axis: axis, p: p, kind: kind, w: w, names: names,
             lo: axis === 'ns' ? Z0 : fNS.x, hi: axis === 'ns' ? Z1 : X1, nodes: []};
    lines.push(l);
    return l;
  }
  if(!FREE){
  addLine('ns', fNS.x, 'fwy', [{name: fNS.name, cut: null}]);
  G.ns.forEach(function(a, i){
    addLine('ns', a.x, 'art', a.names.map(function(n){ return {name: n.name, cut: n.z}; }));
    var cn = G.nsCol ? G.nsCol[i] : NS_COLLECTORS[i % NS_COLLECTORS.length];
    if(i < G.ns.length - 1 && G.ns[i + 1].x - a.x > 250 && cn)
      addLine('ns', (a.x + G.ns[i + 1].x) / 2, 'col', [{name: cn, cut: null}]);
  });
  G.ew.forEach(function(a, i){
    addLine('ew', a.z, 'art', [{name: a.names[0].name, cut: null}]);
    if(i < G.ew.length - 1){
      var mid = (a.z + G.ew[i + 1].z) / 2;
      if(Math.abs(mid - fEW.z) < 60) addLine('ew', fEW.z, 'fwy', [{name: fEW.name, cut: null}]);
      else if(G.ew[i + 1].z - a.z > 250 && (G.ewCol ? G.ewCol[i] : true)) addLine('ew', mid, 'col', [{name: G.ewCol ? G.ewCol[i] : EW_COLLECTORS[i % EW_COLLECTORS.length], cut: null}]);
    }
  });
  } else freeLines();
  M.lines = lines;

  /* ---- curves: a Catmull-Rom spline through the control points ---- */
  function freeLines(){
    function cr(a, b, c, d, t){
      var t2 = t * t, t3 = t2 * t;
      return [0.5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
              0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)];
    }
    G.roads.forEach(function(rd){
      var P = rd.pts.map(function(p){ return typeof p === 'string' ? G.junctions[p] : p; });
      var jn = rd.pts.map(function(p){ return typeof p === 'string' ? p : null; });
      var kind = rd.kind || 'art';
      var w = kind === 'fwy' ? W_FWY : kind === 'art' ? W_ART : W_COL;
      var l = {id: lines.length, kind: kind, w: w, names: [{name: rd.name, cut: null}], nodes: [], junc: [], crests: rd.crests || []};
      var allX = P.every(function(p){ return p[0] === P[0][0]; }), allZ = P.every(function(p){ return p[1] === P[0][1]; });
      if(allX || allZ){
        // straight: the grid kind of line
        l.axis = allX ? 'ns' : 'ew'; l.p = allX ? P[0][0] : P[0][1];
        var cs = P.map(function(p){ return allX ? p[1] : p[0]; });
        l.lo = Math.min.apply(null, cs); l.hi = Math.max.apply(null, cs);
        P.forEach(function(p, k){ if(jn[k]) l.junc.push({j: jn[k], at: allX ? p[1] : p[0]}); });
        var n = Math.ceil((l.hi - l.lo) / 4);
        l.pts = []; for(var q = 0; q <= n; q++){ var a = l.lo + (l.hi - l.lo) * q / n; l.pts.push(allX ? [l.p, a] : [a, l.p]); }
      } else {
        var pts = [], marks = [];
        for(var k = 0; k < P.length - 1; k++){
          var p0 = P[k - 1] || P[k], p1 = P[k], p2 = P[k + 1], p3 = P[k + 2] || P[k + 1];
          var m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
          marks.push(pts.length);
          for(var i = 0; i < m; i++) pts.push(cr(p0, p1, p2, p3, i / m));
        }
        marks.push(pts.length); pts.push(P[P.length - 1].slice());
        l.axis = null; l.pts = pts;
        P.forEach(function(p, k){ if(jn[k]) l.junc.push({j: jn[k], idx: marks[k]}); });
      }
      // lengths along it
      var cum = [0];
      for(var q2 = 1; q2 < l.pts.length; q2++) cum.push(cum[q2 - 1] + Math.hypot(l.pts[q2][0] - l.pts[q2 - 1][0], l.pts[q2][1] - l.pts[q2 - 1][1]));
      l.cum = cum; l.len = cum[cum.length - 1];
      if(!l.axis){ l.lo = 0; l.hi = l.len; l.junc.forEach(function(j){ j.at = cum[j.idx]; }); }
      lines.push(l);
    });
  }
  /* where a line is at s: the point and the way it runs */
  M.linePoint = function(l, s){
    if(l.axis === 'ns') return {x: l.p, z: s, dx: 0, dz: 1};
    if(l.axis === 'ew') return {x: s, z: l.p, dx: 1, dz: 0};
    var c = l.cum, lo = 0, hi = c.length - 1;
    if(s <= 0) lo = 0; else if(s >= l.len) lo = hi - 1;
    else { while(hi - lo > 1){ var mid = (lo + hi) >> 1; if(c[mid] <= s) lo = mid; else hi = mid; } }
    var a = l.pts[lo], b = l.pts[lo + 1], L = (c[lo + 1] - c[lo]) || 1, t = Math.max(0, Math.min(1, (s - c[lo]) / L));
    return {x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L};
  };
  /* the nearest point of a line to (x, z): {s, d, x, z} */
  M.lineNear = function(l, x, z){
    if(l.axis === 'ns'){ var sz = Math.max(l.lo, Math.min(l.hi, z)); return {s: sz, d: Math.hypot(x - l.p, z - sz), x: l.p, z: sz}; }
    if(l.axis === 'ew'){ var sx = Math.max(l.lo, Math.min(l.hi, x)); return {s: sx, d: Math.hypot(z - l.p, x - sx), x: sx, z: l.p}; }
    var best = {s: 0, d: 1e9, x: 0, z: 0}, P = l.pts;
    for(var k = 0; k < P.length - 1; k++){
      var ax = P[k][0], az = P[k][1], bx = P[k + 1][0], bz = P[k + 1][1];
      if(Math.abs(x - ax) > best.d + 8 && Math.abs(x - bx) > best.d + 8) continue;
      if(Math.abs(z - az) > best.d + 8 && Math.abs(z - bz) > best.d + 8) continue;
      var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      var t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
      var qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
      if(d < best.d) best = {s: l.cum[k] + Math.sqrt(L2) * t, d: d, x: qx, z: qz};
    }
    return best;
  };
  function lineDist(l, x, z){ return l.axis === 'ns' ? Math.abs(x - l.p) : l.axis === 'ew' ? Math.abs(z - l.p) : M.lineNear(l, x, z).d; }
  var NSL = lines.filter(function(l){ return l.axis === 'ns'; }).sort(function(a, b){ return a.p - b.p; });
  var EWL = lines.filter(function(l){ return l.axis === 'ew'; }).sort(function(a, b){ return a.p - b.p; });
  M.lineName = function(l, along){
    for(var i = 0; i < l.names.length; i++){
      var n = l.names[i];
      if(n.cut == null || along < n.cut) return n.name;
    }
    return l.names[l.names.length - 1].name;
  };

  /* ---------------- containers ---------------- */
  var boxes = [];      // solid: {x0,z0,x1,z1,h,k}
  var circles = [];    // solid: {x,z,r,h,k}
  var props = [];      // breakable: {x,z,r,k}
  var houses = [];
  var cells = [];
  var basins = [];     // {x,z,rx,rz,d}
  var ramps = [];      // {x0,z0,x1,z1,dx,dz,h,len}
  var decks = [];      // boxes you can drive on top of (container roofs): indices into boxes
  var pickups = [];    // {k:'keg'|'ice'|'boom', x,z}
  var misters = [];
  var trees = [];      // visual + solid circle: {x,z,k:'palm'|'pv'|'orange'|'saguaro'|'pine', s}
  var lots = [];       // concrete pads for drawing: {x0,z0,x1,z1,k}
  var buildings = [];  // stores/landmark boxes for drawing: {x0,z0,x1,z1,h,k,label,color,face}
  var resRoads = [];   // residential streets: {x0,z0,x1,z1,name}
  var drives = [];     // driveways
  var walls = [];      // {x0,z0,x1,z1,h}
  var signs = [];      // store signs {x,z,face,label,w}
  var canals = G.canals.map(function(c){ return {name: c.name, pts: c.pts}; });
  var ponds = (G.ponds || []).map(function(p){ return {x: p.x, z: p.z, rx: p.rx, rz: p.rz}; });      // {x,z,rx,rz}
  var fields = [];     // {x0,z0,x1,z1,k}
  var lights = [];     // traffic signal positions (visual)
  M.boxes = boxes; M.circles = circles; M.props = props; M.houses = houses; M.cells = cells;
  M.basins = basins; M.ramps = ramps; M.pickups = pickups; M.misters = misters; M.trees = trees;
  M.lots = lots; M.buildings = buildings; M.resRoads = resRoads; M.drives = drives; M.walls = walls;
  M.decks = decks;
  M.signs = signs; M.canals = canals; M.ponds = ponds; M.fields = fields; M.lights = lights;

  /* ---------------- canal helpers ---------------- */
  function distSeg(px, pz, ax, az, bx, bz){
    var dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    var t = L > 0 ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + dx * t - px, qz = az + dz * t - pz;
    return Math.sqrt(qx * qx + qz * qz);
  }
  function canalDist(x, z){
    var best = 1e9;
    for(var i = 0; i < canals.length; i++){
      var p = canals[i].pts;
      for(var j = 0; j < p.length - 1; j++){
        var d = distSeg(x, z, p[j][0], p[j][1], p[j + 1][0], p[j + 1][1]);
        if(d < best) best = d;
      }
    }
    return best;
  }
  function rectNearCanal(x0, z0, x1, z1, clear){
    // conservative: centre distance minus half diagonal
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hd = Math.hypot(x1 - x0, z1 - z0) / 2;
    return canalDist(cx, cz) < clear + hd;
  }
  M.canalDist = canalDist;

  /* ---------------- landmarks ---------------- */
  var LM = G.lm;
  function inRect(p, r, m){ m = m || 0; return p.x >= r.x0 - m && p.x <= r.x1 + m && p.z >= r.z0 - m && p.z <= r.z1 + m; }

  /* ---------------- cells ---------------- */
  var ci = 0;
  // a free town says where its districts are: flat pads beside the roads
  if(FREE) (G.pockets || []).forEach(function(pk){ cells.push({id: ci++, x0: pk.x0, x1: pk.x1, z0: pk.z0, z1: pk.z1, W: null, E: null, N: null, S: null, type: pk.type, name: pk.name, pk: pk}); });
  for(var i = 0; i < (FREE ? 0 : NSL.length); i++){
    var L = NSL[i], Rn = NSL[i + 1];
    var cx0 = L.p + L.w / 2 + 3, cx1 = Rn ? Rn.p - Rn.w / 2 - 3 : X1 - 2;
    for(var j = -1; j < EWL.length; j++){
      var T = EWL[j], B = EWL[j + 1];
      var cz0 = T ? T.p + T.w / 2 + 3 : Z0 + 2, cz1 = B ? B.p - B.w / 2 - 3 : Z1 - 2;
      if(cx1 - cx0 < 20 || cz1 - cz0 < 20) continue;
      cells.push({id: ci++, x0: cx0, x1: cx1, z0: cz0, z1: cz1,
        W: L, E: Rn || null, N: T || null, S: B || null, type: null});
    }
  }

  // which cells are special
  function cellAt(x, z){
    for(var k = 0; k < cells.length; k++) if(inRect({x: x, z: z}, cells[k])) return cells[k];
    return null;
  }
  M.cellAt = cellAt;
  var mainLine = (FREE ? lines : EWL).filter(function(l){ return /Main/.test(l.names[0].name); })[0];
  var gilbertLine = NSL.filter(function(l){ return /Gilbert/.test(l.names[0].name); })[0];
  var elliotLine = EWL.filter(function(l){ return /Elliot/.test(l.names[0].name); })[0];
  M.mainLine = mainLine; M.gilbertLine = gilbertLine;
  M.name = G.name || 'Mesa & Gilbert';

  function canalThrough(c){
    // a canal's centreline crosses the middle of this cell
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    return canalDist((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2) < Math.min(w, h) / 2 - 10;
  }
  cells.forEach(function(c){
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    var cxm = (c.x0 + c.x1) / 2, czm = (c.z0 + c.z1) / 2;
    if(FREE) return;
    if(G.zones){
      // a made-up town: districts by rectangle
      var zn = null;
      for(var q = 0; q < G.zones.length && !zn; q++) if(inRect({x: cxm, z: czm}, G.zones[q])) zn = G.zones[q];
      if(inRect(LM.watsons, c, 14) && c.N === mainLine) c.type = 'watsons';
      else if(zn) c.type = w < 60 || h < 60 ? 'desert' : zn.type;
      else if(inRect(LM.grandpa, c)) c.type = 'grandpa';
      else if(canalThrough(c)) c.type = 'canal';
      else if(w < 95 || h < 95) c.type = 'desert';
      else { var r0 = R(); c.type = r0 < 0.12 ? 'plaza' : r0 < 0.18 ? 'park' : r0 < 0.21 ? 'school' : 'homes'; }
      return;
    }
    if(inRect(LM.watsons, c, 14) && c.N === mainLine) c.type = 'watsons';
    else if(inRect(LM.grandpa, c)) c.type = 'grandpa';
    else if(inRect(LM.temple, c)) c.type = 'temple';
    else if(cxm > 1193 && cxm < 1513 && (c.N === mainLine || c.S === mainLine)) c.type = 'downtown';
    else if((c.W === gilbertLine || c.E === gilbertLine) && czm > LM.tower.z - 120 && czm < elliotLine.p) c.type = 'heritage';
    else if(inRect(LM.riparian, c)) c.type = 'riparian';
    else if(inRect(LM.freestone, c)) c.type = 'pondpark';
    else if(inRect(LM.mcc, c)) c.type = 'campus';
    else if(w < 95 || h < 95) c.type = R() < 0.7 ? 'desert' : 'strip';
    else {
      var r = R();
      c.type = r < 0.15 ? 'plaza' : r < 0.24 ? 'park' : r < 0.31 ? (czm < 600 ? 'grove' : 'farm') : r < 0.35 ? 'school' : 'homes';
    }
  });

  /* ---------------- helpers that place things ---------------- */
  function clearOfCanal(x0, z0, x1, z1){ return !rectNearCanal(x0, z0, x1, z1, CANAL_CLEAR); }
  function addBox(x0, z0, x1, z1, h, k, extra){
    if(!clearOfCanal(x0, z0, x1, z1)) return null;
    var b = {x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h: h, k: k};
    if(extra) for(var q in extra) b[q] = extra[q];
    boxes.push(b);
    return b;
  }
  function addWall(x0, z0, x1, z1){
    // walls are split around the canal corridor rather than dropped whole
    var horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    var len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    var n = Math.max(1, Math.ceil(len / 12));
    for(var s = 0; s < n; s++){
      var a = s / n, b = (s + 1) / n;
      var ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      var t = 0.5;
      var bb = horiz ? addBox(ax, az - t, bx, bz + t, 1.9, 'wall') : addBox(ax - t, az, bx + t, bz, 1.9, 'wall');
      if(bb){ bb.bi = boxes.length - 1; bb.wi = walls.length; walls.push(bb); }
    }
  }
  function addTree(x, z, k){
    if(canalDist(x, z) < CANAL_CLEAR) return;
    var s = 0.8 + R() * 0.5;
    trees.push({x: x, z: z, k: k, s: s});
    if(k === 'pv' || k === 'orange' || k === 'olive') circles.push({x: x, z: z, r: 0.45, h: 4, k: 'tree'});
    else if(k === 'palm') circles.push({x: x, z: z, r: 0.4, h: 12, k: 'palm'});
    else if(k === 'saguaro') circles.push({x: x, z: z, r: 0.5, h: 5, k: 'saguaro'});
    else if(k === 'pine') circles.push({x: x, z: z, r: 0.5, h: 9, k: 'tree'});
  }
  function addProp(x, z, k){
    if(canalDist(x, z) < CANAL_CLEAR - 4) return;
    props.push({x: x, z: z, r: PROP_R[k] || 0.5, k: k});
  }
  function store(x0, z0, x1, z1, face, h){
    var b = addBox(x0, z0, x1, z1, h || 6, 'store', {color: Math.floor(R() * 6)});
    if(!b) return;
    var label = STORES[Math.floor(R() * STORES.length)];
    buildings.push({x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: b.h, k: 'store', label: label, face: face, color: b.color});
    var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    var fx = face === 'n' ? cx : face === 's' ? cx : face === 'w' ? b.x0 : b.x1;
    var fz = face === 'n' ? b.z0 : face === 's' ? b.z1 : cz;
    signs.push({x: fx, z: fz, face: face, label: label, w: Math.min(10, (face === 'n' || face === 's') ? (b.x1 - b.x0) * 0.8 : (b.z1 - b.z0) * 0.8), y: b.h - 1.2});
    return b;
  }

  /* house numbering: Mesa counts 800 to the mile from Center Street and
     Main Street; Gilbert from Gilbert Road. (Grandpa's 122 E Palo Verde
     comes out right with this.) */
  var mileGame = FREE ? 1 : (G.ns[1].x - G.ns[0].x);
  var centerX = FREE ? 0 : (G.ns[2].x + G.ns[3].x) / 2;
  function houseNum(x, z, ew){
    if(FREE){ var o = G.origin || [X1 / 2, Z1 / 2], al = ew ? x - o[0] : z - o[1];
      return {n: Math.max(10, Math.round(Math.abs(al) / 2) * 2), dir: ew ? (al >= 0 ? 'E' : 'W') : (al >= 0 ? 'S' : 'N')}; }
    var gilbert = z > G.ew[4].z - 5 && x > G.ns[4].x;
    var base = ew ? (gilbert ? gilbertLine.p : centerX) : mainLine.p;
    var along = ew ? x - base : z - base;
    var n = Math.round(Math.abs(along) / mileGame * 800 / 2) * 2;
    n = Math.max(10, n);
    var dir = ew ? (along >= 0 ? 'E' : 'W') : (along >= 0 ? 'S' : 'N');
    return {n: n, dir: dir};
  }

  /* ---------------- cell builders ---------------- */
  var loopNames = LOOP_NAMES.slice();
  for(var s1 = loopNames.length - 1; s1 > 0; s1--){ var j1 = Math.floor(R() * (s1 + 1)); var tmp = loopNames[s1]; loopNames[s1] = loopNames[j1]; loopNames[j1] = tmp; }
  var loopCount = 0;
  var loops = [];      // {cell, x0,z0,x1,z1, name, entries:[{side,at, to:{line, x,z}}]}
  M.loops = loops;
  var entriesWanted = [];   // to wire into the graph: {lx,lz (on loop), gx,gz (on grid line), line, loop}

  function sideLine(c, side){ return side === 'n' ? c.N : side === 's' ? c.S : side === 'w' ? c.W : c.E; }

  function walledEdges(c, gaps){
    // a block wall around the cell's edge, leaving the entries open
    var ins = 1.5;
    var x0 = c.x0 + ins, x1 = c.x1 - ins, z0 = c.z0 + ins, z1 = c.z1 - ins;
    ['n', 's', 'w', 'e'].forEach(function(side){
      var g = gaps.filter(function(q){ return q.side === side; }).map(function(q){ return q.at; }).sort(function(a, b){ return a - b; });
      var horiz = side === 'n' || side === 's';
      var a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1, fixed = side === 'n' ? z0 : side === 's' ? z1 : side === 'w' ? x0 : x1;
      var cur = a0;
      g.concat([1e9]).forEach(function(at){
        var end = Math.min(a1, at - 7);
        if(end - cur > 2){ if(horiz) addWall(cur, fixed, end, fixed); else addWall(fixed, cur, fixed, end); }
        cur = at + 7;
      });
    });
  }

  /* from a loop's side straight out to the first road, within 110 m */
  function rayHit(x, z, dx, dz, maxD){
    var best = null;
    lines.forEach(function(l){
      if(l.kind === 'fwy') return;
      var P = l.pts;
      for(var k = 0; k < P.length - 1; k++){
        var ax = P[k][0], az = P[k][1], bx = P[k + 1][0], bz = P[k + 1][1];
        var ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if(Math.abs(den) < 1e-9) continue;
        var t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * dz - (az - z) * dx) / den;
        if(t > 0 && t < maxD && u >= 0 && u <= 1 && (!best || t < best.t)) best = {t: t, x: x + dx * t, z: z + dz * t, line: l};
      }
    });
    return best;
  }
  function freeEntrySides(c, lx0, lz0, lx1, lz1){
    var out = [];
    ['n', 's', 'w', 'e'].forEach(function(sd){
      var horiz = sd === 'n' || sd === 's';
      for(var tries = 0; tries < 5; tries++){
        var f = 0.5 + (tries ? (R() - 0.5) * 0.7 : (R() - 0.5) * 0.3);
        var at = Math.round(horiz ? lx0 + (lx1 - lx0) * f : lz0 + (lz1 - lz0) * f);
        var lx = horiz ? at : (sd === 'w' ? lx0 : lx1), lz = horiz ? (sd === 'n' ? lz0 : lz1) : at;
        var dx = sd === 'w' ? -1 : sd === 'e' ? 1 : 0, dz = sd === 'n' ? -1 : sd === 's' ? 1 : 0;
        var hit = rayHit(lx, lz, dx, dz, 110);
        if(hit){ out.push({side: sd, at: at, lx: lx, lz: lz, gx: hit.x, gz: hit.z, line: hit.line, s: M.lineNear(hit.line, hit.x, hit.z).s, d: hit.t}); break; }
      }
    });
    out.sort(function(a, b){ return a.d - b.d; });
    return out.slice(0, 2);
  }

  function homesCell(c, named){
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    var ins = Math.max(31, Math.min(40, Math.min(w, h) * 0.27));
    var lx0 = c.x0 + ins, lx1 = c.x1 - ins, lz0 = c.z0 + ins, lz1 = c.z1 - ins;
    if(lx1 - lx0 < 24 || lz1 - lz0 < 24){ c.type = 'strip'; return stripCell(c); }
    var name = named || (loopNames[loopCount++ % loopNames.length] + ' ' + SUFFIX[Math.floor(R() * SUFFIX.length)]);
    var loop = {cell: c, x0: lx0, z0: lz0, x1: lx1, z1: lz1, name: name, entries: []};
    loops.push(loop);
    c.loop = loop;
    // entries: from each collector side (or the best side if none)
    var gaps = [];
    var cand = ['n', 's', 'w', 'e'].filter(function(sd){ var l = sideLine(c, sd); return l && l.kind === 'col'; });
    if(!cand.length) cand = ['n', 's', 'w', 'e'].filter(function(sd){ var l = sideLine(c, sd); return l && l.kind === 'art'; }).slice(0, 1);
    if(!cand.length) cand = ['n', 's', 'w', 'e'].filter(function(sd){ var l = sideLine(c, sd); return l && l.kind !== 'fwy'; }).slice(0, 1);
    if(cand.length > 2) cand = cand.slice(0, 2);
    if(FREE) cand = freeEntrySides(c, lx0, lz0, lx1, lz1);
    cand.forEach(function(sd){
      if(FREE){
        var e0 = sd; sd = e0.side;
        var hz = sd === 'n' || sd === 's';
        var e1 = {side: sd, at: e0.at, lx: e0.lx, lz: e0.lz, gx: e0.gx, gz: e0.gz, line: e0.line, s: e0.s};
        loop.entries.push(e1); gaps.push({side: sd, at: e0.at});
        if(hz) resRoads.push({x0: e0.at - W_RES / 2, x1: e0.at + W_RES / 2, z0: Math.min(e1.lz, e1.gz), z1: Math.max(e1.lz, e1.gz), name: name});
        else resRoads.push({z0: e0.at - W_RES / 2, z1: e0.at + W_RES / 2, x0: Math.min(e1.lx, e1.gx), x1: Math.max(e1.lx, e1.gx), name: name});
        entriesWanted.push({loop: loop, e: e1});
        return;
      }
      var l = sideLine(c, sd);
      var horiz = sd === 'n' || sd === 's';
      var at = horiz ? (lx0 + lx1) / 2 + (R() - 0.5) * (lx1 - lx0) * 0.4 : (lz0 + lz1) / 2 + (R() - 0.5) * (lz1 - lz0) * 0.4;
      at = Math.round(at);
      var e = {side: sd, at: at};
      e.lx = horiz ? at : (sd === 'w' ? lx0 : lx1);
      e.lz = horiz ? (sd === 'n' ? lz0 : lz1) : at;
      e.gx = horiz ? at : l.p; e.gz = horiz ? l.p : at;
      e.line = l;
      loop.entries.push(e);
      gaps.push({side: sd, at: at});
      // the entry street
      if(horiz) resRoads.push({x0: at - W_RES / 2, x1: at + W_RES / 2, z0: Math.min(e.lz, e.gz), z1: Math.max(e.lz, e.gz), name: name});
      else resRoads.push({z0: at - W_RES / 2, z1: at + W_RES / 2, x0: Math.min(e.lx, e.gx), x1: Math.max(e.lx, e.gx), name: name});
      entriesWanted.push({loop: loop, e: e});
    });
    walledEdges(c, gaps);
    // the loop street
    var hw = W_RES / 2;
    resRoads.push({x0: lx0 - hw, x1: lx1 + hw, z0: lz0 - hw, z1: lz0 + hw, name: name});
    resRoads.push({x0: lx0 - hw, x1: lx1 + hw, z0: lz1 - hw, z1: lz1 + hw, name: name});
    resRoads.push({x0: lx0 - hw, x1: lx0 + hw, z0: lz0 - hw, z1: lz1 + hw, name: name});
    resRoads.push({x0: lx1 - hw, x1: lx1 + hw, z0: lz0 - hw, z1: lz1 + hw, name: name});
    // houses along each side of the loop, outer and inner rows
    var OFF = hw + 1.5 + 7 + 6;   // street centre to house centre
    var HW = 13, HD = 12;
    function row(side, outer){
      var horiz = side === 'n' || side === 's';
      var line = side === 'n' ? lz0 : side === 's' ? lz1 : side === 'w' ? lx0 : lx1;
      var sgn = (side === 'n' || side === 'w') ? -1 : 1;
      if(!outer) sgn = -sgn;
      var a0 = horiz ? lx0 : lz0, a1 = horiz ? lx1 : lz1;
      var startA = outer ? a0 - 6 : a0 + OFF + 2, endA = outer ? a1 + 6 : a1 - OFF - 2;
      if(!outer && (horiz ? (lz1 - lz0) : (lx1 - lx0)) < 2 * (OFF + 6)) return;   // too narrow for an inner row on this side
      var span = endA - startA;
      var n = Math.floor(span / 19);
      if(n < 1) return;
      var step = span / n;
      for(var k = 0; k < n; k++){
        var a = startA + step * (k + 0.5);
        var cxh = horiz ? a : line + sgn * OFF, czh = horiz ? line + sgn * OFF : a;
        // keep clear of entries
        var blocked = loop.entries.some(function(e){
          var eh = e.side === 'n' || e.side === 's';
          if(eh) return Math.abs(cxh - e.at) < 13 && (e.side === 'n' ? czh < lz0 + 4 : czh > lz1 - 4);
          return Math.abs(czh - e.at) < 13 && (e.side === 'w' ? cxh < lx0 + 4 : cxh > lx1 - 4);
        });
        if(blocked) continue;
        var hx0 = cxh - (horiz ? HW : HD) / 2, hx1 = cxh + (horiz ? HW : HD) / 2;
        var hz0 = czh - (horiz ? HD : HW) / 2, hz1 = czh + (horiz ? HD : HW) / 2;
        if(hx0 < c.x0 + 3 || hx1 > c.x1 - 3 || hz0 < c.z0 + 3 || hz1 > c.z1 - 3) continue;
        // inner rows must not overlap houses already placed in the middle
        var clash = houses.some(function(o){ return o.cell === c.id && hx0 < o.x1 + 2 && hx1 > o.x0 - 2 && hz0 < o.z1 + 2 && hz1 > o.z0 - 2; });
        if(clash) continue;
        var bx = addBox(hx0, hz0, hx1, hz1, 4.2 + (R() < 0.15 ? 2.6 : 0), 'house');
        if(!bx) continue;
        // facing: towards the loop street
        var fdx = horiz ? 0 : -sgn, fdz = horiz ? -sgn : 0;
        var fx = cxh + fdx * (HD / 2), fz = czh + fdz * (HD / 2);
        var porch = {x: fx + fdx * 1.2, z: fz + fdz * 1.2};
        var front = {x: horiz ? cxh : line, z: horiz ? line : czh};
        var num = houseNum(front.x, front.z, horiz);
        var hs = {id: houses.length, x: cxh, z: czh, x0: bx.x0, z0: bx.z0, x1: bx.x1, z1: bx.z1, h: bx.h,
          fdx: fdx, fdz: fdz, porch: porch, front: front, cell: c.id, loop: loops.length - 1,
          side: side, street: name, num: num.n, dir: num.dir,
          color: Math.floor(R() * 8), roof: Math.floor(R() * 4), garage: R() < 0.8};
        houses.push(hs);
        drives.push({x0: Math.min(fx, front.x) - (horiz ? 2.6 : 0) + (horiz ? 3 : 0), x1: Math.max(fx, front.x) + (horiz ? 2.6 : 0) + (horiz ? 3 : 0),
                     z0: Math.min(fz, front.z) - (horiz ? 0 : 2.6) + (horiz ? 0 : 3), z1: Math.max(fz, front.z) + (horiz ? 0 : 2.6) + (horiz ? 0 : 3)});
        // front yard: a tree, sometimes a saguaro; a bin at the kerb
        var yx = fx + fdx * 4 + (horiz ? -4 : 0), yz = fz + fdz * 4 + (horiz ? 0 : -4);
        var tr = R();
        if(tr < 0.35) addTree(yx, yz, 'palm');
        else if(tr < 0.75) addTree(yx, yz, 'pv');
        else if(tr < 0.85) addTree(yx, yz, 'saguaro');
        var kx = front.x - fdx * (hw + 0.8) + (horiz ? 4.5 : 0), kz = front.z - fdz * (hw + 0.8) + (horiz ? 0 : 4.5);
        addProp(kx, kz, 'bin');
        if(R() < 0.3) addProp(fx + fdx * 2 + (horiz ? 5 : 0), fz + fdz * 2 + (horiz ? 0 : 5), 'bush');
      }
    }
    ['n', 's', 'w', 'e'].forEach(function(sd){ row(sd, true); });
    ['n', 's', 'w', 'e'].forEach(function(sd){ row(sd, false); });
    // the middle of a big loop: a little green with a palm or two
    if(lx1 - lx0 > 70 && lz1 - lz0 > 70) addTree((lx0 + lx1) / 2, (lz0 + lz1) / 2, 'palm');
    return loop;
  }

  function stripCell(c){
    // one row of houses facing whichever side has a road they can be reached from
    walledEdges(c, []);
    for(var x = c.x0 + 10; x < c.x1 - 10; x += 24){
      for(var z = c.z0 + 10; z < c.z1 - 10; z += 24){
        if(R() < 0.6) addTree(x + R() * 6, z + R() * 6, R() < 0.5 ? 'palm' : 'pv');
      }
    }
  }

  function desertCell(c){
    for(var x = c.x0 + 6; x < c.x1 - 6; x += 14){
      for(var z = c.z0 + 6; z < c.z1 - 6; z += 14){
        var r = R();
        var px = x + (R() - 0.5) * 8, pz = z + (R() - 0.5) * 8;
        if(r < 0.12) addTree(px, pz, 'saguaro');
        else if(r < 0.45) addProp(px, pz, 'bush');
        else if(r < 0.5) addTree(px, pz, 'pv');
      }
    }
  }

  var plazaCount = 0;
  function plazaCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    // stores along the two edges that are not on the arterial corner
    var artSides = ['n', 's', 'w', 'e'].filter(function(sd){ var l = sideLine(c, sd); return l && l.kind === 'art'; });
    var backZ = artSides.indexOf('n') >= 0 ? 's' : 'n';
    var backX = artSides.indexOf('w') >= 0 ? 'e' : 'w';
    var D = 20;
    if(backZ === 's') { for(var x = c.x0 + 4; x < c.x1 - 30; x += 26) store(x, c.z1 - D, Math.min(x + 24, c.x1 - 4), c.z1 - 2, 'n'); }
    else { for(var x2 = c.x0 + 4; x2 < c.x1 - 30; x2 += 26) store(x2, c.z0 + 2, Math.min(x2 + 24, c.x1 - 4), c.z0 + D, 's'); }
    if(backX === 'e') { for(var z = c.z0 + D + 6; z < c.z1 - D - 6; z += 26) store(c.x1 - D, z, c.x1 - 2, Math.min(z + 24, c.z1 - D - 4), 'w'); }
    else { for(var z2 = c.z0 + D + 6; z2 < c.z1 - D - 6; z2 += 26) store(c.x0 + 2, z2, c.x0 + D, Math.min(z2 + 24, c.z1 - D - 4), 'e'); }
    // misters on the storefront patio, an ice chest, light poles, parked cars
    var mx = backX === 'e' ? c.x1 - D - 5 : c.x0 + D + 5;
    var mz = backZ === 's' ? c.z1 - D - 5 : c.z0 + D + 5;
    misters.push({x: mx, z: mz, r: 8, id: misters.length});
    pickups.push({k: 'ice', x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2});
    for(var px = c.x0 + 20; px < c.x1 - 20; px += 30)
      for(var pz = c.z0 + 30; pz < c.z1 - 30; pz += 30) addProp(px, pz, 'pole');
    for(var k = 0; k < 6; k++){
      var cx = c.x0 + 25 + R() * (c.x1 - c.x0 - 50), cz = c.z0 + 25 + R() * (c.z1 - c.z0 - 50);
      var b = addBox(cx - 2.3, cz - 1, cx + 2.3, cz + 1, 1.5, 'parked', {color: Math.floor(R() * 8)});
    }
    plazaCount++;
  }

  function parkCell(c){
    fields.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'grass'});
    var cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    var rx = (c.x1 - c.x0) * 0.32, rz = (c.z1 - c.z0) * 0.32;
    if(canalDist(cx, cz) > Math.max(rx, rz) + CANAL_CLEAR) basins.push({x: cx, z: cz, rx: rx, rz: rz, d: 2.6});
    // trees around the edge
    for(var a = 0; a < 18; a++){
      var t = a / 18 * Math.PI * 2;
      addTree(cx + Math.cos(t) * (rx + 18), cz + Math.sin(t) * (rz + 18), R() < 0.5 ? 'pv' : (R() < 0.5 ? 'pine' : 'palm'));
    }
    // a ramada
    addBox(c.x0 + 8, c.z0 + 8, c.x0 + 16, c.z0 + 14, 3.2, 'ramada');
    buildings.push({x0: c.x0 + 8, z0: c.z0 + 8, x1: c.x0 + 16, z1: c.z0 + 14, h: 3.2, k: 'ramada'});
  }

  function groveCell(c, farm){
    fields.push({x0: c.x0 + 2, z0: c.z0 + 2, x1: c.x1 - 2, z1: c.z1 - 2, k: farm ? 'farm' : 'grove'});
    if(farm){
      // hay bales and an old barn
      var bx = c.x0 + 10, bz = c.z0 + 10;
      addBox(bx, bz, bx + 16, bz + 12, 7, 'barn');
      buildings.push({x0: bx, z0: bz, x1: bx + 16, z1: bz + 12, h: 7, k: 'barn'});
      for(var k = 0; k < 10; k++) addProp(c.x0 + 30 + R() * (c.x1 - c.x0 - 50), c.z0 + 30 + R() * (c.z1 - c.z0 - 50), 'bale');
      return;
    }
    // orange trees in rows, with lanes between
    for(var x = c.x0 + 8; x < c.x1 - 6; x += 9)
      for(var z = c.z0 + 8; z < c.z1 - 6; z += 7)
        if(Math.floor((z - c.z0) / 7) % 4 !== 2) addTree(x, z, 'orange');
  }

  function schoolCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x0 + (c.x1 - c.x0) * 0.45, z1: c.z1, k: 'lot'});
    fields.push({x0: c.x0 + (c.x1 - c.x0) * 0.45, z0: c.z0, x1: c.x1, z1: c.z1, k: 'grass'});
    var bx0 = c.x0 + 10, bx1 = c.x0 + (c.x1 - c.x0) * 0.4;
    addBox(bx0, c.z0 + 20, bx1, c.z0 + 60, 7, 'school');
    buildings.push({x0: bx0, z0: c.z0 + 20, x1: bx1, z1: c.z0 + 60, h: 7, k: 'school', label: 'ELEMENTARY'});
    walledEdges(c, [{side: 'n', at: (c.x0 + c.x1) / 2}, {side: 's', at: (c.x0 + c.x1) / 2}, {side: 'w', at: (c.z0 + c.z1) / 2}, {side: 'e', at: (c.z0 + c.z1) / 2}]);
  }

  /* ---------------- the special places ---------------- */
  M.shops = [];
  function watsonsCell(c){
    var L = LM.watsons;
    // the lot faces Main Street to the north
    var front = c.z0;
    var bx0 = L.x - 14, bx1 = L.x + 12, bz0 = front + 16, bz1 = front + 30;
    lots.push({x0: L.x - 34, z0: front, x1: L.x + 30, z1: bz1 + 4, k: 'lot'});
    addBox(bx0, bz0, bx1, bz1, 5.2, 'watsons');
    buildings.push({x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: 5.2, k: 'watsons', face: 'n'});
    // the sign: a pole at the front corner (solid)
    var sx = L.x + 18, sz = front + 6;
    circles.push({x: sx, z: sz, r: 0.7, h: 14, k: 'sign'});
    M.watsonsSign = {x: sx, z: sz};
    // four cabins behind, the rose garden behind them
    for(var k = 0; k < 4; k++){
      var cx = L.x - 30 + k * 16, cz = bz1 + 14;
      addBox(cx, cz, cx + 9, cz + 8, 3.2, 'cabin');
      buildings.push({x0: cx, z0: cz, x1: cx + 9, z1: cz + 8, h: 3.2, k: 'cabin'});
    }
    fields.push({x0: L.x - 40, z0: bz1 + 28, x1: L.x + 40, z1: Math.min(c.z1 - 4, bz1 + 70), k: 'roses'});
    // the load zone: drive through the lot
    var mn = FREE ? M.lineNear(mainLine, L.x, front) : null;
    M.shops.push({key: 'watsons', name: "Watson's Flowers", x: L.x, z: front + 8, r: 11, line: mainLine, lx: FREE ? mn.x : L.x, lz: FREE ? mn.z : mainLine.p, s: FREE ? mn.s : null});
    // the rest: desert, a few palms
    for(var x = c.x0 + 6; x < L.x - 44; x += 16) for(var z = c.z0 + 6; z < c.z1 - 6; z += 16) if(R() < 0.3) addTree(x, z, R() < 0.5 ? 'palm' : 'saguaro');
    for(var x2 = L.x + 44; x2 < c.x1 - 6; x2 += 16) for(var z2 = c.z0 + 6; z2 < c.z1 - 6; z2 += 16) if(R() < 0.3) addTree(x2, z2, 'pv');
    addTree(L.x - 32, front + 4, 'palm'); addTree(L.x + 26, front + 4, 'palm');
  }

  function grandpaCell(c){
    var loop = homesCell(c, 'Palo Verde Street');
    if(!loop || !loop.name){ return; }
    // Grandpa's: the house nearest the real address
    var best = null, bd = 1e9;
    houses.forEach(function(h){
      if(h.cell !== c.id) return;
      var d = Math.hypot(h.x - LM.grandpa.x, h.z - LM.grandpa.z);
      if(d < bd){ bd = d; best = h; }
    });
    if(!best) return;
    best.grandpa = true; best.num = 122; best.dir = 'E';
    M.grandpaHouse = best.id;
    M.shops.push({key: 'grandpa', name: (FREE || G.zones) ? "Grandpa's" : "Grandpa's (Gilbert)", x: best.front.x, z: best.front.z, r: 11, house: best.id});
  }

  function templeCell(c){
    var L = LM.temple;
    fields.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lawn'});
    var tx0 = L.x - 22, tx1 = L.x + 22, tz0 = L.z - 10, tz1 = L.z + 22;
    addBox(tx0, tz0, tx1, tz1, 16, 'temple');
    buildings.push({x0: tx0, z0: tz0, x1: tx1, z1: tz1, h: 16, k: 'temple'});
    ponds.push({x: L.x, z: c.z0 + 14, rx: 14, rz: 4, shallow: true});
    for(var k = -3; k <= 3; k++){ addTree(L.x + k * 12, tz1 + 12, 'palm'); addTree(L.x + k * 12, c.z0 + 4, 'pine'); }
    walledEdges(c, [{side: 'n', at: L.x}]);
  }

  function downtownCell(c){
    var onMainNorth = c.S === mainLine;   // the cell is north of Main: its south edge faces Main
    var fz = onMainNorth ? c.z1 : c.z0;
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    for(var x = c.x0 + 2; x < c.x1 - 12; x += 16){
      var near = function(p){ return Math.abs(p.x - (x + 7)) < 16 && Math.abs(p.z - fz) < 40; };
      if(near(LM.neon) || near(LM.artsctr)) continue;
      var h = 6 + Math.floor(R() * 3) * 3.5;
      var b0 = onMainNorth ? fz - 18 : fz, b1 = onMainNorth ? fz : fz + 18;
      var b = addBox(x, b0, x + 14, b1, h, 'brick', {color: Math.floor(R() * 5)});
      if(b){
        var lab = STORES[Math.floor(R() * STORES.length)];
        buildings.push({x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: h, k: 'brick', color: b.color, face: onMainNorth ? 's' : 'n', label: lab});
        signs.push({x: x + 7, z: onMainNorth ? fz : fz, face: onMainNorth ? 's' : 'n', label: lab, w: 10, y: 3.6});
      }
      addTree(x + 15, onMainNorth ? fz - 1 : fz + 1, 'pv');
    }
    if(inRect({x: LM.neon.x, z: LM.neon.z}, {x0: c.x0, x1: c.x1, z0: c.z0 - 30, z1: c.z1 + 30}) && Math.abs(LM.neon.z - fz) < 40){
      M.neon = {x: LM.neon.x, z: onMainNorth ? fz - 14 : fz + 14};
      for(var k = 0; k < 6; k++) circles.push({x: M.neon.x - 12 + k * 5, z: M.neon.z + (k % 2) * 6 - 3, r: 0.3, h: 7, k: 'neonpole'});
    }
    if(Math.abs(LM.artsctr.x - (c.x0 + c.x1) / 2) < (c.x1 - c.x0) / 2 && Math.abs(LM.artsctr.z - fz) < 40){
      var ax = LM.artsctr.x;
      var a0 = onMainNorth ? fz - 30 : fz + 6, a1 = onMainNorth ? fz - 6 : fz + 30;
      addBox(ax - 16, a0, ax + 16, a1, 11, 'arts');
      buildings.push({x0: ax - 16, z0: a0, x1: ax + 16, z1: a1, h: 11, k: 'arts'});
    }
  }

  function heritageCell(c){
    var west = c.E === gilbertLine;      // the cell is west of Gilbert Road
    var fx = west ? c.x1 : c.x0;
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    for(var z = c.z0 + 2; z < c.z1 - 12; z += 15){
      if(west && Math.abs(z + 7 - LM.tower.z) < 20) continue;
      var h = 5 + Math.floor(R() * 2) * 3;
      var b0 = west ? fx - 16 : fx, b1 = west ? fx : fx + 16;
      var b = addBox(b0, z, b1, z + 13, h, 'brick', {color: Math.floor(R() * 5)});
      if(b){
        var lab = STORES[Math.floor(R() * STORES.length)];
        buildings.push({x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: h, k: 'brick', color: b.color, face: west ? 'e' : 'w', label: lab});
        signs.push({x: fx, z: z + 6.5, face: west ? 'e' : 'w', label: lab, w: 9, y: 3.4});
      }
    }
    if(west && Math.abs(LM.tower.z - (c.z0 + c.z1) / 2) < (c.z1 - c.z0) / 2 + 10){
      var tx = c.x1 - 24, tz = LM.tower.z;
      M.tower = {x: tx, z: tz};
      [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(function(o){ circles.push({x: tx + o[0], z: tz + o[1], r: 0.5, h: 22, k: 'tower'}); });
    }
  }

  function riparianCell(c){
    fields.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'marsh'});
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    ponds.push({x: c.x0 + w * 0.5, z: c.z0 + h * 0.3, rx: w * 0.3, rz: h * 0.16});
    ponds.push({x: c.x0 + w * 0.45, z: c.z0 + h * 0.72, rx: w * 0.25, rz: h * 0.14});
    for(var k = 0; k < 30; k++) addTree(c.x0 + R() * w, c.z0 + R() * h, R() < 0.6 ? 'pv' : 'pine');
  }
  function pondParkCell(c){
    fields.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'grass'});
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    ponds.push({x: c.x0 + w * 0.55, z: c.z0 + h * 0.5, rx: w * 0.2, rz: h * 0.25});
    for(var k = 0; k < 24; k++){ var t = k / 24 * Math.PI * 2; addTree(c.x0 + w * 0.55 + Math.cos(t) * (w * 0.2 + 14), c.z0 + h * 0.5 + Math.sin(t) * (h * 0.25 + 14), R() < 0.5 ? 'palm' : 'pv'); }
  }
  function campusCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    [[0.1, 0.1, 0.45, 0.35], [0.55, 0.15, 0.9, 0.4], [0.15, 0.6, 0.5, 0.9]].forEach(function(r){
      var b = addBox(c.x0 + w * r[0], c.z0 + h * r[1], c.x0 + w * r[2], c.z0 + h * r[3], 9, 'campus');
      if(b) buildings.push({x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: 9, k: 'campus', label: 'MCC'});
    });
    for(var k = 0; k < 20; k++) addTree(c.x0 + R() * w, c.z0 + R() * h, 'palm');
  }


  /* ---------------- the made-up town's districts ---------------- */
  // a jump: the lip at (lx, lz), climbing along +axis*dir to height h over len
  function addRamp(lx, lz, axis, dir, len, h, wid){
    wid = wid || 5;
    if(axis === 'x'){ var s0 = lx - dir * len; ramps.push({x0: Math.min(s0, lx), x1: Math.max(s0, lx), z0: lz - wid / 2, z1: lz + wid / 2, dx: dir, dz: 0, s0: s0, h: h, len: len}); }
    else { var s1 = lz - dir * len; ramps.push({z0: Math.min(s1, lz), z1: Math.max(s1, lz), x0: lx - wid / 2, x1: lx + wid / 2, dx: 0, dz: dir, s0: s1, h: h, len: len}); }
  }
  function building(x0, z0, x1, z1, h, k, extra){
    var b = addBox(x0, z0, x1, z1, h, k, extra);
    if(b){ var o = {x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: h, k: k}; if(extra) for(var q in extra) o[q] = extra[q]; buildings.push(o); }
    return b;
  }
  function gateRow(ax, az, bx, bz){
    var n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 2.2));
    for(var k = 0; k <= n; k++) addProp(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 'gate');
  }
  // canal jumps: ramps across the canal, alternating ways, all along it
  function canalJumps(c){
    var gap = CANAL_W / 2 + BANK_W + 1;
    canals.forEach(function(cn){
      var p = cn.pts;
      for(var k = 0; k < p.length - 1; k++){
        var ax = p[k][0], az = p[k][1], bx = p[k + 1][0], bz = p[k + 1][1];
        if(Math.abs(bx - ax) < 1){         // runs north-south: jump east-west
          if(ax < c.x0 || ax > c.x1) continue;
          var n = 0;
          for(var z = c.z0 + 30; z < c.z1 - 25; z += 55, n++){ var d = n % 2 ? 1 : -1; addRamp(ax - d * gap, z, 'x', d, 12, 2.8, 6); }
        } else if(Math.abs(bz - az) < 1){  // runs east-west: jump north-south
          if(az < c.z0 || az > c.z1) continue;
          var m = 0;
          for(var x = c.x0 + 30; x < c.x1 - 25; x += 55, m++){ var e = m % 2 ? 1 : -1; addRamp(x, az - e * gap, 'z', e, 12, 2.8, 6); }
        }
      }
    });
  }
  function canalCell(c){
    fields.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'grass'});
    canalJumps(c);
    for(var k = 0; k < 14; k++) addTree(c.x0 + 8 + R() * (c.x1 - c.x0 - 16), c.z0 + 8 + R() * (c.z1 - c.z0 - 16), R() < 0.6 ? 'palm' : 'pv');
  }

  // downtown: towers on a grid of alleys; gates across the alley mouths
  function towersCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    var A = 10, w = c.x1 - c.x0, h = c.z1 - c.z0;
    var nx = Math.max(2, Math.round(w / 52)), nz = Math.max(2, Math.round(h / 52));
    var bw = (w - 4 - (nx - 1) * A) / nx, bh = (h - 4 - (nz - 1) * A) / nz;
    var xs = [], zs = [];
    for(var i = 0; i < nx; i++) xs.push(c.x0 + 2 + i * (bw + A));
    for(var j = 0; j < nz; j++) zs.push(c.z0 + 2 + j * (bh + A));
    // the alleys
    for(var i2 = 1; i2 < nx; i2++){ var ax = xs[i2] - A / 2; resRoads.push({x0: ax - A / 2, x1: ax + A / 2, z0: c.z0, z1: c.z1, name: 'Alley'});
      if(R() < 0.65) gateRow(ax - A / 2 + 0.8, c.z0 + 1.5, ax + A / 2 - 0.8, c.z0 + 1.5);
      if(R() < 0.65) gateRow(ax - A / 2 + 0.8, c.z1 - 1.5, ax + A / 2 - 0.8, c.z1 - 1.5);
      if(R() < 0.5) pickups.push({k: 'keg', x: ax, z: c.z0 + h * (0.3 + R() * 0.4)}); }
    for(var j2 = 1; j2 < nz; j2++){ var az = zs[j2] - A / 2; resRoads.push({z0: az - A / 2, z1: az + A / 2, x0: c.x0, x1: c.x1, name: 'Alley'});
      if(R() < 0.65) gateRow(c.x0 + 1.5, az - A / 2 + 0.8, c.x0 + 1.5, az + A / 2 - 0.8);
      if(R() < 0.65) gateRow(c.x1 - 1.5, az - A / 2 + 0.8, c.x1 - 1.5, az + A / 2 - 0.8);
      // a kicker in the alley, into a crossing
      if(R() < 0.45 && nx > 1){ var kx = xs[1] - A / 2 - (R() < 0.5 ? 14 : -14); addRamp(kx, az, 'x', kx < xs[1] - A / 2 ? 1 : -1, 8, 1.8, 5); } }
    // the blocks
    for(var bi = 0; bi < nx; bi++) for(var bj = 0; bj < nz; bj++){
      var x0 = xs[bi], z0 = zs[bj], x1 = x0 + bw, z1 = z0 + bh;
      if(R() < 0.12){
        // a little plaza: a palm each corner, a fountain of crates in the middle
        addTree(x0 + 4, z0 + 4, 'palm'); addTree(x1 - 4, z1 - 4, 'palm'); addTree(x0 + 4, z1 - 4, 'palm'); addTree(x1 - 4, z0 + 4, 'palm');
        for(var q = 0; q < 4; q++) addProp((x0 + x1) / 2 + (q % 2 - 0.5) * 2, (z0 + z1) / 2 + (q > 1 ? 1 : -1), 'crate');
        continue;
      }
      var tall = 16 + Math.floor(R() * 5) * 7 + (R() < 0.15 ? 25 : 0);
      var face = bj === 0 ? 'n' : bj === nz - 1 ? 's' : bi === 0 ? 'w' : bi === nx - 1 ? 'e' : null;
      var b = building(x0, z0, x1, z1, tall, 'tower', {color: Math.floor(R() * 6), face: face});
      if(b && face){
        var lab = STORES[Math.floor(R() * STORES.length)];
        var fx = face === 'w' ? b.x0 : face === 'e' ? b.x1 : (b.x0 + b.x1) / 2, fz = face === 'n' ? b.z0 : face === 's' ? b.z1 : (b.z0 + b.z1) / 2;
        signs.push({x: fx, z: fz, face: face, label: lab, w: 10, y: 3.6});
      }
    }
  }

  // the airfield: a runway with a mega ramp each way, kickers, hangars
  function airfieldCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    var w = c.x1 - c.x0, h = c.z1 - c.z0, alongX = w >= h;
    var mid = alongX ? (c.z0 + c.z1) / 2 + h * 0.08 : (c.x0 + c.x1) / 2 + w * 0.08;
    var a0 = (alongX ? c.x0 : c.z0) + 8, a1 = (alongX ? c.x1 : c.z1) - 8, L = a1 - a0;
    if(alongX) resRoads.push({x0: a0, x1: a1, z0: mid - 13, z1: mid + 13, name: 'Runway'});
    else resRoads.push({z0: a0, z1: a1, x0: mid - 13, x1: mid + 13, name: 'Runway'});
    // the mega ramps: one each way, either side of the middle
    if(alongX){ addRamp(a0 + L * 0.34, mid - 5, 'x', 1, 22, 7.5, 8); addRamp(a0 + L * 0.66, mid + 5, 'x', -1, 22, 7.5, 8); }
    else { addRamp(mid - 5, a0 + L * 0.34, 'z', 1, 22, 7.5, 8); addRamp(mid + 5, a0 + L * 0.66, 'z', -1, 22, 7.5, 8); }
    // cones down both edges of the runway
    for(var t = a0 + 6; t < a1 - 6; t += 14){
      if(alongX){ addProp(t, mid - 14.5, 'cone'); addProp(t, mid + 14.5, 'cone'); }
      else { addProp(mid - 14.5, t, 'cone'); addProp(mid + 14.5, t, 'cone'); }
    }
    // hangars and the control tower along the far side
    var side = alongX ? c.z0 + 4 : c.x0 + 4;
    for(var k = 0; k < 3; k++){
      var s0 = a0 + 10 + k * (L - 20) / 3, s1 = s0 + Math.min(34, (L - 20) / 3 - 10);
      if(alongX) building(s0, side, s1, side + 22, 11, 'hangar', {label: 'HANGAR ' + (k + 1)});
      else building(side, s0, side + 22, s1, 11, 'hangar', {label: 'HANGAR ' + (k + 1)});
    }
    var tx = alongX ? a1 - 14 : side + 36, tz = alongX ? side + 36 : a1 - 14;
    building(tx - 4, tz - 4, tx + 4, tz + 4, 24, 'ctower');
    // kickers on the apron, both ways
    for(var q = 0; q < 4; q++){
      var at = a0 + 20 + R() * (L - 40), off = (q % 2 ? 1 : -1) * (22 + R() * 10), dir = q < 2 ? 1 : -1;
      if(alongX) addRamp(at, mid + off, 'x', dir, 9, 2.2, 6); else addRamp(mid + off, at, 'z', dir, 9, 2.2, 6);
    }
    pickups.push({k: 'keg', x: alongX ? a0 + L * 0.2 : mid, z: alongX ? mid : a0 + L * 0.2});
    pickups.push({k: 'keg', x: alongX ? a0 + L * 0.8 : mid, z: alongX ? mid : a0 + L * 0.8});
  }

  // the speedway: a ring track, a grandstand, an infield of jumps
  function speedwayCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    var I = 14, T = 16;   // track centre inset, track width
    var x0 = c.x0 + I, x1 = c.x1 - I, z0 = c.z0 + I, z1 = c.z1 - I, hw = T / 2;
    resRoads.push({x0: x0 - hw, x1: x1 + hw, z0: z0 - hw, z1: z0 + hw, name: 'Speedway'});
    resRoads.push({x0: x0 - hw, x1: x1 + hw, z0: z1 - hw, z1: z1 + hw, name: 'Speedway'});
    resRoads.push({x0: x0 - hw, x1: x0 + hw, z0: z0 - hw, z1: z1 + hw, name: 'Speedway'});
    resRoads.push({x0: x1 - hw, x1: x1 + hw, z0: z0 - hw, z1: z1 + hw, name: 'Speedway'});
    var ix0 = x0 + hw + 2, ix1 = x1 - hw - 2, iz0 = z0 + hw + 2, iz1 = z1 - hw - 2;
    fields.push({x0: ix0, z0: iz0, x1: ix1, z1: iz1, k: 'grass'});
    // tyres round the infield, with gaps to cut across
    function tyres(ax, az, bx, bz){ var n = Math.round(Math.hypot(bx - ax, bz - az) / 7); for(var k = 0; k <= n; k++) if(k % 6 !== 3) addProp(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 'tire'); }
    tyres(ix0, iz0, ix1, iz0); tyres(ix0, iz1, ix1, iz1); tyres(ix0, iz0, ix0, iz1); tyres(ix1, iz0, ix1, iz1);
    // the grandstand, outside the long side nearest the freeway
    building(c.x0 + 1, z0 + 30, c.x0 + I - hw - 1, z1 - 30, 7, 'stand');
    // jumps across the infield, and one on each straight
    var iw = ix1 - ix0, ih = iz1 - iz0;
    for(var k = 0; k < 3; k++){
      var zz = iz0 + ih * (0.25 + k * 0.25), dir = k % 2 ? -1 : 1;
      addRamp(dir > 0 ? ix0 + iw * 0.4 : ix1 - iw * 0.4, zz, 'x', dir, 14, 3.6, 7);
    }
    addRamp(x1, z0 + (z1 - z0) * 0.5, 'z', 1, 12, 2.6, 7);
    addRamp(x0, z0 + (z1 - z0) * 0.5, 'z', -1, 12, 2.6, 7);
    for(var q = 0; q < 8; q++) addProp(ix0 + 10 + R() * (iw - 20), iz0 + 10 + R() * (ih - 20), 'crate');
    pickups.push({k: 'keg', x: (x0 + x1) / 2, z: z1});
    pickups.push({k: 'keg', x: (x0 + x1) / 2, z: z0});
  }

  // the rail yard: rows of containers two wide, a ramp onto each row
  var CCOL = 6;
  function yardCell(c){
    lots.push({x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, k: 'lot'});
    var w = c.x1 - c.x0, h = c.z1 - c.z0, CL = 12.2, CW = 2.5, CH = 2.6;
    var n = 0;
    for(var z = c.z0 + 14; z + 2 * CW < c.z1 - 10; z += 2 * CW + 15, n++){
      var len = Math.floor((w - 50) * (0.55 + R() * 0.35) / CL);
      if(len < 2) continue;
      var start = n % 2 ? c.x1 - 18 - len * CL : c.x0 + 18;
      for(var k = 0; k < len; k++){
        var x = start + k * CL;
        for(var r2 = 0; r2 < 2; r2++){
          var b = building(x, z + r2 * CW, x + CL, z + (r2 + 1) * CW, CH, 'container', {color: Math.floor(R() * CCOL)});
          if(b){ b.deck = true; decks.push(boxes.length - 1); }
        }
      }
      // up onto the roofs from one end; off the other end is a jump
      var up = n % 2 ? 1 : -1;   // which end the ramp is at
      if(up < 0) addRamp(start, z + CW, 'x', 1, 12, CH, 2 * CW);
      else addRamp(start + len * CL, z + CW, 'x', -1, 12, CH, 2 * CW);
      for(var q = 0; q < 3; q++) addProp(c.x0 + 10 + R() * (w - 20), z + 2 * CW + 4 + R() * 7, 'crate');
    }
    if(R() < 0.7) pickups.push({k: 'keg', x: (c.x0 + c.x1) / 2, z: c.z1 - 8});
  }

  // the quarry: dirt, boulders, ramps every way and a pit to jump
  function quarryCell(c){
    var w = c.x1 - c.x0, h = c.z1 - c.z0, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    if(canalThrough(c)){ canalJumps(c); return; }
    var prx = Math.min(30, w * 0.18), prz = Math.min(20, h * 0.14);
    if(canalDist(cx, cz) > Math.max(prx, prz) + CANAL_CLEAR + 30 && w > 120 && h > 100){
      basins.push({x: cx, z: cz, rx: prx, rz: prz, d: 6, k: 'pit'});
      addRamp(cx - prx - 2, cz, 'x', 1, 16, 3.6, 7);
      addRamp(cx + prx + 2, cz + 9, 'x', -1, 16, 3.6, 7);
    }
    for(var k = 0; k < 7; k++){
      var bx = c.x0 + 10 + R() * (w - 30), bz = c.z0 + 10 + R() * (h - 30), s1 = 5 + R() * 9, s2 = 5 + R() * 9;
      if(Math.abs(bx - cx) < prx + 30 && Math.abs(bz - cz) < prz + 16) continue;
      building(bx, bz, bx + s1, bz + s2, 3 + R() * 5, 'rock');
    }
    for(var q = 0; q < 5; q++){
      var rx = c.x0 + 25 + R() * (w - 50), rz = c.z0 + 25 + R() * (h - 50);
      if(Math.abs(rx - cx) < prx + 22 && Math.abs(rz - cz) < prz + 22) continue;
      if(R() < 0.5) addRamp(rx, rz, 'x', R() < 0.5 ? 1 : -1, 10, 2.4 + R() * 1.4, 6);
      else addRamp(rx, rz, 'z', R() < 0.5 ? 1 : -1, 10, 2.4 + R() * 1.4, 6);
    }
    for(var p2 = 0; p2 < 10; p2++) addProp(c.x0 + 6 + R() * (w - 12), c.z0 + 6 + R() * (h - 12), R() < 0.5 ? 'bale' : 'crate');
    for(var t2 = 0; t2 < 6; t2++) addTree(c.x0 + 6 + R() * (w - 12), c.z0 + 6 + R() * (h - 12), 'saguaro');
    if(R() < 0.5) pickups.push({k: 'keg', x: cx, z: c.z0 + 10});
  }

  cells.forEach(function(c){
    switch(c.type){
      case 'watsons': watsonsCell(c); break;
      case 'grandpa': grandpaCell(c); break;
      case 'temple': templeCell(c); break;
      case 'downtown': downtownCell(c); break;
      case 'heritage': heritageCell(c); break;
      case 'riparian': riparianCell(c); break;
      case 'pondpark': pondParkCell(c); break;
      case 'campus': campusCell(c); break;
      case 'plaza': plazaCell(c); break;
      case 'park': parkCell(c); break;
      case 'grove': groveCell(c, false); break;
      case 'farm': groveCell(c, true); break;
      case 'school': schoolCell(c); break;
      case 'desert': desertCell(c); break;
      case 'strip': stripCell(c); break;
      case 'towers': towersCell(c); break;
      case 'airfield': airfieldCell(c); break;
      case 'speedway': speedwayCell(c); break;
      case 'yard': yardCell(c); break;
      case 'quarry': quarryCell(c); break;
      case 'canal': canalCell(c); break;
      default: homesCell(c);
    }
  });

  // freeway sound walls between crossings, and the map's edge
  lines.forEach(function(l){
    if(l.kind !== 'fwy' || FREE) return;
    var cross = (l.axis === 'ns' ? EWL : NSL).map(function(o){ return o.p; }).sort(function(a, b){ return a - b; });
    var off = l.w / 2 + 1;
    var pts = [l.lo].concat(cross).concat([l.hi]);
    for(var k = 0; k < pts.length - 1; k++){
      var a = pts[k] + (k === 0 ? 0 : 16), b = pts[k + 1] - (k === pts.length - 2 ? 0 : 16);
      if(b - a < 6) continue;
      [-1, 1].forEach(function(sg){
        if(l.axis === 'ns') addWall(l.p + sg * off, a, l.p + sg * off, b);
        else addWall(a, l.p + sg * off, b, l.p + sg * off);
      });
    }
  });
  M.edge = {x0: X0, x1: X1, z0: Z0, z1: Z1};

  /* ---------------- pickups along the canals, ramps at the crossings ---------------- */
  canals.forEach(function(cn){
    var p = cn.pts;
    for(var k = 0; k < p.length - 1; k++){
      var ax = p[k][0], az = p[k][1], bx = p[k + 1][0], bz = p[k + 1][1];
      var segL = Math.hypot(bx - ax, bz - az);
      if(segL < 120) continue;
      if(R() < 0.55){
        var t = 0.3 + R() * 0.4;
        var nx = -(bz - az) / segL, nz = (bx - ax) / segL;
        var side = R() < 0.5 ? -1 : 1;
        var kx = ax + (bx - ax) * t + nx * side * (CANAL_W / 2 + BANK_W / 2), kz = az + (bz - az) * t + nz * side * (CANAL_W / 2 + BANK_W / 2);
        var nearRoad = lines.some(function(l){ return lineDist(l, kx, kz) < l.w / 2 + 30; });
        if(!nearRoad) pickups.push({k: 'keg', x: kx, z: kz});
      }
    }
  });
  // where a grid road crosses a canal: a dirt ramp on each shoulder, both ways
  lines.forEach(function(l){
    if(l.kind === 'fwy' || FREE) return;
    canals.forEach(function(cn){
      var p = cn.pts;
      for(var k = 0; k < p.length - 1; k++){
        var ax = p[k][0], az = p[k][1], bx = p[k + 1][0], bz = p[k + 1][1];
        var t, cx, cz;
        if(l.axis === 'ns'){
          if((ax - l.p) * (bx - l.p) > 0 || ax === bx) continue;
          t = (l.p - ax) / (bx - ax); cx = l.p; cz = az + (bz - az) * t;
        } else {
          if((az - l.p) * (bz - l.p) > 0 || az === bz) continue;
          t = (l.p - az) / (bz - az); cz = l.p; cx = ax + (bx - ax) * t;
        }
        // the canal must cross fairly squarely for the jump to clear it
        var segL = Math.hypot(bx - ax, bz - az);
        var along = l.axis === 'ns' ? Math.abs(bz - az) / segL : Math.abs(bx - ax) / segL;
        if(along > 0.75) continue;
        var off = l.w / 2 + 1.6, len = 11, wid = 5, gap = CANAL_W / 2 + BANK_W + 1;
        [-1, 1].forEach(function(dir){        // travelling towards +axis (dir 1) or -axis
          var side = l.axis === 'ns' ? -dir : dir;   // the right-hand shoulder for that direction
          var end = (l.axis === 'ns' ? cz : cx) - dir * gap;
          var start = end - dir * len;
          var lat = l.p + side * off;
          if(l.axis === 'ns') ramps.push({x0: lat - wid / 2, x1: lat + wid / 2, z0: Math.min(start, end), z1: Math.max(start, end), dx: 0, dz: dir, s0: start, h: 2.4, len: len});
          else ramps.push({z0: lat - wid / 2, z1: lat + wid / 2, x0: Math.min(start, end), x1: Math.max(start, end), dx: dir, dz: 0, s0: start, h: 2.4, len: len});
        });
      }
    });
  });
  // Grandpa's black powder: on the Consolidated Canal bank nearest his house
  (function(){
    var g = LM.grandpa, best = null, bd = 1e9;
    canals.forEach(function(cn){
      if(cn.name.indexOf(G.boomCanal || 'Consolidated') < 0) return;
      var p = cn.pts;
      for(var k = 0; k < p.length - 1; k++){
        for(var t = 0; t <= 1; t += 0.05){
          var x = p[k][0] + (p[k + 1][0] - p[k][0]) * t, z = p[k][1] + (p[k + 1][1] - p[k][1]) * t;
          var d = Math.hypot(x - g.x, z - g.z);
          var nearRoad = lines.some(function(l){ return lineDist(l, x, z) < l.w / 2 + 20; });
          if(d < bd && !nearRoad){
            bd = d;
            var segL = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
            var nx = -(p[k + 1][1] - p[k][1]) / segL, nz = (p[k + 1][0] - p[k][0]) / segL;
            if(nx * (g.x - x) + nz * (g.z - z) < 0){ nx = -nx; nz = -nz; }
            best = {x: x + nx * (CANAL_W / 2 + BANK_W / 2), z: z + nz * (CANAL_W / 2 + BANK_W / 2), cx: x, cz: z};
          }
        }
      }
    });
    if(best){ pickups.push({k: 'boom', x: best.x, z: best.z, cx: best.cx, cz: best.cz}); M.boom = best; }
  })();
  pickups.forEach(function(p, i){ p.id = i; });

  /* ---------------- the surface raster ---------------- */
  var GW = Math.ceil(X1 / RES) + 1, GH = Math.ceil(Z1 / RES) + 1;
  var surf = new Uint8Array(GW * GH);   // DIRT everywhere to start
  M.GW = GW; M.GH = GH; M.surfGrid = surf;
  function fillRect(x0, z0, x1, z1, v){
    var i0 = Math.max(0, Math.floor(x0 / RES)), i1 = Math.min(GW - 1, Math.ceil(x1 / RES));
    var j0 = Math.max(0, Math.floor(z0 / RES)), j1 = Math.min(GH - 1, Math.ceil(z1 / RES));
    for(var j = j0; j < j1; j++) for(var i = i0; i < i1; i++) surf[j * GW + i] = v;
  }
  function fillEllipse(cx, cz, rx, rz, v){
    var i0 = Math.max(0, Math.floor((cx - rx) / RES)), i1 = Math.min(GW - 1, Math.ceil((cx + rx) / RES));
    var j0 = Math.max(0, Math.floor((cz - rz) / RES)), j1 = Math.min(GH - 1, Math.ceil((cz + rz) / RES));
    for(var j = j0; j < j1; j++) for(var i = i0; i < i1; i++){
      var dx = ((i + 0.5) * RES - cx) / rx, dz = ((j + 0.5) * RES - cz) / rz;
      if(dx * dx + dz * dz < 1) surf[j * GW + i] = v;
    }
  }
  function fillBuffer(pts, half, v){
    for(var k = 0; k < pts.length - 1; k++){
      var ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0], bz = pts[k + 1][1];
      var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half) / RES)), i1 = Math.min(GW - 1, Math.ceil((Math.max(ax, bx) + half) / RES));
      var j0 = Math.max(0, Math.floor((Math.min(az, bz) - half) / RES)), j1 = Math.min(GH - 1, Math.ceil((Math.max(az, bz) + half) / RES));
      for(var j = j0; j < j1; j++) for(var i = i0; i < i1; i++)
        if(distSeg((i + 0.5) * RES, (j + 0.5) * RES, ax, az, bx, bz) < half) surf[j * GW + i] = v;
    }
  }
  // yards and parks are grass, lots concrete
  cells.forEach(function(c){
    if(c.type === 'homes' || c.type === 'grandpa' || c.type === 'strip') fillRect(c.x0, c.z0, c.x1, c.z1, SURF.GRASS);
  });
  fields.forEach(function(f){ fillRect(f.x0, f.z0, f.x1, f.z1, f.k === 'farm' || f.k === 'grove' || f.k === 'roses' ? SURF.FIELD : SURF.GRASS); });
  lots.forEach(function(f){ fillRect(f.x0, f.z0, f.x1, f.z1, SURF.CONCRETE); });
  drives.forEach(function(f){ fillRect(f.x0, f.z0, f.x1, f.z1, SURF.CONCRETE); });
  // canals: banks then water
  canals.forEach(function(cn){ fillBuffer(cn.pts, CANAL_W / 2 + BANK_W, SURF.BANK); });
  canals.forEach(function(cn){ fillBuffer(cn.pts, CANAL_W / 2, SURF.WATER); });
  ponds.forEach(function(p){ if(!p.shallow) fillEllipse(p.x, p.z, p.rx, p.rz, SURF.WATER); });
  // roads and sidewalks last: a road over a canal is a bridge
  if(FREE) lines.forEach(function(l){ if(l.kind !== 'fwy') fillBuffer(l.pts, l.w / 2 + 3, SURF.CONCRETE); });
  if(FREE) lines.forEach(function(l){ fillBuffer(l.pts, l.w / 2, SURF.ROAD); });
  if(!FREE) lines.forEach(function(l){
    var hw = l.w / 2;
    if(l.kind !== 'fwy'){
      if(l.axis === 'ns') fillRect(l.p - hw - 3, l.lo, l.p + hw + 3, l.hi, SURF.CONCRETE);
      else fillRect(l.lo, l.p - hw - 3, l.hi, l.p + hw + 3, SURF.CONCRETE);
    }
  });
  if(!FREE) lines.forEach(function(l){
    var hw = l.w / 2;
    if(l.axis === 'ns') fillRect(l.p - hw, l.lo, l.p + hw, l.hi, SURF.ROAD);
    else fillRect(l.lo, l.p - hw, l.hi, l.p + hw, SURF.ROAD);
  });
  resRoads.forEach(function(r){ fillRect(r.x0, r.z0, r.x1, r.z1, SURF.ROAD); });
  M.surf = function(x, z){
    var i = Math.floor(x / RES), j = Math.floor(z / RES);
    if(i < 0 || j < 0 || i >= GW || j >= GH) return SURF.DIRT;
    return surf[j * GW + i];
  };
  // a free town's open ground: saguaros, palo verdes and brush, clear of the roads
  if(FREE && G.scatter){
    var openAt = function(x, z){ for(var a = 0; a < 5; a++){ var ox = a === 1 ? 8 : a === 2 ? -8 : 0, oz = a === 3 ? 8 : a === 4 ? -8 : 0; if(M.surf(x + ox, z + oz) !== SURF.DIRT) return false; } return true; };
    for(var sc = 0; sc < G.scatter; sc++){
      var tx = 20 + R() * (X1 - 40), tz = 20 + R() * (Z1 - 40), rr = R();
      if(!openAt(tx, tz) || cells.some(function(c){ return inRect({x: tx, z: tz}, c, 6); })) continue;
      if(rr < 0.3) addTree(tx, tz, 'saguaro'); else if(rr < 0.5) addTree(tx, tz, 'pv'); else addProp(tx, tz, 'bush');
    }
  }



  /* the ground's height: flat (this is Mesa) but for the canals, the
     retention basins and the ramps */
  // jumps and container roofs, by 32 m square, so a height lookup only
  // looks at the few nearby
  var HG = 32, HGW = Math.ceil(X1 / HG) + 1, HGH = Math.ceil(Z1 / HG) + 1, hashR = new Array(HGW * HGH);
  function hgPut(x0, z0, x1, z1, item){
    for(var j = Math.max(0, Math.floor(z0 / HG)); j <= Math.min(HGH - 1, Math.floor(z1 / HG)); j++)
      for(var i = Math.max(0, Math.floor(x0 / HG)); i <= Math.min(HGW - 1, Math.floor(x1 / HG)); i++){ var c = j * HGW + i; (hashR[c] || (hashR[c] = [])).push(item); }
  }
  ramps.forEach(function(rp){ hgPut(rp.x0, rp.z0, rp.x1, rp.z1, rp); });
  decks.forEach(function(di){ var b = boxes[di]; hgPut(b.x0, b.z0, b.x1, b.z1, b); });
  /* a free town has hills: the ground from G.terrain, with every road
     graded along its length (smoothed, pinned where roads meet, crests
     added where the town asks for them) and cut into the hillside, and
     every district a flat pad. On a 4 m grid. */
  var HR = 4, HW4 = Math.ceil(X1 / HR) + 2, HH4 = Math.ceil(Z1 / HR) + 2, Hg = null;
  if(FREE) (function(){
    var T = G.terrain, N = HW4 * HH4;
    Hg = new Float32Array(N);
    for(var j = 0; j < HH4; j++) for(var i = 0; i < HW4; i++) Hg[j * HW4 + i] = T(i * HR, j * HR);
    // districts: flat pads, blended into the hills round them
    cells.forEach(function(c){
      var ph = c.pk && c.pk.h != null ? c.pk.h : T((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2), B = 34;
      c.gy = ph;
      for(var j = Math.max(0, Math.floor((c.z0 - B) / HR)); j <= Math.min(HH4 - 1, Math.ceil((c.z1 + B) / HR)); j++)
        for(var i = Math.max(0, Math.floor((c.x0 - B) / HR)); i <= Math.min(HW4 - 1, Math.ceil((c.x1 + B) / HR)); i++){
          var x = i * HR, z = j * HR;
          var dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1), d = Math.hypot(dx, dz);
          var t = d >= B ? 0 : 1 - smooth(d / B);
          Hg[j * HW4 + i] += (ph - Hg[j * HW4 + i]) * t;
        }
    });
    function base(x, z){ var i = Math.max(0, Math.min(HW4 - 2, x / HR)), j = Math.max(0, Math.min(HH4 - 2, z / HR)), i0 = Math.floor(i), j0 = Math.floor(j), fi = i - i0, fj = j - j0;
      return (Hg[j0 * HW4 + i0] * (1 - fi) + Hg[j0 * HW4 + i0 + 1] * fi) * (1 - fj) + (Hg[(j0 + 1) * HW4 + i0] * (1 - fi) + Hg[(j0 + 1) * HW4 + i0 + 1] * fi) * fj; }
    // where roads meet: one height for all of them
    var jh = {};
    Object.keys(G.junctions).forEach(function(k){ var p = G.junctions[k]; jh[k] = base(p[0], p[1]); });
    lines.forEach(function(l){
      var P = l.pts, n = P.length, raw = P.map(function(p){ return base(p[0], p[1]); }), prof = new Float32Array(n);
      for(var k = 0; k < n; k++){ var a = 0, m = 0; for(var q = Math.max(0, k - 7); q <= Math.min(n - 1, k + 7); q++){ a += raw[q]; m++; } prof[k] = a / m; }
      // pinned at the junctions, the difference spread along between them
      var pins = l.junc.map(function(j){ var k = l.axis ? Math.round((j.at - l.lo) / ((l.hi - l.lo) / (n - 1))) : j.idx; return {k: k, d: jh[j.j] - prof[k]}; }).sort(function(a, b){ return a.k - b.k; });
      if(pins.length){
        for(var k2 = 0; k2 < n; k2++){
          var d;
          if(k2 <= pins[0].k) d = pins[0].d;
          else if(k2 >= pins[pins.length - 1].k) d = pins[pins.length - 1].d;
          else for(var q2 = 0; q2 < pins.length - 1; q2++) if(k2 >= pins[q2].k && k2 <= pins[q2 + 1].k){ var f = (k2 - pins[q2].k) / Math.max(1, pins[q2 + 1].k - pins[q2].k); d = pins[q2].d + (pins[q2 + 1].d - pins[q2].d) * f; break; }
          prof[k2] += d;
        }
      }
      // no steeper than 12%: graded both ways, the junctions held where they are
      var pinned = {}; pins.forEach(function(p){ pinned[p.k] = true; });
      for(var pass = 0; pass < 2; pass++){
        for(var k4 = 1; k4 < n; k4++) if(!pinned[k4]){ var g1 = 0.12 * (l.cum[k4] - l.cum[k4 - 1]); prof[k4] = Math.max(prof[k4 - 1] - g1, Math.min(prof[k4 - 1] + g1, prof[k4])); }
        for(var k5 = n - 2; k5 >= 0; k5--) if(!pinned[k5]){ var g2 = 0.12 * (l.cum[k5 + 1] - l.cum[k5]); prof[k5] = Math.max(prof[k5 + 1] - g2, Math.min(prof[k5 + 1] + g2, prof[k5])); }
      }
      // crests to fly off
      l.crests.forEach(function(cr){ var at = cr.at * l.len; for(var k3 = 0; k3 < n; k3++){ var u = (l.cum[k3] - at) / cr.w; if(Math.abs(u) < 3) prof[k3] += cr.h * Math.exp(-u * u); } });
      l.prof = prof;
    });
    // cut the roads into the ground: flat across, a shoulder, then a blend
    var dBest = new Float32Array(N).fill(1e9), hRoad = new Float32Array(N), wRoad = new Float32Array(N);
    lines.forEach(function(l){
      var P = l.pts, hw = l.w / 2, reach = hw + 8 + 30;
      for(var k = 0; k < P.length - 1; k++){
        var ax = P[k][0], az = P[k][1], bx = P[k + 1][0], bz = P[k + 1][1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
        var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / HR)), i1 = Math.min(HW4 - 1, Math.ceil((Math.max(ax, bx) + reach) / HR));
        var j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach) / HR)), j1 = Math.min(HH4 - 1, Math.ceil((Math.max(az, bz) + reach) / HR));
        for(var j = j0; j <= j1; j++) for(var i = i0; i <= i1; i++){
          var x = i * HR, z = j * HR, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
          var d = Math.hypot(x - ax - ex * t, z - az - ez * t) - hw;
          var c = j * HW4 + i;
          if(d < dBest[c]){ dBest[c] = d; hRoad[c] = l.prof[k] + (l.prof[k + 1] - l.prof[k]) * t; }
        }
      }
    });
    for(var c = 0; c < N; c++){
      var d = dBest[c];
      if(d <= 8) Hg[c] = hRoad[c];
      else if(d < 38){ var t = smooth((d - 8) / 30); Hg[c] = hRoad[c] + (Hg[c] - hRoad[c]) * t; }
    }
  })();
  function smooth(t){ t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  /* the bare ground (no jumps, roofs or basins) */
  M.ground = function(x, z){
    if(!Hg) return 0;
    var i = x / HR, j = z / HR;
    if(i < 0) i = 0; else if(i > HW4 - 2) i = HW4 - 2;
    if(j < 0) j = 0; else if(j > HH4 - 2) j = HH4 - 2;
    var i0 = Math.floor(i), j0 = Math.floor(j), fi = i - i0, fj = j - j0, a = j0 * HW4 + i0;
    return (Hg[a] * (1 - fi) + Hg[a + 1] * fi) * (1 - fj) + (Hg[a + HW4] * (1 - fi) + Hg[a + HW4 + 1] * fi) * fj;
  };
  // everything that stands on the ground stands where the ground is
  boxes.forEach(function(b){ b.gy = M.ground((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); });
  buildings.forEach(function(b){ b.gy = M.ground((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); });
  ramps.forEach(function(r){ r.gy = M.ground((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); });

  M.height = function(x, z){
    var s = M.surf(x, z);
    var h = M.ground(x, z);
    if(s === SURF.WATER) return h - 2.8;
    var h0 = h;
    var cell = hashR[Math.floor(z / HG) * HGW + Math.floor(x / HG)];
    if(x >= 0 && z >= 0 && x < X1 && z < Z1 && cell){
      for(var q = 0; q < cell.length; q++){
        var it = cell[q];
        if(x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
        if(it.len){ var al = it.dx ? (x - it.s0) * it.dx : (z - it.s0) * it.dz; if(al >= 0 && al <= it.len) h = Math.max(h, h0 + it.h * al / it.len); }
        else if((it.gy || 0) + it.h > h) h = (it.gy || 0) + it.h;
      }
    }
    for(var k = 0; k < basins.length; k++){
      var b = basins[k];
      var dx = (x - b.x) / b.rx, dz = (z - b.z) / b.rz;
      var r2 = dx * dx + dz * dz;
      if(r2 < 1){ var q = 1 - r2; h -= b.d * q * (2 - q) * 0.999 + 0; }
    }
    return h;
  };

  /* ---------------- solids: a spatial hash ---------------- */
  var HC = 16, HW = Math.ceil(X1 / HC) + 1, HH = Math.ceil(Z1 / HC) + 1;
  var hashB = new Array(HW * HH), hashC = new Array(HW * HH), hashP = new Array(HW * HH);
  function hput(arr, x0, z0, x1, z1, idx){
    var i0 = Math.max(0, Math.floor(x0 / HC)), i1 = Math.min(HW - 1, Math.floor(x1 / HC));
    var j0 = Math.max(0, Math.floor(z0 / HC)), j1 = Math.min(HH - 1, Math.floor(z1 / HC));
    for(var j = j0; j <= j1; j++) for(var i = i0; i <= i1; i++){ var c = j * HW + i; (arr[c] || (arr[c] = [])).push(idx); }
  }
  // the map's edge
  var E = 6;
  boxes.push({x0: X0 - E, z0: Z0 - E, x1: X1 + E, z1: Z0, h: 50, k: 'edge'});
  boxes.push({x0: X0 - E, z0: Z1, x1: X1 + E, z1: Z1 + E, h: 50, k: 'edge'});
  boxes.push({x0: X0 - E, z0: Z0, x1: X0, z1: Z1, h: 50, k: 'edge'});
  boxes.push({x0: X1, z0: Z0, x1: X1 + E, z1: Z1, h: 50, k: 'edge'});
  boxes.forEach(function(b, i){ hput(hashB, b.x0, b.z0, b.x1, b.z1, i); });
  circles.forEach(function(c, i){ hput(hashC, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, i); });
  props.forEach(function(p, i){ p.id = i; hput(hashP, p.x - p.r, p.z - p.r, p.x + p.r, p.z + p.r, i); });
  M.near = function(x, z, r, out){
    // every solid whose hash cell is within r: {b:[...], c:[...], p:[...]} (indices, may repeat)
    out = out || {b: [], c: [], p: []};
    out.b.length = 0; out.c.length = 0; out.p.length = 0;
    var i0 = Math.max(0, Math.floor((x - r) / HC)), i1 = Math.min(HW - 1, Math.floor((x + r) / HC));
    var j0 = Math.max(0, Math.floor((z - r) / HC)), j1 = Math.min(HH - 1, Math.floor((z + r) / HC));
    for(var j = j0; j <= j1; j++) for(var i = i0; i <= i1; i++){
      var c = j * HW + i, a;
      if((a = hashB[c])) for(var k = 0; k < a.length; k++) out.b.push(a[k]);
      if((a = hashC[c])) for(var k2 = 0; k2 < a.length; k2++) out.c.push(a[k2]);
      if((a = hashP[c])) for(var k3 = 0; k3 < a.length; k3++) out.p.push(a[k3]);
    }
    return out;
  };

  /* ---------------- the road graph ---------------- */
  var nodes = [];   // {x,z, adj:[{n, d, name}]}
  function node(x, z){ nodes.push({id: nodes.length, x: x, z: z, adj: []}); return nodes.length - 1; }
  function link(a, b, name, kind){
    var d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    if(d < 0.01) return;
    var cost = d * (kind === 'fwy' ? 0.8 : kind === 'art' ? 0.9 : kind === 'col' ? 1 : 1.25);
    nodes[a].adj.push({n: b, d: cost, len: d, name: name, kind: kind});
    nodes[b].adj.push({n: a, d: cost, len: d, name: name, kind: kind});
  }
  // crossings (and their lights: phase a for line a, phase b for line b)
  function mkLight(x, z, a, b){
    if(a.kind === 'fwy' && b.kind === 'fwy') return null;
    var L = {x: x, z: z, wa: a.w, wb: b.w, a: a.id, b: b.id, sig: a.kind !== 'fwy' && b.kind !== 'fwy' && !(a.kind === 'col' && b.kind === 'col')};
    lights.push(L);
    return L;
  }
  if(!FREE) NSL.forEach(function(a){ EWL.forEach(function(b){
    var n = node(a.p, b.p), L = mkLight(a.p, b.p, a, b);
    a.nodes.push({at: b.p, n: n, L: L}); b.nodes.push({at: a.p, n: n, L: L});
  }); });
  if(FREE){
    // junctions: one node each, on every line that goes through it
    var jnode = {}, jlines = {};
    lines.forEach(function(l){ l.junc.forEach(function(j){ (jlines[j.j] || (jlines[j.j] = [])).push({l: l, at: j.at}); }); });
    Object.keys(jlines).forEach(function(k){
      var p = G.junctions[k], n = node(p[0], p[1]), ls = jlines[k], L = null;
      if(ls.length > 1) L = mkLight(p[0], p[1], ls[0].l, ls[1].l);
      ls.forEach(function(q){ q.l.nodes.push({at: q.at, n: n, L: L}); });
    });
  }
  // the ends of every line, so a dead end is still drivable for the computer
  lines.forEach(function(l){
    var lo = FREE ? l.lo + 4 : l.axis === 'ns' ? l.lo + 8 : Math.max(l.lo, X0 + 8), hi = l.hi - (FREE ? 4 : 8);
    var first = l.nodes.length ? Math.min.apply(null, l.nodes.map(function(q){ return q.at; })) : 1e9;
    var last = l.nodes.length ? Math.max.apply(null, l.nodes.map(function(q){ return q.at; })) : -1e9;
    if(first - lo > 20){ var p0 = M.linePoint(l, lo), n0 = node(p0.x, p0.z); l.nodes.push({at: lo, n: n0}); }
    if(hi - last > 20){ var p1 = M.linePoint(l, hi), n1 = node(p1.x, p1.z); l.nodes.push({at: hi, n: n1}); }
  });
  // the loops
  loops.forEach(function(lp){
    var c0 = node(lp.x0, lp.z0), c1 = node(lp.x1, lp.z0), c2 = node(lp.x1, lp.z1), c3 = node(lp.x0, lp.z1);
    lp.corners = [c0, c1, c2, c3];
    var sides = {n: [c0, c1], e: [c1, c2], s: [c3, c2], w: [c0, c3]};
    var onSide = {n: [], e: [], s: [], w: []};
    lp.entries.forEach(function(e){
      var ln = node(e.lx, e.lz), gn = e.s != null ? node(e.gx, e.gz) : (e.line.axis === 'ns') ? node(e.line.p, e.gz) : node(e.gx, e.line.p);
      e.ln = ln; e.gn = gn;
      onSide[e.side].push(ln);
      e.line.nodes.push({at: e.s != null ? e.s : e.line.axis === 'ns' ? e.gz : e.gx, n: gn});
      link(ln, gn, lp.name, 'res');
    });
    ['n', 'e', 's', 'w'].forEach(function(sd){
      var ends = sides[sd], horiz = sd === 'n' || sd === 's';
      var list = [ends[0]].concat(onSide[sd]).concat([ends[1]]);
      list.sort(function(a, b){ return horiz ? nodes[a].x - nodes[b].x : nodes[a].z - nodes[b].z; });
      for(var k = 0; k < list.length - 1; k++) link(list[k], list[k + 1], lp.name, 'res');
      lp['side_' + sd] = list;
    });
  });
  // Watson's: a node on Main in front of the lot
  M.shops.forEach(function(sh){
    if(sh.line){ var n = node(sh.lx, sh.lz); sh.line.nodes.push({at: sh.s != null ? sh.s : sh.lx, n: n}); sh.node = n; }
  });
  // join each line's nodes in order
  lines.forEach(function(l){
    l.nodes.sort(function(a, b){ return a.at - b.at; });
    for(var k = 0; k < l.nodes.length - 1; k++){
      var a = l.nodes[k], b = l.nodes[k + 1];
      if(b.at - a.at < 0.5){
        // the same spot: merge by a zero-length link
        nodes[a.n].adj.push({n: b.n, d: 0.01, len: 0, name: M.lineName(l, a.at), kind: l.kind});
        nodes[b.n].adj.push({n: a.n, d: 0.01, len: 0, name: M.lineName(l, a.at), kind: l.kind});
        continue;
      }
      if(!l.axis && b.at - a.at > 30){
        var steps = Math.ceil((b.at - a.at) / 22), prev = a.n;
        for(var q = 1; q < steps; q++){ var pp = M.linePoint(l, a.at + (b.at - a.at) * q / steps), sn = node(pp.x, pp.z); link(prev, sn, M.lineName(l, a.at), l.kind); prev = sn; }
        link(prev, b.n, M.lineName(l, a.at), l.kind);
        continue;
      }
      link(a.n, b.n, M.lineName(l, (a.at + b.at) / 2), l.kind);
    }
  });
  M.nodes = nodes;
  // every edge once, for nearest-road lookups
  var edges = [];
  nodes.forEach(function(n){ n.adj.forEach(function(e){ if(e.n > n.id) edges.push({a: n.id, b: e.n, name: e.name, kind: e.kind}); }); });
  M.edges = edges;

  // each house: which loop side it fronts, and the side's two ends
  houses.forEach(function(h){
    var lp = loops[h.loop];
    var list = lp['side_' + h.side];
    var horiz = h.side === 'n' || h.side === 's';
    var a = list[0], b = list[list.length - 1];
    for(var k = 0; k < list.length - 1; k++){
      var p = horiz ? nodes[list[k]].x : nodes[list[k]].z, q = horiz ? nodes[list[k + 1]].x : nodes[list[k + 1]].z;
      var v = horiz ? h.front.x : h.front.z;
      if(v >= p - 0.01 && v <= q + 0.01){ a = list[k]; b = list[k + 1]; break; }
    }
    h.na = a; h.nb = b;
    h.addr = h.num + ' ' + h.dir + ' ' + h.street;
  });
  M.shops.forEach(function(sh){
    if(sh.house != null){ var h = houses[sh.house]; sh.na = h.na; sh.nb = h.nb; sh.front = h.front; }
    else { sh.na = sh.node; sh.nb = sh.node; sh.front = {x: sh.lx, z: sh.lz}; }
  });

  /* ---------------- routing ---------------- */
  M.nearestEdge = function(x, z, prefer){
    var best = null, bd = 1e9;
    for(var k = 0; k < edges.length; k++){
      var e = edges[k], A = nodes[e.a], B = nodes[e.b];
      // quick reject on the bounding box
      if(x < Math.min(A.x, B.x) - 60 || x > Math.max(A.x, B.x) + 60 || z < Math.min(A.z, B.z) - 60 || z > Math.max(A.z, B.z) + 60) continue;
      var d = distSeg(x, z, A.x, A.z, B.x, B.z);
      if(d < bd){ bd = d; best = e; }
    }
    return best ? {e: best, d: bd} : null;
  };
  M.streetAt = function(x, z){
    var ne = M.nearestEdge(x, z);
    return ne && ne.d < 16 ? ne.e.name : null;
  };

  function dijkstra(starts){
    // starts: [{n, d}] -> {dist: Float64Array, prev: Int32Array}
    var N = nodes.length;
    var dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    var heap = [];
    function push(n, d){
      heap.push([d, n]);
      var i = heap.length - 1;
      while(i > 0){ var p = (i - 1) >> 1; if(heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
    }
    function pop(){
      var top = heap[0], last = heap.pop();
      if(heap.length){
        heap[0] = last;
        var i = 0;
        for(;;){
          var l = 2 * i + 1, r = l + 1, m = i;
          if(l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if(r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if(m === i) break;
          var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    }
    starts.forEach(function(s){ if(s.d < dist[s.n]){ dist[s.n] = s.d; push(s.n, s.d); } });
    while(heap.length){
      var top = pop(), d = top[0], n = top[1];
      if(d > dist[n]) continue;
      var adj = nodes[n].adj;
      for(var k = 0; k < adj.length; k++){
        var e = adj[k], nd = d + e.d;
        if(nd < dist[e.n]){ dist[e.n] = nd; prev[e.n] = n; push(e.n, nd); }
      }
    }
    return {dist: dist, prev: prev};
  }

  /* A route from (x,z) to a place {na, nb, front, final}: a list of points,
     ending at the place's front (and its final point if it has one). */
  M.route = function(x, z, place){
    var ne = M.nearestEdge(x, z);
    if(!ne) return [{x: place.front.x, z: place.front.z}];
    var A = nodes[ne.e.a], B = nodes[ne.e.b];
    // the point on the road we start from
    var dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2)) : 0;
    var sx = A.x + dx * t, sz = A.z + dz * t;
    // already on the target's own stretch of road: straight there
    if((ne.e.a === place.na && ne.e.b === place.nb) || (ne.e.a === place.nb && ne.e.b === place.na) || place.na === place.nb && (ne.e.a === place.na || ne.e.b === place.na) && Math.hypot(x - place.front.x, z - place.front.z) < 60){
      var out0 = [{x: sx, z: sz}, {x: place.front.x, z: place.front.z}];
      if(place.final) out0.push(place.final);
      return out0;
    }
    var r = dijkstra([{n: ne.e.a, d: Math.hypot(sx - A.x, sz - A.z)}, {n: ne.e.b, d: Math.hypot(sx - B.x, sz - B.z)}]);
    var NA = nodes[place.na], NB = nodes[place.nb];
    var ca = r.dist[place.na] + Math.hypot(NA.x - place.front.x, NA.z - place.front.z);
    var cb = r.dist[place.nb] + Math.hypot(NB.x - place.front.x, NB.z - place.front.z);
    var end = ca <= cb ? place.na : place.nb;
    var path = [];
    for(var n = end; n >= 0; n = r.prev[n]) path.push(n);
    path.reverse();
    var out = [{x: sx, z: sz}];
    path.forEach(function(n){ out.push({x: nodes[n].x, z: nodes[n].z, n: n}); });
    out.push({x: place.front.x, z: place.front.z});
    if(place.final) out.push(place.final);
    // drop repeats
    return out.filter(function(p, i){ return i === 0 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 0.5; });
  };
  M.housePlace = function(h){ var hs = houses[h]; return {na: hs.na, nb: hs.nb, front: hs.front}; };
  M.shopPlace = function(s){
    var sh = M.shops[s];
    return {na: sh.na, nb: sh.nb, front: sh.front, final: sh.house == null ? {x: sh.x, z: sh.z} : null};
  };

  /* a random spot on a road, facing along it (for a respawn) */
  M.roadSpot = function(x, z){
    // the nearest road, however far (the middle of a lake is a long way from one),
    // and a dry bit of it (never back into the water)
    var ne = M.nearestEdge(x, z), best = null;
    var cand = ne ? [ne.e] : [];
    if(!ne || M.surf(x, z) === SURF.WATER){
      var ord = edges.map(function(e){ var A = nodes[e.a], B = nodes[e.b]; return {e: e, d: distSeg(x, z, A.x, A.z, B.x, B.z)}; }).sort(function(a, b){ return a.d - b.d; });
      cand = cand.concat(ord.slice(0, 12).map(function(q){ return q.e; }));
    }
    for(var k = 0; k < cand.length && !best; k++){
      var e = cand[k], A = nodes[e.a], B = nodes[e.b];
      var dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
      var t0 = L2 > 0 ? Math.max(0.1, Math.min(0.9, ((x - A.x) * dx + (z - A.z) * dz) / L2)) : 0;
      for(var q = 0; q < 9 && !best; q++){
        var t = Math.max(0.1, Math.min(0.9, t0 + (q % 2 ? 1 : -1) * Math.ceil(q / 2) * 0.1));
        var px = A.x + dx * t, pz = A.z + dz * t;
        var dry = true;
        for(var a2 = 0; a2 < 8; a2++) if(M.surf(px + Math.cos(a2 * 0.785) * 7, pz + Math.sin(a2 * 0.785) * 7) === SURF.WATER){ dry = false; break; }
        if(dry && M.surf(px, pz) !== SURF.WATER) best = {x: px, z: pz, h: Math.atan2(dz, dx), e: e};
      }
    }
    return best || (ne ? {x: nodes[ne.e.a].x, z: nodes[ne.e.a].z, h: 0, e: ne.e} : {x: x, z: z, h: 0});
  };

  /* traffic lanes: every non-residential line, both ways */
  M.trafficLines = lines;
  M.laneOffsets = function(l){
    return l.kind === 'fwy' ? [3.4, 7.2, 11] : l.kind === 'art' ? [3.0, 6.6] : [2.8];
  };
  M.speedLimit = function(l){ return l.kind === 'fwy' ? 31 : l.kind === 'art' ? 20 : 13; };

  M.stats = {cells: cells.length, houses: houses.length, boxes: boxes.length, circles: circles.length,
    props: props.length, trees: trees.length, nodes: nodes.length, edges: edges.length, loops: loops.length,
    ramps: ramps.length, kegs: pickups.filter(function(p){ return p.k === 'keg'; }).length, plazas: plazaCount};
  return M;
}

/* the towns to pick from in the lobby; built once each, on first use */
var TOWNS = [
  {k: 'mesa', name: 'Mesa & Gilbert', blurb: 'The real streets where the shop was: Main Street, Gilbert Road, the canals.', geo: 'WGEO'},
  {k: 'ridge', name: 'Rattlesnake Ridge', blurb: 'Made for driving: curving roads over the hills, a mountain pass, an airfield on the mesa, crests to fly off.', geo: 'WGEO_RIDGE'}
];
var built = {};
function town(key){
  var t = TOWNS.filter(function(q){ return q.k === key && root[q.geo]; })[0] || TOWNS[0];
  if(!built[t.k]){ built[t.k] = build(root[t.geo], 1927); built[t.k].key = t.k; }
  return built[t.k];
}
function townInfo(key){ return TOWNS.filter(function(q){ return q.k === key; })[0] || TOWNS[0]; }
root.WMap = {build: build, rng: rng, SURF: SURF, town: town, townInfo: townInfo,
  TOWNS: TOWNS.map(function(t){ return {k: t.k, name: t.name, blurb: t.blurb}; })};
})(typeof window !== 'undefined' ? window : globalThis);
