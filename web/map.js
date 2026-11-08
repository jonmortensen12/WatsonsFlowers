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
var SUFFIX = ['Street', 'Avenue', 'Drive', 'Circle', 'Lane', 'Way', 'Place', 'Court'];
var STORES = ['TACOS', 'DONUTS', 'PHARMACY', 'SNO-CONES', 'PIZZA', 'BOBA', 'TIRES', 'NAILS',
  'MATTRESS', 'BURGERS', 'HARDWARE', 'GROCERY', 'DENTIST', 'GYM', 'CAR WASH', 'TAMALES',
  'BBQ', 'YOGURT', 'BIKE SHOP', 'THRIFT'];

function build(G, seed){
  var R = rng(seed || 1927);
  var M = {G: G, SURF: SURF, RES: RES, seed: seed || 1927};

  /* ---------------- the grid lines ---------------- */
  var fNS = G.fwy.filter(function(f){ return f.axis === 'ns'; })[0];
  var fEW = G.fwy.filter(function(f){ return f.axis === 'ew'; })[0];
  var X0 = fNS.x - W_FWY / 2 - 4, X1 = G.ns[G.ns.length - 1].x + 85;
  var Z0 = G.ew[0].z - 68, Z1 = G.ew[G.ew.length - 1].z + 68;
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
  addLine('ns', fNS.x, 'fwy', [{name: fNS.name, cut: null}]);
  G.ns.forEach(function(a, i){
    addLine('ns', a.x, 'art', a.names.map(function(n){ return {name: n.name, cut: n.z}; }));
    if(i < G.ns.length - 1 && G.ns[i + 1].x - a.x > 250)
      addLine('ns', (a.x + G.ns[i + 1].x) / 2, 'col', [{name: NS_COLLECTORS[i % NS_COLLECTORS.length], cut: null}]);
  });
  G.ew.forEach(function(a, i){
    addLine('ew', a.z, 'art', [{name: a.names[0].name, cut: null}]);
    if(i < G.ew.length - 1){
      var mid = (a.z + G.ew[i + 1].z) / 2;
      if(Math.abs(mid - fEW.z) < 60) addLine('ew', fEW.z, 'fwy', [{name: fEW.name, cut: null}]);
      else if(G.ew[i + 1].z - a.z > 250) addLine('ew', mid, 'col', [{name: EW_COLLECTORS[i % EW_COLLECTORS.length], cut: null}]);
    }
  });
  M.lines = lines;
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
  var ponds = [];      // {x,z,rx,rz}
  var fields = [];     // {x0,z0,x1,z1,k}
  var lights = [];     // traffic signal positions (visual)
  M.boxes = boxes; M.circles = circles; M.props = props; M.houses = houses; M.cells = cells;
  M.basins = basins; M.ramps = ramps; M.pickups = pickups; M.misters = misters; M.trees = trees;
  M.lots = lots; M.buildings = buildings; M.resRoads = resRoads; M.drives = drives; M.walls = walls;
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
  for(var i = 0; i < NSL.length; i++){
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
  var mainLine = EWL.filter(function(l){ return /Main/.test(l.names[0].name); })[0];
  var gilbertLine = NSL.filter(function(l){ return /Gilbert/.test(l.names[0].name); })[0];
  var elliotLine = EWL.filter(function(l){ return /Elliot/.test(l.names[0].name); })[0];
  M.mainLine = mainLine; M.gilbertLine = gilbertLine;

  cells.forEach(function(c){
    var w = c.x1 - c.x0, h = c.z1 - c.z0;
    var cxm = (c.x0 + c.x1) / 2, czm = (c.z0 + c.z1) / 2;
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
      if(bb) walls.push(bb);
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
    props.push({x: x, z: z, r: k === 'bush' ? 0.9 : k === 'pole' ? 0.3 : 0.5, k: k});
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
  var mileGame = (G.ns[1].x - G.ns[0].x);
  var centerX = (G.ns[2].x + G.ns[3].x) / 2;
  function houseNum(x, z, ew){
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
    cand.forEach(function(sd){
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
    M.shops.push({key: 'watsons', name: "Watson's Flowers", x: L.x, z: front + 8, r: 11, line: mainLine, lx: L.x, lz: mainLine.p});
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
    M.shops.push({key: 'grandpa', name: "Grandpa's (Gilbert)", x: best.front.x, z: best.front.z, r: 11, house: best.id});
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
      default: homesCell(c);
    }
  });

  // freeway sound walls between crossings, and the map's edge
  lines.forEach(function(l){
    if(l.kind !== 'fwy') return;
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
        var nearRoad = lines.some(function(l){ return Math.abs((l.axis === 'ns' ? kx : kz) - l.p) < l.w / 2 + 30; });
        if(!nearRoad) pickups.push({k: 'keg', x: kx, z: kz});
      }
    }
  });
  // where a grid road crosses a canal: a dirt ramp on each shoulder, both ways
  lines.forEach(function(l){
    if(l.kind === 'fwy') return;
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
        var off = l.w / 2 + 1.4, len = 9, wid = 4, gap = CANAL_W / 2 + BANK_W + 1;
        [-1, 1].forEach(function(dir){        // travelling towards +axis (dir 1) or -axis
          var side = l.axis === 'ns' ? -dir : dir;   // the right-hand shoulder for that direction
          var end = (l.axis === 'ns' ? cz : cx) - dir * gap;
          var start = end - dir * len;
          var lat = l.p + side * off;
          if(l.axis === 'ns') ramps.push({x0: lat - wid / 2, x1: lat + wid / 2, z0: Math.min(start, end), z1: Math.max(start, end), dx: 0, dz: dir, s0: start, h: 2.0, len: len});
          else ramps.push({z0: lat - wid / 2, z1: lat + wid / 2, x0: Math.min(start, end), x1: Math.max(start, end), dx: dir, dz: 0, s0: start, h: 2.0, len: len});
        });
      }
    });
  });
  // Grandpa's black powder: on the Consolidated Canal bank nearest his house
  (function(){
    var g = LM.grandpa, best = null, bd = 1e9;
    canals.forEach(function(cn){
      if(!/Consolidated/.test(cn.name)) return;
      var p = cn.pts;
      for(var k = 0; k < p.length - 1; k++){
        for(var t = 0; t <= 1; t += 0.05){
          var x = p[k][0] + (p[k + 1][0] - p[k][0]) * t, z = p[k][1] + (p[k + 1][1] - p[k][1]) * t;
          var d = Math.hypot(x - g.x, z - g.z);
          var nearRoad = lines.some(function(l){ return Math.abs((l.axis === 'ns' ? x : z) - l.p) < l.w / 2 + 20; });
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
  lines.forEach(function(l){
    var hw = l.w / 2;
    if(l.kind !== 'fwy'){
      if(l.axis === 'ns') fillRect(l.p - hw - 3, l.lo, l.p + hw + 3, l.hi, SURF.CONCRETE);
      else fillRect(l.lo, l.p - hw - 3, l.hi, l.p + hw + 3, SURF.CONCRETE);
    }
  });
  lines.forEach(function(l){
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

  /* the ground's height: flat (this is Mesa) but for the canals, the
     retention basins and the ramps */
  M.height = function(x, z){
    var s = M.surf(x, z);
    if(s === SURF.WATER) return -2.8;
    var h = 0;
    for(var k = 0; k < basins.length; k++){
      var b = basins[k];
      var dx = (x - b.x) / b.rx, dz = (z - b.z) / b.rz;
      var r2 = dx * dx + dz * dz;
      if(r2 < 1){ var q = 1 - r2; h -= b.d * q * (2 - q) * 0.999 + 0; }
    }
    for(var r = 0; r < ramps.length; r++){
      var rp = ramps[r];
      if(x < rp.x0 || x > rp.x1 || z < rp.z0 || z > rp.z1) continue;
      var along = rp.dx ? (x - rp.s0) * rp.dx : (z - rp.s0) * rp.dz;
      if(along >= 0 && along <= rp.len) h = Math.max(h, rp.h * along / rp.len);
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
  // crossings
  NSL.forEach(function(a){ EWL.forEach(function(b){
    var n = node(a.p, b.p);
    a.nodes.push({at: b.p, n: n}); b.nodes.push({at: a.p, n: n});
    if(a.kind !== 'fwy' || b.kind !== 'fwy') lights.push({x: a.p, z: b.p, wa: a.w, wb: b.w, a: a.id, b: b.id, sig: a.kind !== 'fwy' && b.kind !== 'fwy' && !(a.kind === 'col' && b.kind === 'col')});
  }); });
  // the ends of every line, so a dead end is still drivable for the computer
  lines.forEach(function(l){
    var lo = l.axis === 'ns' ? l.lo + 8 : Math.max(l.lo, X0 + 8), hi = l.hi - 8;
    var first = Math.min.apply(null, l.nodes.map(function(q){ return q.at; }));
    var last = Math.max.apply(null, l.nodes.map(function(q){ return q.at; }));
    if(first - lo > 20){ var n0 = l.axis === 'ns' ? node(l.p, lo) : node(lo, l.p); l.nodes.push({at: lo, n: n0}); }
    if(hi - last > 20){ var n1 = l.axis === 'ns' ? node(l.p, hi) : node(hi, l.p); l.nodes.push({at: hi, n: n1}); }
  });
  // the loops
  loops.forEach(function(lp){
    var c0 = node(lp.x0, lp.z0), c1 = node(lp.x1, lp.z0), c2 = node(lp.x1, lp.z1), c3 = node(lp.x0, lp.z1);
    lp.corners = [c0, c1, c2, c3];
    var sides = {n: [c0, c1], e: [c1, c2], s: [c3, c2], w: [c0, c3]};
    var onSide = {n: [], e: [], s: [], w: []};
    lp.entries.forEach(function(e){
      var ln = node(e.lx, e.lz), gn = (e.line.axis === 'ns') ? node(e.line.p, e.gz) : node(e.gx, e.line.p);
      e.ln = ln; e.gn = gn;
      onSide[e.side].push(ln);
      e.line.nodes.push({at: e.line.axis === 'ns' ? e.gz : e.gx, n: gn});
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
    if(sh.line){ var n = node(sh.lx, sh.lz); sh.line.nodes.push({at: sh.lx, n: n}); sh.node = n; }
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
    var ne = M.nearestEdge(x, z);
    if(!ne) return {x: x, z: z, h: 0};
    var A = nodes[ne.e.a], B = nodes[ne.e.b];
    var dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    var t = L2 > 0 ? Math.max(0.1, Math.min(0.9, ((x - A.x) * dx + (z - A.z) * dz) / L2)) : 0;
    return {x: A.x + dx * t, z: A.z + dz * t, h: Math.atan2(dz, dx), e: ne.e};
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

root.WMap = {build: build, rng: rng, SURF: SURF};
})(typeof window !== 'undefined' ? window : globalThis);
