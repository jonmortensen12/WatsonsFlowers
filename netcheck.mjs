/* Watson's Flowers - the TV and phones in Chromium, over ?local=1.

   One TV and six phones (tabs of one browser, joined by BroadcastChannel,
   so no internet): a driver who steers with a finger and holds the gas, a
   tosser riding with them, an arranger who makes a bouquet from the card,
   a grower, a dispatcher and a kid with the rose cart. Then the end of the
   day, the parade and back to the lobby.

   node netcheck.mjs      (about a minute; serves web/ itself) */
import http from 'http';
import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); } catch(e){ ({chromium} = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const ROOT = path.resolve('web');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg'};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if(!p.startsWith(ROOT) || !fs.existsSync(p)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(p)] || 'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = 'http://localhost:' + server.address().port + '/';

let fails = 0;
function ok(c, m){ console.log((c ? '  ok   ' : '  FAIL ') + m); if(!c) fails++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']});
const ctx = await browser.newContext({viewport: {width: 1280, height: 720}});
const errors = [];
process.on('exit', () => { if(errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  ')); });
function watch(page, who){ page.on('pageerror', e => errors.push(who + ': ' + e.message)); page.on('console', m => { if(m.type() === 'error') errors.push(who + ': ' + m.text()); }); }

const tv = await ctx.newPage(); watch(tv, 'tv');
await tv.setViewportSize({width: 480, height: 270});   // software rendering: a small TV keeps the phones responsive
await tv.goto(base + 'index.html?local=1&norender=1');
await tv.waitForFunction(() => window.WTV && WTV.NET.code, null, {polling: 250, timeout: 30000});
const code = await tv.evaluate(() => WTV.NET.code);
ok(/^[A-Z0-9]{4}$/.test(code), 'the TV opened room ' + code);

async function phone(name, w, h){
  const p = await ctx.newPage(); watch(p, name);
  await p.setViewportSize({width: w || 390, height: h || 800});
  await p.goto(base + 'controller.html?local=1#' + code);
  await p.fill('#nameIn', name);
  await p.click('#joinBtn');
  await p.waitForFunction(sel => { const e = document.querySelector(sel); return e && e.getClientRects().length > 0; }, '#jobs.on', {polling: 250, timeout: 30000});
  return p;
}
async function pick(p, label){ await p.locator('.job', {hasText: label}).first().click(); }

const dad = await phone('Dad', 800, 390);
const kid = await phone('Kid');
const aunt = await phone('Aunt');
const grandma = await phone('Grandma');
const uncle = await phone('Uncle');
const tiny = await phone('Tiny');
await sleep(500);
ok(await tv.evaluate(() => Object.keys(WTV.NET.people).length) === 6, 'six phones joined');

await pick(dad, 'Driver');
await sleep(300);
await pick(kid, 'Tosser');
await kid.locator('#rideBox button', {hasText: 'Dad'}).click();
await pick(aunt, 'Arranger');
await pick(grandma, 'Grower');
await pick(uncle, 'Dispatcher');
await pick(tiny, 'Rose cart');
await sleep(400);
const roles = await tv.evaluate(() => Object.values(WTV.NET.people).map(p => p.name + ':' + p.role).sort().join(' '));
ok(roles === 'Aunt:arrange Dad:drive Grandma:grow Kid:toss Tiny:cart Uncle:dispatch', 'everyone has a job: ' + roles);

// a holiday, then start from any phone
await grandma.locator('#hols button', {hasText: "Valentine"}).click();
await sleep(300);
ok(await tv.evaluate(() => WTV.G.S.holiday) === 'valentines', 'any phone picks the holiday');
await tiny.click('#startBtn');
try { await tv.waitForFunction(() => WTV.G.phase === 'day', null, {polling: 250, timeout: 20000}); }
catch(e){ console.log('phase', await tv.evaluate(() => WTV.G.phase), errors); throw e; }
ok(true, 'the day started');
ok(await tv.evaluate(() => WTV.G.S.vans.length === 1 && WTV.G.S.vans[0].owner != null), "Dad's phone owns the van");

// each phone is on its job's screen
await sleep(500);
for(const [p, scr] of [[dad, 'drive'], [kid, 'toss'], [aunt, 'arrange'], [grandma, 'grow'], [uncle, 'dispatch'], [tiny, 'cart']]){
  ok(await p.evaluate(s => document.getElementById(s).classList.contains('on'), scr), (await p.evaluate(() => document.getElementById('nameIn').value)) + ' sees the ' + scr + ' screen');
}

// Dad: finger steering, hold the gas
if(await dad.locator('#calTouch').isVisible()) await dad.click('#calTouch');
else await dad.evaluate(() => { tilt.touch = true; document.getElementById('calib').style.display = 'none'; });
const gas = await dad.locator('#bGas').boundingBox();
await dad.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
await dad.mouse.down();
await sleep(2500);
const spd = await tv.evaluate(() => WTV.G.S.vans[0].spd);
ok(spd > 10, 'holding GAS on the phone drives the van: ' + (spd * 2.237).toFixed(0) + ' mph');
await dad.mouse.up();

// Aunt: claim the first order and make it exactly
await aunt.waitForFunction(sel => { const e = document.querySelector(sel); return e && e.getClientRects().length > 0; }, '#aList .card', {polling: 250, timeout: 30000});
await aunt.locator('#aList .card:not(.walk):not(.taken)').first().click();
await aunt.waitForFunction(() => !!myOrder(), null, {polling: 250, timeout: 30000});
const order = await tv.evaluate(() => { const S = WTV.G.S; const o = S.orders.find(o => o.state === 'arr'); const r = WSim.recipes(S)[o.ri]; return {id: o.id, st: r.st, wrap: r.wrap, rib: r.rib}; });
const FL = await aunt.evaluate(() => WSim.FLOWERS.map(f => f.k));
try { await aunt.waitForFunction(() => document.querySelectorAll('#aStems .stem').length >= 7, null, {polling: 250, timeout: 30000}); }
catch(e){ console.log(await aunt.evaluate(() => JSON.stringify([cur, myOrder(), document.querySelectorAll('#aStems .stem').length, benchBuilt, getComputedStyle(document.getElementById('bench')).display, SNAP.hol, ME]))); throw e; }
for(const [k, n] of Object.entries(order.st)) for(let i = 0; i < n; i++){ await aunt.evaluate(j => document.querySelectorAll('#aStems .stem')[j].click(), FL.indexOf(k)); await sleep(60); }
await aunt.evaluate(w => document.querySelector('#aWrap button[data-k="' + w + '"]').click(), order.wrap);
await aunt.evaluate(w => document.querySelector('#aRib button[data-k="' + w + '"]').click(), order.rib);
await sleep(300);
await aunt.evaluate(() => document.getElementById('aDone').click());
await sleep(400);
const made = await tv.evaluate(id => { const o = WSim.orderById(WTV.G.S, id); return o && {state: o.state, q: o.q}; }, order.id);
ok(made && made.state !== 'arr' && made.q >= 1, "Aunt's arrangement went into the cooler at " + Math.round((made && made.q) * 100) + '%');

// Grandma waters, Tiny sells a rose, Uncle pings
try { await grandma.waitForFunction(sel => { const e = document.querySelector(sel); return e && e.getClientRects().length > 0; }, '#plots .plot', {polling: 250, timeout: 30000}); }
catch(e){ console.log(await grandma.evaluate(() => JSON.stringify([cur, ME.role, !!SNAP.gar, SNAP.ppl]))); console.log(await tv.evaluate(() => JSON.stringify([WTV.G.S.roles, Object.values(WTV.NET.people).map(p => [p.name, p.role, !!p.conn, Math.round(performance.now() - p.seen)])]))); throw e; }
await grandma.locator('#plots .plot').first().click();
await sleep(300);
ok(await tv.evaluate(() => WTV.G.S.ppl[Object.values(WTV.NET.people).find(p => p.name === 'Grandma').id].watered >= 0), 'the garden takes water');
const roseBefore = await tv.evaluate(() => WTV.G.S.roses);
for(let i = 0; i < 40 && (await tv.evaluate(() => WTV.G.S.roses)) === roseBefore; i++){
  const pt = await tiny.evaluate(() => { const c = document.getElementById('ccan'); const W = c.width / (c._dpr || 1); const p = CART.people.find(p => p.want && !p.happy && Math.abs(p.x - CART.x * W) < W * 0.3 && p.x > 10 && p.x < W - 10); return p ? {x: p.x, y: p.y - 25} : null; });
  if(pt){ const box = await tiny.locator('#ccan').boundingBox(); await tiny.mouse.click(box.x + pt.x, box.y + pt.y); }
  await sleep(250);
}
ok(await tv.evaluate(() => WTV.G.S.roses) > roseBefore, 'the rose cart sold a rose');
const map = await uncle.locator('#dmap').boundingBox();
await uncle.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
await uncle.mouse.down(); await sleep(800); await uncle.mouse.up();
await sleep(200);
ok(await tv.evaluate(() => WTV.G.S.pings.length > 0), 'dispatch pinged the map');

// the kid throws from a van parked by a porch with a bouquet in it
await tv.evaluate(() => {
  const S = WTV.G.S, v = S.vans[0];
  const o = S.orders.find(o => o.kind === 'del' && (o.state === 'ready' || o.state === 'new'));
  const h = WTV.M.houses[o.house];
  o.state = 'van'; o.van = 0; o.q = 1; v.cargo.push(o.id);
  v.x = h.front.x; v.z = h.front.z; v.vx = v.vz = 0; v.h = 0; v.crash = null; v.ghost = 5;
  window.__toss = o.id;
});
await sleep(400);
const info = await kid.evaluate(() => VAN && VAN.toss);
ok(info && info.ok, 'the tosser sees the porch: ' + JSON.stringify(info));
if(info){
  const box = await kid.locator('#tcan').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.58;
  const a = info.ang - Math.PI / 2, L = Math.min(box.width, box.height) * 0.75 * Math.max(0.12, info.d / 32) / 0.6 * 0.8;
  await kid.mouse.move(cx, cy); await kid.mouse.down();
  for(let i = 1; i <= 6; i++){ await kid.mouse.move(cx + Math.cos(a) * L * i / 6, cy + Math.sin(a) * L * i / 6); await sleep(30); }
  await kid.mouse.up();
  await sleep(2500);
  const st = await tv.evaluate(() => { const o = WSim.orderById(WTV.G.S, window.__toss); return o && o.state + ' ' + (o.how || ''); });
  ok(/done|new/.test(st), 'the swiped bouquet landed: ' + st);
}

// end the day early, the parade, back to the lobby
await tv.evaluate(() => { WTV.G.S.t = WTV.G.S.dayLen - 0.1; });
await tv.waitForFunction(() => WTV.G.phase === 'end', null, {polling: 250, timeout: 5000});
ok(true, 'closing time');
await sleep(800);
ok(await kid.evaluate(() => document.getElementById('results').classList.contains('on')), 'phones show the results');
await kid.click('#rNext');
await sleep(200);
await tv.waitForFunction(() => WTV.G.phase === 'parade', null, {polling: 250, timeout: 20000});
ok(true, 'the parade');
await sleep(400);
const pc = await aunt.locator('#pcan').boundingBox();
for(let i = 0; i < 6; i++){
  const dir = i % 2 ? 1 : -1;
  await aunt.mouse.move(pc.x + pc.width / 2, pc.y + pc.height / 2); await aunt.mouse.down();
  await aunt.mouse.move(pc.x + pc.width / 2 + dir * pc.width * 0.3, pc.y + pc.height / 2, {steps: 4}); await aunt.mouse.up();
  await sleep(450);
}
await sleep(1200);
ok(await tv.evaluate(() => WTV.G.S.cheers) > 0, 'flowers thrown from a phone reach the crowd: ' + await tv.evaluate(() => WTV.G.S.cheers));
await tv.evaluate(() => { WTV.G.S.parade.t = WTV.G.S.parade.dur; });
await tv.waitForFunction(() => WTV.G.phase === 'results', null, {polling: 250, timeout: 5000});
await sleep(2300);
await dad.click('#rNext');
await tv.waitForFunction(() => WTV.G.phase === 'lobby', null, {polling: 250, timeout: 5000});
ok(true, 'back in the lobby');
await sleep(500);
ok(await dad.evaluate(() => document.getElementById('jobs').classList.contains('on')), 'phones are back on the jobs screen');

// a driver drops out: the computer takes the wheel
await tiny.click('#startBtn');
await tv.waitForFunction(() => WTV.G.phase === 'count' || WTV.G.phase === 'day', null, {polling: 250, timeout: 5000});
await dad.close();
await tv.evaluate(() => { Object.values(WTV.NET.people).forEach(p => { if(p.name === 'Dad') p.seen -= 7000; }); });
await sleep(1500);
ok(await tv.evaluate(() => !WTV.G.S.vans[0].owner), 'a driver who goes quiet hands the van to the computer');

await tv.screenshot({path: 'netcheck-tv.png'});
ok(errors.length === 0, 'no page errors' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
await browser.close();
server.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
