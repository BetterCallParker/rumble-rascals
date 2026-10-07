// Rumble Rascals web client.
import * as THREE from 'three';
import { DT, BTN, ST, PHASE, COLORS, MAX_PLAYERS } from '/shared/constants.js';
import { ARENA, ballPosition } from '/shared/arena.js';
import { ITEMS } from '/shared/items.js';
import { Input, PAD } from './input.js';
import { Net } from './net.js';
import { Rascal } from './character.js';
import { buildItem } from './props.js';
import { buildArena } from './arena.js';
import { ComicPost } from './post.js';
import { FX } from './fx.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Predictor } from './predict.js';
import { skyTexture } from './toon.js';

// ------------------------------------------------------------------ renderer / scene
const canvas = document.getElementById('game');
const QUALITY = new URL(location.href).searchParams.get('q') || 'high'; // ?q=low for weaker machines
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(QUALITY === 'low' ? Math.min(window.devicePixelRatio || 1, 1) * 0.75 : Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = QUALITY !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x7cc4ff, 1);

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xbcd8ff, 110, 300);
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 600);
camera.position.set(0, 22, 26);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a6f9a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.position.set(14, 30, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

const arena = buildArena(scene);
const post = new ComicPost(renderer);
const fx = new FX(scene, camera);
const hud = new Hud();
const sfx = new Sfx();
const input = new Input();

// ------------------------------------------------------------------ game state
const roster = new Map(); // id -> {id,name,color,dummy,ready,wins,kos,client}
const views = new Map(); // id -> Rascal
const propViews = new Map(); // id -> {group, inner, kind, spin, axis}
const joinedSlots = new Map(); // slot -> playerId
const pendingJoins = new Set(); // slots waiting for server
const local = new Map(); // playerId -> local player info
let started = false;
let welcomed = false;
let roomCode = 'MAIN';
let playerName = '';
let seq = 0;
let inputAcc = 0;
let freezeT = 0;
let speedT = 0;
let impactT = 0;
let lastSample = null;
let full = false;

const net = new Net({
  onWelcome(m) {
    welcomed = true;
    roomCode = m.room;
    hud.show();
    hud.setRoom(m.room);
    const url = new URL(location.href);
    url.searchParams.set('room', m.room);
    history.replaceState(null, '', url);
    for (const slot of pendingJoins) net.send({ t: 'join', slot, name: joinedName(slot) });
  },
  onRoster(m) {
    const ids = new Set();
    for (const r of m.players) {
      ids.add(r.id);
      roster.set(r.id, r);
      if (!views.has(r.id)) {
        const v = new Rascal(r.dummy ? 0 : r.color, r.dummy);
        scene.add(v.root);
        views.set(r.id, v);
      }
    }
    for (const id of [...roster.keys()]) {
      if (!ids.has(id)) {
        roster.delete(id);
        const v = views.get(id);
        if (v) {
          scene.remove(v.root);
          v.dispose();
          views.delete(id);
        }
        if (local.has(id)) {
          const L = local.get(id);
          joinedSlots.delete(L.slot);
          local.delete(id);
        }
      }
    }
    full = [...roster.values()].filter((r) => !r.dummy).length >= MAX_PLAYERS;
  },
  onJoined(m) {
    pendingJoins.delete(m.slot);
    joinedSlots.set(m.slot, m.id);
    const used = new Set([...local.values()].map((l) => l.n));
    let n = 1;
    while (used.has(n)) n++;
    const raw = input.read(m.slot);
    local.set(m.id, {
      id: m.id, slot: m.slot, n, label: 'P' + n, pred: new Predictor(m.id),
      suppress: raw.b, prevB: raw.b, lastInput: raw, predAct: null,
      renderPos: null, err: new THREE.Vector3(), wasPred: false,
    });
    sfx.play('join');
    hud.word(`P${n} JOINED!`, null, { sx: window.innerWidth / 2, sy: window.innerHeight * 0.62, size: 40 });
  },
  onFull(m) {
    pendingJoins.delete(m.slot);
    hud.word('ROOM FULL!', null, { sx: window.innerWidth / 2, sy: window.innerHeight / 2, size: 54 });
  },
  onSnapshot(s) {
    for (const [id, L] of local) {
      const sp = s.players.find((p) => p.id === id);
      L.pred.reconcile(sp, s);
      L.server = sp;
    }
  },
  onClose() {
    hud.announce('DISCONNECTED!', 'Refresh to reconnect', 'big');
  },
});

function joinedName(slot) {
  const firstLocal = joinedSlots.size === 0 && [...pendingJoins][0] === slot;
  return firstLocal ? playerName : '';
}

function requestJoin(slot) {
  if (joinedSlots.has(slot) || pendingJoins.has(slot) || full) return;
  pendingJoins.add(slot);
  if (welcomed) net.send({ t: 'join', slot, name: joinedName(slot) });
}

// ------------------------------------------------------------------ title screen
const titleEl = document.getElementById('title');
const nameIn = document.getElementById('name');
const roomIn = document.getElementById('room');
try {
  nameIn.value = localStorage.getItem('rr_name') || '';
} catch { /* storage blocked */ }
roomIn.value = (new URL(location.href).searchParams.get('room') || '').toUpperCase();

function startGame(autoSlot) {
  if (started) return;
  started = true;
  sfx.unlock();
  playerName = nameIn.value.trim().slice(0, 14);
  try {
    localStorage.setItem('rr_name', playerName);
  } catch { /* storage blocked */ }
  const room = (roomIn.value || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MAIN';
  titleEl.classList.add('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (autoSlot) pendingJoins.add(autoSlot);
  net.connect(room, playerName);
}
document.getElementById('play').addEventListener('click', () => startGame(null));
for (const inp of [nameIn, roomIn]) {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startGame('kb');
    }
  });
}
input.onActivity(() => sfx.unlock());
window.addEventListener('pointerdown', () => sfx.unlock());

// ------------------------------------------------------------------ menu-ish input (join, help)
function handleMeta() {
  const pads = input.pads();
  if (!started) {
    const tp = document.getElementById('titlepads');
    if (pads.length && !tp.dataset.found) {
      tp.dataset.found = '1';
      tp.replaceChildren(document.createTextNode(`${pads.length} controller(s) found - press `), Object.assign(document.createElement('b'), { textContent: 'A' }), document.createTextNode(' to play!'));
    }
    for (const gp of pads) {
      if (input.padJustPressed(gp.index, PAD.A) || input.padJustPressed(gp.index, PAD.MENU)) {
        startGame('gp:' + gp.index);
        return;
      }
    }
    if (input.keyJustPressed('Enter') && document.activeElement !== nameIn && document.activeElement !== roomIn) startGame('kb');
    return;
  }
  if (input.keyJustPressed('KeyH') || input.keyJustPressed('F1')) hud.toggleHelp();
  if (input.keyJustPressed('Escape')) hud.toggleHelp(false);
  for (const gp of pads) {
    const slot = 'gp:' + gp.index;
    if (input.padJustPressed(gp.index, PAD.VIEW)) hud.toggleHelp();
    if (!joinedSlots.has(slot) && (input.padJustPressed(gp.index, PAD.A) || input.padJustPressed(gp.index, PAD.MENU))) requestJoin(slot);
  }
  if (!joinedSlots.has('kb') && input.keyJustPressed('Enter')) requestJoin('kb');

  const prompts = [];
  if (!full) {
    for (const gp of pads) {
      const slot = 'gp:' + gp.index;
      if (!joinedSlots.has(slot)) prompts.push(`Controller ${gp.index + 1}: press *A* to join!`);
    }
    if (!joinedSlots.has('kb')) prompts.push('Keyboard: press *ENTER* to join!');
  }
  if (!pads.length && joinedSlots.size === 0) prompts.push('Plug in an Xbox controller *+* press A');
  hud.updateJoin(prompts);
}

// ------------------------------------------------------------------ fixed-rate input sampling
function sampleInputs() {
  seq++;
  const rows = [];
  const latest = net.latest();
  for (const [slot, id] of joinedSlots) {
    const L = local.get(id);
    if (!L) continue;
    const inp = input.read(slot);
    if (L.suppress) {
      L.suppress &= inp.b;
      inp.b &= ~L.suppress;
    }
    const pressed = inp.b & ~L.prevB;
    L.prevB = inp.b;
    L.lastInput = inp;
    rows.push([id, seq, inp.mx, inp.mz, inp.b]);
    L.pred.addInput({ seq, mx: inp.mx, mz: inp.mz, b: inp.b });
    if (pressed & (BTN.ATTACK | BTN.KICK)) predictAction(L, pressed, latest);
  }
  if (rows.length) net.send({ t: 'in', d: rows });
}

// Start attack animations immediately on button press (server confirms ~1 RTT later)
function predictAction(L, pressed, snap) {
  const sp = L.server;
  if (!sp || !snap || !sp.pr || (sp.s !== ST.FREE && sp.s !== ST.BLOCK)) return;
  if (sp.gm === 3) return;
  let item = '';
  let kind;
  let mirror = 0;
  const pr = sp.h >= 0 ? snap.props.find((p) => p.id === sp.h) : null;
  const def = pr ? ITEMS[pr.k] : null;
  if (pressed & BTN.ATTACK) {
    if (sp.g >= 0) return; // throws / pummels come from the server
    if (def && def.type === 'heavy') return;
    if (def && def.type === 'weapon') {
      kind = def.swing.style === 'slam' ? 'slam' : 'swing';
      item = pr.k;
      mirror = sp.hh === 1 ? 1 : 0;
    } else kind = 'jab1';
  } else {
    if (def && def.type === 'heavy') return;
    kind = sp.og ? 'kick' : 'dk';
  }
  const d = item ? ITEMS[item].swing : { jab1: { wind: 3, active: 4, rec: 9 }, kick: { wind: 6, active: 5, rec: 14 }, dk: { wind: 4, active: 46, rec: 0 } }[kind];
  L.predAct = { k: kind, seq, t0: performance.now(), w: d.wind, a: d.active, r: d.rec, item, mirror };
}

// ------------------------------------------------------------------ interpolation
function byId(list, key) {
  if (!list[key]) {
    const m = new Map();
    for (const p of list) m.set(p.id, p);
    list[key] = m;
  }
  return list[key];
}
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function interpolate(t) {
  const br = net.bracket(t);
  if (!br) return null;
  const [A, B, alpha, extra] = br;
  const pa = byId(A.players, '_m');
  const states = new Map();
  for (const b of B.players) {
    const a = pa.get(b.id);
    const s = { ...b };
    if (a && a.s !== ST.DEAD && b.s !== ST.DEAD && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 5) {
      s.x = lerp(a.x, b.x, alpha);
      s.y = lerp(a.y, b.y, alpha);
      s.z = lerp(a.z, b.z, alpha);
      s.vx = lerp(a.vx, b.vx, alpha);
      s.vy = lerp(a.vy, b.vy, alpha);
      s.vz = lerp(a.vz, b.vz, alpha);
      s.f = lerpAngle(a.f, b.f, alpha);
      if (a.s === b.s) s.st = lerp(a.st, b.st, alpha);
      if (a.a && b.a && a.a[0] === b.a[0] && b.a[1] >= a.a[1]) {
        s.a = b.a.slice();
        s.a[1] = lerp(a.a[1], b.a[1], alpha);
      }
      if (b.ko > 0 && a.ko > 0) s.ko = lerp(a.ko, b.ko, alpha);
    }
    if (extra > 0) {
      const e = Math.min(extra, 0.1);
      s.x += s.vx * e;
      s.z += s.vz * e;
      if (!s.og) s.y += s.vy * e;
    }
    states.set(b.id, s);
  }
  const pp = byId(A.props, '_m');
  const props = new Map();
  for (const b of B.props) {
    const a = pp.get(b.id);
    const s = { ...b };
    if (a && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 6) {
      s.x = lerp(a.x, b.x, alpha);
      s.y = lerp(a.y, b.y, alpha);
      s.z = lerp(a.z, b.z, alpha);
    }
    props.set(b.id, s);
  }
  return { states, props, snap: B };
}

// ------------------------------------------------------------------ events -> effects
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const HIT_COLORS = { punch: 0xffe14d, kick: 0xff8a00, weapon: 0x2fd4ff, throw: 0xef2f2a, ball: 0xffffff, body: 0xffe14d, shock: 0xffffff, prop: 0xffe14d, explode: 0xff8a00 };
const SFX_COLORS = { wood: 0xff9420, metal: 0x2fd4ff, pan: 0xffffff, slap: 0xff6fb5, rubber: 0x5ccf3a };
const PROP_COLORS = {
  bat: [0xe8322c, 0x20161a, 0xffffff], hammer: [0x6d6a80, 0xc28a4a], pan: [0x2b2b33, 0x505060], fish: [0x4fb3d9, 0xd9f4ff],
  sign: [0xd81e1e, 0x9a98ab], wrench: [0xa9b0c4, 0xe8322c], crate: [0xc98b45, 0x8a5524], barrel: [0xe8322c, 0x5a5a68], tire: [0x26232e],
};

function isLocal(id) {
  return local.has(id);
}
function rumble(id, strong, weak, ms) {
  const L = local.get(id);
  if (L) input.rumble(L.slot, strong, weak, ms);
}
function playerPos(id, out) {
  const v = views.get(id);
  if (v) return out.copy(v.root.position);
  return null;
}
function screenOf(pos) {
  tmp2.copy(pos).project(camera);
  return [tmp2.x * 0.5 + 0.5, tmp2.y * 0.5 + 0.5];
}
function bigMoment(pos, power, impact = 0) {
  const [sx, sy] = screenOf(pos);
  post.uniforms.uSpeedCenter.value.set(sx, sy);
  speedT = Math.max(speedT, Math.min(0.45, 0.12 + power * 0.012));
  if (impact) impactT = Math.max(impactT, impact);
  freezeT = Math.max(freezeT, Math.min(0.11, power * 0.0035));
}

function onEvent(e) {
  switch (e.e) {
    case 'hit': {
      const pos = tmp.set(e.x, e.y, e.z).clone();
      const p = e.p || 5;
      const v = views.get(e.v);
      if (v) v.hitFlash(p);
      const color = e.k === 'weapon' || e.k === 'throw' ? SFX_COLORS[e.sfx] || HIT_COLORS[e.k] : HIT_COLORS[e.k] || 0xffe14d;
      if (e.k === 'explode') {
        cam.addTrauma(0.25);
        break;
      }
      fx.impact(pos.x, pos.y, pos.z, e.pm ? p * 0.6 : p, color, e.dx || e.dz ? [e.dx, e.dz] : null);
      if (e.w) hud.word(e.w, pos, { size: Math.round(30 + Math.min(62, p * 2.3)), spikes: p > 16 ? 16 : 11 });
      cam.addTrauma(Math.min(0.85, 0.1 + p * 0.028));
      cam.punch(pos, Math.min(1, p / 25));
      if (p > 15 && !e.pm) bigMoment(pos, p, (e.c || 0) > 0.85 || p > 32 ? 0.06 : 0);
      if (p > 13) {
        const vp = playerPos(e.v, tmp2);
        if (vp) fx.dust(vp.x, vp.y, vp.z, 5, 1.1, 0.6);
      }
      const snd = e.k === 'punch' ? 'punch' : e.k === 'kick' ? 'kick' : e.k === 'ball' ? 'ball' : e.k === 'body' ? 'bounce' : e.k === 'shock' ? 'land' : e.k === 'prop' ? e.sfx || 'clunk' : e.sfx || 'punch';
      sfx.play(snd, p);
      if (isLocal(e.v)) rumble(e.v, Math.min(1, 0.35 + p * 0.03), 0.6, 120 + p * 8);
      if (isLocal(e.a)) rumble(e.a, 0.2, Math.min(1, 0.3 + p * 0.03), 90);
      if (Math.random() < 0.25 && v) fx.sweat(v.root.position.x, v.root.position.y + 1.9, v.root.position.z);
      break;
    }
    case 'whoosh':
      sfx.play(e.k === 'hay' || e.k === 'dk' || e.c > 0.5 || e.k === 'slam' ? 'bigwhoosh' : 'whoosh', 10 + (e.c || 0) * 10);
      break;
    case 'jump': {
      const p = playerPos(e.id, tmp);
      if (p) fx.dust(p.x, p.y, p.z, 4, 0.6, 0.4);
      if (isLocal(e.id) || Math.random() < 0.4) sfx.play('jump');
      break;
    }
    case 'land': {
      const p = playerPos(e.id, tmp);
      if (p) fx.dust(p.x, p.y, p.z, 6, 0.9, 0.5);
      sfx.play('land', e.s);
      break;
    }
    case 'bounce': {
      fx.dust(e.x, e.y, e.z, 7, 1.2, 0.65);
      sfx.play('bounce', e.s);
      cam.addTrauma(Math.min(0.4, e.s * 0.02));
      if (e.s > 11) hud.word(Math.random() < 0.5 ? 'THUD!' : 'BONK!', tmp.set(e.x, e.y + 0.5, e.z), { size: 30 });
      break;
    }
    case 'splat':
      fx.impact(e.x, e.y, e.z, 12, 0xff6fb5);
      hud.word('SPLAT!', tmp.set(e.x, e.y, e.z), { size: 48, colors: ['#ff6fb5', '#ffffff'] });
      sfx.play('splat');
      cam.addTrauma(0.45);
      break;
    case 'block':
      fx.impact(e.x, e.y, e.z, 4, 0x2f6cf0);
      hud.word('BLOCK!', tmp.set(e.x, e.y, e.z), { size: 30, colors: ['#ffffff', '#2f6cf0'] });
      sfx.play('block');
      if (isLocal(e.v)) rumble(e.v, 0.2, 0.3, 70);
      break;
    case 'parry':
      fx.impact(e.x, e.y, e.z, 18, 0x2fd4ff);
      hud.word('PARRY!', tmp.set(e.x, e.y, e.z), { size: 64, colors: ['#2fd4ff', '#ffffff'], spikes: 16 });
      sfx.play('parry');
      hud.flash(0.35);
      cam.addTrauma(0.4);
      bigMoment(tmp.set(e.x, e.y, e.z), 18);
      break;
    case 'guardbreak':
      fx.impact(e.x, e.y, e.z, 20, 0xef2f2a);
      hud.word('GUARD BREAK!', tmp.set(e.x, e.y, e.z), { size: 58, colors: ['#ffffff', '#ef2f2a'], spikes: 16 });
      sfx.play('guardbreak');
      cam.addTrauma(0.55);
      bigMoment(tmp.set(e.x, e.y, e.z), 20, 0.06);
      break;
    case 'grab':
      sfx.play('grab');
      hud.word(e.dr ? 'YOINK!' : 'GOTCHA!', tmp.set(e.x, e.y + 0.4, e.z), { size: 30, colors: ['#ffffff', '#2fd4b8'] });
      if (isLocal(e.v)) rumble(e.v, 0.4, 0.4, 120);
      break;
    case 'lift': {
      sfx.play('lift');
      const p = playerPos(e.a, tmp);
      if (p) hud.word('UPSY-DAISY!', p.add(new THREE.Vector3(0, 3.2, 0)), { size: 32, colors: ['#ffd21f', '#9b5cf0'] });
      break;
    }
    case 'throw':
      sfx.play('throw');
      if (e.w) hud.word(e.w, tmp.set(e.x, e.y, e.z), { size: e.lf ? 52 : 36, colors: ['#ffffff', '#ff8a00'] });
      if (e.v !== undefined) cam.addTrauma(0.3);
      if (isLocal(e.a)) rumble(e.a, 0.5, 0.3, 120);
      break;
    case 'escape':
      sfx.play(e.w === 'WAKE UP!' ? 'wake' : 'escape');
      hud.word(e.w, tmp.set(e.x, e.y, e.z), { size: 36, colors: ['#ffffff', '#5ccf3a'] });
      fx.dust(e.x, e.y - 1.4, e.z, 6, 1, 0.5);
      break;
    case 'pickup': {
      sfx.play('pickup');
      const p = playerPos(e.id, tmp);
      if (p && ITEMS[e.k]) hud.word(ITEMS[e.k].label + '!', p.add(new THREE.Vector3(0, 2.6, 0)), { size: 24, plain: true, colors: ['#ffd21f'] });
      break;
    }
    case 'break':
      fx.debris(e.x, e.y, e.z, PROP_COLORS[e.k] || [0xc98b45], 14, 12, 0);
      fx.dust(e.x, e.y - 0.3, e.z, 5, 1, 0.6);
      hud.word(e.w, tmp.set(e.x, e.y, e.z), { size: 44 });
      sfx.play('break');
      cam.addTrauma(0.3);
      break;
    case 'explode': {
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      fx.explosion(e.x, e.y, e.z);
      hud.word(e.w, pos, { size: 96, colors: ['#ffd21f', '#ef2f2a'], spikes: 18, dur: 1.2 });
      hud.flash(0.7);
      cam.addTrauma(1);
      bigMoment(pos, 30, 0.1);
      sfx.play('boom');
      for (const id of local.keys()) {
        const p = playerPos(id, tmp2);
        if (p && p.distanceTo(pos) < 9) rumble(id, 1, 1, 450);
      }
      break;
    }
    case 'knockout': {
      const pos = new THREE.Vector3(e.x, e.y, e.z);
      hud.word('KNOCKOUT!', pos, { size: 76, colors: ['#ffffff', '#9b5cf0'], spikes: 18, dur: 1.3 });
      fx.impact(e.x, e.y, e.z, 22, 0x9b5cf0);
      sfx.play('knockout');
      cam.addTrauma(0.7);
      bigMoment(pos, 26, 0.1);
      hud.flash(0.4);
      if (isLocal(e.id)) rumble(e.id, 1, 0.8, 500);
      break;
    }
    case 'wake':
      hud.word('HUH?!', tmp.set(e.x, e.y, e.z), { size: 30, plain: true, colors: ['#ffffff'] });
      sfx.play('wake');
      break;
    case 'out': {
      const r = roster.get(e.id);
      const pos = new THREE.Vector3(e.x, Math.max(e.y, -6), e.z);
      hud.word('RING OUT!', pos, { size: 80, colors: ['#ef2f2a', '#ffd21f'], spikes: 18, dur: 1.4 });
      sfx.play('out');
      cam.addTrauma(0.5);
      if (r && !r.dummy) {
        const by = roster.get(e.by);
        hud.announce(`${r.name.toUpperCase()} IS OUTTA HERE!`, by ? `KO by ${by.name}` : '', 'small');
      }
      if (isLocal(e.id)) rumble(e.id, 0.8, 0.8, 600);
      break;
    }
    case 'spawn':
      fx.dust(e.x, e.y, e.z, 9, 1.3, 0.8);
      break;
    case 'drop':
      fx.dropMarker(e.x, e.y, e.z, 1.7);
      sfx.play('drop');
      break;
    case 'clunk':
      sfx.play('clunk', e.s * 2);
      if (e.s > 6) fx.dust(e.x, e.y - 0.4, e.z, 4, 0.7, 0.4);
      break;
    case 'taunt': {
      const p = playerPos(e.id, tmp);
      if (p) hud.word(e.w, p.add(new THREE.Vector3(0, 2.8, 0)), { size: 34, colors: ['#ffffff', '#ff6fb5'] });
      sfx.play('taunt');
      break;
    }
    case 'dodge': {
      const p = playerPos(e.id, tmp);
      if (p) fx.dust(p.x, p.y, p.z, 5, 0.8, 0.45);
      sfx.play('dodge');
      break;
    }
    case 'chargeFull': {
      sfx.play('chargeFull');
      const p = playerPos(e.id, tmp);
      if (p) fx.impact(p.x, p.y + 1.2, p.z, 6, 0xffffff);
      if (isLocal(e.id)) rumble(e.id, 0.1, 0.5, 100);
      break;
    }
    case 'slam':
      fx.shockwave(e.x, e.y, e.z, 2.6 + (e.c || 0) * 1.4, 0xffe14d);
      fx.dust(e.x, e.y, e.z, 10, 1.6, 0.8);
      fx.debris(e.x, e.y + 0.1, e.z, [0xe8342c, 0xffcc1f], 8, 8, e.y);
      cam.addTrauma(0.5);
      sfx.play('land', 18);
      break;
    case 'announce':
      hud.announce(e.text, e.sub, e.style);
      if (e.style === 'count') sfx.play('beep');
      else if (e.style === 'go') {
        sfx.play('go');
        hud.flash(0.5);
        cam.addTrauma(0.4);
      } else if (e.style === 'win' || e.style === 'champ') sfx.play('win');
      break;
    case 'roundWin':
    case 'champ': {
      const p = playerPos(e.id, tmp);
      if (p) fx.confetti(p.x, p.y + 2, p.z, e.e === 'champ' ? 140 : 70);
      break;
    }
  }
}

function processEvents(t) {
  for (const s of net.snaps) {
    if (s.done || s.time > t) continue;
    s.done = true;
    for (const e of s.ev) {
      try {
        onEvent(e);
      } catch (err) {
        console.error('event', e, err);
      }
    }
  }
}

// ------------------------------------------------------------------ camera rig
const cam = {
  target: new THREE.Vector3(0, 0, 1),
  dist: 26,
  trauma: 0,
  kick: new THREE.Vector3(),
  time: 0,
  addTrauma(v) {
    this.trauma = Math.min(1, this.trauma + v);
  },
  punch(pos, k) {
    tmp2.copy(pos).sub(camera.position).normalize().multiplyScalar(k * 0.6);
    this.kick.add(tmp2);
  },
  update(dt, points) {
    this.time += dt;
    let cx = 0, cz = 0, cy = 0, n = 0;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of points) {
      cx += p.x; cz += p.z; cy += p.y; n++;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    if (!n) { cx = 0; cz = 0; n = 1; minX = maxX = 0; minZ = maxZ = 0; }
    const mid = new THREE.Vector3((minX + maxX) / 2, Math.min(3, Math.max(0, cy / n)), (minZ + maxZ) / 2 + 0.5);
    const spread = Math.max(maxX - minX, (maxZ - minZ) * 1.5);
    const wantDist = Math.min(40, Math.max(12.5, 10 + spread * 0.95));
    const k = 1 - Math.exp(-dt * 3.2);
    this.target.lerp(mid, k);
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * 2.2));
    const pitch = 0.92; // ~53 degrees down
    camera.position.set(this.target.x, this.target.y + Math.sin(pitch) * this.dist, this.target.z + Math.cos(pitch) * this.dist);
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma;
    const t = this.time * 40;
    camera.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.35 * sh;
    camera.position.y += (Math.sin(t * 1.7) + Math.sin(t * 3.1)) * 0.3 * sh;
    camera.position.add(this.kick);
    this.kick.multiplyScalar(Math.exp(-dt * 10));
    camera.lookAt(this.target.x, this.target.y + 0.6, this.target.z);
    camera.rotateZ((Math.sin(t * 0.9) * 0.02) * sh);
    sun.position.set(this.target.x + 14, 30, this.target.z + 16);
    sun.target.position.set(this.target.x, 0, this.target.z);
  },
};

// ------------------------------------------------------------------ props
function updateProps(sample, dt) {
  const seen = new Set();
  for (const [id, ps] of sample.props) {
    seen.add(id);
    let v = propViews.get(id);
    if (!v) {
      const g = new THREE.Group();
      const inner = buildItem(ps.k);
      g.add(inner);
      scene.add(g);
      v = { group: g, inner, kind: ps.k, def: ITEMS[ps.k], spin: 0, rest: Math.random() * Math.PI * 2, roll: 0 };
      propViews.set(id, v);
    }
    const def = v.def;
    const heavy = def.type === 'heavy';
    const holder = ps.s === 1 ? views.get(ps.o) : null;
    const hs = holder ? sample.states.get(ps.o) : null;
    if (holder && hs && hs.s !== ST.DEAD) {
      const anchor = heavy ? holder.overhead : holder.handAnchor(hs.hh);
      if (v.group.parent !== anchor) anchor.add(v.group);
      v.group.position.set(0, 0, 0);
      v.group.quaternion.identity();
      if (!heavy) v.group.rotation.set(Math.PI, 0, 0);
      else if (v.kind === 'tire') v.group.rotation.set(Math.PI / 2, 0, 0);
      v.inner.position.y = 0;
      continue;
    }
    if (v.group.parent !== scene) scene.add(v.group);
    v.group.position.set(ps.x, ps.y, ps.z);
    const sp = Math.hypot(ps.vx, ps.vy, ps.vz);
    if (heavy) v.inner.position.y = 0;
    else v.inner.position.y = -(def.len || 1) * 0.5;
    if (ps.s === 2 && sp > 2) {
      // spinning through the air
      v.spin += dt * (heavy ? 9 : 16);
      const h = Math.hypot(ps.vx, ps.vz) || 1;
      tmp.set(ps.vz / h, 0, -ps.vx / h);
      v.group.quaternion.setFromAxisAngle(tmp, v.spin);
      if (!heavy) v.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    } else {
      // resting: weapons lie flat, heavy things sit / roll
      const h = Math.hypot(ps.vx, ps.vz);
      if (heavy) {
        v.roll += dt * h * 2;
        if (v.kind === 'barrel' || v.kind === 'tire') {
          v.group.rotation.set(v.kind === 'tire' ? Math.PI / 2 : 0, v.rest, 0);
          if (h > 0.5) v.group.rotation.set(Math.PI / 2, Math.atan2(ps.vx, ps.vz), v.roll, 'YXZ');
        } else v.group.rotation.set(0, v.rest, 0);
      } else {
        v.group.rotation.set(0, v.rest, Math.PI / 2, 'YXZ');
        v.group.position.y = ps.y - def.r * 0.55;
      }
    }
    // fuse blink
    if (ps.f) v.group.visible = Math.floor(performance.now() / 70) % 2 === 0;
    else v.group.visible = true;
  }
  for (const [id, v] of propViews) {
    if (!seen.has(id)) {
      v.group.parent && v.group.parent.remove(v.group);
      propViews.delete(id);
    }
  }
}

// ------------------------------------------------------------------ per-frame player render state
const P_ATTACK_KINDS = new Set(['swing', 'slam', 'hay', 'hook', 'kick', 'dk']);
const _wq = new THREE.Quaternion();

function buildRenderStates(sample, dt) {
  const states = sample.states;
  for (const [id, L] of local) {
    const s = states.get(id);
    if (!s) continue;
    // position: predicted when possible, interpolated otherwise; blend between them
    let base;
    if (L.pred.active && s.s !== ST.DEAD) {
      base = tmp.set(L.pred.s.x, L.pred.s.y, L.pred.s.z);
      s.vx = L.pred.s.vx;
      s.vy = L.pred.s.vy;
      s.vz = L.pred.s.vz;
      s.og = L.pred.s.og ? 1 : 0;
      if (s.s === ST.FREE || s.s === ST.BLOCK || s.s === ST.CHARGE) s.f = L.pred.facing;
    } else base = tmp.set(s.x, s.y, s.z);
    if (!L.renderPos) L.renderPos = base.clone();
    if (L.wasPred !== L.pred.active) {
      L.err.copy(L.renderPos).sub(base);
      if (L.err.length() > 4) L.err.set(0, 0, 0);
      L.wasPred = L.pred.active;
    }
    L.err.multiplyScalar(Math.exp(-dt * 9));
    L.renderPos.copy(base).add(L.err);
    s.rx = L.renderPos.x;
    s.ry = L.renderPos.y;
    s.rz = L.renderPos.z;
    // instant hand reach + predicted attack anim
    s.hd = (L.lastInput.b & BTN.GRAB_L ? 1 : 0) | (L.lastInput.b & BTN.GRAB_R ? 2 : 0);
    const pa = L.predAct;
    if (pa) {
      const ticks = (performance.now() - pa.t0) / (DT * 1000);
      const srv = L.server;
      const confirmed = srv && srv.ack >= pa.seq;
      if (ticks > pa.w + pa.a + pa.r + 2 || (confirmed && ticks > 8)) L.predAct = null;
      else if (!confirmed || !s.a || s.s !== ST.ATTACK) {
        if (s.s === ST.FREE || s.s === ST.BLOCK || s.s === ST.ATTACK) {
          s.s = ST.ATTACK;
          s.a = [pa.k, ticks, pa.w, pa.a, pa.r, 0, 0, pa.mirror, pa.item];
        }
      }
    }
  }
  // carried victims follow their (possibly predicted) carrier
  for (const [id, s] of states) {
    if (s.s === ST.HELD && s.gb >= 0 && local.has(s.gb)) {
      const g = states.get(s.gb);
      if (g && g.rx !== undefined) {
        s.rx = s.x + (g.rx - g.x);
        s.ry = s.y + (g.ry - g.y);
        s.rz = s.z + (g.rz - g.z);
      }
    }
  }
}

function updateTrails(states) {
  for (const [id, s] of states) {
    const v = views.get(id);
    if (!v || !s.a || s.s !== ST.ATTACK) continue;
    const [k, t, w, a] = s.a;
    if (!P_ATTACK_KINDS.has(k) || t < w - 0.5 || t > w + a + 1.5) continue;
    if (k === 'swing' || k === 'slam') {
      const arm = s.hh === 1 ? v.armR : v.armL;
      const len = ITEMS[s.a[8]]?.len || 1.2;
      arm.end.getWorldPosition(tmp);
      arm.joint.getWorldQuaternion(_wq);
      tmp2.set(0, -1, 0).applyQuaternion(_wq).multiplyScalar(len).add(tmp);
      const base = tmp.clone().lerp(tmp2, 0.25);
      fx.trail(id + ':w', base, tmp2, s.a[5] > 0.8 ? 0xffe14d : 0xffffff);
    } else if (k === 'kick' || k === 'dk') {
      v.legR.end.getWorldPosition(tmp2);
      v.legR.joint.getWorldPosition(tmp);
      fx.trail(id + ':k', tmp.lerp(tmp2, 0.6), tmp2.clone(), 0xffffff);
    } else {
      const arm = k === 'jab2' ? v.armL : v.armR;
      arm.end.getWorldPosition(tmp2);
      arm.joint.getWorldPosition(tmp);
      fx.trail(id + ':p', tmp.lerp(tmp2, 0.55), tmp2.clone(), k === 'hay' && s.a[5] > 0.8 ? 0xffe14d : 0xffffff);
    }
  }
}

let streakT = 0;
let dustT = 0;
function ambientFx(states, dt) {
  streakT += dt;
  dustT += dt;
  const doStreak = streakT > 0.035;
  const doDust = dustT > 0.16;
  if (doStreak) streakT = 0;
  if (doDust) dustT = 0;
  for (const [id, s] of states) {
    if (s.s === ST.DEAD) continue;
    const sp = Math.hypot(s.vx, s.vz);
    const x = s.rx ?? s.x, y = s.ry ?? s.y, z = s.rz ?? s.z;
    if (doStreak && s.s === ST.TUMBLE && Math.hypot(sp, s.vy) > 10) fx.streak(x, y + 0.9, z, s.vx, s.vy, s.vz);
    if (doDust && s.og && sp > 6.5 && (s.s === ST.FREE || s.s === ST.HELD)) fx.dust(x - s.vx * 0.04, y, z - s.vz * 0.04, 1, 0.3, 0.35);
    if (doDust && s.s === ST.HELD && s.dr && sp > 2) fx.dust(x, y, z, 2, 0.4, 0.45);
  }
}

// ------------------------------------------------------------------ resize
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h, renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ main loop
let last = performance.now();
let cloudT = 0;
const ctx = { views, states: null, props: null, roster, localSlots: local };

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.poll();
  handleMeta();
  if (welcomed) {
    inputAcc += rawDt;
    let n = 0;
    while (inputAcc >= DT && n < 5) {
      inputAcc -= DT;
      sampleInputs();
      n++;
    }
    if (n === 5) inputAcc = 0;
  }
  input.endFrame();

  // global impact freeze
  let dt = rawDt;
  if (freezeT > 0) {
    freezeT -= rawDt;
    dt = 0;
  }

  const sample = welcomed && net.snaps.length ? interpolate(net.renderTime()) : null;
  if (sample) {
    processEvents(net.renderTime());
    if (dt > 0 || !lastSample) {
      buildRenderStates(sample, rawDt);
      lastSample = sample;
    }
  }
  const smp = lastSample;
  if (smp) {
    ctx.states = smp.states;
    ctx.props = smp.props;
    if (dt > 0) {
      for (const [id, v] of views) {
        const s = smp.states.get(id);
        if (!s) {
          v.root.visible = false;
          continue;
        }
        v.update(s, dt, ctx);
      }
      updateProps(smp, dt);
      updateTrails(smp.states);
      ambientFx(smp.states, dt);
    }
    // camera follows living rascals (humans first, dummy if alone)
    const pts = [];
    for (const [id, s] of smp.states) {
      const r = roster.get(id);
      if (!r || s.s === ST.DEAD || s.y < -4) continue;
      if (r.dummy) continue;
      pts.push({ x: s.rx ?? s.x, y: Math.max(0, s.ry ?? s.y), z: s.rz ?? s.z });
    }
    if (pts.length < 2) {
      for (const [id, s] of smp.states) {
        const r = roster.get(id);
        if (r && r.dummy && s.s !== ST.DEAD && s.y > -4) pts.push({ x: s.x, y: Math.max(0, s.y), z: s.z });
      }
    }
    cam.update(rawDt, pts);
    hud.updateCards(roster, smp.states, local, smp.snap.ph);
    hud.updatePhase(smp.snap, roster);
    arena.crane.update(ballPosition(ARENA.ball, smp.snap.time));
  } else {
    // attract mode camera drift
    cam.update(rawDt, [{ x: Math.sin(now / 4000) * 6, y: 0, z: Math.cos(now / 5000) * 3 }]);
    arena.crane.update(ballPosition(ARENA.ball, now / 1000));
  }

  fx.update(dt, now / 1000);
  // drifting clouds + flapping bunting
  cloudT += rawDt;
  arena.level.children.forEach((o) => {
    if (o.userData.cloud) o.position.x += o.userData.drift * rawDt;
    else if (o.userData.flag !== undefined) o.rotation.x = Math.sin(cloudT * 4 + o.userData.flag) * 0.35;
  });

  speedT = Math.max(0, speedT - rawDt);
  impactT = Math.max(0, impactT - rawDt);
  post.uniforms.uSpeed.value = Math.min(1, speedT * 4);
  post.uniforms.uImpact.value = impactT > 0 ? 1 : 0;
  hud.update(rawDt, camera, window.innerWidth, window.innerHeight, { views, states: smp ? smp.states : new Map(), roster, localSlots: local });
  hud.updateNet(net.rtt, net.connected || !started);
  post.render(scene, camera, now / 1000);
}
requestAnimationFrame(frame);

// expose for debugging in the console
window.__rr = { net, views, roster, local, scene, camera, renderer, input, hud, sfx };
