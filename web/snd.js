/* Watson's Flowers - music and sound effects, made on the spot.

   The engine is Family Beatdown's (jonmortensen12/family-smash, the SND
   block in web/index.html), lifted as it is: every instrument is
   synthesised in the browser and baked into buffers the first time
   something asks for it - plucked strings, struck marimbas, a choir,
   drums - no audio files and nothing downloaded. Its own songs are still
   in here (unused); Watson's five are added just before the compile
   step, in its notation, and the effects bank is at the bottom.

   Pages use WSound: unlock() from the first tap, fx(kind), music(name).
   Songs: mainstreet (the shop), rush (the day), haboob (6 p.m.),
   parade, closing. */
(function(root){
var _AC = null;
function ac(){
  if(!_AC){
    try { _AC = new (root.AudioContext || root.webkitAudioContext)(); } catch(e){ return null; }
  }
  return _AC;
}
var musicOn = true;
var SND = (function(){
"use strict";
/* ==================================================================
   PART 1 - THE WORKSHOP
   Hand-written DSP. The whole argument for baking is that once a
   sound does not have to be finished in 2.9 milliseconds, the node
   graph stops being the limit - you can write the samples yourself.
   ================================================================== */

var A = null, RATE = 44100, master, musBus, musDuck, fxBus, masterTail, BUILT = false;
/* How loud the music sits under everything else. It used to be 1, which
   sounds like the right answer and is not: the output chain ends in a
   tanh, the music alone was already driving it into saturation, and a
   saturated chain has nowhere left to put a punch. A hit as loud as the
   whole song lifted the mix by a decibel and a half. Backing the music
   off leaves that room, and the chain's post gain means the song itself
   barely drops. The fades still run 0..1 on musBus; this is the ceiling
   they fade up to. */
var MUS_LEVEL = 0.62;
/* And how loud the effects sit over it. Measured rather than guessed:
   with both buses at 1 a punch landed 1.5 dB above the music bed and a
   swing landed 10 dB *under* it, which is a fight you watch rather than
   one you hear. See the effect-over-music table in `musiccheck.js`. */
var FX_LEVEL = 2.4;
var MUSSRC = [];
/* The game already owns the AudioContext and the gesture that unlocks
   it, so this borrows it rather than opening a second one. Two buses
   hang off one limiter: music, which has to be faded and then hard
   stopped as a unit, and effects, which must never be caught by that.
   Rebuilding when the context changes identity is what lets the video
   tools point the whole engine at an OfflineAudioContext. */
function actx(){
  var a = ac(); if(!a) return null;
  if(!BUILT || A !== a){
    A = a; RATE = a.sampleRate;
    master = makeChain(a);
    musBus = a.createGain(); musBus.gain.value = 1;
    /* The duck is its own node, and that is the whole point of it.
       `musBus.gain` is the param musicStart ramps up and musicStop fades
       to nothing; a second scheduler writing ducks into the same param
       would cancel that fade halfway and leave the pads ringing - the
       rumble, back again by another route. Two nodes, one param each. */
    musDuck = a.createGain(); musDuck.gain.value = MUS_LEVEL;
    musBus.connect(musDuck); musDuck.connect(master);
    fxBus = a.createGain(); fxBus.gain.value = FX_LEVEL; fxBus.connect(master);
    MUSSRC.length = 0;
    BUILT = true;
  }
  return a;
}
function fxOut(){ actx(); return fxBus; }
/* Hand the whole mix to somebody else as well as the speakers. Used once, by
   the highlight recorder, and it adds a second consumer rather than rerouting
   anything - so if it fails or is never called, the sound is exactly as it was. */
function tapOut(node){
  if(!actx() || !masterTail || !node) return false;
  try { masterTail.connect(node); return true; } catch(e){ return false; }
}
/* A hit and a song meet at one limiter, and the limiter does its job: a
   hit rendered as loud as the music lifted the mix by a decibel and a
   half, which is what "the music plays but you don't hear the punches"
   actually sounds like. Shouting louder does not work - the extra goes
   straight into the compressor. Every fighting game ducks the music
   under the impact instead, so this does too: down in twelve
   milliseconds, back over a quarter of a second. Only the moments worth
   ducking for are in the table; a swing, a jump, a roll and the
   countdown ticks happen far too often to pump the music with. */
var DUCK = {hit:0.55, heavy:0.5, big:0.4, ko:0.32, brk:0.45,
            grab:0.6, item:0.6, go:0.45};
function duck(kind){
  var lo = DUCK[kind];
  if(lo === undefined || !actx() || !musDuck) return;
  var g = musDuck.gain, t = A.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.min(g.value, MUS_LEVEL), t);
  g.linearRampToValueAtTime(MUS_LEVEL * lo, t + 0.012);
  g.linearRampToValueAtTime(MUS_LEVEL, t + 0.26);
}
function hz(m){ return 440 * Math.pow(2, (m - 69) / 12); }

/* The output chain, in one place. Compression to hold the sum together,
   then a tanh waveshaper, which is bounded by construction: whatever is
   playing, nothing downstream of it can clip. The offline check renders
   through this same function, so what it measures is what you hear. */
function makeChain(o, vol){
  var g = o.createGain(); g.gain.value = vol === undefined ? 0.62 : vol;
  var cp = o.createDynamicsCompressor();
  cp.threshold.value = -15; cp.knee.value = 14; cp.ratio.value = 4;
  cp.attack.value = 0.004; cp.release.value = 0.22;
  /* 1025, not 1024, and the -1..1 sweep divides by n-1. A waveshaper
     maps input 0 to the middle of its curve array; with an even length
     that middle falls between two entries and interpolates to about
     -0.002, so the chain emitted a constant DC offset instead of
     silence - inaudible on its own, but it is not nothing, and it made
     "did the music actually stop" impossible to measure. An odd length
     puts zero exactly on a sample. */
  var ws = o.createWaveShaper(), n = 1025, c = new Float32Array(n);
  for(var i = 0; i < n; i++) c[i] = Math.tanh((i * 2 / (n - 1) - 1) * 2) * 0.5;
  ws.curve = c;
  var pre = o.createGain(); pre.gain.value = 0.7;
  var post = o.createGain(); post.gain.value = 2.0;
  g.connect(cp); cp.connect(pre); pre.connect(ws);
  ws.connect(post); post.connect(o.destination);
  /* Remember the tail of the live chain so the highlight recorder can take a
     copy of the mix - see CLIP. Only the live one: makeChain also builds the
     chain for an OfflineAudioContext during a film render, and the
     startRendering discriminator is the same one ac() uses to tell those apart.
     Getting it wrong would leave the recorder holding a node from a context
     that has already finished. */
  if(typeof o.startRendering !== 'function') masterTail = post;
  return g;
}

/* --- a biquad I can run by hand, so filters work inside DSP too ---
   RBJ cookbook. Ten lines, and it is what lets a plucked string have
   a body and a cymbal have a shape without any nodes at all. */
function BQ(type, f0, Q, rate, dbGain){
  var w = 2 * Math.PI * f0 / rate, cs = Math.cos(w), sn = Math.sin(w);
  var al = sn / (2 * Q), A = Math.pow(10, (dbGain || 0) / 40);
  var b0, b1, b2, a0, a1, a2;
  if(type === 'lp'){ b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if(type === 'hp'){ b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if(type === 'bp'){ b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { /* peak */ b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A;
         a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  var B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  this.p = function(x){
    var y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/* --- Karplus-Strong, written out --------------------------------
   A plucked string is a noise burst circulating in a delay line one
   wavelength long, losing its high end a little on every lap. It
   cannot be done with a DelayNode: Web Audio forces a minimum delay
   of one render quantum in a feedback loop - 2.9 ms, which is a low
   A - so every note above the bass would come out at the wrong
   pitch. Written by hand there is no such floor, and this is the
   clearest case of baking buying something rather than saving
   something. */
function pluck(out, rate, f, dur, o){
  o = o || {};
  var N = rate / f, L = Math.max(2, Math.floor(N)), frac = N - L;
  var ring = new Float32Array(L + 1);
  var ex = new BQ('lp', o.excite || 3800, 0.7, rate);
  var hpf = new BQ('hp', o.exciteLow || 180, 0.7, rate);
  for(var i = 0; i < L; i++) ring[i] = hpf.p(ex.p(Math.random() * 2 - 1));
  var body = [];
  (o.body || [[110, 3, 5], [220, 4, 3], [400, 2, 2.5]]).forEach(function(b){
    body.push(new BQ('peak', b[0], b[1], rate, b[2]));
  });
  var damp = o.damp === undefined ? 0.5 : o.damp;
  var loss = o.loss === undefined ? 0.996 : o.loss;
  var n = Math.min(out.length, Math.floor(dur * rate));
  var idx = 0, last = 0, tail = Math.floor(rate * 0.02);
  for(var s = 0; s < n; s++){
    var cur = ring[idx], nxt = ring[(idx + 1) % L];
    var v = cur * (1 - frac) + nxt * frac;
    last = damp * last + (1 - damp) * v;
    ring[idx] = last * loss;
    idx = (idx + 1) % L;
    var y = v;
    for(var b = 0; b < body.length; b++) y = body[b].p(y);
    // only the very end is faded, so the string decays on its own terms
    if(s > n - tail) y *= (n - s) / tail;
    out[s] += y * (o.gain === undefined ? 0.5 : o.gain);
  }
}

/* --- modal synthesis --------------------------------------------
   A struck bar or bell is a handful of inharmonic partials, each
   with its own amplitude and its own decay - the high ones die
   first, which is the whole reason a marimba sounds wooden and a
   bell does not. Thirty-two sine oscillators per note is absurd
   live and free here. */
function modal(out, rate, f, parts, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  for(var p = 0; p < parts.length; p++){
    var ratio = parts[p][0], amp = parts[p][1], dec = parts[p][2];
    var fr = f * ratio;
    if(fr > rate * 0.45) continue;                 // no aliasing, ever
    var w = 2 * Math.PI * fr / rate, ph = Math.random() * 6.283, k = 1 / (dec * rate);
    for(var s = 0; s < n; s++) out[s] += Math.sin(ph + w * s) * amp * Math.exp(-s * k);
  }
  // the mallet: a click of filtered noise on top of the tone
  if(o.mallet){
    var mf = new BQ('bp', o.malletF || 2600, 1.2, rate);
    var mn = Math.floor(rate * (o.mallet || 0.008));
    for(var i = 0; i < mn && i < n; i++)
      out[i] += mf.p(Math.random() * 2 - 1) * (o.malletV || 0.3) * (1 - i / mn);
  }
}

// A drum is a pitch envelope on a sine plus a transient.
function drumTone(out, rate, f1, f0, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var ph = 0, pk = 1 / ((o.pitchDec || 0.05) * rate), ak = 1 / ((o.dec || dur * 0.5) * rate);
  var bend = o.bend === undefined ? 1 : o.bend;
  for(var s = 0; s < n; s++){
    var f = f0 + (f1 - f0) * Math.exp(-s * pk * bend);
    ph += 2 * Math.PI * f / rate;
    out[s] += Math.sin(ph) * Math.exp(-s * ak) * (o.gain === undefined ? 0.7 : o.gain);
  }
  if(o.click){
    var cf = new BQ('hp', o.clickF || 2200, 0.7, rate);
    var cn = Math.floor(rate * 0.012);
    for(var i = 0; i < cn && i < n; i++)
      out[i] += cf.p(Math.random() * 2 - 1) * o.click * (1 - i / cn);
  }
}

function noiseHit(out, rate, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var f1 = new BQ(o.type || 'bp', o.f || 1800, o.q || 1, rate);
  var f2 = o.f2 ? new BQ(o.type2 || 'hp', o.f2, o.q2 || 0.7, rate) : null;
  var k = 1 / ((o.dec || dur * 0.4) * rate);
  for(var s = 0; s < n; s++){
    var v = f1.p(Math.random() * 2 - 1);
    if(f2) v = f2.p(v);
    out[s] += v * Math.exp(-s * k) * (o.gain === undefined ? 0.5 : o.gain);
  }
}

/* ==================================================================
   PART 2 - THE KILN
   Two stages: make the raw sample (by hand or through a node graph),
   then put it in a room. Baking the reverb into the sample is why
   playback afterwards costs one buffer source and nothing else.
   ================================================================== */

function mkIR(o, secs, decay, predelay){
  var len = Math.floor(o.sampleRate * secs);
  var b = o.createBuffer(2, len, o.sampleRate);
  var pd = Math.floor(o.sampleRate * (predelay || 0.012));
  for(var c = 0; c < 2; c++){
    var d = b.getChannelData(c);
    for(var i = pd; i < len; i++){
      var t = (i - pd) / (len - pd);
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
    // a couple of early reflections stop it sounding like a noise cloud
    d[pd + Math.floor(o.sampleRate * 0.011 * (1 + c * 0.3))] += 0.6;
    d[pd + Math.floor(o.sampleRate * 0.023 * (1 + c * 0.2))] += 0.42;
  }
  return b;
}

// Put a finished buffer in a room, and widen it while we are there.
function inRoom(buf, secs, decay, wet, spread){
  var sr = buf.sampleRate, tail = Math.ceil(sr * secs);
  var o = new OfflineAudioContext(2, buf.length + tail, sr);
  var src = o.createBufferSource(); src.buffer = buf;
  var cv = o.createConvolver(); cv.buffer = mkIR(o, secs, decay);
  var w = o.createGain(); w.gain.value = wet;
  var d = o.createGain(); d.gain.value = 1 - wet * 0.35;
  src.connect(cv); cv.connect(w); w.connect(o.destination);
  if(spread){
    var p = o.createStereoPanner(); p.pan.value = spread;
    src.connect(p); p.connect(d); d.connect(o.destination);
  } else { src.connect(d); d.connect(o.destination); }
  src.start(0);
  return o.startRendering();
}

// A mono Float32Array becomes an AudioBuffer the sampler can play.
function toBuf(data, sr){
  var b = A.createBuffer(1, data.length, sr || RATE);
  b.getChannelData(0).set(data);
  return b;
}
function reverse(buf){
  for(var c = 0; c < buf.numberOfChannels; c++){
    var d = buf.getChannelData(c);
    Array.prototype.reverse.call(d);
  }
  return buf;
}
function normalise(data, target){
  var pk = 0;
  for(var i = 0; i < data.length; i++){ var a = Math.abs(data[i]); if(a > pk) pk = a; }
  if(pk < 1e-6) return data;
  var g = target / pk;
  for(var j = 0; j < data.length; j++) data[j] *= g;
  return data;
}
function normBuf(buf, target){
  var pk = 0, c, i, d, a;
  for(c = 0; c < buf.numberOfChannels; c++){
    d = buf.getChannelData(c);
    for(i = 0; i < d.length; i++){ a = Math.abs(d[i]); if(a > pk) pk = a; }
  }
  if(pk < 1e-6) return buf;
  var g = target / pk;
  for(c = 0; c < buf.numberOfChannels; c++){
    d = buf.getChannelData(c);
    for(i = 0; i < d.length; i++) d[i] *= g;
  }
  return buf;
}
function bytes(buf){ return buf.length * buf.numberOfChannels * 4; }

/* ==================================================================
   PART 3 - THE SAMPLER
   One buffer source, one gain, sometimes one panner. That is the
   whole per-note cost, whatever the note sounds like.
   ================================================================== */
var KIT = {};                       // key -> {zones:[{ref,buf}], spec}

function pick(entry, midi){
  var z = entry.zones, best = z[0], bd = 1e9;
  for(var i = 0; i < z.length; i++){
    var d = Math.abs(z[i].ref - midi);
    if(d < bd){ bd = d; best = z[i]; }
  }
  return best;
}
function play(key, t, midi, vel, opt){
  var e = KIT[key]; if(!e || !A) return;
  opt = opt || {};
  var buf, rate = 1;
  if(e.rr){                                   // round robin: never the same twice
    e.turn = (e.turn + 1) % e.zones.length;
    buf = e.zones[e.turn].buf;
    rate = 0.97 + (e.turn % 3) * 0.022;       // and a nudge of pitch with it
  } else {
    var z = pick(e, midi === undefined ? e.zones[0].ref : midi);
    buf = z.buf;
    if(midi !== undefined) rate = hz(midi) / hz(z.ref);
  }
  var src = A.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate * (opt.rate || 1);
  if(opt.sweep){
    src.playbackRate.setValueAtTime(rate * opt.sweep[0], t);
    src.playbackRate.exponentialRampToValueAtTime(
      Math.max(0.02, rate * opt.sweep[1]), t + opt.sweep[2]);
  }
  var g = A.createGain();
  var v = (vel === undefined ? 1 : vel) * (e.spec.gain || 1);
  g.gain.setValueAtTime(Math.max(0.0002, v), t);
  var node = src;
  if(opt.pan){
    var p = A.createStereoPanner(); p.pan.value = opt.pan;
    src.connect(p); node = p;
  }
  node.connect(g); g.connect(opt.mus ? musBus : fxBus);
  if(opt.mus) MUSSRC.push(src);
  // a held note is gated; a struck one rings out on its own
  var dur = opt.dur;
  var natural = buf.duration / (rate * (opt.rate || 1));
  var end = natural;
  if(dur && e.spec.sustain && dur < natural - 0.05){
    g.gain.setValueAtTime(Math.max(0.0002, v), t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (e.spec.release || 0.18));
    end = dur + (e.spec.release || 0.18) + 0.05;
  }
  src.start(t);
  src.stop(t + Math.min(end + 0.05, natural + 0.05));
  src.onended = function(){
    try { g.disconnect(); } catch(err){}
    if(opt.mus){ var qi = MUSSRC.indexOf(src); if(qi >= 0) MUSSRC.splice(qi, 1); }
  };
}

/* ==================================================================
   PART 4 - THE RACK
   Each entry says how it is made. `make` writes the samples by hand;
   `graph` renders through Web Audio nodes; `hall` puts the finished
   thing in a room and bakes the room into it. `zones` is how many
   pitches get their own render, because one sample stretched across
   two octaves sounds like a cartoon.
   ================================================================== */

// 808-school cymbal: six inharmonic squares, hard high-passed.
function cymbal(out, rate, dur, o){
  o = o || {};
  var R = [1, 1.4728, 1.7745, 2.1067, 2.5417, 3.0], f = o.f || 205;
  var n = Math.min(out.length, Math.floor(dur * rate));
  var bp = new BQ('hp', o.hp || 5200, 0.7, rate);
  var bp2 = new BQ('bp', o.bp || 9000, 0.6, rate);
  var k = 1 / ((o.dec || dur * 0.4) * rate);
  var ph = [0, 0, 0, 0, 0, 0];
  for(var s = 0; s < n; s++){
    var v = 0;
    for(var i = 0; i < 6; i++){
      ph[i] += 2 * Math.PI * f * R[i] / rate;
      v += Math.sin(ph[i]) > 0 ? 1 : -1;
    }
    v = bp2.p(bp.p(v / 6)) + (o.wash || 0.3) * bp.p(Math.random() * 2 - 1);
    var e = Math.exp(-s * k);
    if(o.strike && s < rate * 0.004) e *= s / (rate * 0.004);
    out[s] += v * e * (o.gain === undefined ? 0.4 : o.gain);
  }
}

// A saw built from partials, so it can be band-limited by construction.
function sawAt(o, f, t){
  var s = o.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f;
  return s;
}
function gn(o, v){ var g = o.createGain(); g.gain.value = v; return g; }
function bq(o, type, f, q){
  var b = o.createBiquadFilter(); b.type = type; b.frequency.value = f;
  if(q) b.Q.value = q; return b;
}
function pan(o, v){ var p = o.createStereoPanner(); p.pan.value = v; return p; }
function drive(o, k){
  var w = o.createWaveShaper(), n = 1024, c = new Float32Array(n);
  for(var i = 0; i < n; i++){ var x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  w.curve = c; w.oversample = '4x'; return w;
}

/* Eight string players, each with its own detune, vibrato rate,
   vibrato depth, bow speed and seat on the stage. That last one is
   the difference between a chord and a section. */
function gStrings(o, ref, short){
  var f = hz(ref);
  var lp = bq(o, 'lowpass', 700, 0.9);
  lp.frequency.linearRampToValueAtTime(short ? 3400 : 2700, short ? 0.06 : 0.4);
  var out = gn(o, short ? 0.30 : 0.24);
  lp.connect(out); out.connect(o.destination);
  for(var i = 0; i < 8; i++){
    var seat = (i - 3.5) / 4.2;
    var p = pan(o, seat * 0.8);
    var g = gn(o, 0);
    var jitter = Math.random() * (short ? 0.012 : 0.045);
    var atk = short ? 0.018 + Math.random() * 0.012 : 0.16 + Math.random() * 0.13;
    g.gain.setValueAtTime(0.0001, jitter);
    g.gain.linearRampToValueAtTime(0.14, jitter + atk);
    if(short){
      g.gain.exponentialRampToValueAtTime(0.0001, jitter + atk + 0.34);
    } else {
      g.gain.linearRampToValueAtTime(0.115, jitter + atk + 0.5);
      g.gain.setValueAtTime(0.115, 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, 3.1);
    }
    var os = sawAt(o, f);
    os.detune.value = (Math.random() * 2 - 1) * 15;
    // vibrato, arriving late and at its own speed for each player
    var lfo = o.createOscillator(); lfo.frequency.value = 4.4 + Math.random() * 1.6;
    var la = gn(o, 0);
    la.gain.setValueAtTime(0, 0);
    la.gain.linearRampToValueAtTime(short ? 0 : 5 + Math.random() * 4, 0.55 + Math.random() * 0.3);
    lfo.connect(la); la.connect(os.detune); lfo.start(0);
    os.connect(g); g.connect(p); p.connect(lp); os.start(jitter);
  }
}

/* Twelve singers. The vowel travels from "ah" to "oo" across the note,
   which is three filter sweeps per voice - thirty-six automated
   bandpasses in all, and the single most expensive thing here. */
function gChoir(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.16);
  out.connect(o.destination);
  var AH = [[730, 9], [1090, 11], [2440, 17]], OO = [[330, 7], [790, 9], [2560, 18]];
  for(var i = 0; i < 12; i++){
    var seat = (i - 5.5) / 6.5;
    var p = pan(o, seat * 0.85);
    var g = gn(o, 0);
    var jit = Math.random() * 0.11;
    g.gain.setValueAtTime(0.0001, jit);
    g.gain.linearRampToValueAtTime(0.1, jit + 0.24 + Math.random() * 0.16);
    g.gain.setValueAtTime(0.1, 2.3);
    g.gain.exponentialRampToValueAtTime(0.0001, 3.3);
    var src = gn(o, 1), sum = gn(o, 1);
    var os = sawAt(o, f);
    os.detune.value = (Math.random() * 2 - 1) * 17;
    os.connect(src);
    var lfo = o.createOscillator(); lfo.frequency.value = 4.6 + Math.random() * 1.5;
    var la = gn(o, 0);
    la.gain.setValueAtTime(0, 0);
    la.gain.linearRampToValueAtTime(7 + Math.random() * 5, 0.7 + Math.random() * 0.4);
    lfo.connect(la); la.connect(os.detune); lfo.start(0);
    for(var k = 0; k < 3; k++){
      var b = o.createBiquadFilter(); b.type = 'bandpass';
      b.frequency.setValueAtTime(AH[k][0], 0);
      b.frequency.linearRampToValueAtTime(OO[k][0], 2.6);
      b.Q.value = AH[k][1];
      var fg = gn(o, [1, 0.6, 0.28][k]);
      src.connect(b); b.connect(fg); fg.connect(sum);
    }
    var lp = bq(o, 'lowpass', 4200, 0.7);
    sum.connect(lp); lp.connect(g); g.connect(p); p.connect(out);
    os.start(jit);
  }
}

function gHorn(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.26); out.connect(o.destination);
  var lp = bq(o, 'lowpass', 300, 3.5);
  lp.frequency.linearRampToValueAtTime(f * 7 + 700, 0.12);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 3.2), 0.5);
  var g = gn(o, 0);
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.05);
  g.gain.linearRampToValueAtTime(0.42, 0.4);
  g.gain.setValueAtTime(0.42, 1.5);
  g.gain.exponentialRampToValueAtTime(0.0001, 2.1);
  lp.connect(g); g.connect(out);
  [-8, 0, 7].forEach(function(c, i){
    var os = sawAt(o, f); os.detune.value = c;
    var lfo = o.createOscillator(); lfo.frequency.value = 5.2;
    var la = gn(o, 0);
    la.gain.setValueAtTime(0, 0); la.gain.linearRampToValueAtTime(4, 0.9);
    lfo.connect(la); la.connect(os.detune); lfo.start(0);
    os.connect(lp); os.start(i * 0.006);
  });
}

function gBrass(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.3); out.connect(o.destination);
  var lp = bq(o, 'lowpass', 400, 6);
  lp.frequency.linearRampToValueAtTime(f * 10 + 1200, 0.07);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 3), 0.4);
  var g = gn(o, 0);
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.55, 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, 0.85);
  lp.connect(g); g.connect(out);
  [[-10, 1], [0, 1], [9, 1], [1200, 0.35]].forEach(function(c, i){
    var os = sawAt(o, i === 3 ? f * 2 : f); os.detune.value = i === 3 ? 0 : c[0];
    var vg = gn(o, c[1]);
    os.connect(vg); vg.connect(lp); os.start(i * 0.004);
  });
}

function gGuitar(o, ref, mode){
  var f = hz(ref);
  var out = gn(o, mode === 'lead' ? 0.24 : 0.2); out.connect(o.destination);
  var pre = gn(o, mode === 'mute' ? 2.2 : 3.6);
  var ws = drive(o, mode === 'lead' ? 34 : 24);
  var hp = bq(o, 'highpass', mode === 'mute' ? 160 : 105, 0.8);
  var pk = bq(o, 'peaking', 880, 1.2); pk.gain.value = 5;
  var cab = bq(o, 'lowpass', mode === 'mute' ? 2600 : 3500, 1.2);
  var g = gn(o, 0);
  var len = mode === 'mute' ? 0.28 : mode === 'lead' ? 2.0 : 1.4;
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.004);
  if(mode === 'mute'){
    g.gain.exponentialRampToValueAtTime(0.0001, 0.26);
  } else {
    g.gain.linearRampToValueAtTime(0.34, 0.25);
    g.gain.setValueAtTime(0.34, len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, len);
  }
  pre.connect(ws); ws.connect(hp); hp.connect(pk); pk.connect(cab);
  cab.connect(g); g.connect(out);
  // a power chord is root, fifth, octave - a third through this much
  // distortion turns to mud, which is why metal does not use one
  var ints = mode === 'lead' ? [0] : [0, 7, 12];
  ints.forEach(function(iv, k){
    var os = o.createOscillator();
    os.type = k === 2 ? 'square' : 'sawtooth';
    os.frequency.value = hz(ref + iv);
    os.detune.value = (k - 1) * 6;
    os.connect(pre); os.start(k * 0.002);
  });
}

function gPad(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.17); out.connect(o.destination);
  var lp = bq(o, 'lowpass', 320, 2.2);
  lp.frequency.linearRampToValueAtTime(2600, 2.4);
  lp.frequency.linearRampToValueAtTime(1100, 4.0);
  var g = gn(o, 0);
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.9);
  g.gain.setValueAtTime(0.5, 2.8);
  g.gain.exponentialRampToValueAtTime(0.0001, 4.0);
  lp.connect(g); g.connect(out);
  [[0, -14], [0, -5], [0, 6], [0, 15], [-12, 0], [12, 3]].forEach(function(c, i){
    var os = sawAt(o, hz(ref + c[0]));
    os.type = i === 4 ? 'sine' : 'sawtooth';
    os.detune.value = c[1];
    // slow drift, so it never sits still
    var lfo = o.createOscillator(); lfo.frequency.value = 0.08 + i * 0.03;
    var la = gn(o, 6 + i);
    lfo.connect(la); la.connect(os.detune); lfo.start(0);
    var p = pan(o, (i - 2.5) / 3.5 * 0.7);
    os.connect(p); p.connect(lp); os.start(0);
  });
}

function gBraam(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.26); out.connect(o.destination);
  var ws = drive(o, 6);
  var lp = bq(o, 'lowpass', 220, 3);
  lp.frequency.linearRampToValueAtTime(1800, 0.5);
  lp.frequency.exponentialRampToValueAtTime(300, 2.4);
  var g = gn(o, 0);
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.55, 0.16);
  g.gain.setValueAtTime(0.5, 1.1);
  g.gain.exponentialRampToValueAtTime(0.0001, 2.6);
  ws.connect(lp); lp.connect(g); g.connect(out);
  [0, 7, 12, 19, 0.5].forEach(function(iv, i){
    var os = sawAt(o, hz(ref + (i === 4 ? 0 : iv)));
    os.detune.value = i === 4 ? -22 : (i - 2) * 9;
    // the pitch creeping upward is the whole reason a braam feels
    // like a threat rather than a chord
    os.frequency.setValueAtTime(hz(ref + (i === 4 ? 0 : iv)) * 0.985, 0);
    os.frequency.linearRampToValueAtTime(hz(ref + (i === 4 ? 0 : iv)), 1.6);
    os.connect(ws); os.start(0);
  });
}

/* Every sample now comes out of the kiln at the same peak, so the mix is
   one table instead of thirty hand-tuned render gains. FULL is the list
   that keeps 44.1 kHz because it has cymbal or high partial content. */
/* ==================================================================
   NEW VOICES FOR THE SOUND-LAB PIECES
   The first page's tracks were written for bare oscillators. Playing
   them on the foundry's instruments is most of the improvement, but
   chiptune, surf and lounge each need something the foundry never
   had to build.
   ================================================================== */

/* A Chamberlin state variable filter. A biquad cannot have its cutoff
   moved per sample without recomputing coefficients, which clicks; this
   one takes the cutoff as an argument, which is exactly what a swept
   whoosh needs. */
function SVF(rate){
  var lp = 0, bp = 0, r = rate;
  this.p = function(x, f, q){
    var F = 2 * Math.sin(Math.PI * Math.min(0.45, f / r));
    var hp = x - lp - (1 / q) * bp;
    bp += F * hp; lp += F * bp;
    return {lp:lp, bp:bp, hp:hp};
  };
}

/* An NES pulse channel: a square with a selectable duty cycle. The duty
   is the entire timbral control the hardware had - 12.5% is the thin
   nasal one, 50% the fat one - and that is why chiptune leads sound the
   way they do. */
function pulseWave(out, rate, f, dur, o){
  o = o || {};
  var duty = o.duty === undefined ? 0.5 : o.duty;
  var n = Math.min(out.length, Math.floor(dur * rate));
  var lp = new BQ('lp', o.cut || 11000, 0.7, rate);
  var ph = 0, vibS = (o.vibDelay === undefined ? 0.16 : o.vibDelay) * rate;
  var dec = o.dec ? 1 / (o.dec * rate) : 0;
  var rel = Math.max(1, Math.floor((o.rel || 0.012) * rate));
  var atk = Math.max(1, Math.floor(0.002 * rate));
  for(var s = 0; s < n; s++){
    var fr = f;
    if(o.vib && s > vibS)
      fr *= 1 + (o.vib / 100) * Math.sin(2 * Math.PI * (o.vibHz || 6.2) * (s - vibS) / rate);
    ph += fr / rate; if(ph >= 1) ph -= 1;
    var e = dec ? Math.exp(-s * dec) : 1;
    if(s < atk) e *= s / atk;
    if(s > n - rel) e *= (n - s) / rel;
    out[s] += lp.p(ph < duty ? 1 : -1) * e * (o.gain === undefined ? 0.4 : o.gain);
  }
}

/* The NES triangle channel is quantised to sixteen steps, and that
   staircase is audible - it is why chip bass has a buzz in it that a
   clean triangle does not. */
function chipTri(out, rate, f, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var ph = 0, rel = Math.max(1, Math.floor((o.rel || 0.02) * rate));
  for(var s = 0; s < n; s++){
    ph += f / rate; if(ph >= 1) ph -= 1;
    var t = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    var e = 1;
    if(s > n - rel) e = (n - s) / rel;
    out[s] += (Math.round(t * 7.5) / 7.5) * e * (o.gain === undefined ? 0.35 : o.gain);
  }
}

/* The NES noise channel is a 15-bit linear feedback shift register, and
   its short mode taps bit 6 instead of bit 1, which turns hiss into a
   metallic buzz. This is the sort of thing you can only have if you are
   writing the samples yourself. */
function lfsrNoise(out, rate, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var reg = 1, period = rate / (o.f || 1800), acc = 0, cur = 1;
  var k = 1 / ((o.dec || dur * 0.4) * rate);
  var f = new BQ(o.type || 'hp', o.cut || 400, 0.7, rate);
  for(var s = 0; s < n; s++){
    acc += 1;
    if(acc >= period){
      acc -= period;
      var bit = (reg ^ (reg >> (o.metal ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
      cur = (reg & 1) ? 1 : -1;
    }
    out[s] += f.p(cur) * Math.exp(-s * k) * (o.gain === undefined ? 0.4 : o.gain);
  }
}

// A combo organ: drawbars, and a slow wobble so it is not dead still.
function organTone(out, rate, f, dur, o){
  o = o || {};
  var bars = o.bars || [[1,1],[2,0.55],[3,0.3],[4,0.22],[6,0.12],[8,0.1]];
  var n = Math.min(out.length, Math.floor(dur * rate));
  var atk = Math.max(1, Math.floor((o.a || 0.012) * rate));
  var rel = Math.max(1, Math.floor((o.r || 0.05) * rate));
  for(var b = 0; b < bars.length; b++){
    var fr = f * bars[b][0];
    if(fr > rate * 0.45) continue;
    var ph = Math.random() * 6.283, amp = bars[b][1];
    for(var s = 0; s < n; s++){
      ph += 2 * Math.PI * fr * (1 + 0.004 * Math.sin(2 * Math.PI * 6.1 * s / rate + b)) / rate;
      var e = 1;
      if(s < atk) e = s / atk;
      if(s > n - rel) e = Math.min(e, (n - s) / rel);
      out[s] += Math.sin(ph) * amp * e * (o.gain === undefined ? 0.16 : o.gain);
    }
  }
}

// A vibraphone is a marimba made of metal with a fan under it.
function vibesTone(out, rate, f, dur){
  modal(out, rate, f, [[1,1,2.4],[4,0.28,1.2],[9.2,0.11,0.5],[2,0.05,1.5],[16.1,0.04,0.2]],
    dur, {mallet:0.006, malletF:2000, malletV:0.12});
  var n = Math.min(out.length, Math.floor(dur * rate));
  for(var s = 0; s < n; s++) out[s] *= 0.72 + 0.28 * Math.sin(2 * Math.PI * 4.8 * s / rate);
}

// Brushes: noise with a swirl in it rather than a hit.
function brushSwish(out, rate, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var bp = new BQ('bp', o.f || 2400, 0.55, rate), hp = new BQ('hp', 800, 0.7, rate);
  var atk = Math.max(1, Math.floor((o.a || 0.02) * rate));
  var k = 1 / ((o.dec || dur * 0.35) * rate);
  for(var s = 0; s < n; s++){
    var e = Math.exp(-s * k);
    if(s < atk) e *= s / atk;
    out[s] += hp.p(bp.p(Math.random() * 2 - 1)) * e * (o.gain === undefined ? 0.4 : o.gain);
  }
}

// Swept noise, for every whoosh, riser and shatter on the page.
function sweepNoise(out, rate, dur, f1, f2, q, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var sv = new SVF(rate), mode = o.mode || 'bp';
  var k = 1 / ((o.dec || dur * 0.45) * rate);
  for(var s = 0; s < n; s++){
    var t = s / n;
    var r = sv.p(Math.random() * 2 - 1, f1 * Math.pow(f2 / f1, t), q);
    var e = o.swell ? Math.sin(Math.PI * t) : Math.exp(-s * k);
    out[s] += (mode === 'bp' ? r.bp : mode === 'hp' ? r.hp : r.lp) *
              e * (o.gain === undefined ? 0.5 : o.gain);
  }
}

// A tone that slides, optionally with a wobble on it. Slide whistles,
// springs and every cartoon noise start here.
function fxGlide(out, rate, f1, f2, dur, o){
  o = o || {};
  var n = Math.min(out.length, Math.floor(dur * rate));
  var ph = 0, k = 1 / ((o.dec || dur * 0.55) * rate);
  var atk = Math.max(1, Math.floor(0.004 * rate)), rel = Math.max(1, Math.floor(0.012 * rate));
  for(var s = 0; s < n; s++){
    var t = s / n;
    var f = f1 * Math.pow(f2 / f1, o.curve ? Math.pow(t, o.curve) : t);
    if(o.wob) f *= 1 + (o.wob / 100) * Math.sin(2 * Math.PI * (o.wobHz || 15) * s / rate);
    ph += 2 * Math.PI * f / rate;
    var v = o.saw ? ((ph / (2 * Math.PI)) % 1) * 2 - 1 : Math.sin(ph);
    var e = Math.exp(-s * k);
    if(s < atk) e *= s / atk;
    if(s > n - rel) e *= Math.max(0, (n - s) / rel);
    out[s] += v * e * (o.gain === undefined ? 0.5 : o.gain);
  }
}

function gSupersaw(o, ref){
  var f = hz(ref);
  var out = gn(o, 0.2); out.connect(o.destination);
  var lp = bq(o, 'lowpass', Math.min(11000, f * 12), 7);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.8), 0.7);
  var g = gn(o, 0);
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.012);
  g.gain.linearRampToValueAtTime(0.34, 0.5);
  g.gain.setValueAtTime(0.34, 1.4);
  g.gain.exponentialRampToValueAtTime(0.0001, 2.2);
  lp.connect(g); g.connect(out);
  [-24, -15, -7, 0, 6, 14, 23].forEach(function(c, i){
    var os = sawAt(o, f); os.detune.value = c;
    var p = pan(o, (i - 3) / 3.4 * 0.6);
    os.connect(p); p.connect(lp); os.start(0);
  });
}

/* Every sample comes out of the kiln at the same peak, so the mix is one
   table. FULL keeps 44.1 kHz for anything with cymbal or high partial
   content; everything else is baked at 32 kHz. */
var MIX = {
  strings:0.55, spicc:0.50, choir:0.62, horn:0.60, brass:0.58, timp:0.70,
  harp:0.44, glock:0.38, musicbox:0.44, marimba:0.44, steelpan:0.48,
  rhodes:0.48, piano:0.50, nylon:0.46, dguitar:0.55, mute:0.50, lead:0.50,
  slap:0.68, upright:0.62, sub:0.72, pad:0.48, rev:0.50, braam:0.70,
  kick:0.82, snare:0.58, hat:0.32, ohat:0.32, crash:0.38, ride:0.28,
  taiko:0.74, shaker:0.28, tamb:0.30, clap:0.50,
  pulse:0.34, pulse2:0.30, chiptri:0.46, chipnz:0.34, organ:0.44, vibes:0.44,
  brush:0.36, supersaw:0.46, surf:0.50,
  whoosh:0.55, thump:0.80, crack:0.60, glass:0.45, boing:0.55, slide:0.45,
  pop:0.50, riser:0.50
};
var FULL = ['glock','musicbox','rhodes','hat','ohat','crash','ride','tamb','rev','shaker',
            'chipnz','whoosh','crack','glass','riser'];

var RACK = [
// ---- orchestra --------------------------------------------------
{key:'strings', label:'String section', fam:'Orchestra', method:'graph - hall',
 how:'Eight players with independent detune, vibrato rate and bow speed, seated across the stereo stage.',
 zones:[40,52,64,76], secs:2.5, hall:[1.7,2.1,0.36], gain:1.5, sustain:true, release:0.35,
 graph:function(o,r){ gStrings(o,r,false); },
 demo:[[0,52],[0,59],[0,64],[0,68]]},

{key:'spicc', label:'Spiccato strings', fam:'Orchestra', method:'graph - hall',
 how:'The same section bowed short, for ostinatos. A slow-attack sample cut short sounds like a mistake.',
 zones:[40,52,64], secs:0.95, hall:[1.4,2.4,0.24], gain:1.5,
 graph:function(o,r){ gStrings(o,r,true); },
 demo:[[0,52],[0.13,59],[0.26,64],[0.39,59],[0.52,52]]},

{key:'choir', label:'Twelve-voice choir', fam:'Orchestra', method:'graph - hall',
 how:'Twelve singers, each with its own entrance and vibrato, and the vowel travelling from "ah" to "oo" across the note.',
 zones:[48,58,68], secs:3.0, hall:[2.4,1.9,0.46], gain:1.8, sustain:true, release:0.6,
 graph:gChoir,
 demo:[[0,50],[0,57],[0,62],[0,65]]},

{key:'horn', label:'French horns', fam:'Orchestra', method:'graph - hall',
 how:'Three saws behind a filter that opens past the note and settles back - the blat that makes a horn a horn.',
 zones:[45,57,69], secs:2.1, hall:[2.2,2.2,0.32], gain:1.4, sustain:true, release:0.3,
 graph:gHorn,
 demo:[[0,55],[0.3,59],[0.6,62],[0.9,67]]},

{key:'brass', label:'Brass stab', fam:'Orchestra', method:'graph - hall',
 how:'Shorter, brighter and with an octave doubling on top. For hits, not for lines.',
 zones:[48,60], secs:0.95, hall:[1.8,2.3,0.3], gain:1.3,
 graph:gBrass,
 demo:[[0,48],[0,55],[0,60]]},

{key:'timp', label:'Timpani', fam:'Orchestra', method:'DSP - hall',
 how:'A pitch envelope on a sine, tuned, with the skin noise on the strike. Two zones cover the drum.',
 zones:[36,43], secs:1.7, hall:[1.8,2.0,0.4], gain:1.1,
 make:function(out,rate,ref){
   drumTone(out, rate, hz(ref)*1.9, hz(ref), 2.0, {pitchDec:0.09, dec:0.75, click:0.16, clickF:900, gain:0.75});
   noiseHit(out, rate, 0.09, {f:420, q:0.9, dec:0.04, gain:0.1});
 },
 demo:[[0,36],[0.4,36],[0.7,43]]},

{key:'harp', label:'Harp', fam:'Orchestra', method:'K-S - hall',
 how:'A plucked-string loop, bright and lightly damped, with a soundboard baked into the body filters.',
 zones:[48,60,72], secs:2.0, hall:[1.6,2.2,0.3], gain:1.2,
 make:function(out,rate,ref){
   pluck(out, rate, hz(ref), 2.4, {excite:5200, damp:0.36, loss:0.9975, gain:0.5,
     body:[[220,2,4],[420,3,3],[1400,2,2]]});
 },
 demo:[[0,60],[0.07,64],[0.14,67],[0.21,72],[0.28,76],[0.35,79]]},

{key:'glock', label:'Glockenspiel', fam:'Orchestra', method:'modal - hall',
 how:'Struck metal is a handful of inharmonic partials with wildly different decay times. Nine of them here.',
 zones:[72,84], secs:2.0, hall:[2.0,2.4,0.3], gain:0.85,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,1.5],[2.76,0.5,0.9],[5.4,0.28,0.5],[8.93,0.14,0.3],
     [13.34,0.07,0.18],[3.9,0.1,0.6],[7.1,0.06,0.35],[10.2,0.04,0.2],[16.1,0.03,0.12]],
     2.0, {mallet:0.005, malletF:5200, malletV:0.22});
 },
 demo:[[0,84],[0.12,88],[0.24,91],[0.36,96]]},

// ---- struck and plucked ------------------------------------------
{key:'musicbox', label:'Music box', fam:'Keys', method:'modal - hall',
 how:'A tuned steel comb: sixteen partials, the top ones gone in a fifth of a second, plus the tick of the cylinder pin.',
 zones:[72,84], secs:2.4, hall:[1.9,2.6,0.3], gain:0.9,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,1.9],[2.01,0.42,1.1],[3.02,0.2,0.7],[4.1,0.13,0.45],
     [5.42,0.09,0.3],[6.8,0.06,0.22],[8.2,0.05,0.16],[9.9,0.035,0.12],
     [11.6,0.025,0.1],[13.4,0.02,0.08],[15.9,0.015,0.06],[18.2,0.012,0.05],
     [21,0.01,0.04],[24,0.008,0.035],[27,0.006,0.03],[31,0.005,0.025]],
     2.4, {mallet:0.004, malletF:4200, malletV:0.16});
 },
 demo:[[0,84],[0.18,88],[0.36,91],[0.54,88],[0.72,84]]},

{key:'marimba', label:'Marimba', fam:'Keys', method:'modal',
 how:'Rosewood: the fourth harmonic is tuned two octaves plus a third above the fundamental, which is the whole wooden sound.',
 zones:[48,60,72], secs:1.3, gain:1.0,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,0.85],[3.98,0.34,0.35],[10.1,0.12,0.14],
     [1.99,0.1,0.4],[6.2,0.06,0.2]], 1.3, {mallet:0.006, malletF:1800, malletV:0.3});
 },
 demo:[[0,60],[0.11,64],[0.22,67],[0.33,72]]},

{key:'steelpan', label:'Steel pan', fam:'Keys', method:'modal - hall',
 how:'A hammered oil drum: octave and twelfth tuned dead on, and a shimmer of high inharmonics that a sine bank gets for free.',
 zones:[60,72], secs:1.7, hall:[1.6,2.4,0.26], gain:0.95,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,1.2],[2,0.6,0.9],[3,0.34,0.6],[4.02,0.2,0.4],
     [5.1,0.12,0.28],[7.3,0.07,0.18],[9.4,0.05,0.12]], 1.7,
     {mallet:0.007, malletF:2200, malletV:0.24});
 },
 demo:[[0,72],[0.14,76],[0.28,79],[0.42,84]]},

{key:'rhodes', label:'Electric piano', fam:'Keys', method:'modal',
 how:'A tine struck by a hammer: fundamental, a couple of harmonics, and one very high partial that dies in a tenth of a second - the "bark".',
 zones:[48,60,72], secs:2.2, gain:1.0,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,1.9],[2,0.3,1.1],[3,0.12,0.6],[4,0.06,0.35],
     [14.2,0.22,0.09],[9.1,0.08,0.14]], 2.2, {mallet:0.005, malletF:3000, malletV:0.18});
 },
 demo:[[0,48],[0,55],[0,60],[0,64]]},

{key:'piano', label:'Upright piano', fam:'Keys', method:'K-S x3 - hall',
 how:'Three strings per note, each detuned a few cents and run as its own delay loop. The beating between them is the piano.',
 zones:[40,52,64,76], secs:2.2, hall:[1.3,2.6,0.2], gain:1.0,
 make:function(out,rate,ref){
   [-3.5, 0, 3.5].forEach(function(c){
     pluck(out, rate, hz(ref) * Math.pow(2, c/1200), 2.6,
       {excite:3400, damp:0.42, loss:0.9985, gain:0.24,
        body:[[130,2,4],[260,3,3],[700,2,2],[2200,1.5,-3]]});
   });
   noiseHit(out, rate, 0.02, {type:'bp', f:2600, q:1.2, dec:0.008, gain:0.1});
 },
 demo:[[0,52],[0,59],[0,64],[0.35,67],[0.7,71]]},

// ---- guitars and basses -------------------------------------------
{key:'nylon', label:'Nylon uke', fam:'Strings', method:'K-S',
 how:'Same string loop, damped harder and given a small box to live in. Four of these at once is a strum.',
 zones:[55,67,79], secs:1.6, gain:1.1,
 make:function(out,rate,ref){
   pluck(out, rate, hz(ref), 1.6, {excite:3000, damp:0.55, loss:0.994, gain:0.5,
     body:[[280,3,6],[520,4,4],[1100,2,2]]});
 },
 demo:[[0,60],[0.02,64],[0.04,67],[0.06,72]]},

{key:'dguitar', label:'Power chord', fam:'Guitar', method:'graph',
 how:'Root, fifth and octave through a hard waveshaper and a speaker cabinet. The whole chord is one sample, so playing it costs one node.',
 zones:[40,45,52], secs:1.5, gain:1.1,
 graph:function(o,r){ gGuitar(o,r,'chord'); },
 demo:[[0,40],[0.3,45],[0.6,40],[0.75,47]]},

{key:'mute', label:'Palm mute', fam:'Guitar', method:'graph',
 how:'The same rig with the heel of the hand on the strings. A separate sample, because a gated chord is not a mute.',
 zones:[40,47], secs:0.32, gain:1.15,
 graph:function(o,r){ gGuitar(o,r,'mute'); },
 demo:[[0,40],[0.11,40],[0.22,40],[0.33,40],[0.44,43]]},

{key:'lead', label:'Lead guitar', fam:'Guitar', method:'graph',
 how:'One string, more gain, and enough sustain to hold a bent note over a bar.',
 zones:[55,67], secs:2.0, gain:1.0, sustain:true, release:0.14,
 graph:function(o,r){ gGuitar(o,r,'lead'); },
 demo:[[0,67],[0.16,70],[0.32,74],[0.5,72]]},

{key:'slap', label:'Slap bass', fam:'Bass', method:'K-S',
 how:'A string loop hit hard: bright excitation, fast damping, and a thumb click on the front.',
 zones:[33,45], secs:0.95, gain:1.3,
 make:function(out,rate,ref){
   pluck(out, rate, hz(ref), 0.95, {excite:5000, exciteLow:90, damp:0.3, loss:0.9955, gain:0.55,
     body:[[90,2,5],[700,3,4],[2400,2,3]]});
   noiseHit(out, rate, 0.02, {type:'bp', f:3000, q:1.1, dec:0.007, gain:0.16});
 },
 demo:[[0,33],[0.16,45],[0.3,33],[0.44,40]]},

{key:'upright', label:'Upright bass', fam:'Bass', method:'K-S',
 how:'Dark excitation, heavy damping, big body resonances. It walks.',
 zones:[33,45], secs:1.5, gain:1.25,
 make:function(out,rate,ref){
   pluck(out, rate, hz(ref), 1.5, {excite:1500, exciteLow:60, damp:0.62, loss:0.997, gain:0.55,
     body:[[70,3,7],[160,3,4],[380,2,2]]});
 },
 demo:[[0,33],[0.28,37],[0.56,40],[0.84,45]]},

{key:'sub', label:'Sub bass', fam:'Bass', method:'DSP',
 how:'A sine with a little of its own second harmonic, so it survives a phone speaker that cannot reproduce the fundamental at all.',
 zones:[24,36], secs:1.2, gain:1.2, sustain:true, release:0.08,
 make:function(out,rate,ref){
   modal(out, rate, hz(ref), [[1,1,2.5],[2,0.16,1.2],[3,0.05,0.6]], 1.2, {});
   for(var i = 0; i < Math.min(out.length, Math.floor(rate*0.01)); i++)
     out[i] *= i / (rate * 0.01);
 },
 demo:[[0,24],[0.3,31],[0.6,24]]},

// ---- textures ------------------------------------------------------
{key:'pad', label:'Evolving pad', fam:'Texture', method:'graph - hall',
 how:'Six voices drifting against each other on six different slow LFOs, under a filter that opens and closes across four seconds. It never repeats because it is four seconds long.',
 zones:[48,60], secs:3.4, hall:[2.2,1.8,0.4], gain:1.4, sustain:true, release:0.9,
 graph:gPad,
 demo:[[0,48],[0,55],[0,60]]},

{key:'rev', label:'Reverse swell', fam:'Texture', method:'DSP - reversed - hall',
 how:'A cymbal, written forwards and then turned around in the buffer. There is no way to do this live at any price - you need the finished sample to reverse.',
 zones:[60], secs:2.2, reverse:true, hall:[1.6,2.0,0.34], gain:1.0,
 make:function(out,rate){ cymbal(out, rate, 2.6, {f:300, dec:0.8, wash:0.5, gain:0.34, strike:true}); },
 demo:[[0,60]]},

{key:'braam', label:'Braam', fam:'Texture', method:'graph - hall',
 how:'The trailer noise: a low brass cluster whose pitch creeps upward about a quarter-tone across two seconds, which is what makes it feel like a threat rather than a chord.',
 zones:[33], secs:2.4, hall:[2.2,1.8,0.4], gain:1.1,
 graph:gBraam,
 demo:[[0,33]]},

// ---- kit ------------------------------------------------------------
{key:'kick', label:'Kick', fam:'Kit', method:'DSP - 3 round robins',
 how:'Three separate renders, played in rotation with a nudge of pitch, so a fast pattern never machine-guns.',
 rr:3, secs:0.5, gain:1.1,
 make:function(out,rate,ref,i){
   drumTone(out, rate, 190 + i*8, 44 + i, 0.5, {pitchDec:0.038, dec:0.12, click:0.2 + i*0.03, gain:0.85});
 },
 demo:[[0],[0.2],[0.4],[0.5]]},

{key:'snare', label:'Snare', fam:'Kit', method:'DSP - 3 round robins',
 how:'Two body tones under a band of noise, three ways. The rotation is the difference between a drummer and a drum machine.',
 rr:3, secs:0.55, gain:0.85, hall:[0.9,3.0,0.16],
 make:function(out,rate,ref,i){
   drumTone(out, rate, 240 + i*14, 175, 0.16, {pitchDec:0.02, dec:0.07, gain:0.28});
   noiseHit(out, rate, 0.5, {type:'bp', f:1750 + i*180, q:0.7, dec:0.1 + i*0.012, gain:0.42});
 },
 demo:[[0],[0.18],[0.36],[0.45],[0.54]]},

{key:'hat', label:'Hi-hat', fam:'Kit', method:'modal - 3 round robins',
 how:'Six inharmonic squares through a high-pass, closed tight. Three renders again.',
 rr:3, secs:0.3, gain:0.6,
 make:function(out,rate,ref,i){ cymbal(out, rate, 0.3, {f:200+i*12, dec:0.028+i*0.004, wash:0.25, gain:0.3}); },
 demo:[[0],[0.1],[0.2],[0.3],[0.4]]},

{key:'ohat', label:'Open hat', fam:'Kit', method:'modal',
 how:'The same six partials left to ring for a fifth of a second.',
 zones:[60], secs:0.5, gain:0.55,
 make:function(out,rate){ cymbal(out, rate, 0.5, {f:206, dec:0.14, wash:0.3, gain:0.3}); },
 demo:[[0,60],[0.25,60]]},

{key:'crash', label:'Crash', fam:'Kit', method:'modal - hall',
 how:'Long decay, a wash of noise over the partials, and the room baked in behind it.',
 zones:[60], secs:2.0, hall:[1.8,1.9,0.3], gain:0.75,
 make:function(out,rate){ cymbal(out, rate, 2.4, {f:210, dec:0.62, wash:0.42, gain:0.3, strike:true}); },
 demo:[[0,60]]},

{key:'ride', label:'Ride', fam:'Kit', method:'modal - hall',
 how:'Tighter and pitched higher, with the bell picked out by a narrow band.',
 zones:[60], secs:1.4, hall:[1.6,2.4,0.2], gain:0.55,
 make:function(out,rate){ cymbal(out, rate, 1.4, {f:340, hp:6500, bp:11000, dec:0.3, wash:0.16, gain:0.28}); },
 demo:[[0,60],[0.22,60],[0.44,60]]},

{key:'taiko', label:'Taiko', fam:'Kit', method:'DSP - 3 RR - hall',
 how:'A big skin: low pitch envelope, a lot of room, three renders so a run of them breathes.',
 rr:3, secs:1.1, hall:[1.6,1.9,0.34], gain:1.15,
 make:function(out,rate,ref,i){
   drumTone(out, rate, 118 + i*7, 55 + i*2, 1.3, {pitchDec:0.07, dec:0.34, gain:0.8});
   noiseHit(out, rate, 0.07, {type:'bp', f:600 + i*90, q:1.1, dec:0.03, gain:0.16});
 },
 demo:[[0],[0.3],[0.5],[0.7]]},

{key:'shaker', label:'Shaker', fam:'Kit', method:'DSP - 2 RR',
 how:'Band-passed noise with a fast attack and a faster decay. Two of them, alternating.',
 rr:2, secs:0.22, gain:0.5,
 make:function(out,rate,ref,i){ noiseHit(out, rate, 0.22, {type:'hp', f:5400+i*700, q:0.7, dec:0.028+i*0.006, gain:0.34}); },
 demo:[[0],[0.12],[0.24],[0.36]]},

{key:'tamb', label:'Tambourine', fam:'Kit', method:'modal - 2 RR',
 how:'Jingles are metal, so they get the same inharmonic treatment as the cymbals, cut very short.',
 rr:2, secs:0.4, gain:0.5,
 make:function(out,rate,ref,i){ cymbal(out, rate, 0.4, {f:420+i*30, hp:6000, bp:10500, dec:0.075, wash:0.2, gain:0.28}); },
 demo:[[0],[0.16],[0.32]]},

{key:'clap', label:'Clap', fam:'Kit', method:'DSP - 2 RR - hall',
 how:'Four noise bursts a few milliseconds apart, because one pair of hands never lands as one sound.',
 rr:2, secs:0.5, hall:[1.1,2.6,0.22], gain:0.7,
 make:function(out,rate,ref,i){
   for(var k = 0; k < 3; k++)
     noiseHit(out.subarray(Math.floor(rate*(0.006*k + i*0.001))), rate, 0.03,
       {type:'bp', f:1500, q:1.3, dec:0.008, gain:0.4});
   noiseHit(out.subarray(Math.floor(rate*0.021)), rate, 0.3, {type:'bp', f:1300, q:1.0, dec:0.06, gain:0.34});
 },
 demo:[[0],[0.3]]}
];

/* ==================================================================
   PART 5 - FIRING THE KILN
   ================================================================== */
var BAKED = false, STATS = {ms:0, count:0, bytes:0, audio:0, peaks:{}};

async function bakeOne(spec, ref, rrIndex){
  /* Anything without metal in it is baked at 32 kHz. That is a third off
     the memory for a band edge at 16 kHz, which nobody hears out of a
     phone - but a cymbal lives up there, so the kit keeps full rate. */
  var sr = spec.rate || RATE, raw;
  if(spec.make){
    var arr = new Float32Array(Math.ceil(spec.secs * sr));
    spec.make(arr, sr, ref, rrIndex || 0);
    raw = toBuf(arr, sr);
  } else {
    var o = new OfflineAudioContext(2, Math.ceil(spec.secs * sr), sr);
    spec.graph(o, ref);
    raw = await o.startRendering();
  }
  if(spec.reverse) reverse(raw);
  if(spec.hall) raw = await inRoom(raw, spec.hall[0], spec.hall[1], spec.hall[2], spec.hall[3] || 0);
  return normBuf(raw, spec.peak || 0.88);
}

function peakOf(buf){
  var pk = 0;
  for(var c = 0; c < buf.numberOfChannels; c++){
    var d = buf.getChannelData(c);
    for(var i = 0; i < d.length; i += 3){ var a = Math.abs(d[i]); if(a > pk) pk = a; }
  }
  return pk;
}

async function fire(onEach){
  if(!actx()) return;
  if(A.state === 'suspended') await A.resume();
  var t0 = performance.now();
  STATS = {ms:0, count:0, bytes:0, audio:0, peaks:{}};
  for(var i = 0; i < RACK.length; i++){
    var spec = RACK[i], one = performance.now();
    var zones = [];
    if(spec.rr){
      for(var r = 0; r < spec.rr; r++)
        zones.push({ref:60, buf:await bakeOne(spec, 60, r)});
    } else {
      for(var z = 0; z < spec.zones.length; z++)
        zones.push({ref:spec.zones[z], buf:await bakeOne(spec, spec.zones[z])});
    }
    KIT[spec.key] = {zones:zones, spec:spec, rr:!!spec.rr, turn:-1};
    var by = 0, sec = 0, pk = 0;
    zones.forEach(function(z){
      by += bytes(z.buf); sec += z.buf.duration;
      var p = peakOf(z.buf); if(p > pk) pk = p;
    });
    STATS.count += zones.length; STATS.bytes += by; STATS.audio += sec;
    STATS.peaks[spec.key] = pk;
    if(onEach) onEach(spec, zones, performance.now() - one, by, sec);
    await new Promise(function(res){ setTimeout(res, 0); });   // let the page breathe
  }
  STATS.ms = performance.now() - t0;
  BAKED = true;
  return STATS;
}

/* ==================================================================
   PART 6 - NOTATION AND ARRANGEMENT
   One token per grid slot, `_` holds, `.` rests, `a:c:e` is a chord.
   `res` is how many sixteenths a token is worth. Patterns are written
   one bar per array entry, which is the only way sixteen bars of this
   stays countable. Drums get their own parts now - a single string
   cannot say kick and hat on the same step, and a real kit does that
   constantly.
   ================================================================== */
var SN = {c:0, d:2, e:4, f:5, g:7, a:9, b:11};
function nn(s){
  var m = /^([a-g])(#|b)?(-?\d+)$/.exec(s);
  if(!m) throw new Error('bad note: ' + s);
  return 12 * (parseInt(m[3], 10) + 1) + SN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function joinPat(p){ return Array.isArray(p) ? p.join(' | ') : p; }
function compile(pat, res){
  var toks = joinPat(pat).replace(/\|/g, ' ').trim().split(/\s+/);
  var map = {}, last = null;
  toks.forEach(function(tk, i){
    var step = i * res;
    if(tk === '_'){ if(last) last.len += res; return; }
    if(tk === '.'){ last = null; return; }
    var vel = 1;
    if(tk.slice(-1) === '!'){ vel = 1.3; tk = tk.slice(0, -1); }
    else if(tk.slice(-1) === '?'){ vel = 0.6; tk = tk.slice(0, -1); }
    last = {notes:tk.split(':').map(nn), len:res, vel:vel};
    map[step] = last;
  });
  return {map:map, steps:toks.length * res};
}
function compileDrum(pat, res){
  var ch = joinPat(pat).replace(/[|\s]/g, '').split(''), map = {};
  ch.forEach(function(c, i){
    if(c === '.') return;
    map[i * res] = c === 'X' ? 1.32 : c === 'o' ? 0.55 : 1;
  });
  return {map:map, steps:ch.length * res};
}
function P(inst, res, pat, o){ o = o || {}; o.inst = inst; o.res = res; o.pat = pat; return o; }
function DR(drum, res, pat, o){ o = o || {}; o.drum = drum; o.res = res; o.pat = pat; return o; }
function rep(s, n){ var a = []; for(var i = 0; i < n; i++) a.push(s); return a; }

/* ==================================================================
   PART 7 - THE SOUNDTRACKS
   ================================================================== */
var R4 = '. . . .', R8 = '. . . . . . . .', R2 = '. .', R1 = '.';
var R16 = '. . . . . . . . . . . . . . . .', R3 = '. . .', R6 = '. . . . . .';
var D4 = '....', D8 = '........', D16 = '................', D3 = '...', D6 = '......';
var D12 = '............';

/* --- 1. The Family Overture ------------------------------------- */
var oInt = 'g3 . d4 . g3 . d4 .',
    oG  = 'g3 b3 d4 b3 g3 b3 d4 b3', oEm = 'e3 g3 b3 g3 e3 g3 b3 g3',
    oC  = 'c3 e3 g3 e3 c3 e3 g3 e3', oD  = 'd3 f#3 a3 f#3 d3 f#3 a3 f#3',
    oBb = 'bb2 d3 f3 d3 bb2 d3 f3 d3', oF = 'f3 a3 c4 a3 f3 a3 c4 a3',
    oCm = 'c3 eb3 g3 eb3 c3 eb3 g3 eb3', oD7 = 'd3 f#3 c4 f#3 d3 f#3 c4 f#3';

/* --- 5. The Wind-Up Waltz: three beats to the bar, so a bar is
       twelve sixteenths and every res divides differently. --------- */

/* --- 7. Grandma's Disco: sixteenths, and the space between them is
       the whole genre. Sixteen tokens to the bar. ------------------ */
var sA = 'a1 . . a1 . . a1 . e2 . . a1 . . g1 .',
    sB = 'a1 . a1 . . a1 . . e2 . e2 . . a1 . .',
    sD = 'd2 . . d2 . . d2 . a1 . . d2 . . c2 .',
    sF = 'f1 . . f1 . . f1 . c2 . . f1 . . a1 .',
    sG = 'g1 . . g1 . . g1 . d2 . . g1 . . b1 .',
    sOut = 'a1 . . a1 . . a1 . . . . . . . . .';


var TRACKS = [
{
  key:'overture', label:'The Family Overture', genre:'Orchestral',
  meta:'G major -> Bb -> G - 104 bpm - 8 parts', bpm:104, beats:4,
  form:[['Intro',2],['A',4],['A2',4],['Lift',4],['Coda',2]],
  liner:'Sixteen bars with an actual shape: the horns state it, the glockenspiel decorates the repeat, then the whole thing lifts a minor third into Bb for four bars before coming home. The chromatic lift is the cheapest trick in film music and it works every time.',
  parts:[
    P('spicc', 2, [oInt,oInt, oG,oEm,oC,oD, oG,oEm,oC,oD, oBb,oF,oCm,oD7, oG,oG], {vel:0.5, gate:0.9}),
    P('strings', 8, ['g3:d4 _','g3:d4 _', 'g3:b3:d4 _','e3:g3:b3 _','c3:e3:g3 _','d3:f#3:a3 _',
      'g3:b3:d4 _','e3:g3:b3 _','c3:e3:g3 _','d3:f#3:a3 _',
      'bb3:d4:f4 _','f3:a3:c4 _','c4:eb4:g4 _','d3:f#3:c4 _', 'g3:b3:d4 _','g3:b3:d4 _'], {vel:0.42, gate:0.98}),
    P('horn', 4, [R4,R4, 'd4 _ g4 a4','b4 _ a4 g4','e4 _ g4 a4','d5 _ _ _',
      'd4 _ g4 a4','b4 _ a4 g4','e4 _ a4 b4','d5 _ c5 b4',
      'd5 _ f5 _','c5 _ a4 _','bb4 _ c5 _','d5 _ _ _', 'g4:b4:d5 _ _ _','g4:b4:d5 _ _ _'], {vel:0.55, gate:0.9}),
    P('upright', 4, ['g2 _ _ _','g2 _ _ _', 'g2 _ d3 _','e2 _ b2 _','c2 _ g2 _','d2 _ a2 _',
      'g2 _ d3 _','e2 _ b2 _','c2 _ g2 _','d2 _ a2 _',
      'bb1 _ f2 _','f2 _ c3 _','c2 _ g2 _','d2 _ a2 _', 'g2 _ d3 _','g2 _ _ _'], {vel:0.7}),
    P('harp', 2, ['g3 b3 d4 g4 b4 d5 g5 .','d4 f#4 a4 d5 f#5 a5 d6 .', R8,R8,R8,R8, R8,R8,R8,R8,
      'bb3 d4 f4 bb4 d5 f5 bb5 .','f3 a3 c4 f4 a4 c5 f5 .','c3 eb3 g3 c4 eb4 g4 c5 .','d3 f#3 a3 d4 f#4 c5 d5 .',
      'g3 b3 d4 g4 b4 d5 g5 .', R8], {vel:0.5, gate:0.5}),
    P('glock', 2, [R8,R8, R8,R8,R8,R8,
      '. . d5 . . . b4 .','. . g4 . . . e5 .','. . e5 . . . c5 .','. . a4 . . b4 d5 .',
      R8,R8,R8,R8, '. . d5 . g5 . b5 .', R8], {vel:0.55, gate:0.8}),
    P('timp', 4, [R4,R4, 'd2 _ _ _',R4,'g1 _ _ _',R4, 'd2 _ _ _',R4,'g1 _ _ _','d2 _ d2 _',
      'bb1 _ _ _','f1 _ _ _','c2 _ _ _','d2 _ d2 d2', 'g1 _ _ _','g1 _ _ g1'], {vel:0.55}),
    DR('crash', 16, ['.','.', 'x','.','.','.', 'x','.','.','.', 'X','.','.','.', 'x','.'], {vel:0.6})
  ]
},

/* --- 2. Hymn for the Fallen Uncle -------------------------------- */
{
  key:'hymn', label:'Hymn for the Fallen Uncle', genre:'Choral',
  meta:'D minor - 60 bpm - 12 bars - 6 parts', bpm:60, beats:4,
  form:[['Drone',2],['Verse',4],['Lift',4],['Amen',2]],
  liner:'Twelve singers, and the vowel moves from "ah" to "oo" over every held note, so the choir breathes instead of buzzing. A reverse cymbal pulls into each section - the one effect on this page that is flatly impossible without a finished buffer to turn round.',
  parts:[
    P('choir', 16, ['d3:a3 ','d3:a3 ', 'd4:f4:a4','bb3:d4:f4','a3:c4:f4','c4:e4:g4',
      'd4:f4:a4','g3:bb3:d4','bb3:d4:f4','a3:c#4:e4', 'd4:f4:a4','d4:f4:a4'], {vel:0.5, gate:0.97}),
    P('choir', 4, [R4,R4, 'a4 _ _ f4','g4 _ _ _','a4 _ c5 _','g4 _ _ _',
      'd5 _ _ c5','bb4 _ _ a4','d5 _ c5 _','e5 _ _ _', 'a4 _ f4 _','d4 _ _ _'], {vel:0.6, gate:0.94}),
    P('choir', 8, ['d2 _','d2 _', 'd2 _','bb1 _','f2 _','c2 _', 'd2 _','g1 _','bb1 _','a1 _',
      'd2 _','d2 _'], {vel:0.55, gate:0.98}),
    P('pad', 16, ['d3','d3', 'd3','bb2','f3','c3', 'd3','g2','bb2','a2', 'd3','d3'], {vel:0.5, gate:0.98}),
    P('timp', 4, [R4,R4, 'd2 _ _ _',R4,R4,R4, 'd2 _ _ _',R4,R4,'a1 _ a1 _', 'd2 _ _ _',R4], {vel:0.5}),
    P('harp', 2, [R8,R8, R8,R8,R8,R8, R8,R8,R8,R8,
      'd3 f3 a3 d4 f4 a4 d5 .','d3 a3 d4 f4 a4 d5 f5 .'], {vel:0.45, gate:0.5}),
    DR('rev', 16, ['.','x', '.','.','.','.', 'x','.','.','.', 'x','.'], {vel:0.8}),
    DR('crash', 16, ['.','.', 'x','.','.','.', 'x','.','.','.', 'X','.'], {vel:0.5})
  ]
},

/* --- 3. Blood on the Linoleum ------------------------------------ */
{
  key:'linoleum', label:'Blood on the Linoleum', genre:'Metal',
  meta:'E minor - 176 bpm - 8 parts', bpm:176, beats:4,
  form:[['Riff',4],['Verse',4],['Chorus',4],['Breakdown',4]],
  liner:'Palm mutes and open power chords are two different samples, because a gated chord does not sound muted, it sounds cut off. Three snare renders in rotation keep the fills from machine-gunning. The breakdown drops to half time and lets the taiko in, which is cheating, and I do not care.',
  parts:[
    P('mute', 2, rep('e2 e2 e2 e2 e2 e2 e2 e2', 2).concat(['e2 e2 e2 e2 e2 e2 g2 g2','e2 e2 e2 e2 d2 d2 d2 d2'],
      rep('e2 e2 e2 e2 e2 e2 e2 e2', 2), ['e2 e2 e2 e2 e2 e2 g2 g2','e2 e2 e2 e2 a2 a2 a2 a2'],
      rep(R8, 4), rep(R8, 4)), {vel:0.62}),
    P('dguitar', 2, rep(R8, 4).concat(rep(R8, 4),
      ['e2 . . e2 . . g2 .','c2 . . c2 . . d2 .','e2 . . e2 . . g2 .','a2 . . a2 . d2 . .'],
      ['e2 _ _ _ _ _ _ _','. . . . e2 _ _ _','c2 _ _ _ _ _ _ _','. . . . d2 _ _ _']), {vel:0.66, gate:0.95}),
    P('lead', 2, rep(R8, 4).concat(rep(R8, 4),
      ['. . . . b4 d5 e5 .','g5 _ e5 d5 b4 _ _ .','. . . . g4 a4 b4 .','d5 _ b4 a4 b4 _ _ _'],
      rep(R8, 4)), {vel:0.5, gate:0.9}),
    P('sub', 2, ['e1 . e1 . e1 . e1 .','e1 . e1 . e1 . e1 .','e1 . e1 . e1 . g1 .','e1 . e1 . d1 . d1 .',
      'e1 . e1 . e1 . e1 .','e1 . e1 . e1 . e1 .','e1 . e1 . e1 . g1 .','e1 . e1 . a1 . a1 .',
      'e1 . e1 . e1 . g1 .','c1 . c1 . c1 . d1 .','e1 . e1 . e1 . g1 .','a1 . a1 . d1 . . .',
      'e1 _ _ _ _ _ _ _','. . . . e1 _ _ _','c1 _ _ _ _ _ _ _','. . . . d1 _ _ _'], {vel:0.7, gate:0.8}),
    DR('kick', 1, rep('x..x..x...x.x...', 4).concat(rep('x..x..x...x.x...', 4),
      rep('X...x...X...x...', 4), rep('X.x.x.x.X.x.x.x.', 4)), {vel:0.9}),
    DR('snare', 1, rep('....x.......x...', 8).concat(
      rep('....x.......x...', 3), ['....x.......xxxx'],
      ['....x...........','....x...........','....x...........','....x.......XXXX']), {vel:0.85}),
    DR('hat', 1, rep('x.x.x.x.x.x.x.x.', 8).concat(rep('x.x.x.x.x.x.x.x.', 4), rep(D16, 4)), {vel:0.55}),
    DR('taiko', 2, rep(D8, 12).concat(['x...x...','x...x...','x...x...','x.x.x.xx']), {vel:0.9}),
    DR('crash', 16, ['x','.','.','.','x','.','.','.','X','.','.','.','X','.','.','.'], {vel:0.55})
  ]
},

/* --- 4. Ukulele Sunrise ------------------------------------------ */
{
  key:'sunrise', label:'Ukulele Sunrise', genre:'Acoustic',
  meta:'C major - 98 bpm - 8 parts', bpm:98, beats:4,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'The Kauai music. Every string here is a real plucked-string model - a noise burst going round a delay loop and losing its top end each lap - so the uke has a body and the marimba is actually wooden. The steel pan carries the tune, because of course it does.',
  parts:[
    P('nylon', 2, ['c4:e4:g4 . c4:e4:g4 . . . g3:c4:e4 .','a3:c4:e4 . a3:c4:e4 . . . e3:a3:c4 .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','a3:c4:e4 . a3:c4:e4 . . e3:a3:c4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','e3:g3:b3 . e3:g3:b3 . . b3:e4:g4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','a3:c4:e4 . a3:c4:e4 . . e3:a3:c4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','c4:e4:g4 . . . . . . .'], {vel:0.5}),
    P('marimba', 2, [R8,R8, 'c4 . e4 . g4 . e4 .','a3 . c4 . e4 . c4 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .','e3 . g3 . b3 . g3 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .','a3 . c4 . e4 . c4 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .',R8], {vel:0.45}),
    P('steelpan', 4, [R4,R4, 'e5 _ g5 _','c5 _ _ e5','a4 _ c5 _','g4 _ _ _',
      'g5 _ e5 _','b4 _ _ d5','c5 _ a4 _','b4 _ d5 _',
      'e5 _ g5 _','c5 _ _ e5','a4 _ c5 _','d5 _ b4 _', 'c5 _ _ _',R4], {vel:0.62, gate:0.9}),
    P('upright', 4, ['c2 _ g2 _','a1 _ e2 _', 'c2 _ g2 _','a1 _ e2 _','f1 _ c2 _','g1 _ d2 _',
      'c2 _ g2 _','e2 _ b1 _','f1 _ c2 _','g1 _ d2 _',
      'c2 _ g2 _','a1 _ e2 _','f1 _ c2 _','g1 _ d2 _', 'c2 _ g2 _','c2 _ _ _'], {vel:0.72}),
    P('harp', 2, ['c4 e4 g4 c5 e5 g5 c6 .', R8, R8,R8,R8,R8, 'f4 a4 c5 f5 a5 c6 f6 .',R8,R8,R8,
      R8,R8,R8,R8, 'c4 e4 g4 c5 e5 g5 c6 .',R8], {vel:0.42, gate:0.5}),
    DR('shaker', 1, rep('x.x.x.x.x.x.x.x.', 16), {vel:0.7}),
    DR('kick', 1, rep('x.......x.......', 2).concat(rep('x.....x.x.......', 12), rep('x.......x.......', 2)), {vel:0.62}),
    DR('snare', 1, rep(D16, 2).concat(rep('....o.......o...', 12), rep('....o.......o...', 2)), {vel:0.5}),
    DR('tamb', 2, rep(D8, 2).concat(rep('....x...', 12), rep('....x...', 2)), {vel:0.6})
  ]
},

/* --- 5. The Wind-Up Waltz (3/4) ---------------------------------- */
{
  key:'waltz', label:'The Wind-Up Waltz', genre:'Music box',
  meta:'A minor -> A major - 3/4 - 138 bpm - 6 parts', bpm:138, beats:3,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'Three beats to the bar, which the sequencer handles by counting twelve sixteenths instead of sixteen. Sixteen partials per note of tuned steel comb, the top ones gone inside a fifth of a second. It ends on a major chord it has no right to, which is the oldest trick in the box and still lands.',
  parts:[
    P('musicbox', 2, ['a5 . c6 . e6 .','b5 . e6 . c6 .',
      'a5 . _ . c6 .','d6 . _ . a5 .','b5 . _ . e6 .','a5 . _ . _ .',
      'f5 . a5 . c6 .','e6 . _ . c6 .','d6 . _ . a5 .','b5 . _ . e6 .',
      'a5 . c6 . e6 .','d6 . f6 . d6 .','b5 . e6 . g#5 .','a5 . _ . e6 .',
      'a5 . c#6 . e6 .','a5 . _ . _ .'], {vel:0.6, gate:0.9}),
    P('glock', 4, [R3, R3,
      '. e5 e5','. f5 f5','. e5 e5','. a4 a4',
      '. a4 a4','. g4 g4','. f5 f5','. e5 e5',
      '. e5 e5','. f5 f5','. e5 e5','. c#5 c#5', '. e5 e5','. . .'], {vel:0.34, gate:0.7}),
    P('harp', 4, ['a2 a3:c4:e4 a3:c4:e4','e2 g#3:b3:e4 g#3:b3:e4',
      'a2 a3:c4:e4 a3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4','a2 a3:c4:e4 a3:c4:e4',
      'f2 a3:c4:f4 a3:c4:f4','c3 g3:c4:e4 g3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4',
      'a2 a3:c4:e4 a3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4','a2 a3:c#4:e4 a3:c#4:e4',
      'a2 a3:c#4:e4 a3:c#4:e4','a2 . .'], {vel:0.44, gate:0.75}),
    P('strings', 12, ['a3','e3', 'a3','d4','e3','a3', 'f3','c4','d4','e3',
      'a3','d4','e3','a3', 'a3:c#4','a3:c#4'], {vel:0.3, gate:0.97}),
    P('upright', 4, ['a1 . .','e1 . .', 'a1 . .','d2 . .','e1 . .','a1 . .',
      'f1 . .','c2 . .','d2 . .','e1 . .', 'a1 . .','d2 . .','e1 . .','a1 . .', 'a1 . .','a1 . .'], {vel:0.6}),
    DR('shaker', 4, rep('.xx', 2).concat(rep('.xx', 12), ['.xx','...']), {vel:0.45}),
    DR('tamb', 12, ['.','.', 'x','.','.','.', 'x','.','.','.', 'x','.','.','.', 'x','.'], {vel:0.4})
  ]
},

/* --- 6. Nightshift ------------------------------------------------ */
{
  key:'nightshift', label:'Nightshift', genre:'Hybrid cinematic',
  meta:'D minor - 88 bpm - 9 parts', bpm:88, beats:4,
  form:[['Ostinato',4],['Build',4],['Drop',4],['Out',4]],
  liner:'A sixteenth ostinato on short-bowed strings under a braam whose pitch creeps up a quarter tone across two seconds. The drop brings in the choir, the guitar and the taiko together. This is the trailer music, and it should probably be what plays over the results screen.',
  parts:[
    P('spicc', 1, rep('d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4', 4).concat(
      ['d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4',
       'bb3 f4 bb4 f4 d4 f4 bb4 f4 bb3 f4 bb4 f4 d4 f4 bb4 f4',
       'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4',
       'c4 g4 c5 g4 e4 g4 c5 g4 c4 g4 c5 g4 e4 g4 c5 g4'],
      ['d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4',
       'bb3 f4 bb4 f4 d4 f4 bb4 f4 bb3 f4 bb4 f4 d4 f4 bb4 f4',
       'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4',
       'c4 g4 c5 g4 e4 g4 c5 g4 c4 g4 c5 g4 e4 g4 c5 g4'],
      rep('d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4', 4)), {vel:0.34, gate:0.55}),
    P('sub', 2, rep('d1 . . . d1 . . .', 4).concat(
      ['d1 . . . d1 . . .','bb0 . . . bb0 . . .','f1 . . . f1 . . .','c1 . . . c1 . . .'],
      ['d1 . d1 . d1 . d1 .','bb0 . bb0 . bb0 . bb0 .','f1 . f1 . f1 . f1 .','c1 . c1 . c1 . c1 .'],
      rep('d1 . . . . . . .', 4)), {vel:0.8, gate:0.7}),
    P('braam', 8, ['d2 _','. .','. .','. .', 'd2 _','. .','. .','. .',
      'd2 _','. .','f2 _','. .', 'd2 _','. .','. .','. .'], {vel:0.7, gate:0.9}),
    P('choir', 4, rep(R4, 4).concat(rep(R4, 4),
      ['d4:f4:a4 _ _ _','bb3:d4:f4 _ _ _','f3:a3:c4 _ _ _','c4:e4:g4 _ _ _'],
      ['d4:f4:a4 _ _ _',R4,R4,R4]), {vel:0.5, gate:0.92}),
    P('dguitar', 2, rep(R8, 4).concat(rep(R8, 4),
      ['d2 . d2 . . d2 . .','bb1 . bb1 . . bb1 . .','f2 . f2 . . f2 . .','c2 . c2 . . c2 . .'],
      rep(R8, 4)), {vel:0.55, gate:0.85}),
    DR('taiko', 2, rep('x.......', 4).concat(['x.......','x.......','x...x...','x.x.x.xx'],
      ['x...x...','x...x...','x...x...','x.xxx.xx'], rep('x.......', 4)), {vel:0.85}),
    DR('kick', 1, rep(D16, 4).concat(rep('x.......x.......', 4),
      rep('x.....x.x.....x.', 4), rep('x...............', 4)), {vel:0.85}),
    DR('snare', 1, rep(D16, 4).concat(rep(D16, 3), ['............xxxx'],
      rep('........X.......', 4), rep(D16, 4)), {vel:0.7}),
    DR('hat', 1, rep(D16, 4).concat(rep('..x...x...x...x.', 4),
      rep('x.x.x.x.x.x.x.x.', 4), rep(D16, 4)), {vel:0.45}),
    DR('rev', 16, ['.','.','.','x', '.','.','.','x', '.','.','.','.', '.','.','.','.'], {vel:0.8}),
    DR('crash', 16, ['.','.','.','.', 'x','.','.','.', 'X','.','.','.', 'x','.','.','.'], {vel:0.6})
  ]
},

/* --- 7. Grandma's Disco ------------------------------------------- */
{
  key:'disco', label:"Grandma's Disco", genre:'Funk',
  meta:'A Dorian - 112 bpm - 8 parts', bpm:112, beats:4,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'Slap bass is the same plucked-string model hit far harder, with a thumb click on the front. The Rhodes is a tine model - one very high partial that dies in a tenth of a second is the whole bark of the instrument. Somebody has to play this while the results screen loads.',
  parts:[
    P('slap', 1, [sA, sB, sA, sB, sA, sD, sF, sG, sA, sB, sA, sB, sD, sA, sA, sOut], {vel:0.72}),
    P('rhodes', 2, ['. a3:c4:e4 . . a3:c4:e4 . . .','. g3:b3:d4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. d4:f#4:a4 . . d4:f#4:a4 . . .',
      '. f3:a3:c4 . . f3:a3:c4 . . .','. g3:b3:d4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. d4:f#4:a4 . . d4:f#4:a4 . . .','. a3:c4:e4 . . a3:c4:e4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . . .','a3:c4:e4 . . . . . . .'], {vel:0.5, gate:0.4}),
    P('brass', 2, [R8,R8, R8,R8,R8,R8,
      'a4:c5:e5 . . . a4:c5:e5 . . .','. . . . g4:b4:d5 . . .',
      'f4:a4:c5 . . . . . . .','g4:b4:d5 . . . g4:b4:d5 . g4:b4:d5 .',
      R8,R8,R8,R8, 'a4:c5:e5 . . . . . . .',R8], {vel:0.5}),
    P('mute', 2, [R8,R8, '. . e3 . . . e3 .','. . e3 . . e3 . .','. . e3 . . . e3 .','. . d3 . . d3 . .',
      '. . c3 . . . c3 .','. . d3 . . d3 . .','. . e3 . . . e3 .','. . e3 . . e3 . .',
      '. . e3 . . . e3 .','. . e3 . . e3 . .','. . d3 . . . d3 .','. . e3 . . e3 . .',
      '. . e3 . . . e3 .',R8], {vel:0.35}),
    DR('kick', 1, rep('x.......x.......', 2).concat(rep('x.......x.......', 12), rep('x.......x...x...', 2)), {vel:0.9}),
    DR('hat', 1, rep('x.xxx.xxx.xxx.xx', 16), {vel:0.5}),
    DR('clap', 4, rep('.x.x', 16), {vel:0.7}),
    DR('tamb', 2, rep('..x...x.', 2).concat(rep('..x...x.', 12), rep('..x...x.', 2)), {vel:0.5}),
    DR('crash', 16, ['.','.','x','.','.','.','x','.','.','.','x','.','.','.','x','.'], {vel:0.45})
  ]
}
];

/* The instruments the sound-lab pieces need on top of the foundry's rack.
   Nothing here is baked unless a track or an effect bank asks for it. */
RACK.push(
{key:'pulse', label:'Pulse lead', fam:'Chip', method:'DSP - 50% duty',
 how:'A square with a fat duty cycle and late vibrato - the NES lead channel.',
 zones:[60,72], secs:1.1, sustain:true, release:0.015,
 make:function(out,rate,ref){ pulseWave(out,rate,hz(ref),1.1,{duty:0.5, vib:1.4, gain:0.4}); }},

{key:'pulse2', label:'Thin pulse', fam:'Chip', method:'DSP - 12.5% duty',
 how:'The nasal one, for arpeggios that fake a chord out of a single channel.',
 zones:[60,72], secs:0.8, sustain:true, release:0.012,
 make:function(out,rate,ref){ pulseWave(out,rate,hz(ref),0.8,{duty:0.125, gain:0.4}); }},

{key:'chiptri', label:'Chip bass', fam:'Chip', method:'DSP - 16-step triangle',
 how:'Quantised to sixteen steps, exactly like the hardware, which is where the buzz comes from.',
 zones:[36,48], secs:1.1, sustain:true, release:0.02,
 make:function(out,rate,ref){ chipTri(out,rate,hz(ref),1.1,{gain:0.4}); }},

{key:'chipnz', label:'Chip noise', fam:'Chip', method:'DSP - LFSR - 2 RR',
 how:'A real 15-bit shift register. One sample covers snare and hat, played back at two different rates.',
 rr:2, secs:0.4,
 make:function(out,rate,ref,i){
   lfsrNoise(out,rate,0.4,{f:i?2400:1500, dec:0.11+i*0.03, metal:!!i, cut:600, gain:0.45}); }},

{key:'organ', label:'Combo organ', fam:'Keys', method:'DSP - drawbars',
 how:'Six sine drawbars with a slow wobble. Surf music runs on this.',
 zones:[48,60,72], secs:2.0, sustain:true, release:0.06,
 make:function(out,rate,ref){ organTone(out,rate,hz(ref),2.0,{}); }},

{key:'vibes', label:'Vibraphone', fam:'Keys', method:'modal - tremolo - hall',
 how:'A marimba made of metal with a fan under it - the tremolo is the fan.',
 zones:[60,72], secs:2.2, hall:[1.6,2.4,0.24],
 make:function(out,rate,ref){ vibesTone(out,rate,hz(ref),2.2); }},

{key:'brush', label:'Brushes', fam:'Kit', method:'DSP - 2 RR',
 how:'Noise with a swirl in it rather than a hit. A jazz kit is mostly this.',
 rr:2, secs:0.5,
 make:function(out,rate,ref,i){ brushSwish(out,rate,0.5,{f:2200+i*500, dec:0.13+i*0.04, a:0.02+i*0.01}); }},

{key:'supersaw', label:'Supersaw', fam:'Texture', method:'graph - hall',
 how:'Seven detuned saws through a filter that snaps shut. The whole of 1985.',
 zones:[48,60,72], secs:2.2, hall:[1.6,2.2,0.26], sustain:true, release:0.2,
 graph:gSupersaw},

{key:'surf', label:'Surf guitar', fam:'Guitar', method:'K-S - spring',
 how:'A bright plucked string drowned in a generated spring reverb, picked tremolo by the sequencer.',
 zones:[52,64,76], secs:1.2, hall:[1.7,2.6,0.52],
 make:function(out,rate,ref){
   pluck(out,rate,hz(ref),1.2,{excite:5600, damp:0.34, loss:0.9955, gain:0.5,
     body:[[240,3,5],[900,3,3],[2600,2,2]]}); }},

// ---- the eight that exist only to be sound effects --------------------
{key:'whoosh', label:'Whoosh', fam:'FX', method:'DSP - swept noise - 2 RR', rr:2, secs:0.34,
 how:'Noise through a state variable filter whose cutoff moves every sample.',
 make:function(out,rate,ref,i){ sweepNoise(out,rate,0.34, i?600:1400, i?2800:400, 1.6, {gain:0.6}); }},
{key:'thump', label:'Body thump', fam:'FX', method:'DSP', zones:[36], secs:0.5,
 how:'The low half of every impact, and the arcade bank borrows it for a kick.',
 make:function(out,rate){ drumTone(out,rate,190,42,0.5,{pitchDec:0.035,dec:0.11,click:0.22,gain:0.85}); }},
{key:'crack', label:'Transient', fam:'FX', method:'DSP - 2 RR', rr:2, secs:0.3,
 how:'The click on the front of a hit. Without it, nothing lands.',
 make:function(out,rate,ref,i){ noiseHit(out,rate,0.3,{type:'hp',f:3800+i*1600,q:0.7,dec:0.02+i*0.006,gain:0.6}); }},
{key:'glass', label:'Shatter', fam:'FX', method:'DSP', zones:[60], secs:0.7,
 how:'Nine short high bursts scattered over a fifth of a second.',
 make:function(out,rate){
   for(var i=0;i<9;i++){
     var off = Math.floor(rate*(0.005+Math.random()*0.16));
     noiseHit(out.subarray(off), rate, 0.12,
       {type:'bp', f:2800+Math.random()*5000, q:5, dec:0.03, gain:0.35});
   }
   fxGlide(out,rate,1400,260,0.34,{gain:0.2}); }},
{key:'boing', label:'Boing', fam:'FX', method:'DSP - glide', zones:[60], secs:0.45,
 how:'A rising slide with a fast wobble on it. A spring, essentially.',
 make:function(out,rate){ fxGlide(out,rate,180,900,0.45,{wob:9, wobHz:19, gain:0.6}); }},
{key:'slide', label:'Slide whistle', fam:'FX', method:'DSP - glide', zones:[60], secs:0.6,
 how:'Up, then down, with a breath of noise. The oldest joke in animation.',
 make:function(out,rate){
   fxGlide(out,rate,700,2100,0.28,{gain:0.5});
   fxGlide(out.subarray(Math.floor(rate*0.28)),rate,2100,420,0.3,{gain:0.5}); }},
{key:'pop', label:'Pop', fam:'FX', method:'DSP - 2 RR', rr:2, secs:0.16,
 how:'A blip of a tone under a click. Pickups, menu taps, bubbles.',
 make:function(out,rate,ref,i){
   fxGlide(out,rate,900+i*300,1800+i*400,0.08,{gain:0.55});
   noiseHit(out,rate,0.05,{type:'hp',f:3000,q:0.8,dec:0.01,gain:0.3}); }},
{key:'riser', label:'Riser', fam:'FX', method:'DSP - swept noise - hall', zones:[60], secs:0.9,
 how:'Noise climbing for most of a second. What a count-in is made of.',
 hall:[1.2,2.4,0.3],
 make:function(out,rate){ sweepNoise(out,rate,0.9,300,7000,1.1,{swell:true, gain:0.5}); }}
);

RACK.forEach(function(sp){
  if(MIX[sp.key] !== undefined) sp.gain = MIX[sp.key];
  if(FULL.indexOf(sp.key) < 0) sp.rate = 32000;
});
var SPEC = {};
RACK.forEach(function(sp){ SPEC[sp.key] = sp; });
/* ==================================================================
   PART 6 - NOTATION AND ARRANGEMENT
   One token per grid slot, `_` holds, `.` rests, `a:c:e` is a chord.
   `res` is how many sixteenths a token is worth. Patterns are written
   one bar per array entry, which is the only way sixteen bars of this
   stays countable. Drums get their own parts now - a single string
   cannot say kick and hat on the same step, and a real kit does that
   constantly.
   ================================================================== */
var SN = {c:0, d:2, e:4, f:5, g:7, a:9, b:11};
function nn(s){
  var m = /^([a-g])(#|b)?(-?\d+)$/.exec(s);
  if(!m) throw new Error('bad note: ' + s);
  return 12 * (parseInt(m[3], 10) + 1) + SN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function joinPat(p){ return Array.isArray(p) ? p.join(' | ') : p; }
function compile(pat, res){
  var toks = joinPat(pat).replace(/\|/g, ' ').trim().split(/\s+/);
  var map = {}, last = null;
  toks.forEach(function(tk, i){
    var step = i * res;
    if(tk === '_'){ if(last) last.len += res; return; }
    if(tk === '.'){ last = null; return; }
    var vel = 1;
    if(tk.slice(-1) === '!'){ vel = 1.3; tk = tk.slice(0, -1); }
    else if(tk.slice(-1) === '?'){ vel = 0.6; tk = tk.slice(0, -1); }
    last = {notes:tk.split(':').map(nn), len:res, vel:vel};
    map[step] = last;
  });
  return {map:map, steps:toks.length * res};
}
function compileDrum(pat, res){
  var ch = joinPat(pat).replace(/[|\s]/g, '').split(''), map = {};
  ch.forEach(function(c, i){
    if(c === '.') return;
    map[i * res] = c === 'X' ? 1.32 : c === 'o' ? 0.55 : 1;
  });
  return {map:map, steps:ch.length * res};
}
function P(inst, res, pat, o){ o = o || {}; o.inst = inst; o.res = res; o.pat = pat; return o; }
function DR(drum, res, pat, o){ o = o || {}; o.drum = drum; o.res = res; o.pat = pat; return o; }
function rep(s, n){ var a = []; for(var i = 0; i < n; i++) a.push(s); return a; }

/* ==================================================================
   PART 7 - THE SOUNDTRACKS
   ================================================================== */
var R4 = '. . . .', R8 = '. . . . . . . .', R2 = '. .', R1 = '.';
var R16 = '. . . . . . . . . . . . . . . .', R3 = '. . .', R6 = '. . . . . .';
var D4 = '....', D8 = '........', D16 = '................', D3 = '...', D6 = '......';
var D12 = '............';

/* --- 1. The Family Overture ------------------------------------- */
var oInt = 'g3 . d4 . g3 . d4 .',
    oG  = 'g3 b3 d4 b3 g3 b3 d4 b3', oEm = 'e3 g3 b3 g3 e3 g3 b3 g3',
    oC  = 'c3 e3 g3 e3 c3 e3 g3 e3', oD  = 'd3 f#3 a3 f#3 d3 f#3 a3 f#3',
    oBb = 'bb2 d3 f3 d3 bb2 d3 f3 d3', oF = 'f3 a3 c4 a3 f3 a3 c4 a3',
    oCm = 'c3 eb3 g3 eb3 c3 eb3 g3 eb3', oD7 = 'd3 f#3 c4 f#3 d3 f#3 c4 f#3';

/* --- 5. The Wind-Up Waltz: three beats to the bar, so a bar is
       twelve sixteenths and every res divides differently. --------- */

/* --- 7. Grandma's Disco: sixteenths, and the space between them is
       the whole genre. Sixteen tokens to the bar. ------------------ */
var sA = 'a1 . . a1 . . a1 . e2 . . a1 . . g1 .',
    sB = 'a1 . a1 . . a1 . . e2 . e2 . . a1 . .',
    sD = 'd2 . . d2 . . d2 . a1 . . d2 . . c2 .',
    sF = 'f1 . . f1 . . f1 . c2 . . f1 . . a1 .',
    sG = 'g1 . . g1 . . g1 . d2 . . g1 . . b1 .',
    sOut = 'a1 . . a1 . . a1 . . . . . . . . .';


var TRACKS = [
{
  key:'overture', label:'The Family Overture', genre:'Orchestral',
  meta:'G major -> Bb -> G - 104 bpm - 8 parts', bpm:104, beats:4,
  form:[['Intro',2],['A',4],['A2',4],['Lift',4],['Coda',2]],
  liner:'Sixteen bars with an actual shape: the horns state it, the glockenspiel decorates the repeat, then the whole thing lifts a minor third into Bb for four bars before coming home. The chromatic lift is the cheapest trick in film music and it works every time.',
  parts:[
    P('spicc', 2, [oInt,oInt, oG,oEm,oC,oD, oG,oEm,oC,oD, oBb,oF,oCm,oD7, oG,oG], {vel:0.5, gate:0.9}),
    P('strings', 8, ['g3:d4 _','g3:d4 _', 'g3:b3:d4 _','e3:g3:b3 _','c3:e3:g3 _','d3:f#3:a3 _',
      'g3:b3:d4 _','e3:g3:b3 _','c3:e3:g3 _','d3:f#3:a3 _',
      'bb3:d4:f4 _','f3:a3:c4 _','c4:eb4:g4 _','d3:f#3:c4 _', 'g3:b3:d4 _','g3:b3:d4 _'], {vel:0.42, gate:0.98}),
    P('horn', 4, [R4,R4, 'd4 _ g4 a4','b4 _ a4 g4','e4 _ g4 a4','d5 _ _ _',
      'd4 _ g4 a4','b4 _ a4 g4','e4 _ a4 b4','d5 _ c5 b4',
      'd5 _ f5 _','c5 _ a4 _','bb4 _ c5 _','d5 _ _ _', 'g4:b4:d5 _ _ _','g4:b4:d5 _ _ _'], {vel:0.55, gate:0.9}),
    P('upright', 4, ['g2 _ _ _','g2 _ _ _', 'g2 _ d3 _','e2 _ b2 _','c2 _ g2 _','d2 _ a2 _',
      'g2 _ d3 _','e2 _ b2 _','c2 _ g2 _','d2 _ a2 _',
      'bb1 _ f2 _','f2 _ c3 _','c2 _ g2 _','d2 _ a2 _', 'g2 _ d3 _','g2 _ _ _'], {vel:0.7}),
    P('harp', 2, ['g3 b3 d4 g4 b4 d5 g5 .','d4 f#4 a4 d5 f#5 a5 d6 .', R8,R8,R8,R8, R8,R8,R8,R8,
      'bb3 d4 f4 bb4 d5 f5 bb5 .','f3 a3 c4 f4 a4 c5 f5 .','c3 eb3 g3 c4 eb4 g4 c5 .','d3 f#3 a3 d4 f#4 c5 d5 .',
      'g3 b3 d4 g4 b4 d5 g5 .', R8], {vel:0.5, gate:0.5}),
    P('glock', 2, [R8,R8, R8,R8,R8,R8,
      '. . d5 . . . b4 .','. . g4 . . . e5 .','. . e5 . . . c5 .','. . a4 . . b4 d5 .',
      R8,R8,R8,R8, '. . d5 . g5 . b5 .', R8], {vel:0.55, gate:0.8}),
    P('timp', 4, [R4,R4, 'd2 _ _ _',R4,'g1 _ _ _',R4, 'd2 _ _ _',R4,'g1 _ _ _','d2 _ d2 _',
      'bb1 _ _ _','f1 _ _ _','c2 _ _ _','d2 _ d2 d2', 'g1 _ _ _','g1 _ _ g1'], {vel:0.55}),
    DR('crash', 16, ['.','.', 'x','.','.','.', 'x','.','.','.', 'X','.','.','.', 'x','.'], {vel:0.6})
  ]
},

/* --- 2. Hymn for the Fallen Uncle -------------------------------- */
{
  key:'hymn', label:'Hymn for the Fallen Uncle', genre:'Choral',
  meta:'D minor - 60 bpm - 12 bars - 6 parts', bpm:60, beats:4,
  form:[['Drone',2],['Verse',4],['Lift',4],['Amen',2]],
  liner:'Twelve singers, and the vowel moves from "ah" to "oo" over every held note, so the choir breathes instead of buzzing. A reverse cymbal pulls into each section - the one effect on this page that is flatly impossible without a finished buffer to turn round.',
  parts:[
    P('choir', 16, ['d3:a3 ','d3:a3 ', 'd4:f4:a4','bb3:d4:f4','a3:c4:f4','c4:e4:g4',
      'd4:f4:a4','g3:bb3:d4','bb3:d4:f4','a3:c#4:e4', 'd4:f4:a4','d4:f4:a4'], {vel:0.5, gate:0.97}),
    P('choir', 4, [R4,R4, 'a4 _ _ f4','g4 _ _ _','a4 _ c5 _','g4 _ _ _',
      'd5 _ _ c5','bb4 _ _ a4','d5 _ c5 _','e5 _ _ _', 'a4 _ f4 _','d4 _ _ _'], {vel:0.6, gate:0.94}),
    P('choir', 8, ['d2 _','d2 _', 'd2 _','bb1 _','f2 _','c2 _', 'd2 _','g1 _','bb1 _','a1 _',
      'd2 _','d2 _'], {vel:0.55, gate:0.98}),
    P('pad', 16, ['d3','d3', 'd3','bb2','f3','c3', 'd3','g2','bb2','a2', 'd3','d3'], {vel:0.5, gate:0.98}),
    P('timp', 4, [R4,R4, 'd2 _ _ _',R4,R4,R4, 'd2 _ _ _',R4,R4,'a1 _ a1 _', 'd2 _ _ _',R4], {vel:0.5}),
    P('harp', 2, [R8,R8, R8,R8,R8,R8, R8,R8,R8,R8,
      'd3 f3 a3 d4 f4 a4 d5 .','d3 a3 d4 f4 a4 d5 f5 .'], {vel:0.45, gate:0.5}),
    DR('rev', 16, ['.','x', '.','.','.','.', 'x','.','.','.', 'x','.'], {vel:0.8}),
    DR('crash', 16, ['.','.', 'x','.','.','.', 'x','.','.','.', 'X','.'], {vel:0.5})
  ]
},

/* --- 3. Blood on the Linoleum ------------------------------------ */
{
  key:'linoleum', label:'Blood on the Linoleum', genre:'Metal',
  meta:'E minor - 176 bpm - 8 parts', bpm:176, beats:4,
  form:[['Riff',4],['Verse',4],['Chorus',4],['Breakdown',4]],
  liner:'Palm mutes and open power chords are two different samples, because a gated chord does not sound muted, it sounds cut off. Three snare renders in rotation keep the fills from machine-gunning. The breakdown drops to half time and lets the taiko in, which is cheating, and I do not care.',
  parts:[
    P('mute', 2, rep('e2 e2 e2 e2 e2 e2 e2 e2', 2).concat(['e2 e2 e2 e2 e2 e2 g2 g2','e2 e2 e2 e2 d2 d2 d2 d2'],
      rep('e2 e2 e2 e2 e2 e2 e2 e2', 2), ['e2 e2 e2 e2 e2 e2 g2 g2','e2 e2 e2 e2 a2 a2 a2 a2'],
      rep(R8, 4), rep(R8, 4)), {vel:0.62}),
    P('dguitar', 2, rep(R8, 4).concat(rep(R8, 4),
      ['e2 . . e2 . . g2 .','c2 . . c2 . . d2 .','e2 . . e2 . . g2 .','a2 . . a2 . d2 . .'],
      ['e2 _ _ _ _ _ _ _','. . . . e2 _ _ _','c2 _ _ _ _ _ _ _','. . . . d2 _ _ _']), {vel:0.66, gate:0.95}),
    P('lead', 2, rep(R8, 4).concat(rep(R8, 4),
      ['. . . . b4 d5 e5 .','g5 _ e5 d5 b4 _ _ .','. . . . g4 a4 b4 .','d5 _ b4 a4 b4 _ _ _'],
      rep(R8, 4)), {vel:0.5, gate:0.9}),
    P('sub', 2, ['e1 . e1 . e1 . e1 .','e1 . e1 . e1 . e1 .','e1 . e1 . e1 . g1 .','e1 . e1 . d1 . d1 .',
      'e1 . e1 . e1 . e1 .','e1 . e1 . e1 . e1 .','e1 . e1 . e1 . g1 .','e1 . e1 . a1 . a1 .',
      'e1 . e1 . e1 . g1 .','c1 . c1 . c1 . d1 .','e1 . e1 . e1 . g1 .','a1 . a1 . d1 . . .',
      'e1 _ _ _ _ _ _ _','. . . . e1 _ _ _','c1 _ _ _ _ _ _ _','. . . . d1 _ _ _'], {vel:0.7, gate:0.8}),
    DR('kick', 1, rep('x..x..x...x.x...', 4).concat(rep('x..x..x...x.x...', 4),
      rep('X...x...X...x...', 4), rep('X.x.x.x.X.x.x.x.', 4)), {vel:0.9}),
    DR('snare', 1, rep('....x.......x...', 8).concat(
      rep('....x.......x...', 3), ['....x.......xxxx'],
      ['....x...........','....x...........','....x...........','....x.......XXXX']), {vel:0.85}),
    DR('hat', 1, rep('x.x.x.x.x.x.x.x.', 8).concat(rep('x.x.x.x.x.x.x.x.', 4), rep(D16, 4)), {vel:0.55}),
    DR('taiko', 2, rep(D8, 12).concat(['x...x...','x...x...','x...x...','x.x.x.xx']), {vel:0.9}),
    DR('crash', 16, ['x','.','.','.','x','.','.','.','X','.','.','.','X','.','.','.'], {vel:0.55})
  ]
},

/* --- 4. Ukulele Sunrise ------------------------------------------ */
{
  key:'sunrise', label:'Ukulele Sunrise', genre:'Acoustic',
  meta:'C major - 98 bpm - 8 parts', bpm:98, beats:4,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'The Kauai music. Every string here is a real plucked-string model - a noise burst going round a delay loop and losing its top end each lap - so the uke has a body and the marimba is actually wooden. The steel pan carries the tune, because of course it does.',
  parts:[
    P('nylon', 2, ['c4:e4:g4 . c4:e4:g4 . . . g3:c4:e4 .','a3:c4:e4 . a3:c4:e4 . . . e3:a3:c4 .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','a3:c4:e4 . a3:c4:e4 . . e3:a3:c4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','e3:g3:b3 . e3:g3:b3 . . b3:e4:g4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','a3:c4:e4 . a3:c4:e4 . . e3:a3:c4 . .',
      'f3:a3:c4 . f3:a3:c4 . . c4:f4:a4 . .','g3:b3:d4 . g3:b3:d4 . . d4:g4:b4 . .',
      'c4:e4:g4 . c4:e4:g4 . . g3:c4:e4 . .','c4:e4:g4 . . . . . . .'], {vel:0.5}),
    P('marimba', 2, [R8,R8, 'c4 . e4 . g4 . e4 .','a3 . c4 . e4 . c4 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .','e3 . g3 . b3 . g3 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .','a3 . c4 . e4 . c4 .','f3 . a3 . c4 . a3 .','g3 . b3 . d4 . b3 .',
      'c4 . e4 . g4 . e4 .',R8], {vel:0.45}),
    P('steelpan', 4, [R4,R4, 'e5 _ g5 _','c5 _ _ e5','a4 _ c5 _','g4 _ _ _',
      'g5 _ e5 _','b4 _ _ d5','c5 _ a4 _','b4 _ d5 _',
      'e5 _ g5 _','c5 _ _ e5','a4 _ c5 _','d5 _ b4 _', 'c5 _ _ _',R4], {vel:0.62, gate:0.9}),
    P('upright', 4, ['c2 _ g2 _','a1 _ e2 _', 'c2 _ g2 _','a1 _ e2 _','f1 _ c2 _','g1 _ d2 _',
      'c2 _ g2 _','e2 _ b1 _','f1 _ c2 _','g1 _ d2 _',
      'c2 _ g2 _','a1 _ e2 _','f1 _ c2 _','g1 _ d2 _', 'c2 _ g2 _','c2 _ _ _'], {vel:0.72}),
    P('harp', 2, ['c4 e4 g4 c5 e5 g5 c6 .', R8, R8,R8,R8,R8, 'f4 a4 c5 f5 a5 c6 f6 .',R8,R8,R8,
      R8,R8,R8,R8, 'c4 e4 g4 c5 e5 g5 c6 .',R8], {vel:0.42, gate:0.5}),
    DR('shaker', 1, rep('x.x.x.x.x.x.x.x.', 16), {vel:0.7}),
    DR('kick', 1, rep('x.......x.......', 2).concat(rep('x.....x.x.......', 12), rep('x.......x.......', 2)), {vel:0.62}),
    DR('snare', 1, rep(D16, 2).concat(rep('....o.......o...', 12), rep('....o.......o...', 2)), {vel:0.5}),
    DR('tamb', 2, rep(D8, 2).concat(rep('....x...', 12), rep('....x...', 2)), {vel:0.6})
  ]
},

/* --- 5. The Wind-Up Waltz (3/4) ---------------------------------- */
{
  key:'waltz', label:'The Wind-Up Waltz', genre:'Music box',
  meta:'A minor -> A major - 3/4 - 138 bpm - 6 parts', bpm:138, beats:3,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'Three beats to the bar, which the sequencer handles by counting twelve sixteenths instead of sixteen. Sixteen partials per note of tuned steel comb, the top ones gone inside a fifth of a second. It ends on a major chord it has no right to, which is the oldest trick in the box and still lands.',
  parts:[
    P('musicbox', 2, ['a5 . c6 . e6 .','b5 . e6 . c6 .',
      'a5 . _ . c6 .','d6 . _ . a5 .','b5 . _ . e6 .','a5 . _ . _ .',
      'f5 . a5 . c6 .','e6 . _ . c6 .','d6 . _ . a5 .','b5 . _ . e6 .',
      'a5 . c6 . e6 .','d6 . f6 . d6 .','b5 . e6 . g#5 .','a5 . _ . e6 .',
      'a5 . c#6 . e6 .','a5 . _ . _ .'], {vel:0.6, gate:0.9}),
    P('glock', 4, [R3, R3,
      '. e5 e5','. f5 f5','. e5 e5','. a4 a4',
      '. a4 a4','. g4 g4','. f5 f5','. e5 e5',
      '. e5 e5','. f5 f5','. e5 e5','. c#5 c#5', '. e5 e5','. . .'], {vel:0.34, gate:0.7}),
    P('harp', 4, ['a2 a3:c4:e4 a3:c4:e4','e2 g#3:b3:e4 g#3:b3:e4',
      'a2 a3:c4:e4 a3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4','a2 a3:c4:e4 a3:c4:e4',
      'f2 a3:c4:f4 a3:c4:f4','c3 g3:c4:e4 g3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4',
      'a2 a3:c4:e4 a3:c4:e4','d3 a3:d4:f4 a3:d4:f4','e2 g#3:b3:e4 g#3:b3:e4','a2 a3:c#4:e4 a3:c#4:e4',
      'a2 a3:c#4:e4 a3:c#4:e4','a2 . .'], {vel:0.44, gate:0.75}),
    P('strings', 12, ['a3','e3', 'a3','d4','e3','a3', 'f3','c4','d4','e3',
      'a3','d4','e3','a3', 'a3:c#4','a3:c#4'], {vel:0.3, gate:0.97}),
    P('upright', 4, ['a1 . .','e1 . .', 'a1 . .','d2 . .','e1 . .','a1 . .',
      'f1 . .','c2 . .','d2 . .','e1 . .', 'a1 . .','d2 . .','e1 . .','a1 . .', 'a1 . .','a1 . .'], {vel:0.6}),
    DR('shaker', 4, rep('.xx', 2).concat(rep('.xx', 12), ['.xx','...']), {vel:0.45}),
    DR('tamb', 12, ['.','.', 'x','.','.','.', 'x','.','.','.', 'x','.','.','.', 'x','.'], {vel:0.4})
  ]
},

/* --- 6. Nightshift ------------------------------------------------ */
{
  key:'nightshift', label:'Nightshift', genre:'Hybrid cinematic',
  meta:'D minor - 88 bpm - 9 parts', bpm:88, beats:4,
  form:[['Ostinato',4],['Build',4],['Drop',4],['Out',4]],
  liner:'A sixteenth ostinato on short-bowed strings under a braam whose pitch creeps up a quarter tone across two seconds. The drop brings in the choir, the guitar and the taiko together. This is the trailer music, and it should probably be what plays over the results screen.',
  parts:[
    P('spicc', 1, rep('d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4', 4).concat(
      ['d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4',
       'bb3 f4 bb4 f4 d4 f4 bb4 f4 bb3 f4 bb4 f4 d4 f4 bb4 f4',
       'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4',
       'c4 g4 c5 g4 e4 g4 c5 g4 c4 g4 c5 g4 e4 g4 c5 g4'],
      ['d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4',
       'bb3 f4 bb4 f4 d4 f4 bb4 f4 bb3 f4 bb4 f4 d4 f4 bb4 f4',
       'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4',
       'c4 g4 c5 g4 e4 g4 c5 g4 c4 g4 c5 g4 e4 g4 c5 g4'],
      rep('d4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4', 4)), {vel:0.34, gate:0.55}),
    P('sub', 2, rep('d1 . . . d1 . . .', 4).concat(
      ['d1 . . . d1 . . .','bb0 . . . bb0 . . .','f1 . . . f1 . . .','c1 . . . c1 . . .'],
      ['d1 . d1 . d1 . d1 .','bb0 . bb0 . bb0 . bb0 .','f1 . f1 . f1 . f1 .','c1 . c1 . c1 . c1 .'],
      rep('d1 . . . . . . .', 4)), {vel:0.8, gate:0.7}),
    P('braam', 8, ['d2 _','. .','. .','. .', 'd2 _','. .','. .','. .',
      'd2 _','. .','f2 _','. .', 'd2 _','. .','. .','. .'], {vel:0.7, gate:0.9}),
    P('choir', 4, rep(R4, 4).concat(rep(R4, 4),
      ['d4:f4:a4 _ _ _','bb3:d4:f4 _ _ _','f3:a3:c4 _ _ _','c4:e4:g4 _ _ _'],
      ['d4:f4:a4 _ _ _',R4,R4,R4]), {vel:0.5, gate:0.92}),
    P('dguitar', 2, rep(R8, 4).concat(rep(R8, 4),
      ['d2 . d2 . . d2 . .','bb1 . bb1 . . bb1 . .','f2 . f2 . . f2 . .','c2 . c2 . . c2 . .'],
      rep(R8, 4)), {vel:0.55, gate:0.85}),
    DR('taiko', 2, rep('x.......', 4).concat(['x.......','x.......','x...x...','x.x.x.xx'],
      ['x...x...','x...x...','x...x...','x.xxx.xx'], rep('x.......', 4)), {vel:0.85}),
    DR('kick', 1, rep(D16, 4).concat(rep('x.......x.......', 4),
      rep('x.....x.x.....x.', 4), rep('x...............', 4)), {vel:0.85}),
    DR('snare', 1, rep(D16, 4).concat(rep(D16, 3), ['............xxxx'],
      rep('........X.......', 4), rep(D16, 4)), {vel:0.7}),
    DR('hat', 1, rep(D16, 4).concat(rep('..x...x...x...x.', 4),
      rep('x.x.x.x.x.x.x.x.', 4), rep(D16, 4)), {vel:0.45}),
    DR('rev', 16, ['.','.','.','x', '.','.','.','x', '.','.','.','.', '.','.','.','.'], {vel:0.8}),
    DR('crash', 16, ['.','.','.','.', 'x','.','.','.', 'X','.','.','.', 'x','.','.','.'], {vel:0.6})
  ]
},

/* --- 7. Grandma's Disco ------------------------------------------- */
{
  key:'disco', label:"Grandma's Disco", genre:'Funk',
  meta:'A Dorian - 112 bpm - 8 parts', bpm:112, beats:4,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'Slap bass is the same plucked-string model hit far harder, with a thumb click on the front. The Rhodes is a tine model - one very high partial that dies in a tenth of a second is the whole bark of the instrument. Somebody has to play this while the results screen loads.',
  parts:[
    P('slap', 1, [sA, sB, sA, sB, sA, sD, sF, sG, sA, sB, sA, sB, sD, sA, sA, sOut], {vel:0.72}),
    P('rhodes', 2, ['. a3:c4:e4 . . a3:c4:e4 . . .','. g3:b3:d4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. d4:f#4:a4 . . d4:f#4:a4 . . .',
      '. f3:a3:c4 . . f3:a3:c4 . . .','. g3:b3:d4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . a3:c4:e4 .','. a3:c4:e4 . . g3:b3:d4 . . .',
      '. d4:f#4:a4 . . d4:f#4:a4 . . .','. a3:c4:e4 . . a3:c4:e4 . . .',
      '. a3:c4:e4 . . a3:c4:e4 . . .','a3:c4:e4 . . . . . . .'], {vel:0.5, gate:0.4}),
    P('brass', 2, [R8,R8, R8,R8,R8,R8,
      'a4:c5:e5 . . . a4:c5:e5 . . .','. . . . g4:b4:d5 . . .',
      'f4:a4:c5 . . . . . . .','g4:b4:d5 . . . g4:b4:d5 . g4:b4:d5 .',
      R8,R8,R8,R8, 'a4:c5:e5 . . . . . . .',R8], {vel:0.5}),
    P('mute', 2, [R8,R8, '. . e3 . . . e3 .','. . e3 . . e3 . .','. . e3 . . . e3 .','. . d3 . . d3 . .',
      '. . c3 . . . c3 .','. . d3 . . d3 . .','. . e3 . . . e3 .','. . e3 . . e3 . .',
      '. . e3 . . . e3 .','. . e3 . . e3 . .','. . d3 . . . d3 .','. . e3 . . e3 . .',
      '. . e3 . . . e3 .',R8], {vel:0.35}),
    DR('kick', 1, rep('x.......x.......', 2).concat(rep('x.......x.......', 12), rep('x.......x...x...', 2)), {vel:0.9}),
    DR('hat', 1, rep('x.xxx.xxx.xxx.xx', 16), {vel:0.5}),
    DR('clap', 4, rep('.x.x', 16), {vel:0.7}),
    DR('tamb', 2, rep('..x...x.', 2).concat(rep('..x...x.', 12), rep('..x...x.', 2)), {vel:0.5}),
    DR('crash', 16, ['.','.','x','.','.','.','x','.','.','.','x','.','.','.','x','.'], {vel:0.45})
  ]
}
];

RACK.forEach(function(sp){
  if(MIX[sp.key] !== undefined) sp.gain = MIX[sp.key];
  if(FULL.indexOf(sp.key) < 0) sp.rate = 32000;
});

/* ==================================================================
   THE EIGHT FROM THE SOUND LAB
   Same tunes, played by the foundry instead of by bare oscillators,
   and given somewhere to go - four bars became twelve or sixteen.
   ================================================================== */
var pG = 'g3:b3:d4 _', pEm = 'e3:g3:b3 _', pC = 'c3:e3:g3 _', pD = 'd3:f#3:a3 _';
var bG = 'g2 _ d3 _', bEm = 'e2 _ b2 _', bC = 'c2 _ g2 _', bD = 'd2 _ a2 _';
var aAm = 'a4 c5 e5 a4 c5 e5 a4 c5 e5 a4 c5 e5 a4 c5 e5 a5',
    aF  = 'f4 a4 c5 f4 a4 c5 f4 a4 c5 f4 a4 c5 f4 a4 c5 f5',
    aC  = 'c5 e5 g5 c5 e5 g5 c5 e5 g5 c5 e5 g5 c5 e5 g5 c6',
    aG  = 'g4 b4 d5 g4 b4 d5 g4 b4 d5 g4 b4 d5 g4 b4 d5 g5';
var oE = 'e3:g#3:b3 _ _ _', oA = 'a3:c#4:e4 _ _ _', oB = 'b2:d#3:f#3 _ _ _';
var wF = 'f2 a2 c3 e3', wDm = 'd2 f2 a2 c3', wGm = 'g2 bb2 d3 f3', wC7 = 'c3 e3 g3 bb3';
var jF = '. a3:c4:e4 . . a3:c4:e4 . . .', jDm = '. f3:a3:c4 . . f3:a3:c4 . . .',
    jGm = '. bb3:d4:f4 . . bb3:d4:f4 . . .', jC7 = '. e3:g3:bb3 . . e3:g3:bb3 . . .';
var nD = 'd4 a4 d5 a4 f4 a4 d5 a4 d4 a4 d5 a4 f4 a4 d5 a4',
    nBb = 'bb3 f4 bb4 f4 d4 f4 bb4 f4 bb3 f4 bb4 f4 d4 f4 bb4 f4',
    nF = 'f3 c4 f4 c4 a3 c4 f4 c4 f3 c4 f4 c4 a3 c4 f4 c4',
    nC = 'c4 g4 c5 g4 e4 g4 c5 g4 c4 g4 c5 g4 e4 g4 c5 g4';

TRACKS.push(
{
  key:'cabinet', label:'Cabinet', genre:'Chiptune',
  meta:'A minor - 132 bpm - 6 parts', bpm:132, beats:4,
  form:[['A',4],['B',4],['Break',4]],
  liner:'The fight theme from the sound lab, played on real chip voices instead of bare oscillators: two duty cycles, a sixteen-step triangle bass, and a genuine NES shift register for the drums. One noise sample is both the snare and the hat, played back at two speeds.',
  parts:[
    P('pulse', 2, ['a4 . c5 . e5 . c5 .','f4 . a4 . c5 . a4 .','g4 . c5 . e5 . g5 .','g4 . b4 . d5 . b4 .',
      'e5 _ _ . c5 . a4 .','f5 _ _ . c5 . a4 .','e5 . g5 . a5 _ _ .','g5 . d5 . b4 _ _ .',
      R8,R8,'a5 . g5 . e5 . c5 .','b4 . d5 . g5 _ _ .'], {vel:0.62, gate:0.85}),
    P('pulse2', 1, [aAm,aF,aC,aG, aAm,aF,aC,aG, aAm,aF,aG,aG], {vel:0.3, gate:0.5}),
    P('chiptri', 2, ['a2 . a2 . a2 . e2 .','f2 . f2 . f2 . c3 .','c3 . c3 . c3 . g2 .','g2 . g2 . g2 . d3 .',
      'a2 . a2 . a2 . e2 .','f2 . f2 . f2 . c3 .','c3 . c3 . c3 . g2 .','g2 . g2 . g2 . d3 .',
      'a2 . a2 . a2 . e2 .','f2 . f2 . f2 . c3 .','g2 . g2 . g2 . d3 .','g2 . g2 . d3 . g2 .'], {vel:0.7, gate:0.8}),
    DR('thump', 1, rep('x.....x...x.....', 11).concat(['x.x...x...x.x...']), {vel:0.8, rate:1.35}),
    DR('chipnz', 1, rep('....x.......x...', 11).concat(['....x.......x.xx']), {vel:0.75}),
    DR('chipnz', 1, rep('x.x.x.x.x.x.x.x.', 12), {vel:0.3, rate:2.6})
  ]
},
{
  key:'kyrie', label:'Kyrie for a Kitchen Brawl', genre:'Choral battle',
  meta:'D minor - 70 bpm - 9 parts', bpm:70, beats:4,
  form:[['Intro',2],['Verse',4],['Build',4],['Battle',4],['Out',2]],
  liner:'The sound lab had this as four bars of choir and taiko. Now it goes somewhere: the strings come in under the second verse, a braam marks the battle, and the taiko doubles into it. The requiem on the foundry page is the slow one - this is the one for a last stock.',
  parts:[
    P('choir', 16, ['d4:f4:a4','d4:f4:a4', 'd4:f4:a4','bb3:d4:f4','a3:c4:f4','c4:e4:g4',
      'd4:f4:a4','g3:bb3:d4','bb3:d4:f4','a3:c#4:e4',
      'd4:f4:a4','bb3:d4:f4','a3:c4:f4','a3:c#4:e4', 'd4:f4:a4','d4:f4:a4'], {vel:0.5, gate:0.96}),
    P('choir', 4, [R4,R4, 'a4 _ _ f4','g4 _ _ _','a4 _ c5 _','g4 _ _ _',
      'd5 _ _ c5','bb4 _ _ a4','d5 _ c5 _','e5 _ _ _',
      'f5 _ e5 d5','d5 _ c5 bb4','a4 _ c5 d5','e5 _ _ _', 'd5 _ _ _','d4 _ _ _'], {vel:0.62, gate:0.93}),
    P('choir', 8, ['d2 _','d2 _','d2 _','bb1 _','f2 _','c2 _','d2 _','g1 _','bb1 _','a1 _',
      'd2 _','bb1 _','f2 _','a1 _','d2 _','d2 _'], {vel:0.55, gate:0.98}),
    P('strings', 8, [R2,R2, R2,R2,R2,R2, 'd3:a3 _','g2:d3 _','bb2:f3 _','a2:e3 _',
      'd3:a3 _','bb2:f3 _','f2:c3 _','a2:e3 _', 'd3:a3 _','d3:a3 _'], {vel:0.42, gate:0.97}),
    P('braam', 8, rep(R2, 10).concat(['d2 _',R2,'a1 _',R2], [R2,R2]), {vel:0.62, gate:0.9}),
    P('timp', 4, [R4,R4, 'd2 _ _ _',R4,R4,R4, 'd2 _ _ _',R4,R4,'a1 _ a1 _',
      'd2 _ _ _','bb1 _ _ _','f2 _ _ _','a1 _ a1 a1', 'd2 _ _ _',R4], {vel:0.6}),
    DR('taiko', 4, ['....','....', 'x...','....','x...','....', 'x...','..x.','x...','x.x.',
      'x..x','x..x','x..x','xxxx', 'x...','x...'], {vel:0.95}),
    DR('rev', 16, ['.','x','.','.','.','.','x','.','.','.','x','.','.','.','.','.'], {vel:0.8}),
    DR('crash', 16, ['.','.','x','.','.','.','x','.','.','.','X','.','.','.','x','.'], {vel:0.5})
  ]
},
{
  key:'overworld', label:'Overworld', genre:'Orchestral',
  meta:'G major - 112 bpm - 8 parts', bpm:112, beats:4,
  form:[['A',4],['B',4],['C',4],['A2',4]],
  liner:'The bright one. Four bars of it existed on the sound lab; this has three sections and a march snare running under the whole thing. Where the foundry Overture lifts into Bb and gets serious, this stays home and keeps moving - it is the menu, not the cutscene.',
  parts:[
    P('spicc', 2, [oG,oEm,oC,oD, oEm,oC,oG,oD, oC,oD,oG,oEm, oG,oEm,oC,oD], {vel:0.48, gate:0.9}),
    P('strings', 8, [pG,pEm,pC,pD, pEm,pC,pG,pD, pC,pD,pG,pEm, pG,pEm,pC,pD], {vel:0.4, gate:0.98}),
    P('horn', 4, ['g4 _ b4 d5','b4 _ _ g4','e4 _ g4 a4','b4 _ a4 _',
      'e5 _ d5 b4','g4 _ _ e4','d5 _ b4 g4','a4 _ _ _',
      'c5 _ e5 g5','f#5 _ d5 _','b4 _ d5 g5','b4 _ _ _',
      'g4 _ b4 d5','b4 _ _ g4','e4 _ a4 b4','d5 _ _ _'], {vel:0.55, gate:0.9}),
    P('upright', 4, [bG,bEm,bC,bD, bEm,bC,bG,bD, bC,bD,bG,bEm, bG,bEm,bC,bD], {vel:0.66}),
    P('glock', 2, [R8,R8,R8,R8, '. . b4 . . . d5 .','. . g4 . . . e5 .','. . d5 . . . b4 .','. . a4 . . b4 d5 .',
      R8,R8,R8,R8, '. . d5 . . . b5 .','. . g5 . . . e5 .','. . e5 . . . c5 .','. . d5 . g5 . b5 .'], {vel:0.5, gate:0.8}),
    DR('snare', 1, rep('..o...o...o...o.', 15).concat(['..o...o...oxxxxx']), {vel:0.45}),
    DR('timp', 4, rep('x...', 15).concat(['x.x.']), {vel:0.6}),
    DR('crash', 16, ['x','.','.','.','x','.','.','.','x','.','.','.','x','.','.','.'], {vel:0.45})
  ]
},
{
  key:'garage', label:'Garage Ruckus', genre:'Rock',
  meta:'E minor - 168 bpm - 7 parts', bpm:168, beats:4,
  form:[['Riff',4],['Verse',4],['Chorus',4],['Out',4]],
  liner:'Punkier and more tuneful than the metal on the foundry page - open power chords instead of palm mutes, and a lead that actually carries a melody through the chorus. The bass is the plucked-string model with the damping turned down.',
  parts:[
    P('dguitar', 2, ['e2 . e2 . g2 . a2 .','e2 . e2 . g2 . a2 .','e2 . e2 . d2 . . .','c2 . c2 . d2 . . .',
      'e2 . . . e2 . . .','e2 . . . e2 . . .','c2 . . . c2 . . .','d2 . . . d2 . . .',
      'e2 e2 . e2 . e2 g2 .','c2 c2 . c2 . c2 . .','g2 g2 . g2 . g2 . .','d2 d2 . d2 . a2 . .',
      'e2 . e2 . g2 . a2 .','e2 . e2 . g2 . a2 .','e2 . e2 . d2 . . .','e2 _ _ _ _ _ _ _'], {vel:0.6, gate:0.9}),
    P('lead', 2, rep(R8, 8).concat(
      ['. . b4 d5 e5 _ _ .','g5 _ e5 d5 b4 _ _ .','. . g4 a4 b4 _ _ .','d5 _ b4 a4 b4 _ _ _'],
      ['e5 _ _ . d5 . b4 .','g5 _ _ . e5 _ _ .','a5 _ _ . g5 . e5 .','e5 _ _ _ _ _ _ _']), {vel:0.5, gate:0.92}),
    P('slap', 2, ['e1 e1 . e1 . e1 g1 .','e1 e1 . e1 . e1 g1 .','e1 e1 . e1 . e1 . .','c2 c2 . c2 . c2 . .',
      'e1 e1 . e1 . e1 . .','e1 e1 . e1 . e1 . .','c2 c2 . c2 . c2 . .','d2 d2 . d2 . d2 . .',
      'e1 e1 . e1 . e1 g1 .','c2 c2 . c2 . c2 . .','g1 g1 . g1 . g1 . .','d2 d2 . d2 . a1 . .',
      'e1 e1 . e1 . e1 g1 .','e1 e1 . e1 . e1 g1 .','e1 e1 . e1 . e1 . .','e1 _ _ _ _ _ _ _'], {vel:0.6, gate:0.7}),
    DR('kick', 1, rep('x.....x...x.....', 8).concat(rep('x..x..x...x.x...', 4),
      rep('x.x...x...x.x...', 4)), {vel:0.88}),
    DR('snare', 1, rep('....x.......x...', 15).concat(['....x.......xxxx']), {vel:0.8}),
    DR('hat', 1, rep('x.x.x.x.x.x.x.x.', 16), {vel:0.5}),
    DR('crash', 16, ['x','.','.','.','x','.','.','.','X','.','.','.','x','.','.','.'], {vel:0.5})
  ]
},
{
  key:'neon', label:'Neon Boardwalk', genre:'Synthwave',
  meta:'A minor - 116 bpm - 7 parts', bpm:116, beats:4,
  form:[['Intro',4],['A',4],['B',4],['Out',4]],
  liner:'Seven detuned saws a note, a sub under the kick, and a clap with a plate on it. The intro runs on pad and arpeggio alone so the kick landing at bar five means something - which is the only structural idea in the entire genre and it works every time.',
  parts:[
    P('supersaw', 4, rep('a3:c4:e4 _ _ _', 1).concat(['f3:a3:c4 _ _ _','c4:e4:g4 _ _ _','g3:b3:d4 _ _ _'],
      ['a3:c4:e4 _ _ _','f3:a3:c4 _ _ _','c4:e4:g4 _ _ _','g3:b3:d4 _ _ _'],
      ['a3:c4:e4 _ _ _','f3:a3:c4 _ _ _','c4:e4:g4 _ _ _','g3:b3:d4 _ _ _'],
      ['a3:c4:e4 _ _ _','f3:a3:c4 _ _ _','c4:e4:g4 _ _ _','g3:b3:d4 _ _ _']), {vel:0.5, gate:0.9}),
    P('supersaw', 2, rep(R8, 8).concat(
      ['e5 _ _ . c5 . a4 .','f5 _ _ . c5 . a4 .','g5 _ e5 . c5 _ _ .','b4 . d5 . g5 _ _ .'],
      rep(R8, 4)), {vel:0.62, gate:0.8}),
    P('sub', 2, ['a1 . a1 . a1 . a1 a1','f1 . f1 . f1 . f1 f1','c2 . c2 . c2 . c2 c2','g1 . g1 . g1 . g1 g1',
      'a1 . a1 . a1 . a1 a1','f1 . f1 . f1 . f1 f1','c2 . c2 . c2 . c2 c2','g1 . g1 . g1 . g1 g1',
      'a1 . a1 . a1 . a1 a1','f1 . f1 . f1 . f1 f1','c2 . c2 . c2 . c2 c2','g1 . g1 . g1 . g1 g1',
      'a1 . a1 . a1 . a1 a1','f1 . f1 . f1 . f1 f1','c2 . c2 . c2 . c2 c2','a1 _ _ _ _ _ _ _'], {vel:0.7, gate:0.7}),
    P('pad', 16, ['a3','f3','c4','g3', 'a3','f3','c4','g3', 'a3','f3','c4','g3', 'a3','f3','c4','a3'], {vel:0.4, gate:0.98}),
    DR('kick', 4, rep('....', 4).concat(rep('xxxx', 12)), {vel:0.85}),
    DR('clap', 4, rep('....', 4).concat(rep('.x.x', 12)), {vel:0.65}),
    DR('ohat', 2, rep(D8, 4).concat(rep('.x.x.x.x', 12)), {vel:0.42})
  ]
},
{
  key:'reverbpoint', label:'Reverb Point', genre:'Surf rock',
  meta:'E major - 150 bpm - 7 parts', bpm:150, beats:4,
  form:[['Intro',2],['A',4],['B',4],['A2',4],['Out',2]],
  liner:'Kauai. The lead is a plucked string with a generated spring on it, and the sequencer picks it tremolo - a fresh attack every eighth rather than one held note, which is the entire sound of surf guitar. The organ underneath is six sine drawbars with a wobble.',
  parts:[
    P('surf', 4, [R4,R4, 'e4 _ g#4 b4','a4 _ _ e4','b4 _ g#4 e4','f#4 _ b4 _',
      'e5 _ c#5 b4','a4 _ _ c#5','b4 _ d#5 f#5','e5 _ _ _',
      'e4 _ g#4 b4','a4 _ _ e4','b4 _ g#4 e4','e4 _ _ _', 'e5 _ _ _','e4 _ _ _'],
      {vel:0.72, gate:0.95, trem:2}),
    P('organ', 4, [oE,oE, oE,oA,oE,oB, oA,oE,oB,oE, oE,oA,oE,oB, oE,oE], {vel:0.4, gate:0.95}),
    P('upright', 2, ['e2 . e2 . b2 . e2 .','e2 . e2 . b2 . e2 .',
      'e2 . e2 . b2 . e2 .','a2 . a2 . e3 . a2 .','e2 . e2 . b2 . e2 .','b2 . b2 . f#3 . b2 .',
      'a2 . a2 . e3 . a2 .','e2 . e2 . b2 . e2 .','b2 . b2 . f#3 . b2 .','e2 . e2 . b2 . e2 .',
      'e2 . e2 . b2 . e2 .','a2 . a2 . e3 . a2 .','e2 . e2 . b2 . e2 .','b2 . b2 . f#3 . a2 .',
      'e2 . e2 . b2 . e2 .','e2 _ _ _ _ _ _ _'], {vel:0.6}),
    DR('kick', 1, rep('x.....x.x.......', 16), {vel:0.7}),
    DR('snare', 1, rep('....x.......x...', 15).concat(['....x.......xxxx']), {vel:0.6}),
    DR('hat', 1, rep('x.x.x.x.x.x.x.x.', 16), {vel:0.4}),
    DR('tamb', 2, rep('....x...', 16), {vel:0.45})
  ]
},
{
  key:'lounge', label:'Lounge Standard', genre:'Jazz',
  meta:'F major - 92 bpm - swung - 5 parts', bpm:92, beats:4, swing:0.3,
  form:[['Head',4],['Turn',4],['Solo',4],['Out',4]],
  liner:'A ii-V-I that goes round four times with the tune opening out each pass. Swung eighths - the sequencer pushes every offbeat late. Brushes instead of sticks, a walking bass on the plucked-string model, and vibes on the melody. Menu music you can talk over.',
  parts:[
    P('vibes', 2, ['a4 . c5 . f5 _ _ .','d5 . c5 . a4 _ _ .','bb4 . d5 . f5 _ _ .','e5 . g5 . e5 _ _ .',
      'f5 _ e5 . c5 . a4 .','d5 _ c5 . a4 . f4 .','g4 . bb4 . d5 _ _ .','c5 . e5 . g5 _ _ .',
      'a5 . g5 . f5 . e5 .','d5 . c5 . a4 _ _ .','bb4 . c5 . d5 . f5 .','e5 _ _ . c5 _ _ .',
      'a4 . c5 . f5 _ _ .','d5 . c5 . a4 _ _ .','g4 . bb4 . e5 _ _ .','f5 _ _ _ _ _ _ _'], {vel:0.6, gate:0.9}),
    P('upright', 4, [wF,wDm,wGm,wC7, wF,wDm,wGm,wC7, wF,wDm,wGm,wC7,
      wF,wDm,wGm,'c3 e3 g3 e3'], {vel:0.7}),
    P('rhodes', 2, [jF,jDm,jGm,jC7, jF,jDm,jGm,jC7, jF,jDm,jGm,jC7, jF,jDm,jGm,jC7], {vel:0.42, gate:0.5}),
    DR('brush', 4, rep('.x.x', 16), {vel:0.7}),
    DR('ride', 2, rep('x.xxx.xx', 15).concat(['x.xxx.xo']), {vel:0.5})
  ]
},
{
  key:'maintheme', label:'Main Theme', genre:'Hybrid trailer',
  meta:'D minor - 144 bpm - 9 parts', bpm:144, beats:4,
  form:[['Fanfare',2],['A',4],['B',4],['C',4],['Coda',2]],
  liner:'Everything at once, which is what a fighting game main theme is. Choir on top, distorted guitar on the bottom, sixteenth strings in the middle, taiko and brass marking the corners. Where Nightshift is slow and threatening, this one is the title card.',
  parts:[
    P('choir', 16, ['d4:f4:a4','d4:f4:a4', 'd4:f4:a4','bb3:d4:f4','f3:a3:c4','c4:e4:g4',
      'd4:f4:a4','bb3:d4:f4','f3:a3:c4','c4:e4:g4',
      'd4:f4:a4','bb3:d4:f4','a3:c4:e4','a3:c#4:e4', 'd4:f4:a4','d4:f4:a4'], {vel:0.5, gate:0.95}),
    P('spicc', 1, [nD,nD, nD,nBb,nF,nC, nD,nBb,nF,nC, nD,nBb,nF,nC, nD,nD], {vel:0.3, gate:0.55}),
    P('brass', 4, ['d4:a4 . f4:c5 .','a4:e5 _ _ .', R4,R4,R4,R4,
      'd4:a4 . . .','bb3:f4 . . .','f3:c4 . . .','c4:g4 . . .',
      'd4:a4 . f4:c5 .','bb3:f4 . d4:a4 .','a3:e4 . c4:g4 .','a3:e4 _ _ _', 'd4:a4 . . .','d4:a4 . . .'], {vel:0.62}),
    P('dguitar', 2, [R8,R8, 'd2 . . d2 . . d2 .','bb1 . . bb1 . . bb1 .','f2 . . f2 . . f2 .','c2 . . c2 . . c2 .',
      'd2 d2 . d2 . d2 . .','bb1 bb1 . bb1 . bb1 . .','f2 f2 . f2 . f2 . .','c2 c2 . c2 . c2 c2 .',
      'd2 d2 . d2 . d2 . .','bb1 bb1 . bb1 . bb1 . .','a1 a1 . a1 . a1 . .','a1 a1 . a1 a1 . a1 .',
      'd2 _ _ _ _ _ _ _','d2 _ _ _ _ _ _ _'], {vel:0.55, gate:0.85}),
    P('sub', 2, ['d1 . . . d1 . . .','d1 . . . d1 . . .',
      'd1 . d1 . d1 . d1 .','bb0 . bb0 . bb0 . bb0 .','f1 . f1 . f1 . f1 .','c1 . c1 . c1 . c1 .',
      'd1 . d1 . d1 . d1 .','bb0 . bb0 . bb0 . bb0 .','f1 . f1 . f1 . f1 .','c1 . c1 . c1 . c1 .',
      'd1 . d1 . d1 . d1 .','bb0 . bb0 . bb0 . bb0 .','a0 . a0 . a0 . a0 .','a0 . a0 . a0 . a0 .',
      'd1 _ _ _ _ _ _ _','d1 _ _ _ _ _ _ _'], {vel:0.72, gate:0.7}),
    P('braam', 8, ['d2 _',R2, R2,R2,R2,R2, R2,R2,R2,R2, R2,R2,R2,'a1 _', 'd2 _',R2], {vel:0.6, gate:0.9}),
    DR('taiko', 2, ['x...x...','x.x.x.xx', 'x..x..x.','x..x..x.','x..x..x.','x.xx.xxx',
      'x..x..x.','x..x..x.','x..x..x.','x.xx.xxx',
      'x..x..x.','x..x..x.','x..x..x.','x.xxx.xx', 'x...x...','x.......'], {vel:0.85}),
    DR('kick', 1, rep(D16, 2).concat(rep('x..x..x...x.x...', 12), rep('x...............', 2)), {vel:0.85}),
    DR('snare', 1, rep(D16, 2).concat(rep('....x.......x...', 11), ['....x.......xxxx'],
      rep(D16, 2)), {vel:0.7}),
    DR('crash', 16, ['x','.','x','.','.','.','.','.','x','.','.','.','x','.','x','.'], {vel:0.5})
  ]
}
);

/* Which job each piece does, and where it came from. Grouping the library
   by role rather than by genre is the only grouping that answers the
   question you actually have when you open it. */
var ROLE = {
  overworld:'Menu and between rounds', lounge:'Menu and between rounds',
  waltz:'Menu and between rounds',
  cabinet:'Fights', garage:'Fights', linoleum:'Fights', neon:'Fights',
  disco:'Fights', nightshift:'Fights',
  overture:'Stages', reverbpoint:'Stages', sunrise:'Stages',
  kyrie:'Moments', hymn:'Moments', maintheme:'Moments'
};
var ROLES = ['Menu and between rounds', 'Fights', 'Stages', 'Moments'];
var FROM_LAB = {cabinet:1, kyrie:1, overworld:1, garage:1, neon:1, reverbpoint:1,
                lounge:1, maintheme:1};


/* ==================================================================
   WATSON'S FLOWERS - the songs. Written in the notation above: one
   string per bar, `_` holds, `.` rests, `a:c:e` is a chord, `res` is
   sixteenths per token. Five pieces: the shop (lobby), the rush (the
   day), the haboob (6 p.m.), the parade, and closing time.
   ================================================================== */
(function(){
  function bars(list, fn){ return list.map(fn); }
  /* --- Main Street, 1927: a swung acoustic shuffle, G major ----------- */
  var mCh = ['G', 'D7', 'G', 'Em', 'C', 'D7', 'C', 'G', 'A7', 'D7', 'G', 'Em', 'C', 'D7', 'G', 'G'];
  var UKE = {G: 'g3:b3:d4', D7: 'f#3:a3:c4', Em: 'e3:g3:b3', C: 'e3:g3:c4', A7: 'g3:a3:c#4'};
  var UB = {G: 'g2 _ d3 _', D7: 'd2 _ a2 _', Em: 'e2 _ b2 _', C: 'c2 _ g2 _', A7: 'a1 _ e2 _'};
  TRACKS.push({
    key: 'mainstreet', label: 'Main Street, 1927', genre: 'Acoustic swing',
    meta: 'G major - 100 bpm - swung', bpm: 100, beats: 4, swing: 0.16,
    form: [['Intro', 2], ['A', 4], ['B', 4], ['A2', 4], ['Out', 2]],
    liner: "Irene's rose cart going up Main Street: a ukulele, an upright bass, a marimba with the tune, brushes.",
    parts: [
      P('nylon', 2, bars(mCh, function(c){ var k = UKE[c]; return k + ' . ' + k + ' ' + k + ' . ' + k + ' ' + k + ' .'; }), {vel: 0.45}),
      P('upright', 4, bars(mCh, function(c){ return UB[c]; }), {vel: 0.7}),
      P('marimba', 2, [R8, R8,
        'd5 . b4 . g4 . b4 d5', 'e5 . . d5 b4 . g4 .', 'e5 . g5 . e5 . c5 .', 'd5 _ _ . a4 . c5 .',
        'e5 . e5 . g5 . e5 .', 'd5 . b4 . g4 _ _ .', 'c#5 . e5 . g5 . e5 .', 'f#5 _ _ . d5 . a4 .',
        'd5 . b4 . g4 . b4 d5', 'g5 . . e5 b4 . g4 .', 'e5 . g5 . c5 . e5 .', 'd5 . c5 . a4 . f#4 .',
        'g4 . b4 . d5 . g5 .', 'g5 _ _ _ . . . .'], {vel: 0.55}),
      P('glock', 4, [R4, R4, R4, R4, R4, R4, 'g5 _ . .', '. . b5 _', 'a5 _ . .', 'f#5 _ . .', R4, R4, R4, R4, R4, R4], {vel: 0.4}),
      P('harp', 2, ['g3 b3 d4 g4 b4 d5 g5 .', R8, R8, R8, R8, R8, R8, R8, R8, R8, 'g3 b3 d4 g4 b4 d5 g5 .', R8, R8, R8, R8, R8], {vel: 0.4, gate: 0.5}),
      DR('brush', 1, rep('x..x..x.x..x..x.', 16), {vel: 0.45}),
      DR('kick', 1, rep('x.......x.......', 16), {vel: 0.4}),
      DR('tamb', 4, rep('.x.x', 16), {vel: 0.35})
    ]
  });

  /* --- Delivery Rush: surf rock, E minor, flat out ------------------- */
  var rCh = ['Em', 'Em', 'Em', 'G', 'D', 'Em', 'C', 'D', 'Em', 'B7', 'Em', 'G', 'D', 'Em', 'C', 'B7'];
  var RB = {Em: 'e2 e2 b2 e2 e2 e2 b2 d3', G: 'g2 g2 d3 g2 g2 g2 d3 f#2', D: 'd2 d2 a2 d2 d2 d2 a2 c3', C: 'c2 c2 g2 c2 c2 c2 g2 b1', B7: 'b1 b1 f#2 b1 b1 b1 f#2 a2'};
  var RO = {Em: 'e3:g3:b3 _', G: 'g3:b3:d4 _', D: 'f#3:a3:d4 _', C: 'e3:g3:c4 _', B7: 'd#3:f#3:a3 _'};
  TRACKS.push({
    key: 'rush', label: 'Delivery Rush', genre: 'Surf rock',
    meta: 'E minor - 160 bpm', bpm: 160, beats: 4,
    form: [['Intro', 2], ['A', 4], ['B', 4], ['A2', 4], ['Break', 2]],
    liner: 'Tremolo surf guitar over a combo organ, for driving too fast down Main Street.',
    parts: [
      P('surf', 4, [R4, R4,
        'b4 _ a4 g4', 'b4 _ d5 _', 'a4 _ f#4 d4', 'e4 _ _ _',
        'e5 _ d5 c5', 'd5 _ c5 b4', 'b4 _ g4 e4', 'd#4 _ f#4 _',
        'b4 _ a4 g4', 'b4 _ e5 _', 'd5 _ f#4 a4', 'e4 _ _ _',
        'c5 _ b4 a4', 'b4 _ _ _'], {vel: 0.5, trem: 1}),
      P('upright', 2, bars(rCh, function(c){ return RB[c]; }), {vel: 0.75}),
      P('organ', 8, bars(rCh, function(c){ return RO[c]; }), {vel: 0.32, gate: 0.9}),
      DR('kick', 1, rep('x.......x.......', 2).concat(rep('x.....x.x.......', 14)), {vel: 0.75}),
      DR('snare', 1, rep('....x.......x...', 2).concat(rep('....x.......x...', 12), ['....x...x.x.xxxx', 'x.x.x.x.XXXXXXXX']), {vel: 0.6}),
      DR('hat', 1, rep('x.x.x.x.x.x.x.x.', 16), {vel: 0.4}),
      DR('crash', 16, ['X', '.', 'X', '.', '.', '.', 'X', '.', '.', '.', 'X', '.', '.', '.', 'X', '.'], {vel: 0.5})
    ]
  });

  /* --- Haboob: the dust wall, D minor --------------------------------- */
  var hCh = ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Bb', 'C', 'A'];
  var HS = {Dm: 'd3 d3 f3 d3 a3 d3 f3 d3', Bb: 'bb2 bb2 d3 bb2 f3 bb2 d3 bb2', C: 'c3 c3 e3 c3 g3 c3 e3 c3', A: 'a2 a2 c#3 a2 e3 a2 c#3 a2'};
  TRACKS.push({
    key: 'haboob', label: 'Haboob', genre: 'Hybrid cinematic',
    meta: 'D minor - 126 bpm', bpm: 126, beats: 4,
    form: [['Wall', 4], ['Storm', 4]],
    liner: 'Short strings, taiko and a braam: a wall of dust coming in off the desert at six.',
    parts: [
      P('spicc', 2, bars(hCh, function(c){ return HS[c]; }), {vel: 0.5, gate: 0.85}),
      P('braam', 16, ['d2', '_', 'bb1', 'a1', 'd2', 'bb1', 'c2', 'a1'], {vel: 0.45, gate: 0.98}),
      P('sub', 4, ['d1 _ _ _', 'd1 _ _ _', 'bb0 _ _ _', 'a0 _ _ _', 'd1 _ _ _', 'bb0 _ _ _', 'c1 _ _ _', 'a0 _ _ _'], {vel: 0.6}),
      P('choir', 16, ['.', '.', '.', '.', 'd4:f4:a4', 'bb3:d4:f4', 'c4:e4:g4', 'c#4:e4:a4'], {vel: 0.45, gate: 0.97}),
      DR('taiko', 2, rep('x..x..x.', 6).concat(['x.x.x.x.', 'xxxxxxxx']), {vel: 0.8}),
      DR('hat', 1, rep('x.xxx.xxx.xxx.xx', 8), {vel: 0.3}),
      DR('snare', 1, rep('....x.......x...', 8), {vel: 0.5})
    ]
  });

  /* --- The Gilbert Days Parade: a march, Bb major --------------------- */
  TRACKS.push({
    key: 'parade', label: 'Gilbert Days Parade', genre: 'March',
    meta: 'Bb major - 116 bpm', bpm: 116, beats: 4,
    form: [['March', 8]],
    liner: 'Brass, glockenspiel, snare and a bass drum: the Watson’s float going down Gilbert Road.',
    parts: [
      P('brass', 4, ['bb4 _ d5 f5', 'f5 _ e5 _', 'd5 _ c5 bb4', 'eb5 _ _ _', 'bb4 _ d5 f5', 'a5 _ g5 f5', 'g5 _ a5 _', 'bb5 _ _ _'], {vel: 0.55, gate: 0.85}),
      P('horn', 8, ['bb3:d4 _', 'a3:c4 _', 'bb3:d4 _', 'g3:bb3 _', 'bb3:d4 _', 'a3:c4 _', 'g3:bb3 a3:c4', 'bb3:d4 _'], {vel: 0.4}),
      P('upright', 4, ['bb1 _ f2 _', 'f1 _ c2 _', 'bb1 _ f2 _', 'eb2 _ bb1 _', 'bb1 _ f2 _', 'f1 _ c2 _', 'eb2 _ f2 _', 'bb1 _ _ _'], {vel: 0.75}),
      P('glock', 2, [R8, R8, 'bb5 . d6 . f6 . d6 .', 'eb6 . . . g5 . . .', R8, 'c6 . a5 . f5 . a5 .', 'g5 . bb5 . a5 . c6 .', 'bb5 _ _ _ . . . .'], {vel: 0.45}),
      P('timp', 4, ['bb1 _ . .', 'f1 _ . .', 'bb1 _ . .', 'eb2 _ . .', 'bb1 _ . .', 'f1 _ . .', 'eb2 _ f1 _', 'bb1 _ bb1 _'], {vel: 0.5}),
      DR('snare', 1, rep('x.xx..x.x.xx..x.', 7).concat(['xxxxxxxxXXXXXXXX']), {vel: 0.55}),
      DR('kick', 1, rep('x.......x.......', 8), {vel: 0.65}),
      DR('crash', 16, ['X', '.', '.', '.', 'X', '.', '.', 'X'], {vel: 0.45})
    ]
  });

  /* --- Closing Time: piano and strings, C major ----------------------- */
  var cCh = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'C'];
  var CP = {C: 'c3 g3 c4 e4 g4 e4 c4 g3', Am: 'a2 e3 a3 c4 e4 c4 a3 e3', F: 'f2 c3 f3 a3 c4 a3 f3 c3', G: 'g2 d3 g3 b3 d4 b3 g3 d3'};
  var CS = {C: 'c3:e3:g3', Am: 'a2:c3:e3', F: 'f2:a2:c3', G: 'g2:b2:d3'};
  TRACKS.push({
    key: 'closing', label: 'Closing Time', genre: 'Piano and strings',
    meta: 'C major - 80 bpm', bpm: 80, beats: 4,
    form: [['Evening', 8]],
    liner: 'The neon comes on over Main Street and the day is counted up.',
    parts: [
      P('piano', 2, bars(cCh, function(c){ return CP[c]; }), {vel: 0.45}),
      P('strings', 16, bars(cCh, function(c){ return CS[c]; }), {vel: 0.35, gate: 0.98}),
      P('musicbox', 4, ['e5 _ g5 _', 'e5 _ c5 _', 'a5 _ g5 f5', 'd5 _ _ _', 'e5 _ g5 c6', 'b5 _ a5 _', 'a5 _ g5 f5', 'e5 _ _ _'], {vel: 0.45}),
      P('upright', 8, bars(cCh, function(c){ return {C: 'c2 _', Am: 'a1 _', F: 'f1 _', G: 'g1 _'}[c]; }), {vel: 0.6})
    ]
  });
  ROLE.mainstreet = 'Menu and between rounds'; ROLE.closing = 'Moments';
  ROLE.rush = 'Fights'; ROLE.haboob = 'Fights'; ROLE.parade = 'Moments';
})();


// Compile up front so a miscounted bar fails loudly here, not four bars in.
var PROBLEMS = [];
TRACKS.forEach(function(T){
  T.bars = T.form.reduce(function(a, f){ return a + f[1]; }, 0);
  var want = T.bars * T.beats * 4, needs = {};
  T.parts.forEach(function(p, i){
    var c = p.drum ? compileDrum(p.pat, p.res) : compile(p.pat, p.res);
    p.map = c.map;
    needs[p.inst || p.drum] = 1;
    if(c.steps !== want)
      PROBLEMS.push(T.key + ' part ' + i + ' (' + (p.inst || p.drum) + '): ' +
                    c.steps + ' steps, wanted ' + want);
  });
  T.needs = Object.keys(needs);
});

/* ==================================================================
   WHAT THE MUSIC ACTUALLY PLAYS
   Every pitched instrument declares zones covering its whole range,
   but no piece uses the whole range. Walking the compiled patterns
   says which zones are actually reachable, and the rest are never
   rendered. This is free - the information is already in the notes.
   ================================================================== */
var USE = {};
function useNote(key, midi){
  var u = USE[key] || (USE[key] = {notes:{}, drum:false});
  if(midi === null) u.drum = true; else u.notes[midi] = 1;
}
TRACKS.forEach(function(T){
  T.parts.forEach(function(p){
    if(p.drum){ useNote(p.drum, null); return; }
    Object.keys(p.map).forEach(function(st){
      p.map[st].notes.forEach(function(n){ useNote(p.inst, n + (p.oct || 0) * 12); });
    });
  });
});
function neededZones(spec){
  var u = USE[spec.key];
  if(!u) return spec.zones.slice(0, 1);
  var need = {};
  if(u.drum) need[spec.zones[0]] = 1;              // drum rows always take zone one
  Object.keys(u.notes).forEach(function(k){
    var m = Number(k), best = spec.zones[0], bd = 1e9;
    spec.zones.forEach(function(z){ var d = Math.abs(z - m); if(d < bd){ bd = d; best = z; } });
    need[best] = 1;
  });
  var out = spec.zones.filter(function(z){ return need[z]; });
  return out.length ? out : spec.zones.slice(0, 1);
}

/* A rendered buffer is mostly silence at the end - a hall tail decays
   below hearing long before the buffer runs out, and every byte after
   that point is memory spent on nothing. */
function trimTail(buf, thresh){
  var n = buf.length, last = 0, c, i, d;
  for(c = 0; c < buf.numberOfChannels; c++){
    d = buf.getChannelData(c);
    for(i = n - 1; i > last; i--) if(Math.abs(d[i]) > thresh){ last = i; break; }
  }
  var keep = Math.min(n, last + Math.floor(buf.sampleRate * 0.008));
  if(keep >= n - 16 || keep < 64) return buf;
  var out = A.createBuffer(buf.numberOfChannels, keep, buf.sampleRate);
  for(c = 0; c < buf.numberOfChannels; c++)
    out.getChannelData(c).set(buf.getChannelData(c).subarray(0, keep));
  return out;
}

/* ==================================================================
   THE KILN, ON DEMAND
   ================================================================== */
var CORE = ['pop', 'whoosh', 'pulse', 'thump'];
var CEIL = 24 * 1048576;
var TALLY = {coreMs:0, longest:0, zoneSaved:0, tailSaved:0, evicted:0,
             declared:0, baked:0, tailPct:0, tailN:0};
var CLOCK = 0;

function heldBytes(){
  var t = 0;
  Object.keys(KIT).forEach(function(k){ t += KIT[k].bytes; });
  return t;
}
/* What the eviction may never take. CORE is the four instruments the
   effect recipes are built on, but the impact and arcade banks between
   them want eleven, and the seven that were not in this list are what
   went missing: baking the fourth song of a session pushed the kit over
   the ceiling and the least-recently-used samples were the effects,
   because a hit does not touch `used` the way `ensure` does. The banks
   went cold four songs in and every hit for the rest of the evening fell
   through to the plain oscillator underneath the music. FX_NEEDS is
   declared further down and this runs long after, but read it through a
   guard anyway so the order can never matter. */
function pinned(k){
  return CORE.indexOf(k) >= 0 ||
         (typeof FX_NEEDS !== 'undefined' && FX_NEEDS.indexOf(k) >= 0);
}
function evict(keep){
  var keys = Object.keys(KIT).filter(function(k){
    return !pinned(k) && keep.indexOf(k) < 0;
  });
  keys.sort(function(a, b){ return KIT[a].used - KIT[b].used; });
  while(heldBytes() > CEIL && keys.length){
    var k = keys.shift();
    TALLY.evicted += KIT[k].bytes;
    delete KIT[k];        // the audition pages logged this; the game just does it
  }
}

async function ensure(keys, onOne){
  var a = actx(); if(!a) return {ms:0, bytes:0, made:0};
  if(a.state === 'suspended') await a.resume();
  var todo = [], i;
  for(i = 0; i < keys.length; i++)
    if(!KIT[keys[i]] && SPEC[keys[i]] && todo.indexOf(keys[i]) < 0) todo.push(keys[i]);
  keys.forEach(function(k){ if(KIT[k]) KIT[k].used = ++CLOCK; });
  if(!todo.length) return {ms:0, bytes:0, made:0};
  var t0 = performance.now(), added = 0;
  for(i = 0; i < todo.length; i++){
    var spec = SPEC[todo[i]], zones = [], raw = 0, kept = 0, z, r, buf;
    var want = spec.rr ? null : neededZones(spec);
    /* The zones of one instrument have nothing to do with each other, so
       start them all and wait for the set. An offline render hands work to
       the audio threads, which means four string zones overlap instead of
       queueing - most of the cost of the expensive instruments. */
    if(spec.rr){
      var jobs = [];
      for(r = 0; r < spec.rr; r++) jobs.push(bakeOne(spec, 60, r));
      (await Promise.all(jobs)).forEach(function(b){
        raw += bytes(b); b = trimTail(b, 0.0016); kept += bytes(b);
        zones.push({ref:60, buf:b});
      });
    } else {
      var zjobs = want.map(function(zz){ return bakeOne(spec, zz); });
      (await Promise.all(zjobs)).forEach(function(b, bi){
        raw += bytes(b); b = trimTail(b, 0.0016); kept += bytes(b);
        zones.push({ref:want[bi], buf:b});
      });
      // what the zones we skipped would have cost, at the same average
      TALLY.zoneSaved += (spec.zones.length - want.length) * (raw / want.length);
      TALLY.declared += spec.zones.length; TALLY.baked += want.length;
    }
    TALLY.tailSaved += raw - kept;
    TALLY.tailPct += 1 - kept / raw; TALLY.tailN++;
    KIT[spec.key] = {zones:zones, spec:spec, rr:!!spec.rr, turn:-1, bytes:kept,
                     raw:raw, declared:spec.rr ? spec.rr : spec.zones.length,
                     needed:spec.rr ? spec.rr : want.length, used:++CLOCK};
    added += kept;
    if(onOne) onOne(spec, kept);
    await new Promise(function(res){ setTimeout(res, 0); });
  }
  var ms = performance.now() - t0;
  if(ms > TALLY.longest) TALLY.longest = ms;
  evict(keys);
  return {ms:ms, bytes:added, made:todo.length};
}

/* ==================================================================
   SOUND EFFECTS
   Mostly recipes over instruments the music already needed. Only the
   eight FX samples exist purely to be effects; the orchestral bank
   adds nothing at all if a fight track is already loaded.
   ================================================================== */
function seq(list){ list.forEach(function(f){ f(); }); }
var BANKS = {
  arcade:{
    needs:['pulse','pulse2','chipnz','thump'],
    swing:function(t){ play('pulse2', t, 84, 0.5, {dur:0.06, sweep:[1, 0.45, 0.07]}); },
    hit:function(t){ play('chipnz', t, 0, 0.6, {rate:0.85});
                     play('pulse', t, 48, 0.75, {dur:0.1, sweep:[1, 0.5, 0.11]}); },
    smash:function(t){ play('thump', t, 34, 0.95, {rate:0.85});
                       play('pulse', t, 43, 0.8, {dur:0.24, sweep:[1, 0.3, 0.26]}); },
    shield:function(t){ play('pulse', t, 76, 0.8, {dur:0.09, sweep:[1, 1.45, 0.09]}); },
    brk:function(t){ play('pulse2', t, 88, 0.7, {dur:0.32, sweep:[1, 0.14, 0.34]});
                     play('chipnz', t, 0, 0.5, {rate:1.5}); },
    jump:function(t){ play('pulse', t, 64, 0.5, {dur:0.08, sweep:[1, 2.1, 0.08]}); },
    dodge:function(t){ play('chipnz', t, 0, 0.4, {rate:2.2}); },
    item:function(t){ [72,79,84].forEach(function(m,i){ play('pulse', t+i*0.05, m, 0.55, {dur:0.07}); }); },
    ko:function(t){ play('pulse', t, 60, 0.8, {dur:0.5, sweep:[1, 0.11, 0.5]});
                    play('chipnz', t+0.02, 0, 0.6, {rate:0.55}); },
    go:function(t){ [72,79,84].forEach(function(m,i){
                    play('pulse', t+i*0.09, m, 0.7, {dur:i===2?0.36:0.1}); }); }
  },
  impact:{
    needs:['whoosh','crack','thump','glass','riser','sub','crash','glock'],
    swing:function(t){ play('whoosh', t, 0, 0.85, {rate:1.3}); },
    hit:function(t){ play('crack', t, 0, 0.8); play('thump', t, 36, 0.9); },
    smash:function(t){ play('crack', t, 0, 1); play('thump', t, 31, 1, {rate:0.8});
                       play('sub', t, 24, 0.9, {dur:0.4}); play('crash', t+0.01, 60, 0.5); },
    shield:function(t){ play('crack', t, 0, 0.5, {rate:1.6}); play('glock', t, 84, 0.5); },
    brk:function(t){ play('glass', t, 60, 0.9); play('thump', t, 40, 0.6); },
    jump:function(t){ play('whoosh', t, 0, 0.45, {rate:1.8}); },
    dodge:function(t){ play('whoosh', t, 0, 0.55, {rate:0.9}); },
    item:function(t){ [72,79,84,88].forEach(function(m,i){ play('glock', t+i*0.045, m, 0.6); }); },
    ko:function(t){ play('thump', t, 26, 1, {rate:0.65}); play('sub', t, 24, 1, {dur:0.8});
                    play('glass', t+0.02, 60, 0.5); play('crash', t, 60, 0.8); },
    go:function(t){ play('riser', t, 60, 0.8); play('thump', t+0.62, 33, 1);
                    play('crash', t+0.62, 60, 0.7); }
  },
  cartoon:{
    needs:['slide','boing','pop','marimba','glock','tamb','whoosh','thump'],
    swing:function(t){ play('slide', t, 60, 0.4, {rate:1.9}); },
    hit:function(t){ play('marimba', t, 72, 0.9, {rate:1.6}); play('pop', t, 0, 0.5); },
    smash:function(t){ play('boing', t, 60, 0.9); play('marimba', t, 60, 0.7, {rate:0.8}); },
    shield:function(t){ play('boing', t, 60, 0.5, {rate:0.6}); },
    brk:function(t){ play('pop', t, 0, 0.8); play('slide', t+0.03, 60, 0.6, {rate:0.55}); },
    jump:function(t){ play('boing', t, 60, 0.6, {rate:1.3}); },
    dodge:function(t){ play('whoosh', t, 0, 0.5, {rate:1.5}); },
    item:function(t){ [72,76,79,84].forEach(function(m,i){ play('glock', t+i*0.055, m, 0.55); });
                      play('pop', t+0.22, 0, 0.4); },
    ko:function(t){ play('slide', t, 60, 0.7, {rate:0.5});
                    play('thump', t+0.55, 34, 0.8); play('marimba', t+0.55, 48, 0.6, {rate:0.7}); },
    go:function(t){ [60,64,67,72].forEach(function(m,i){ play('marimba', t+i*0.09, m, 0.7); });
                    play('tamb', t+0.28, 0, 0.9); play('glock', t+0.28, 84, 0.6); }
  },
  orchestral:{
    needs:['harp','timp','brass','crash','glock','brush'],
    swing:function(t){ play('brush', t, 0, 0.7, {rate:1.5}); },
    hit:function(t){ play('harp', t, 48, 0.9, {rate:0.9}); play('timp', t, 40, 0.5); },
    smash:function(t){ [48,55,60].forEach(function(m){ play('brass', t, m, 0.8, {dur:0.35}); });
                       play('timp', t, 36, 1); play('crash', t+0.01, 60, 0.5); },
    shield:function(t){ play('glock', t, 91, 0.6); },
    brk:function(t){ [84,85,90].forEach(function(m){ play('glock', t, m, 0.45); });
                     play('crash', t, 60, 0.7); },
    jump:function(t){ [60,64,67,72,76].forEach(function(m,i){ play('harp', t+i*0.03, m, 0.55); }); },
    dodge:function(t){ play('brush', t, 0, 0.8); },
    item:function(t){ [67,71,74,79,83,86].forEach(function(m,i){ play('harp', t+i*0.033, m, 0.6); });
                      play('glock', t+0.2, 88, 0.5); },
    ko:function(t){ play('timp', t, 36, 1); [36,43,48].forEach(function(m){
                      play('brass', t, m, 0.75, {dur:0.7}); });
                    play('crash', t, 60, 0.8); play('timp', t+0.28, 33, 0.8); },
    go:function(t){ [55,59,62].forEach(function(m){ play('brass', t, m, 0.8, {dur:0.2}); });
                    [62,67,71].forEach(function(m){ play('brass', t+0.24, m, 0.9, {dur:0.5}); });
                    play('timp', t+0.24, 38, 0.9); }
  }
};
var EVENTS = [
  ['swing','Swing','a whiffed attack'],
  ['hit','Hit','heard hundreds of times a match'],
  ['smash','Smash','the charged one'],
  ['shield','Shield','a block that held'],
  ['brk','Shield break','and one that did not'],
  ['jump','Jump',''],
  ['dodge','Dodge roll',''],
  ['item','Item pickup',''],
  ['ko','KO','somebody left the screen'],
  ['go','GO!','the count-in ending']
];
var COMBO = [[0,'swing'],[0.22,'hit'],[0.5,'swing'],[0.66,'hit'],
             [0.95,'shield'],[1.2,'brk'],[1.6,'smash'],[2.2,'ko']];

// The effect banks are counted in the usage scan too, so an instrument
// an effect plays at a high pitch gets the zone that reaches it.
useNote('pulse', 84); useNote('pulse', 43); useNote('pulse2', 84); useNote('pulse2', 88);
useNote('glock', 91); useNote('glock', 72); useNote('harp', 48); useNote('harp', 86);
useNote('brass', 36); useNote('brass', 71); useNote('timp', 33); useNote('timp', 40);
useNote('marimba', 48); useNote('marimba', 72); useNote('sub', 24); useNote('thump', 36);

/* ==================================================================
   SEQUENCER
   ================================================================== */
var SEQ = {track:null, step:0, next:0, timer:null};
var LOOK = 0.3, TICK = 45;
function pump(){
  var T = SEQ.track; if(!T || !A) return;
  var spb = 60 / T.bpm / 4, total = T.bars * T.beats * 4;
  if(SEQ.next < A.currentTime) SEQ.next = A.currentTime + 0.06;
  var guard = 0;
  while(SEQ.next < A.currentTime + LOOK && guard++ < 400){
    var step = SEQ.step % total;
    var t = SEQ.next + (T.swing && step % 4 === 2 ? spb * T.swing : 0);
    for(var i = 0; i < T.parts.length; i++){
      var p = T.parts[i], e = p.map[step];
      if(!e) continue;
      if(p.drum){ play(p.drum, t, 0, (p.vel || 1) * e, {rate:p.rate || 1, mus:1}); continue; }
      var dur = e.len * spb * (p.gate === undefined ? 0.95 : p.gate);
      for(var k = 0; k < e.notes.length; k++){
        var mid = e.notes[k] + (p.oct || 0) * 12, v = (p.vel || 0.8) * e.vel;
        if(p.trem){
          /* Tremolo picking: a fresh attack every p.trem sixteenths rather
             than one held note. It is the whole sound of surf guitar and it
             costs nothing but more buffer sources. */
          var reps = Math.max(1, Math.round(e.len / p.trem)), st = p.trem * spb;
          for(var r = 0; r < reps; r++)
            play(p.inst, t + r * st, mid, v * (r ? 0.82 : 1), {dur:st * 0.92, pan:p.pan || 0, mus:1});
        } else play(p.inst, t, mid, v, {dur:dur, pan:p.pan || 0, mus:1});
      }
    }
    SEQ.next += spb; SEQ.step++;
  }
}


/* ==================================================================
   WHAT THE GAME ASKS FOR
   ================================================================== */
var ALIAS = {fight:'maintheme', menu:'overworld', victory:'hymn',
             surf:'reverbpoint', city:'overworld', desert:'garage', peaks:'overture'};
function trackByKey(k){
  for(var i = 0; i < TRACKS.length; i++) if(TRACKS[i].key === k) return TRACKS[i];
  return null;
}

/* Impact for everything except the shield, which keeps its arcade blip -
   a block is the one moment that wants to read as a game rather than as
   a fight. These four are not on the audition page because only the game
   needs them. */
BANKS.impact.heavy = function(t){
  play('whoosh', t, 0, 0.8, {rate:0.72});
  play('sub', t + 0.02, 28, 0.25, {dur:0.12});
};
BANKS.impact.grab = function(t){
  play('crack', t, 0, 0.45, {rate:0.85}); play('thump', t, 41, 0.5);
};
BANKS.impact.count = function(t){
  play('crack', t, 0, 0.45, {rate:1.5}); play('glock', t, 79, 0.55);
};
BANKS.impact.tick = function(t){ play('crack', t, 0, 0.3, {rate:2.0}); };

var FXMAP = {
  swing:['impact','swing'], heavy:['impact','heavy'], hit:['impact','hit'],
  big:['impact','smash'],   grab:['impact','grab'],   jump:['impact','jump'],
  roll:['impact','dodge'],  dodge:['impact','dodge'], item:['impact','item'],
  ko:['impact','ko'],       go:['impact','go'],       count:['impact','count'],
  tick:['impact','tick'],
  shield:['arcade','shield'], brk:['arcade','brk']
};
var FX_NEEDS = BANKS.impact.needs.concat(BANKS.arcade.needs).filter(
  function(k, i, all){ return all.indexOf(k) === i; });
function bankReady(b){
  var n = BANKS[b].needs;
  for(var i = 0; i < n.length; i++) if(!KIT[n[i]]) return false;
  return true;
}
/* This used to latch: one successful bake set fxWarm and the kiln was
   never asked again. Paired with the eviction above that made silence
   permanent - once the banks were gone nothing would rebuild them for
   the rest of the session. Ask the banks themselves instead, so a warm
   kit costs two array walks and a cold one gets refilled. */
var fxWarming = false;
function warmFx(){
  if(fxWarming || !actx()) return;
  if(bankReady('impact') && bankReady('arcade')) return;
  fxWarming = true;
  ensure(FX_NEEDS).then(function(){ fxWarming = false; },
                        function(){ fxWarming = false; });
}
/* Returns false if the sample kit is not hot yet, and the caller falls
   back to the oscillator sound it has always had. Nothing waits. */
function fire(kind){
  var m = FXMAP[kind];
  if(!m) return false;
  if(!bankReady(m[0])){ warmFx(); return false; }
  if(!actx()) return false;
  try { BANKS[m[0]][m[1]](A.currentTime + 0.005); } catch(e){ return false; }
  return true;
}

/* ---- which song, and when ---------------------------------------
   Neither "one theme per stage" nor "shuffle" is right on its own: a
   fixed theme means Kauai sounds identical the fourth time you play it,
   and a shuffle means nowhere sounds like anywhere. So a place gets its
   own music the first time you go there in a session, and after that it
   joins the shuffle with its own themes weighted heavily - you will
   still mostly hear the island music on the island, but not always, and
   never twice running. */
var STAGE_THEMES = {
  practice:['cabinet'],
  kauai:['reverbpoint','sunrise'], 'kauai-big':['reverbpoint','sunrise'],
  byu:['overworld','disco'],
  arizona:['garage','cabinet'],
  slc:['neon','lounge'],
  washington:['overture','nightshift'], cascades:['overture','nightshift'],
  california:['sunrise','neon']
};
var MATCH_POOL = [], MENU_POOL = [], MOMENT_POOL = [], TRACK_ON = {};
TRACKS.forEach(function(T){
  TRACK_ON[T.key] = true;
  var r = ROLE[T.key];
  if(r === 'Fights' || r === 'Stages') MATCH_POOL.push(T.key);
  else if(r === 'Moments') MOMENT_POOL.push(T.key);
  else MENU_POOL.push(T.key);
});
function enabledIn(list){
  return list.filter(function(k){ return TRACK_ON[k]; });
}
function ownThemes(key){
  var list = (STAGE_THEMES[key] || []).slice();
  var m = (typeof STAGE !== 'undefined' && STAGE && STAGE.music)
        ? (ALIAS[STAGE.music] || STAGE.music) : null;
  if(m && trackByKey(m) && list.indexOf(m) < 0) list.unshift(m);
  return enabledIn(list);
}
var seenStage = {}, lastPick = null, menuTurn = 0, momentTurn = 0;
function pickForStage(key){
  var own = ownThemes(key);
  if(own.length && !seenStage[key]){ seenStage[key] = 1; lastPick = own[0]; return own[0]; }
  seenStage[key] = 1;
  var pool = enabledIn(MATCH_POOL).slice();
  /* A stage's own songs are always candidates for that stage, whatever
     group they otherwise belong to - Provo's theme is the menu music, and
     leaving it out meant Provo almost never sounded like itself. */
  own.forEach(function(k){ if(pool.indexOf(k) < 0) pool.push(k); });
  if(!pool.length) pool = enabledIn(TRACKS.map(function(T){ return T.key; }));
  if(!pool.length) return null;
  // never twice running, as long as there is anything else to play
  if(pool.length > 1 && lastPick){
    var other = pool.filter(function(k){ return k !== lastPick; });
    if(other.length) pool = other;
  }
  var w = [], tot = 0, i;
  for(i = 0; i < pool.length; i++){
    var x = own.indexOf(pool[i]) >= 0 ? 4 : 1;
    w.push(x); tot += x;
  }
  var r = Math.random() * tot;
  for(i = 0; i < pool.length; i++){ r -= w[i]; if(r <= 0){ lastPick = pool[i]; return pool[i]; } }
  lastPick = pool[pool.length - 1];
  return lastPick;
}
/* Until a match has been played, the menu plays the main theme. It is
   the first thing anyone hears, and a rotation made that a coin toss -
   the game opened on whichever song menuTurn happened to be pointing
   at, and the one piece written to be the title music was filed under
   Moments where the menu never asked for it. After the first match the
   menu goes back to its own pool, so nobody hears the same song all
   evening. Turning it off in the Music tab still turns it off. */
var firstMenu = true;
function pickMenu(){
  if(firstMenu && TRACK_ON['maintheme'] && trackByKey('maintheme')) return 'maintheme';
  var p = enabledIn(MENU_POOL);
  if(!p.length) p = enabledIn(MATCH_POOL);
  return p.length ? p[menuTurn++ % p.length] : null;
}
function pickMoment(){
  var p = enabledIn(MOMENT_POOL);
  if(!p.length) p = enabledIn(MENU_POOL);
  return p.length ? p[momentTurn++ % p.length] : null;
}

/* MUS is kept in this shape because the video tools drive it by hand. */
var MUS = {name:null, want:null, timer:null, level:0};
var pending = null;

function begin(T){
  var a = actx(); if(!a) return;
  var t = a.currentTime;
  try {
    musBus.gain.cancelScheduledValues(t);
    musBus.gain.setValueAtTime(0.0001, t);
    musBus.gain.linearRampToValueAtTime(1, t + 0.35);
  } catch(e){}
  SEQ.track = T; SEQ.step = 0; SEQ.next = t + 0.12;
  MUS.name = T.key;
  pump();
  SEQ.timer = MUS.timer = setInterval(pump, TICK);
}
function musicStart(name){
  name = ALIAS[name] || name;
  var T = trackByKey(name);
  if(!T) return;
  musicStop(true);
  MUS.want = name;
  if(!actx()) return;
  var missing = T.needs.filter(function(k){ return !KIT[k]; });
  if(!missing.length){ begin(T); return; }
  /* Nothing waits for the kiln. The match starts silent and the music
     joins a moment later, which nobody notices; blocking the game on a
     render is the one outcome that is not allowed. */
  pending = name;
  ensure(T.needs).then(function(){
    if(pending === name && MUS.want === name) begin(T);
    if(pending === name) pending = null;
  }, function(){ if(pending === name) pending = null; });
}
/* The rumble. Stopping the sequencer only stops it *booking* notes:
   a pad is three and a half seconds long with two more of hall baked
   into it, so a dozen of them carry on ringing after the music is
   "off" - a low wash with no beat, which is exactly what it sounded
   like. Fade the bus over a fifth of a second, then hard-stop every
   source that was feeding it. */
function musicStop(quick){
  if(SEQ.timer){ clearInterval(SEQ.timer); SEQ.timer = null; }
  MUS.timer = null; MUS.name = null; MUS.want = null; pending = null;
  SEQ.track = null;
  if(!A || !musBus) return;
  var t = A.currentTime, f = quick ? 0.05 : 0.22;
  try {
    musBus.gain.cancelScheduledValues(t);
    musBus.gain.setValueAtTime(musBus.gain.value || 1, t);
    /* Linear, not exponential: an exponential ramp approaches zero and
       never arrives, so "off" was a ten-thousandth of a pad still
       going - inaudible on a laptop and a definite rumble on anything
       with a woofer. A linear ramp reaches true zero, and the
       setValueAtTime after it pins it there. */
    musBus.gain.linearRampToValueAtTime(0, t + f);
    musBus.gain.setValueAtTime(0, t + f + 0.001);
  } catch(e){}
  /* And then actually stop the sources, so they are not still being
     mixed at zero for the next five seconds. Scheduled on the audio
     clock at the end of the fade rather than from a setTimeout: a
     wall-clock timer racing an audio-clock fade lands in a different
     place every time, and stop() with no argument means "now", which
     during an offline render is a different "now" again. */
  var when = t + f + 0.02;
  for(var k = 0; k < MUSSRC.length; k++){
    try { MUSSRC[k].stop(when); } catch(e){}
  }
  MUSSRC.length = 0;
}

var matchTrack = null, menuTrack = null, momentTrack = null;
var audioEverRan = false;

/* The kiln is why the opening music comes in late. A browser will not make
   a sound until somebody presses something, which cannot be helped - but
   what happened after that press could: musicUpdate noticed on the next
   frame, asked for the main theme, found none of its samples baked, and
   only then started rendering them. The press and the bake were in series.

   This puts them in parallel. It is called from the same listener that
   unlocks the context, so the rendering starts on the press itself and is
   usually done by the time the context finishes resuming. */
var warmingMusic = false;
function musicWarm(){
  if(warmingMusic || !musicOn || !firstMenu) return;
  var T = trackByKey(ALIAS['maintheme'] || 'maintheme');
  if(!T) return;
  warmingMusic = true;
  ensure(T.needs).then(function(){ warmingMusic = false; },
                       function(){ warmingMusic = false; });
}
function musicUpdate(){
  /* The game opens on the menu, and the menu is drawn before anyone has
     pressed anything - so the first ask for music happened while the
     browser still had the speaker shut. That ask set MUS.want, and the
     early return below then matched it on every frame afterwards: the
     menu stayed silent even once a button press had unlocked the
     context, because as far as this function was concerned the right
     song was already playing. Once sound really is running, drop what
     was wanted and let the rest of this function ask again. */
  if(!audioEverRan && A && A.state === 'running'){
    audioEverRan = true;
    musicStop(true);
  }
  var want = null;
  if(typeof musicOn !== 'undefined' && musicOn){
    if(typeof results !== 'undefined' && results){
      if(!momentTrack) momentTrack = pickMoment();
      want = momentTrack;
    } else if(typeof paused !== 'undefined' && paused){
      if(!menuTrack) menuTrack = pickMenu();
      want = menuTrack;
    } else {
      if(!matchTrack) matchTrack = pickForStage(
        (typeof STAGE !== 'undefined' && STAGE) ? STAGE.key : null);
      want = matchTrack;
    }
  }
  if(typeof results === 'undefined' || !results) momentTrack = null;
  if(typeof paused === 'undefined' || !paused) menuTrack = null;
  if(want === MUS.want) return;
  if(!want){ musicStop(); return; }
  musicStart(want);
}

return {
  actx:actx, fxOut:fxOut, tapOut:tapOut, play:play, ensure:ensure,
  KIT:KIT, SPEC:SPEC, RACK:RACK, TRACKS:TRACKS, ROLE:ROLE, BANKS:BANKS,
  FXMAP:FXMAP, FX_NEEDS:FX_NEEDS, PROBLEMS:PROBLEMS, TALLY:TALLY,
  STAGE_THEMES:STAGE_THEMES, TRACK_ON:TRACK_ON, MUS:MUS, SEQ:SEQ,
  fire:fire, warmFx:warmFx, bankReady:bankReady, held:heldBytes, duck:duck,
  musicStart:musicStart, musicStop:musicStop, musicUpdate:musicUpdate, pump:pump,
  matchPlayed:function(){ firstMenu = false; },
  musicWarm:musicWarm,
  pickForStage:pickForStage,
  /* Play a song from the Music tab. It does NOT call musicStart: the
     game loop calls musicUpdate every frame and would pick the menu's
     own song straight back over the top of it, which is the trap the
     handoff warns about. Hand the menu the song instead and let
     musicUpdate start it, and it stays until the menu closes. Returns
     what is now playing so the tab can mark it. */
  preview:function(key){
    key = ALIAS[key] || key;
    if(!trackByKey(key)) return null;
    menuTrack = key;
    musicUpdate();
    return key;
  },
  nowPlaying:function(){ return MUS.want || null; },
  resetMatchTrack:function(){ matchTrack = null; },
  warm:function(name){
    var T = trackByKey(ALIAS[name] || name);
    return T ? ensure(T.needs) : Promise.resolve();
  },
  needsOf:function(name){
    var T = trackByKey(ALIAS[name] || name);
    return T ? T.needs.slice() : [];
  },
  setEnabled:function(k, v){ if(TRACK_ON[k] !== undefined) TRACK_ON[k] = !!v; },
  enabledList:function(){
    return TRACKS.filter(function(T){ return TRACK_ON[T.key]; })
                 .map(function(T){ return T.key; });
  },
  allKeys:function(){ return TRACKS.map(function(T){ return T.key; }); }
};
})();

/* ==================================================================
   WATSON'S FLOWERS - the effects, and how the game asks for sound.
   Everything below plays the samples SND bakes (no files). Until the
   kit is baked - it takes a second or so after the first tap - a sound
   falls through to a plain oscillator, so nothing is ever silent.
   ================================================================== */
var NEEDS = ['whoosh', 'crack', 'thump', 'glass', 'riser', 'sub', 'crash', 'glock', 'marimba', 'pop', 'boing',
             'slide', 'tamb', 'harp', 'brass', 'timp', 'pulse', 'chipnz'];
var ready = false, warming = false, muted = false;
function warm(){
  if(ready || warming || !SND.actx()) return;
  warming = true;
  SND.ensure(NEEDS).then(function(){ ready = true; warming = false; }, function(){ warming = false; });
}
function T(dt){ return SND.actx().currentTime + 0.01 + (dt || 0); }
function p(k, dt, midi, vel, opt){ SND.play(k, T(dt), midi, vel, opt); }
function arp(k, notes, step, vel, at){ notes.forEach(function(m, i){ p(k, (at || 0) + i * step, m, vel); }); }
var FX = {
  click: function(){ p('crack', 0, 0, 0.25, {rate: 2}); },
  crash: function(v){ p('crack', 0, 0, 1); p('thump', 0, 31, 1, {rate: 0.8}); p('sub', 0, 24, 0.9, {dur: 0.5}); p('glass', 0.02, 60, 0.8); p('crash', 0.01, 60, 0.6);
                      if(v > 35){ p('timp', 0.05, 33, 0.9); p('thump', 0.3, 28, 0.7); } },
  bump: function(v){ p('thump', 0, 40, Math.min(1, (v || 8) / 14)); if(v > 10) p('crack', 0, 0, 0.4, {rate: 0.9}); },
  dent: function(){ p('crack', 0, 0, 0.7, {rate: 0.85}); p('thump', 0, 44, 0.7); p('glass', 0.03, 72, 0.25); },
  wall: function(){ p('crack', 0, 0, 0.7, {rate: 0.7}); p('thump', 0, 38, 0.8);
                    for(var i = 0; i < 6; i++) p('pop', 0.05 + Math.random() * 0.35, 0, 0.4, {rate: 0.55 + Math.random() * 0.4}); },
  smash: function(){ p('pop', 0, 0, 0.6); p('crack', 0, 0, 0.35, {rate: 1.4}); },
  carhit: function(v){ p('crack', 0, 0, 0.8); p('thump', 0, 36, 0.8); p('glass', 0.02, 66, 0.5); if(v) p('crash', 0, 60, 0.35); },
  carbounce: function(){ p('thump', 0, 30, 0.55); p('crack', 0, 0, 0.3, {rate: 0.7}); },
  near: function(){ p('whoosh', 0, 0, 0.9, {rate: 0.9}); },
  toss: function(){ p('whoosh', 0, 0, 0.6, {rate: 1.7}); },
  perfect: function(){ arp('glock', [76, 79, 84, 88], 0.06, 0.6); arp('harp', [72, 79, 84], 0.04, 0.5, 0.05); },
  porch: function(){ arp('glock', [79, 84], 0.08, 0.55); },
  lawn: function(){ p('marimba', 0, 67, 0.6); },
  miss: function(){ p('slide', 0, 60, 0.6, {rate: 0.55}); p('boing', 0.25, 48, 0.5); },
  load: function(){ arp('marimba', [72, 79], 0.07, 0.6); },
  cash: function(){ p('glock', 0, 91, 0.5); p('glock', 0.06, 96, 0.5); },
  boost: function(){ p('riser', 0, 60, 0.45, {rate: 1.7}); },
  powder: function(){ p('riser', 0, 60, 0.6); p('crack', 0.5, 0, 0.6); },
  boom: function(){ p('thump', 0, 26, 1, {rate: 0.65}); p('sub', 0, 22, 1, {dur: 1}); p('crash', 0, 60, 0.9); p('glass', 0.05, 60, 0.6); p('timp', 0.1, 31, 0.9); },
  splash: function(){ p('whoosh', 0, 0, 0.8, {rate: 0.45}); p('chipnz', 0.03, 0, 0.35, {rate: 0.4}); },
  gooned: function(){ p('slide', 0, 60, 0.5, {rate: 1.3}); p('slide', 0.25, 60, 0.5, {rate: 0.6}); },
  bonk: function(){ p('boing', 0, 60, 0.7, {rate: 0.8}); p('pop', 0, 0, 0.5); },
  go: function(){ [58, 62, 65].forEach(function(m){ p('brass', 0, m, 0.7, {dur: 0.2}); });
                  [62, 65, 70].forEach(function(m){ p('brass', 0.22, m, 0.8, {dur: 0.5}); }); p('crash', 0.22, 60, 0.5); },
  count: function(){ p('crack', 0, 0, 0.4, {rate: 1.5}); p('glock', 0, 79, 0.5); },
  bell: function(){ arp('glock', [84, 88, 84], 0.12, 0.5); },
  ding: function(){ p('glock', 0, 88, 0.45); },
  rose: function(){ p('glock', 0, 96, 0.35); },
  ping: function(){ p('pulse', 0, 84, 0.4, {dur: 0.08}); p('pulse', 0.14, 84, 0.4, {dur: 0.08}); },
  cheer: function(){ p('tamb', 0, 0, 0.7); arp('glock', [84, 88, 91], 0.05, 0.4); p('whoosh', 0, 0, 0.4, {rate: 1.2}); },
  thud: function(){ p('thump', 0, 34, 0.7); },
  land: function(){ p('thump', 0, 30, 0.8); p('crack', 0, 0, 0.3, {rate: 0.8}); },
  water: function(){ p('chipnz', 0, 0, 0.3, {rate: 0.9}); p('whoosh', 0, 0, 0.35, {rate: 0.7}); },
  harvest: function(){ arp('harp', [72, 76, 79, 84], 0.04, 0.5); },
  stem: function(){ p('pop', 0, 0, 0.35, {rate: 1.3}); p('marimba', 0, 84, 0.25); },
  done: function(){ arp('harp', [67, 71, 74, 79, 83], 0.035, 0.55); p('glock', 0.18, 88, 0.45); },
  goons: function(){ arp('pulse', [67, 66, 65, 64], 0.15, 0.35); },
  haboob: function(){ p('riser', 0, 60, 0.6, {rate: 0.5}); p('sub', 0, 26, 0.8, {dur: 2}); },
  end: function(){ arp('brass', [60, 64, 67, 72], 0.14, 0.7); p('crash', 0.42, 60, 0.5); }
};
/* the plain sound under each, for before the kit is baked */
var OSC = {
  crash: [70, 35, 0.5, 'sine', 0.6], bump: [90, 50, 0.15, 'sine', 0.3], dent: [120, 60, 0.15, 'square', 0.15], wall: [140, 60, 0.3, 'square', 0.15],
  smash: [400, 200, 0.1, 'triangle', 0.1], carhit: [90, 45, 0.3, 'sine', 0.4], near: [300, 1200, 0.3, 'sine', 0.06], toss: [500, 1500, 0.2, 'sine', 0.06],
  perfect: [784, 1568, 0.3, 'triangle', 0.15], porch: [659, 988, 0.25, 'triangle', 0.12], lawn: [440, 440, 0.2, 'triangle', 0.1],
  miss: [330, 200, 0.5, 'sawtooth', 0.08], load: [660, 880, 0.15, 'sine', 0.1], cash: [2637, 3136, 0.2, 'sine', 0.06], boom: [55, 28, 1.2, 'sine', 0.7],
  go: [880, 1320, 0.5, 'square', 0.1], count: [660, 660, 0.15, 'square', 0.1], bonk: [220, 110, 0.15, 'square', 0.12], gooned: [600, 200, 0.4, 'square', 0.06],
  ding: [1568, 1568, 0.3, 'sine', 0.06], click: [880, 880, 0.05, 'square', 0.05]
};
function osc(kind){
  var o = OSC[kind]; var a = SND.actx(); if(!o || !a) return;
  var t = a.currentTime, os = a.createOscillator(), g = a.createGain();
  os.type = o[3]; os.frequency.setValueAtTime(o[0], t); os.frequency.exponentialRampToValueAtTime(Math.max(30, o[1]), t + o[2]);
  g.gain.setValueAtTime(o[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + o[2]);
  os.connect(g); g.connect(SND.fxOut()); os.start(t); os.stop(t + o[2] + 0.05);
}
var last = {};
function fx(kind, v){
  if(muted || !SND.actx() || SND.actx().state !== 'running') return;
  var now = performance.now();
  if(last[kind] && now - last[kind] < 45) return;
  last[kind] = now;
  if(!ready){ warm(); osc(kind); return; }
  try { if(FX[kind]) FX[kind](v); } catch(e){}
}
/* A browser makes no sound until somebody touches this device. Every
   page calls unlock() from its first tap or key press. */
function unlock(){
  var a = SND.actx(); if(!a) return;
  try { if(navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
  if(a.state === 'suspended') a.resume();
  // iPads: a one-sample sound inside the tap
  try { var b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); } catch(e){}
  warm();
}
var song = null;
function music(name){
  if(name === song) return;
  song = name;
  if(!name){ SND.musicStop(); return; }
  if(!muted && SND.actx() && SND.actx().state === 'running') SND.musicStart(name);
}
root.WSound = {
  unlock: unlock, fx: fx, music: music,
  ctx: function(){ return SND.actx(); },
  out: function(){ return SND.fxOut(); },
  on: function(){ var a = SND.actx(); return !!a && a.state === 'running'; },
  ready: function(){ return ready; },
  mute: function(m){ muted = !!m; if(muted) SND.musicStop(); else if(song){ var s = song; song = null; music(s); } },
  muted: function(){ return muted; },
  // once the speaker is unlocked, start whatever was asked for before it was
  kick: function(){ if(song && !muted && SND.MUS.want !== song && SND.actx() && SND.actx().state === 'running') SND.musicStart(song); }
};

root.SND = SND;
})(typeof window !== "undefined" ? window : globalThis);
