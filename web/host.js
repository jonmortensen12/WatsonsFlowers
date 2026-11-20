/* Watson's Flowers - the host.

   Whoever opens the room runs the game: the TV normally, or one of the
   phones when there is no TV ("Start the shop on this phone"). The host
   holds the simulation, steps it at 60 Hz from real elapsed time
   (setInterval, not requestAnimationFrame, which is a paint rate and stops
   in a background tab), tells every phone what it needs ten or twenty
   times a second, and seats people in their jobs.

   It draws nothing and plays nothing. A TV that hosts hears about events
   and changes of phase through the hooks and draws and plays them; a
   phone that hosts also plays, its own job wired in through a loopback
   connection that looks exactly like a network one, so the game never
   needs to know which device is holding the room.

   Lessons carried over from Mission Control: a phone that says nothing for
   six seconds is away (WebRTC can take far longer to notice), one away for
   thirty has gone, and a phone that comes back with the same device id gets
   its own seat back.

   WHost.create(hooks) -> host. hooks (all optional):
     tv          true on the TV (phones are told whether there is one)
     room(info)  the room opened or failed: {code, status}
     event(e)    every simulation event, after the phones have been told
     phase(p)    'count' | 'end' | 'parade' | 'results' | 'lobby', on entering it
     vans()      the vans changed (a driver joined mid-day, a name changed)
     map(M)      the town changed (in the lobby)
     ticker(text, color), sfx(kind)
     kbdInput()  the keyboard driver's input for van 1 (the TV) */
(function(root){
'use strict';
var PROTO = 1, PROTO_MIN = 1;
var ROLES = ['drive', 'toss', 'arrange', 'grow', 'dispatch', 'cart'];

function cleanName(n){ return String(n || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 14); }

function create(hooks){
  hooks = hooks || {};
  var SIM = root.WSim, DT = SIM.DT, HOLIDAYS = SIM.HOLIDAYS;
  var nop = function(){};
  var hk = function(k){ return hooks[k] || nop; };

  /* ---------------- the save ---------------- */
  var SAVE = {records: {}, days: 0, holiday: 'thanksgiving', map: 'mesa'};
  try { Object.assign(SAVE, JSON.parse(localStorage.getItem('wats_save') || '{}')); } catch(e){}
  function storeSave(){ try { localStorage.setItem('wats_save', JSON.stringify(SAVE)); } catch(e){} }

  /* ---------------- the town ---------------- */
  var M = root.WMap.town(SAVE.map);
  var G = {S: null, phase: 'lobby', paused: false, phaseT: 0, ticker: [], msgs: {}, flash: 0, recordNew: false, kbd: {}};
  function newSim(){ G.S = SIM.create(M, {seed: (Date.now() & 0xffff) + 1, holiday: SAVE.holiday}); }
  newSim();

  /* ---------------- the room ---------------- */
  var NET = {code: null, handle: null, status: 'Opening the room...', people: {}};
  var stopped = false;
  function openRoom(){
    NET.status = 'Opening the room...';
    NET.handle = root.WNet.host({
      open: function(code){ NET.code = code; NET.status = ''; hk('room')({code: code, status: ''}); },
      conn: function(c){ wireConn(c); },
      error: function(msg){
        NET.status = msg + ' Retrying...'; NET.code = null; hk('room')({code: null, status: NET.status});
        setTimeout(function(){ if(!NET.code && !stopped) openRoom(); }, 4000);
      }
    });
  }
  function wireConn(c){
    var id = null;
    c.on('data', function(d){
      if(!d || typeof d !== 'object') return;
      if(d.t === 'hello'){
        id = String(d.dev || c.peer).slice(0, 40);
        var old = NET.people[id];
        if(old && old.conn && old.conn !== c){ try { old.conn.close(); } catch(e){} }
        var p = old || {id: id, role: null, van: -1, ride: null, inp: {}, seen: 0, joined: performance.now()};
        p.name = cleanName(d.name) || p.name || 'Helper';
        p.conn = c; p.lastConn = c; p.gone = 0; p.seen = performance.now();
        p.local = c.peer === 'local';
        NET.people[id] = p;
        send(p, {t: 'host', proto: PROTO, min: PROTO_MIN, tv: !!hooks.tv, code: NET.code});
        tellYou(p);
        hk('ticker')(p.name + ' is here');
        return;
      }
      var q = id && NET.people[id];
      if(!q) return;
      if(!q.conn && q.lastConn === c){ q.conn = c; q.gone = 0; seatBack(q); }
      if(q.conn !== c) return;
      q.seen = performance.now();
      onPhone(q, d);
    });
    c.on('close', function(){ var p = id && NET.people[id]; if(p && p.conn === c){ p.conn = null; p.gone = performance.now(); away(p); } });
  }
  function send(p, m){ if(p && p.conn){ try { p.conn.send(m); } catch(e){} } }
  function everyone(m){ Object.keys(NET.people).forEach(function(k){ send(NET.people[k], m); }); }
  function people(){ return Object.keys(NET.people).map(function(k){ return NET.people[k]; }); }
  function present(){ return people().filter(function(p){ return p.conn; }); }

  function sweep(){
    var now = performance.now();
    people().forEach(function(p){
      if(p.local) return;   // the phone holding the room is always here
      if(p.conn && now - p.seen > 6000){ p.conn = null; p.gone = now; away(p); }
      if(!p.conn && now - p.gone > 30000){ release(p); delete NET.people[p.id]; }
    });
    countRoles();
  }
  /* a driver who goes quiet: the computer takes the wheel until they are back */
  function away(p){
    var S = G.S;
    if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && S.vans[p.van].owner === p.id){ SIM.setOwner(S, p.van, null); S.vans[p.van].name = p.name + ' (computer)'; }
  }
  function seatBack(p){
    var S = G.S;
    if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && !S.vans[p.van].owner){ SIM.setOwner(S, p.van, p.id, p.name, true); sendDrv(p); }
    tellYou(p);
  }
  function release(p){
    var S = G.S;
    if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && (S.vans[p.van].owner === p.id || !S.vans[p.van].owner)){ SIM.setOwner(S, p.van, null); S.vans[p.van].name = 'Computer'; }
  }
  function countRoles(){
    var S = G.S, r = {arr: 0, grow: 0, disp: 0, cart: 0};
    present().forEach(function(p){ if(p.role === 'arrange') r.arr++; else if(p.role === 'grow') r.grow++; else if(p.role === 'dispatch') r.disp++; else if(p.role === 'cart') r.cart++; });
    S.roles = r;
  }
  function drivers(){ return people().filter(function(p){ return p.role === 'drive'; }).sort(function(a, b){ return a.joined - b.joined; }); }
  function vanFor(p){
    // where a tosser rides: with the driver they picked, else van 1
    var S = G.S;
    if(p.ride){ var d = NET.people[p.ride]; if(d && d.van >= 0 && S.vans[d.van]) return d.van; }
    if(p.rideVan != null && S.vans[p.rideVan]) return p.rideVan;
    return S.vans.length ? 0 : -1;
  }
  function tellYou(p){
    var S = G.S;
    if(p.role === 'toss') p.van = vanFor(p);
    var drv = drivers().map(function(d){ return [d.id, d.name, d.van]; });
    var vans = S.vans.map(function(v){ return [v.i, v.name, v.color]; });
    send(p, {t: 'you', role: p.role, van: p.van, name: p.name, id: p.id, ph: G.phase, drv: drv, vans: vans, hol: SAVE.holiday, map: M.key, tv: !!hooks.tv, code: NET.code});
  }
  function tellAll(){ people().forEach(tellYou); }
  /* a driver's phone takes the van from here */
  function sendDrv(p){
    var S = G.S, v = p.van >= 0 && S.vans[p.van];
    if(!v || !p.conn) return;
    send(p, {t: 'drv', i: v.i, x: v.x, z: v.z, h: v.crash ? v.crash.h || v.h : v.h, color: v.color, boost: v.boost});
  }

  /* picking a job */
  function pick(p, role, opt){
    var S = G.S;
    if(ROLES.indexOf(role) < 0) return;
    // leaving the wheel hands the van to the computer
    if(p.role === 'drive' && role !== 'drive') release(p);
    p.role = role; p.inp = {};
    if(role === 'drive'){
      if(G.phase === 'day' || G.phase === 'count'){
        var v = -1;
        for(var k = 0; k < S.vans.length; k++) if(!S.vans[k].owner){ v = k; break; }
        if(v < 0) v = SIM.addVan(S, p.id, p.name);
        if(v < 0){ p.role = null; send(p, {t: 'full'}); tellYou(p); return; }
        SIM.setOwner(S, v, p.id, p.name, true);
        p.van = v;
        hk('vans')();
        sendDrv(p);
      } else {
        if(drivers().length > SIM.MAX_VANS){ p.role = null; send(p, {t: 'full'}); }
        p.van = -1;
      }
    } else if(role === 'toss'){
      p.ride = opt && opt.ride || null;
      p.rideVan = opt && opt.van != null ? +opt.van : null;
      p.van = vanFor(p);
    } else p.van = -1;
    countRoles();
    tellAll();
    hk('sfx')('click');
    hk('ticker')(p.name + ' is ' + (role === 'arrange' ? 'arranging' : role === 'grow' ? 'in the garden' : role === 'dispatch' ? 'on dispatch' : role === 'cart' ? 'pushing the rose cart' : role === 'toss' ? 'riding shotgun' : 'driving'));
  }

  function onPhone(p, d){
    var S = G.S;
    switch(d.t){
      case 'pick': pick(p, d.role, d); break;
      case 'name': p.name = cleanName(d.name) || p.name; if(p.role === 'drive' && S.vans[p.van] && S.vans[p.van].owner === p.id){ S.vans[p.van].name = p.name; hk('vans')(); } tellAll(); break;
      case 'in': if(p.role === 'drive') p.inp = d; break;
      case 'vs': if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && S.vans[p.van].owner === p.id) SIM.remoteState(S, p.van, d.a); break;
      case 've': if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && S.vans[p.van].owner === p.id) SIM.remoteEvent(S, p.van, d.e); break;
      case 'act': {
        var a = d.a; if(!a || !a.a) return;
        var ok = {
          claim: 'arrange', stem: 'arrange', wrap: 'arrange', ribbon: 'arrange', done: 'arrange', drop: 'arrange', move: 'arrange',
          water: 'grow', harvest: 'grow', gsize: 'grow', rose: 'cart', assign: 'dispatch', prio: 'dispatch', ping: 'dispatch'
        }[a.a];
        if(a.a === 'toss'){
          if(p.role === 'drive'){ a.v = p.van; a.auto = true; }
          else if(p.role === 'toss'){ a.v = p.van = vanFor(p); a.auto = false; }
          else return;
        } else if(a.a === 'ptoss'){ /* everybody throws at the parade */ }
        else if(ok && ok !== p.role) return;
        SIM.act(S, p.id, p.name, a);
        break;
      }
      case 'start':
        if(G.phase === 'lobby'){ if(d.hol && HOLIDAYS[d.hol]) SAVE.holiday = d.hol; if(d.map) setMap(d.map); startDay(); }
        break;
      case 'map':
        if(G.phase === 'lobby') setMap(d.k);
        break;
      case 'hol':
        if(G.phase === 'lobby') setHoliday(d.k);
        break;
      case 'next':
        if(G.phase === 'end' && G.phaseT > 3) startParade();
        else if(G.phase === 'results' && G.phaseT > 2) toLobby();
        break;
      case 'pause':
        if(G.phase === 'day'){ G.paused = !!d.v; G.S.paused = G.paused; hk('sfx')('click'); }
        break;
    }
  }

  /* what every phone is told, ten times a second */
  function broadcast(){
    var S = G.S;
    var s = SIM.snap(S);
    s.t = 's'; s.phase = G.phase; s.paused = G.paused; s.tv = !!hooks.tv;
    s.ppl = people().map(function(p){ return [p.name, p.role || '', p.van, p.conn ? 1 : 0, p.id]; });
    s.rec = SAVE.records[SAVE.holiday] || 0;
    if(G.phase === 'end' || G.phase === 'results') s.res = S.results ? {money: S.money, del: S.results.delivered, aw: S.results.awards, cheers: S.cheers} : null;
    everyone(s);
    // the van's own numbers for its driver and tossers
    people().forEach(function(p){
      if((p.role === 'drive' || p.role === 'toss') && p.van >= 0 && S.vans[p.van]){
        var vi = SIM.vanInfo(S, p.van);
        vi.t = 'v'; vi.i = p.van;
        send(p, vi);
      }
    });
  }

  /* ---------------- the town and the holiday, in the lobby ---------------- */
  function setMap(key){
    var t = root.WMap.townInfo(key);
    if(G.phase !== 'lobby' || t.k === M.key) return;
    SAVE.map = t.k; storeSave();
    M = root.WMap.town(SAVE.map);
    newSim();
    hk('map')(M);
    tellAll();
    hk('sfx')('click');
  }
  function setHoliday(k){
    if(!HOLIDAYS[k]) return;
    SAVE.holiday = k; storeSave(); G.S.holiday = k; tellAll(); hk('sfx')('click');
  }

  /* ---------------- the day ---------------- */
  function startDay(){
    var S = G.S = SIM.create(M, {seed: (Date.now() & 0xffff) + 1, holiday: SAVE.holiday});
    drivers().slice(0, SIM.MAX_VANS).forEach(function(p){
      var v = SIM.addVan(S, p.conn ? p.id : null, p.name);
      if(p.conn) SIM.setOwner(S, v, p.id, p.name, true);
      p.van = v;
    });
    if(!S.vans.length) SIM.addVan(S, null, 'Computer');
    if(G.kbdDriver && !S.vans[0].owner){ SIM.setOwner(S, 0, 'kbd', 'Keyboard'); }
    countRoles();
    SIM.start(S, SAVE.holiday);
    G.phase = 'count'; G.phaseT = 0; G.paused = false; G.recordNew = false;
    hk('phase')('count');
    tellAll();
    drivers().forEach(sendDrv);
  }
  function endOfDay(){
    G.phase = 'end'; G.phaseT = 0;
    var S = G.S;
    var best = SAVE.records[S.holiday] || 0;
    if(S.money > best){ SAVE.records[S.holiday] = S.money; G.recordNew = true; }
    SAVE.days++;
    storeSave();
    tellAll();
    hk('phase')('end');
  }
  function startParade(){
    SIM.startParade(G.S);
    G.phase = 'parade'; G.phaseT = 0;
    hk('phase')('parade');
    tellAll();
  }
  function toLobby(){
    G.phase = 'lobby'; G.phaseT = 0;
    newSim();
    people().forEach(function(p){ if(p.role === 'drive') p.van = -1; });
    hk('phase')('lobby');
    tellAll();
  }

  /* ---------------- the clock ---------------- */
  var lastT = performance.now(), acc = 0;
  function tick(){
    var now = performance.now();
    acc += Math.min(0.25, (now - lastT) / 1000);
    lastT = now;
    while(acc >= DT){ acc -= DT; stepOnce(); }
  }
  function stepOnce(){
    var S = G.S;
    G.phaseT += DT;
    // inputs: phones and the keyboard
    if(G.phase === 'day' || G.phase === 'count'){
      people().forEach(function(p){
        if(p.role === 'drive' && p.van >= 0 && S.vans[p.van] && S.vans[p.van].owner === p.id) SIM.input(S, p.van, p.inp);
      });
      if(S.vans[0] && S.vans[0].owner === 'kbd' && hooks.kbdInput) SIM.input(S, 0, hooks.kbdInput());
    }
    // remember where everything was, for smooth drawing
    S.vans.forEach(function(v){ v.px = v.x; v.pz = v.z; v.py = v.y; v.ph = v.h; });
    SIM.step(S);
    S.ev.forEach(onEvent);
    if(G.phase === 'count' && S.ph === 'day'){ G.phase = 'day'; G.phaseT = 0; }
    if(G.phase === 'day' && S.ph === 'end') endOfDay();
    if(G.phase === 'parade' && S.ph === 'results'){ G.phase = 'results'; G.phaseT = 0; tellAll(); hk('phase')('results'); }
    if(G.phase === 'end' && G.phaseT > 14) startParade();
    if(G.phase === 'results' && G.phaseT > 60) toLobby();
  }

  /* ---------------- events: what the phones are told ---------------- */
  function phoneFx(vanI, k, extra){
    people().forEach(function(p){ if((p.role === 'drive' || p.role === 'toss') && p.van === vanI) send(p, Object.assign({t: 'fx', k: k}, extra || {})); });
  }
  // what each driver's phone gets told about (near its van)
  var pendingEv = {};
  var LOOK = {crash: 1, carhit: 1, smash: 1, land: 1, toss: 1, boom: 1, goonhit: 1, splash: 1, mist: 1, thud: 1};
  function shareEvent(e){
    if(e.k === 'goons' || e.k === 'haboob'){   // news every driver hears, wherever they are
      people().forEach(function(p){ if(p.role === 'drive' && p.van >= 0) (pendingEv[p.id] || (pendingEv[p.id] = [])).push({k: e.k}); });
      return;
    }
    if(!LOOK[e.k] || e.x == null) return;
    people().forEach(function(p){
      if(p.role !== 'drive' || p.van < 0) return;
      var v = G.S.vans[p.van]; if(!v) return;
      if((e.k === 'crash' || e.k === 'smash' || e.k === 'thud') && e.v === p.van) return;   // it saw its own
      if(Math.hypot(e.x - v.x, e.z - v.z) > 320) return;
      var q = pendingEv[p.id] || (pendingEv[p.id] = []);
      if(q.length < 30) q.push(e);
    });
  }
  function onEvent(e){
    shareEvent(e);
    switch(e.k){
      case 'crash': phoneFx(e.v, 'crash', {lost: e.lost}); break;
      case 'dent': phoneFx(e.v, 'dent', {dmg: e.dmg}); break;
      case 'land': if(e.how) phoneFx(e.v, 'land', {how: e.how, pay: e.pay}); break;
      case 'nothing': phoneFx(e.v, 'nothing'); break;
      case 'load': phoneFx(e.v, 'load', {n: e.n}); break;
      case 'mist': phoneFx(e.v, 'mist'); break;
      case 'ice': phoneFx(e.v, 'ice'); break;
      case 'powder': phoneFx(e.v, 'powder'); break;
      case 'boom': phoneFx(e.v, 'boom'); break;
      case 'gooned': phoneFx(e.v, 'gooned'); break;
      case 'goonhit': phoneFx(e.v, 'goonhit', {rec: e.rec}); break;
    }
    hk('event')(e);
  }

  /* ---------------- each driver's phone: the world around its van ---------------- */
  function worldTick(){
    var S = G.S;
    var live = G.phase === 'day' || G.phase === 'count';
    var pk = M.pickups.filter(function(q){ return (S.pickupT[q.id] || 0) > S.t || (q.k === 'boom' && S.boomUsed); }).map(function(q){ return q.id; });
    if(S.boomUsed) pk.push(-1);
    var br = Object.keys(S.broken).map(Number), bw = Object.keys(S.wallsDown).map(Number);
    var r1 = function(n){ return Math.round(n * 10) / 10; }, r2 = function(n){ return Math.round(n * 100) / 100; };
    people().forEach(function(p){
      if(p.role !== 'drive' || !p.conn) return;
      var v = p.van >= 0 && S.vans[p.van];
      var w = {t: 'w', st: r2(S.t), clk: r2(S.clock), dust: r2(S.dust), gx: r1(S.gust.x), gz: r1(S.gust.z), ph: live ? S.ph : G.phase, hol: S.holiday, br: br, pk: pk, bw: bw};
      if(v){
        w.cars = [];
        S.cars.forEach(function(c){
          if(Math.abs(c.x - v.x) > 280 || Math.abs(c.z - v.z) > 280) return;
          var kind = 0; for(var q = 0; q < SIM.CAR_KINDS.length; q++) if(SIM.CAR_KINDS[q].k === c.kind) kind = q;
          var a = [c.id, r1(c.x), r1(c.z), r2(c.h), r1(c.v), kind, c.color];
          if(c.wreck) a.push(r2(c.wreck.y), r2(c.wreck.ax), r2(c.wreck.ay), r2(c.wreck.az));
          w.cars.push(a);
        });
        w.vans = S.vans.filter(function(o){ return o !== v; }).map(function(o){
          var a = [o.i, r1(o.x), r1(o.z), r2(o.y), r2(o.crash && o.crash.h != null ? o.crash.h : o.h), o.i, o.name];
          if(o.crash) a.push(r2(o.crash.ax || 0), r2(o.crash.ay || 0), r2(o.crash.az || 0));
          return a;
        });
        w.goons = S.goons.filter(function(g){ return g.st !== 'gone' && Math.abs(g.x - v.x) < 280 && Math.abs(g.z - v.z) < 280; })
          .map(function(g){ return [r1(g.x), r2(g.y || 0), r1(g.z), r2(g.h), g.st === 'flung' ? 2 : g.st === 'flee' ? 1 : 0, r2(g.spin || 0), g.color, g.carry != null ? 1 : 0]; });
        w.tgt = v.tgt ? {k: v.tgt.k, id: v.tgt.id} : null;
      }
      if(pendingEv[p.id] && pendingEv[p.id].length){ w.ev = pendingEv[p.id]; pendingEv[p.id] = []; }
      send(p, w);
    });
  }

  /* A player on this very device: the same messages, no network. */
  function local(name, dev, onMessage){
    var em = {};
    var fire = function(ev, x){ (em[ev] || []).forEach(function(f){ f(x); }); };
    var conn = {
      peer: 'local',
      on: function(ev, fn){ (em[ev] = em[ev] || []).push(fn); },
      // delivered on the next turn, like the network: a phone's handlers never run inside the host's
      send: function(m){ setTimeout(function(){ try { onMessage(m); } catch(e){ console.error(e); } }, 0); },
      close: function(){ fire('close'); }
    };
    wireConn(conn);
    var toHost = function(m){ fire('data', m); };
    toHost({t: 'hello', name: name, dev: dev, proto: PROTO});
    return {send: toHost};
  }

  /* ---------------- go ---------------- */
  openRoom();
  var timers = [setInterval(tick, 1000 / 60), setInterval(broadcast, 100), setInterval(sweep, 1000), setInterval(worldTick, 50)];

  return {
    G: G, NET: NET, SAVE: SAVE,
    get M(){ return M; },
    alpha: function(){ return Math.max(0, Math.min(1, acc / DT)); },
    startDay: startDay, startParade: startParade, toLobby: toLobby, setMap: setMap, setHoliday: setHoliday,
    tellAll: tellAll, storeSave: storeSave, refresh: function(){ hk('vans')(); },
    local: local,
    stop: function(){ stopped = true; timers.forEach(clearInterval); try { NET.handle && NET.handle.close && NET.handle.close(); } catch(e){} }
  };
}

root.WHost = {create: create, PROTO: PROTO};
})(typeof window !== 'undefined' ? window : globalThis);
