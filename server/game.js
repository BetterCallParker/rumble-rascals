// Authoritative game simulation for one room.
import {
  DT, BTN, ALL_BTNS, ST, PHASE, MOVE, STATE_MOVE_MUL, HOLD_HEAVY_MUL, holdMoveMul, DAZE, GUARD, SPRINT, updateSprint,
  ROUND_WINS_TO_MATCH, MAX_PLAYERS, COLORS, PLAYER_HEIGHT, isPredictable, clamp,
} from '../shared/constants.js';
import { LEVELS, levelBoxesAt, ballPosition, beamState, crusherState, chaserX } from '../shared/levels.js';
import { stepMove, collideMove, applyGravity, collideSphere, groundFriction } from '../shared/physics.js';
import { ITEMS, pickFromPool, filterPool, CATEGORIES } from '../shared/items.js';
import { ATTACKS, SUPER, chargeAmount, CHARGE_MAX } from '../shared/combat.js';
import { HATS, FACES } from '../shared/cosmetics.js';
import { CHARACTERS, charStats } from '../shared/characters.js';
import { SETTINGS, defaultSettings, settingValue } from '../shared/settings.js';

const HAND_BTN = [BTN.GRAB_L, BTN.GRAB_R];
const ANY_HAND = BTN.GRAB_L | BTN.GRAB_R;
const TAUNTS = ['HA-HA!', 'NYAH!', 'COME ON!', 'BOO-YAH!', 'TOO EASY!', 'HEH HEH!'];
const UNBLOCKABLE = new Set(['explode', 'ball', 'beam', 'snow', 'crush', 'dot']);
const CLIMB = { SPEED: 2.7, STAMINA: 420, HANG_DRAIN: 0.6 };
const SQUASH_WORDS = ['SQUASHED!', 'FLATTENED!', 'PANCAKE!'];
const BALLISTIC = new Set(['dk', 'spear', 'slide', 'pound']);
const MAX_PROPS = 34;

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const r2 = (v) => Math.round(v * 100) / 100;
const popcount = (b) => { let n = 0; for (; b; b &= b - 1) n++; return n; };

class Player {
  constructor(id, name, color, clientId, dummy = false) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.clientId = clientId;
    this.dummy = dummy; // the training dummy: never moves on its own
    this.ready = dummy;
    this.wins = 0;
    this.kos = 0;
    this.hat = 0;
    this.face = 0;
    this.char = 0;
    this.queue = [];
    this.inp = { mx: 0, mz: 0, b: 0, seq: 0 };
    this.prevB = 0;
    this.pressed = 0;
    this.ack = 0;
    this.reset();
    this.state = ST.DEAD;
  }

  reset() {
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.og = false; this.gnd = -1; this.co = 0; this.jb = 0; this.jh = false; this.spT = 0; this.bn = false;
    this.bounced = false;
    this.facing = 0;
    this.state = ST.FREE;
    this.st = 0;
    this.stun = 0;
    this.damage = 0;
    this.daze = 0;
    this.lastDazeTick = -9999;
    this.dazeImmune = 0;
    this.koStun = 0; // >0 while knocked out cold
    this.guard = GUARD.MAX;
    this.guardT = 999;
    this.guardBroken = false;
    this.super = 0;
    this.superHits = null;
    this.hitstop = 0;
    this.act = null;
    this.charge = 0;
    this.held = -1; // prop id
    this.heldHand = 0; // 0 left, 1 right, 2 both (heavy)
    this.grab = -1; // player id we're holding
    this.grabMask = 0; // 1 left hand, 2 right hand, 3 both = lifted overhead
    this.grabCd = 0;
    this.grabbedBy = -1;
    this.drag = false; // being dragged while KO'd
    this.escape = 0;
    this.limp = 0;
    this.hang = null;
    this.hangCd = 0;
    this.climb = null;
    this.stam = CLIMB.STAMINA;
    this.burn = 0;
    this.acid = 0;
    this.gunCd = 0;
    this.clickCd = 0;
    this.lastHandPress = -999;
    this.lastHand = 0;
    this.invuln = 0;
    this.dodgeCd = 0;
    this.blockT = 0;
    this.blockCd = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboHits = 0;
    this.comboTick = -999;
    this.buf = 0;
    this.bufT = 0;
    this.airDash = true;
    this.lastHitBy = -1;
    this.lastHitTick = -9999;
    this.ballCd = 0;
    this.beamI = -1;
    this.crushI = -1;
    this.respawn = 0;
    this.pendingVel = null;
    this.lastStickX = 0;
  }

  get alive() { return this.state !== ST.DEAD; }
  get fx() { return Math.sin(this.facing); }
  get fz() { return Math.cos(this.facing); }
  // right-hand side vector
  get rx() { return -Math.cos(this.facing); }
  get rz() { return Math.sin(this.facing); }
}

export class Game {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.props = new Map();
    this.nextPlayerId = 1;
    this.nextPropId = 1;
    this.tick = 0;
    this.time = 0;
    this.phase = PHASE.LOBBY;
    this.phaseT = 0;
    this.round = 0;
    this.events = [];
    this.dropTimer = 0;
    this.suddenDeath = false;
    this.kbMul = 1;
    this.lastWinner = -1;
    this.rosterDirty = true;
    this.levelIndex = 0;
    this.matchStartLevel = 0;
    this.lastLevelTick = -999;
    this.lv = LEVELS[0];
    this.boxBuf = [];
    this.boxes = levelBoxesAt(this.lv, 0, this.boxBuf);
    this.snowDrops = [];
    this.snowT = 0;
    this.settings = defaultSettings();
    this.hostClient = null;
    this.bullets = [];
    this.nextBulletId = 1;
    this.puddles = [];
    this.chaserPos = this.lv.chaser ? this.lv.chaser.startX : 0;
    this.finisher = null;
    this.spawnInitialProps();
    this.addDummy();
  }

  // ================================================================ settings
  set(key) {
    return settingValue(this.settings, key);
  }

  setSetting(clientId, key, val) {
    if (clientId !== this.hostClient || this.phase !== PHASE.LOBBY) return;
    const d = SETTINGS.find((x) => x.key === key);
    if (!d) return;
    const n = d.bool ? 2 : d.options.length;
    const v = val | 0;
    if (v < 0 || v >= n) return;
    this.settings[key] = v;
    if (key === 'stages') {
      const st = d.options[v];
      if (typeof st === 'number' && st !== this.levelIndex) {
        this.setLevel(st);
        this.announce(this.lv.name, this.lv.tagline, 'level');
      }
    }
    if (key === 'items' || CATEGORIES.includes(key)) this.spawnInitialProps();
    this.rosterDirty = true;
  }

  enabledCats() {
    const cats = new Set();
    for (const c of CATEGORIES) if (c === 'throwable' || this.set(c)) cats.add(c);
    return cats;
  }

  roundsToWin() {
    return this.set('rounds');
  }

  setCharacter(clientId, id, c) {
    const p = this.owned(clientId, id);
    if (!p || this.phase !== PHASE.LOBBY) return;
    const ci = c | 0;
    if (ci < 0 || ci >= CHARACTERS.length) return;
    p.char = ci;
    this.rosterDirty = true;
  }

  // ================================================================ players
  addPlayer(clientId, name) {
    const humans = this.humans();
    if (humans.length >= MAX_PLAYERS) return null;
    const used = new Set(humans.map((p) => p.color));
    let color = 0;
    while (used.has(color) && color < COLORS.length - 1) color++;
    name = String(name || COLORS[color].name).replace(/[<>&"]/g, '').trim().slice(0, 14) || COLORS[color].name;
    const p = new Player(this.nextPlayerId++, name, color, clientId);
    this.players.set(p.id, p);
    if (this.phase === PHASE.LOBBY) this.spawnPlayer(p);
    this.rosterDirty = true;
    return p;
  }

  // A burlap training dummy that lives in the level. It takes hits, gets knocked out,
  // can be grabbed / dragged / lifted / thrown, and pops back after a ring-out.
  addDummy() {
    const d = new Player(this.nextPlayerId++, 'TEST DUMMY', -1, null, true);
    this.players.set(d.id, d);
    this.spawnPlayer(d);
    return d;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.releaseGrab(p);
    if (p.grabbedBy >= 0) {
      const g = this.players.get(p.grabbedBy);
      if (g) { g.grab = -1; g.grabMask = 0; }
    }
    this.dropHeld(p);
    this.players.delete(id);
    this.rosterDirty = true;
    if (this.phase !== PHASE.LOBBY && this.humans().length < 2) this.enterLobby();
  }

  removeClient(clientId) {
    for (const p of [...this.players.values()]) if (p.clientId === clientId) this.removePlayer(p.id);
  }

  humans() {
    return [...this.players.values()].filter((p) => !p.dummy);
  }

  owned(clientId, id) {
    const p = this.players.get(id);
    return p && !p.dummy && p.clientId === clientId ? p : null;
  }

  setCosmetics(clientId, id, hat, face) {
    const p = this.owned(clientId, id);
    if (!p) return;
    const h = hat | 0, f = face | 0;
    if (h >= 0 && h < HATS.length) p.hat = h;
    if (f >= 0 && f < FACES.length) p.face = f;
    this.rosterDirty = true;
  }

  cycleColor(clientId, id) {
    const p = this.owned(clientId, id);
    if (!p) return;
    const used = new Set(this.humans().filter((o) => o !== p).map((o) => o.color));
    for (let i = 1; i <= COLORS.length; i++) {
      const c = (p.color + i) % COLORS.length;
      if (!used.has(c)) {
        p.color = c;
        break;
      }
    }
    this.rosterDirty = true;
  }

  requestLevel(clientId, dir) {
    if (this.phase !== PHASE.LOBBY) return;
    if (![...this.players.values()].some((p) => p.clientId === clientId)) return;
    if (this.tick - this.lastLevelTick < 40) return;
    const n = LEVELS.length;
    this.setLevel((this.levelIndex + (dir < 0 ? -1 : 1) + n) % n);
    this.announce(this.lv.name, this.lv.tagline, 'level');
  }

  setLevel(i) {
    this.levelIndex = i;
    this.lv = LEVELS[i];
    this.boxBuf = [];
    this.boxes = levelBoxesAt(this.lv, this.time, this.boxBuf);
    this.lastLevelTick = this.tick;
    this.snowDrops = [];
    this.snowT = 0;
    this.dropTimer = 0;
    for (const p of this.players.values()) {
      p.grab = -1; p.grabMask = 0; p.grabbedBy = -1;
    }
    let idx = 0;
    for (const p of this.players.values()) {
      if (p.state === ST.DEAD && !p.dummy && this.phase !== PHASE.LOBBY) continue;
      this.spawnPlayer(p, p.dummy ? -1 : idx++);
    }
    this.spawnInitialProps();
    this.ev({ e: 'level', lv: i });
    this.rosterDirty = true;
  }

  pushInput(id, seq, mx, mz, b, ay) {
    const p = this.players.get(id);
    if (!p || p.dummy) return;
    seq |= 0;
    const last = p.queue.length ? p.queue[p.queue.length - 1].seq : p.ack;
    if (seq <= last) return;
    const aim = Number.isFinite(+ay) ? +ay : null;
    p.queue.push({ seq, mx: clamp(+mx || 0, -1, 1), mz: clamp(+mz || 0, -1, 1), b: b & ALL_BTNS, ay: aim });
    // Keep latency bounded if a client runs fast / bursts after a stall
    if (p.queue.length > 6) p.queue.splice(0, p.queue.length - 3);
  }

  spawnPlayer(p, idx = -1) {
    const keepWins = p.wins, keepKos = p.kos;
    p.reset();
    p.wins = keepWins;
    p.kos = keepKos;
    const spawns = this.lv.spawns;
    let s = spawns[0];
    if (p.dummy) s = this.lv.dummySpawn;
    else if (idx >= 0) s = spawns[idx % spawns.length];
    else {
      let best = -1;
      for (const c of spawns) {
        let dmin = 1e9;
        for (const o of this.players.values()) {
          if (o === p || !o.alive) continue;
          dmin = Math.min(dmin, Math.hypot(o.x - c[0], o.z - c[2]));
        }
        if (dmin > best) { best = dmin; s = c; }
      }
    }
    p.x = s[0]; p.y = s[1] + 0.02; p.z = s[2];
    p.facing = p.dummy ? 0 : this.lv.mode === 'race' ? Math.PI / 2 : Math.atan2(-p.x, -p.z);
    p.og = true;
    p.invuln = p.dummy ? 30 : 70;
    this.ev({ e: 'spawn', id: p.id, x: p.x, y: p.y, z: p.z });
  }

  // ================================================================ events
  ev(e) { this.events.push(e); }
  announce(text, sub = '', style = 'big') { this.ev({ e: 'announce', text, sub, style }); }

  // ================================================================ props
  spawnProp(kind, x, y, z) {
    const def = ITEMS[kind];
    if (!def) return null;
    const pr = {
      id: this.nextPropId++, kind, x, y, z, vx: 0, vy: 0, vz: 0, og: false, gnd: -1,
      state: 'free', owner: -1, ownerT: 99, dur: def.durability || 1, fuse: -1, r: def.r, ammo: def.ammo || 0,
    };
    this.props.set(pr.id, pr);
    return pr;
  }

  pool() {
    return filterPool(this.lv.pool, this.enabledCats());
  }

  spawnInitialProps() {
    for (const p of this.players.values()) p.held = -1;
    this.props.clear();
    this.bullets = [];
    this.puddles = [];
    const mul = this.set('items');
    if (!mul) return;
    const cats = this.enabledCats();
    for (const [kind, x, y, z] of this.lv.props) if (cats.has(ITEMS[kind].cat)) this.spawnProp(kind, x, y, z);
    const pool = this.pool();
    if (!Object.keys(pool).length) return;
    const spots = [...this.lv.itemSpawns].sort(() => Math.random() - 0.5);
    const extra = Math.round(this.lv.extra * mul);
    for (let i = 0; i < extra && i < spots.length; i++) {
      const s = spots[i];
      this.spawnProp(pickFromPool(pool), s[0] + (Math.random() - 0.5) * 0.6, s[1] + 0.6, s[2] + (Math.random() - 0.5) * 0.6);
    }
  }

  skyDrop() {
    const pool = this.pool();
    if (!Object.keys(pool).length) return;
    const s = pick(this.lv.itemSpawns);
    const kind = pickFromPool(pool);
    const pr = this.spawnProp(kind, s[0] + (Math.random() - 0.5), s[1] + 16, s[2] + (Math.random() - 0.5));
    if (!pr) return;
    pr.vy = -6;
    this.ev({ e: 'drop', x: r2(pr.x), y: s[1], z: r2(pr.z), k: kind });
  }

  removeProp(pr) {
    if (pr.state === 'held') {
      const h = this.players.get(pr.owner);
      if (h && h.held === pr.id) h.held = -1;
    }
    this.props.delete(pr.id);
  }

  heldDef(p) {
    if (p.held < 0) return null;
    const pr = this.props.get(p.held);
    return pr ? ITEMS[pr.kind] : null;
  }

  isHeavy(p) {
    const d = this.heldDef(p);
    return !!d && d.type === 'heavy';
  }

  heldWeapon(p) {
    if (p.held < 0) return null;
    const pr = this.props.get(p.held);
    return pr && ITEMS[pr.kind].type === 'weapon' ? pr : null;
  }

  heldProp(p) {
    return p.held >= 0 ? this.props.get(p.held) || null : null;
  }

  victimOf(p) {
    return p.grab >= 0 ? this.players.get(p.grab) : null;
  }

  // ================================================================ main loop
  step() {
    this.tick++;
    this.time += DT;
    this.phaseT++;
    this.boxes = levelBoxesAt(this.lv, this.time, this.boxBuf);
    this.updatePhase();

    for (const p of this.players.values()) this.readInput(p);
    const frozen = this.phase === PHASE.COUNTDOWN;
    if (!frozen) for (const p of this.players.values()) this.updatePlayer(p);
    this.updateHeldPositions();
    this.separatePlayers();
    this.updateProps();
    this.updateBullets();
    this.updatePuddles();
    this.updateHazards();
    if (this.lv.mode === 'race') this.updateRace();
    this.checkRingOuts();

    const itemMul = this.set('items');
    if ((this.phase === PHASE.FIGHT || this.phase === PHASE.LOBBY) && itemMul > 0) {
      this.dropTimer++;
      const interval = (this.suddenDeath ? 170 : 380) / itemMul;
      if (this.dropTimer > interval && this.props.size < MAX_PROPS - 4) {
        this.dropTimer = 0;
        this.skyDrop();
      }
    }
  }

  readInput(p) {
    if (p.dummy) {
      p.inp = { mx: 0, mz: 0, b: 0, seq: 0, ay: null };
    } else if (p.queue.length) {
      p.inp = p.queue.shift();
    } // else: keep last input (held buttons repeat, edges don't retrigger)
    const b = p.inp.b;
    p.pressed = b & ~p.prevB;
    p.prevB = b;
    p.ack = p.inp.seq;
    if (p.pressed & ANY_HAND) {
      p.lastHandPress = this.tick;
      p.lastHand = p.pressed & BTN.GRAB_R ? 1 : 0;
    }
    // buffer actions pressed during hitstop / recovery
    const actionBits = p.pressed & (BTN.ATTACK | BTN.KICK | BTN.DODGE | BTN.JUMP);
    if (actionBits) { p.buf |= actionBits; p.bufT = 9; }
    else if (p.bufT > 0 && --p.bufT === 0) p.buf = 0;
    if (p.pressed & BTN.START) this.toggleReady(p);
  }

  readyMsg(clientId, id) {
    const p = this.owned(clientId, id);
    if (p) this.toggleReady(p);
  }

  toggleReady(p) {
    if (this.phase !== PHASE.LOBBY || p.dummy) return;
    p.ready = !p.ready;
    this.rosterDirty = true;
  }

  consume(p, bit) {
    if (p.buf & bit) {
      p.buf &= ~bit;
      if (!p.buf) p.bufT = 0;
      return true;
    }
    return false;
  }

  setState(p, s) {
    p.state = s;
    p.st = 0;
  }

  addSuper(p, amt) {
    if (!p || p.dummy || p.state === ST.SUPER || !this.set('supers')) return;
    const before = p.super;
    p.super = Math.min(SUPER.MAX, p.super + amt);
    if (before < SUPER.MAX && p.super >= SUPER.MAX) this.ev({ e: 'superReady', id: p.id });
  }

  // ================================================================ player update
  updatePlayer(p) {
    if (p.state === ST.DEAD) {
      const raceOn = this.lv.mode === 'race' && this.phase === PHASE.FIGHT;
      if ((this.phase === PHASE.LOBBY || (p.dummy && !raceOn)) && --p.respawn <= 0) this.spawnPlayer(p);
      return;
    }
    this.updateStatus(p);
    if (p.hitstop > 0) {
      p.hitstop--;
      if (p.hitstop === 0 && p.pendingVel) {
        p.vx = p.pendingVel[0]; p.vy = p.pendingVel[1]; p.vz = p.pendingVel[2];
        p.og = false;
        p.pendingVel = null;
      }
      return;
    }
    p.st++;
    if (p.invuln > 0) p.invuln--;
    if (p.dodgeCd > 0) p.dodgeCd--;
    if (p.blockCd > 0) p.blockCd--;
    if (p.ballCd > 0) p.ballCd--;
    if (p.grabCd > 0) p.grabCd--;
    if (p.hangCd > 0) p.hangCd--;
    if (p.dazeImmune > 0) p.dazeImmune--;
    if (p.daze > 0 && this.tick - p.lastDazeTick > DAZE.DECAY_DELAY) p.daze = Math.max(0, p.daze - DAZE.DECAY);
    // guard regenerates when not blocking
    if (p.state !== ST.BLOCK) {
      p.guardT++;
      if (p.guardT > GUARD.REGEN_DELAY && p.guard < GUARD.MAX) p.guard = Math.min(GUARD.MAX, p.guard + GUARD.REGEN);
      if (p.guardBroken && p.guard >= 45) p.guardBroken = false;
    }
    if (p.comboTimer > 0 && --p.comboTimer === 0) p.combo = 0;
    if (p.gunCd > 0) p.gunCd--;
    if (p.clickCd > 0) p.clickCd--;
    if (p.og) {
      p.airDash = true;
      p.stam = Math.min(CLIMB.STAMINA, p.stam + 5);
    }

    const inp = p.inp;
    const stickLen = Math.hypot(inp.mx, inp.mz);

    switch (p.state) {
      case ST.FREE:
      case ST.BLOCK:
      case ST.TAUNT:
        this.updateFree(p, inp, stickLen);
        break;
      case ST.ATTACK:
        this.updateHands(p, false);
        this.updateAttack(p, inp, stickLen);
        break;
      case ST.CHARGE:
        this.updateHands(p, false);
        this.updateCharge(p, inp, stickLen);
        break;
      case ST.SUPER:
        this.updateSuper(p, inp, stickLen);
        break;
      case ST.DODGE:
        this.updateDodge(p);
        break;
      case ST.HELD:
        this.updateHeld(p, inp);
        break;
      case ST.TUMBLE:
        this.updateTumble(p);
        break;
      case ST.STAGGER:
        this.updateStagger(p);
        break;
      case ST.DOWN:
      case ST.DIZZY:
        this.updateStunned(p);
        break;
      case ST.KO:
        this.updateKO(p);
        break;
      case ST.HANG:
        this.updateHang(p, inp);
        break;
      case ST.CLIMB:
        this.updateClimb(p, inp);
        break;
      case ST.GETUP:
        this.physicsOnly(p, 0.8);
        if (p.st >= 14) this.setState(p, ST.FREE);
        break;
    }
    if (p.bounced) {
      p.bounced = false;
      this.ev({ e: 'boing', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z) });
    }
  }

  heavyMul(p) {
    const d = this.heldDef(p);
    return d && d.type === 'heavy' ? d.carryMul ?? HOLD_HEAVY_MUL : 1;
  }

  moveMul(p, stickLen) {
    const v = this.victimOf(p);
    const heavyMul = this.heavyMul(p);
    const canSprint = p.state === ST.FREE && p.grab < 0 && heavyMul === 1;
    const sprint = updateSprint(p, stickLen, canSprint);
    return (STATE_MOVE_MUL[p.state] ?? 1) * holdMoveMul(p.grabMask, !!(v && v.drag), heavyMul) * sprint * statusMoveMul(p);
  }

  locomote(p, inp, stickLen, turnRate) {
    if (stickLen > 0.2 && turnRate > 0) {
      p.facing = turnToward(p.facing, Math.atan2(inp.mx, inp.mz), turnRate);
    }
    const wasGround = p.og;
    const vyBefore = p.vy;
    const canJump = p.state === ST.FREE || p.state === ST.BLOCK;
    const mul = this.moveMul(p, stickLen);
    const jumped = stepMove(p, inp, this.boxes, { dt: DT, mul, canJump, phys: this.lv.phys });
    if (jumped) {
      if (p.state === ST.BLOCK) this.setState(p, ST.FREE);
      this.ev({ e: 'jump', id: p.id });
    }
    if (!wasGround && p.og && vyBefore < -9) this.ev({ e: 'land', id: p.id, s: r2(-vyBefore) });
    if (!p.og && p.vy < 1.5 && p.state === ST.FREE && !this.tryHang(p)) this.tryClimb(p);
  }

  physicsOnly(p, friction = 0.85) {
    applyGravity(p, DT, false);
    const slide = this.lv.phys && this.lv.phys.slide;
    groundFriction(p, this.boxes, slide ? Math.max(friction, slide) : friction);
    collideMove(p, DT, this.boxes);
  }

  updateFree(p, inp, stickLen) {
    const def = this.heldDef(p);
    const heavy = !!def && def.type === 'heavy';
    const weapon = !!def && def.type === 'weapon';
    const light = !!def && def.type === 'light';
    const gun = !!def && def.type === 'gun';

    if (p.state === ST.BLOCK) {
      p.blockT++;
      p.guardT = 0;
      if (!(inp.b & BTN.BLOCK)) {
        this.setState(p, ST.FREE);
        p.blockCd = 10;
      }
    } else if (p.state === ST.TAUNT) {
      if (p.st === 50) {
        // finishing a taunt shakes off daze and pumps the super meter
        p.daze = Math.max(0, p.daze - 25);
        this.addSuper(p, 10);
        this.ev({ e: 'tauntDone', id: p.id });
      }
      if (p.st > 50 || stickLen > 0.5) this.setState(p, ST.FREE);
    }

    if (p.state === ST.FREE || p.state === ST.BLOCK) {
      if (p.buf & BTN.DODGE && p.dodgeCd <= 0 && (p.og || p.airDash)) {
        this.consume(p, BTN.DODGE);
        this.startDodge(p, inp, stickLen);
        return;
      }
      // SUPER (taunt button with a full meter)
      if (p.pressed & BTN.TAUNT && p.super >= SUPER.MAX) {
        this.startSuper(p);
        return;
      }
      this.updateHands(p, true);
      if (p.state !== ST.FREE && p.state !== ST.BLOCK) return;

      const sprinting = p.spT > SPRINT.TICKS && p.og;
      // guns: semi-auto on press, flamethrower / acid squirter while held
      if (gun && p.grabMask !== 3) {
        const pr = this.heldProp(p);
        const firing = def.auto ? inp.b & BTN.ATTACK : this.consume(p, BTN.ATTACK);
        if (firing && pr) this.fireGun(p, pr, def);
      }
      if (!gun && this.consume(p, BTN.ATTACK)) {
        const v = this.victimOf(p);
        if (v && (p.grabMask === 3 || v.drag)) this.throwPlayer(p);
        else if (heavy || light) this.throwProp(p);
        else if (sprinting && !weapon && p.grab < 0) this.startAttack(p, 'spear');
        else this.startAttack(p, weapon ? 'swing' : this.nextPunch(p));
        if (p.state === ST.ATTACK) return;
      }
      if (this.consume(p, BTN.KICK) && !heavy && p.grabMask !== 3) {
        const v = this.victimOf(p);
        if (!(v && v.drag)) {
          if (sprinting && p.grab < 0) this.startAttack(p, 'slide');
          else this.startAttack(p, p.og || p.grab >= 0 ? 'kick' : 'dk');
          return;
        }
      }
      // ground pound: block in mid-air
      if (p.pressed & BTN.BLOCK && !p.og && !heavy && p.grab < 0 && p.y > -1) {
        this.startAttack(p, 'pound');
        return;
      }
      const canBlock = p.blockCd <= 0 && p.grab < 0 && !heavy && p.og && !(p.guardBroken && p.guard < 45);
      if (p.state === ST.FREE && inp.b & BTN.BLOCK && canBlock) {
        this.setState(p, ST.BLOCK);
        p.blockT = 0;
      }
      if (p.state === ST.FREE && p.pressed & BTN.TAUNT && p.og && p.grab < 0) {
        this.setState(p, ST.TAUNT);
        this.ev({ e: 'taunt', id: p.id, w: pick(TAUNTS) });
      }
    }
    this.locomote(p, inp, stickLen, p.state === ST.BLOCK ? 0.12 : 0.3);
  }

  // ---------------------------------------------------------------- guns & bullets
  // Find a target near the aim line (generous aim assist for controllers)
  aimAssist(p, yaw, range, cone) {
    let best = null, bestScore = cone;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || o.state === ST.HELD) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3 || d > range || Math.abs(o.y - p.y) > 3) continue;
      let da = Math.atan2(dx, dz) - yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const score = Math.abs(da) + d * 0.004;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best ? Math.atan2(best.x - p.x, best.z - p.z) : yaw;
  }

  fireGun(p, pr, def) {
    if (p.gunCd > 0) return;
    if (pr.ammo <= 0) {
      if (p.clickCd <= 0) {
        this.ev({ e: 'click', id: p.id });
        p.clickCd = 25;
      }
      return;
    }
    pr.ammo--;
    p.gunCd = def.rate;
    const aim = p.inp.ay != null ? p.inp.ay : p.facing;
    const yaw = this.aimAssist(p, aim, 26, 0.32);
    p.facing = yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const side = p.heldHand === 1 ? 0.4 : -0.4;
    const mx = p.x + fx * 0.95 + p.rx * side * 0.6, mz = p.z + fz * 0.95 + p.rz * side * 0.6, my = p.y + 1.2;
    const b = def.bullet;
    const n = def.pellets || 1;
    for (let i = 0; i < n; i++) {
      const spread = def.spread ? (Math.random() - 0.5) * 2 * def.spread : 0;
      const a = yaw + spread;
      const sp = b.speed * (n > 1 ? 0.85 + Math.random() * 0.3 : 1);
      this.bullets.push({
        id: this.nextBulletId++, kind: b.kind, def: b, owner: p.id, x: mx, y: my, z: mz,
        vx: Math.sin(a) * sp + p.vx * 0.3, vy: b.gravity ? 2.5 : (Math.random() - 0.5) * (n > 1 ? 1.5 : 0), vz: Math.cos(a) * sp + p.vz * 0.3,
        life: b.life, age: 0, hit: new Set(),
      });
    }
    if (def.recoil) {
      p.vx -= fx * def.recoil;
      p.vz -= fz * def.recoil;
    }
    if (!def.auto || pr.ammo % 4 === 0) this.ev({ e: 'shoot', id: p.id, k: pr.kind, x: r2(mx), y: r2(my), z: r2(mz), f: r2(yaw), w: def.auto ? '' : pick(def.words) });
    if (pr.ammo === 0) this.ev({ e: 'empty', id: p.id, k: pr.kind });
  }

  updateBullets() {
    const boxes = this.boxes;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const d = b.def;
      b.age++;
      let dead = --b.life <= 0;
      if (d.gravity) b.vy -= 22 * DT;
      if (b.kind === 'flame') {
        b.vx *= 0.96;
        b.vz *= 0.96;
        b.vy += 3 * DT;
      }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.z += b.vz * DT;
      // walls & floors
      if (!dead) {
        for (const bx of boxes) {
          if (b.x > bx.x0 && b.x < bx.x1 && b.y > bx.y0 && b.y < bx.y1 && b.z > bx.z0 && b.z < bx.z1) {
            dead = true;
            break;
          }
        }
      }
      // rascals
      if (!dead) {
        for (const o of this.players.values()) {
          if (!o.alive || b.hit.has(o.id)) continue;
          if (o.id === b.owner && b.age < 25) continue;
          if (!capsuleHit(b.x, b.y, b.z, d.r, o)) continue;
          b.hit.add(o.id);
          const owner = this.players.get(b.owner) || null;
          if (d.explode) {
            dead = true;
            break;
          }
          const hl = Math.hypot(b.vx, b.vz) || 1;
          const dot = !!(d.burn || d.acid);
          this.applyHit(owner, o, {
            dmg: d.dmg, kb: d.kb * this.kbMul, up: d.up, dir: [b.vx / hl, b.vz / hl],
            word: dot ? '' : pick(['POP!', 'BIFF!', 'ZING!', 'THWIP!']), kind: dot ? 'dot' : 'shot', sfx: dot ? '' : 'punch',
            x: b.x, y: b.y, z: b.z, noSelfStop: true, daze: d.daze || 0,
          });
          if (d.burn && o.alive) {
            if (!o.burn) this.ev({ e: 'ignite', id: o.id });
            o.burn = Math.max(o.burn, d.burn);
          }
          if (d.acid && o.alive) {
            if (!o.acid) this.ev({ e: 'acid', id: o.id });
            o.acid = Math.max(o.acid, d.acid);
          }
          if (!d.pierce) { dead = true; break; }
        }
      }
      // bump loose props
      if (!dead && !d.burn && !d.acid) {
        for (const pr of this.props.values()) {
          if (pr.state === 'held') continue;
          const dx = pr.x - b.x, dy = pr.y - b.y, dz = pr.z - b.z;
          if (dx * dx + dy * dy + dz * dz > (pr.r + d.r) ** 2) continue;
          if (d.explode) { dead = true; break; }
          pr.vx += b.vx * 0.25;
          pr.vz += b.vz * 0.25;
          pr.vy += 3;
          pr.state = 'thrown';
          pr.owner = b.owner;
          pr.ownerT = 30;
          if (ITEMS[pr.kind].explosive && !ITEMS[pr.kind].fuseOnThrow && pr.fuse < 0) pr.fuse = 6;
          dead = true;
          break;
        }
      }
      if (dead) {
        if (d.explode) this.blast(b.x, b.y, b.z, d.explode, b.owner, 'KA-BOOM!');
        else if (b.kind === 'acid' && Math.random() < 0.08) this.addPuddle(b.x, b.y, b.z, 1.1, 180);
        this.bullets.splice(i, 1);
      }
    }
    if (this.bullets.length > 160) this.bullets.splice(0, this.bullets.length - 160);
  }

  addPuddle(x, y, z, r, t) {
    // settle the puddle on the floor under the splash
    let top = -1e9;
    for (const bx of this.boxes) {
      if (x >= bx.x0 && x <= bx.x1 && z >= bx.z0 && z <= bx.z1 && bx.y1 <= y + 0.6 && bx.y1 > top) top = bx.y1;
    }
    if (top < -50) return;
    this.puddles.push({ x, y: top, z, r, t, max: t });
    if (this.puddles.length > 12) this.puddles.shift();
  }

  updatePuddles() {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const pd = this.puddles[i];
      if (--pd.t <= 0) { this.puddles.splice(i, 1); continue; }
      for (const o of this.players.values()) {
        if (!o.alive || Math.abs(o.y - pd.y) > 0.6) continue;
        if (Math.hypot(o.x - pd.x, o.z - pd.z) > pd.r) continue;
        if (!o.acid) this.ev({ e: 'acid', id: o.id });
        o.acid = Math.max(o.acid, 70);
      }
    }
  }

  // burning & acid damage over time
  updateStatus(p) {
    if (p.burn > 0) {
      p.burn--;
      if (p.state === ST.DODGE) {
        p.burn = 0;
        this.ev({ e: 'extinguish', id: p.id });
      } else if (p.burn % 20 === 0) {
        p.damage = Math.min(999, p.damage + 1.5);
        this.addDaze(p, 1.2);
        if (p.burn % 80 === 0) this.ev({ e: 'burnYell', id: p.id, w: pick(['YEOWCH!', 'HOT HOT HOT!', 'OW OW OW!', 'FIRE!']) });
      }
    }
    if (p.acid > 0) {
      p.acid--;
      if (p.acid % 30 === 0) {
        p.damage = Math.min(999, p.damage + 1);
        this.addDaze(p, 0.8);
      }
    }
  }

  // ---------------------------------------------------------------- climbing walls
  tryClimb(p) {
    if (p.hangCd > 0 || p.koStun > 0 || p.grab >= 0 || this.isHeavy(p) || p.stam < 40) return false;
    const b = p.inp.b;
    let hand = false;
    for (let h = 0; h < 2; h++) {
      if (!(b & HAND_BTN[h])) continue;
      if (p.held >= 0 && p.heldHand === h) continue;
      hand = true;
    }
    if (!hand) return false;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.src || bx.bounce) continue;
      if (bx.y1 - p.y <= 2.0) continue; // near the top: that's a ledge hang
      if (p.y + 1.2 < bx.y0) continue; // no wall at chest height
      const cx = clamp(p.x, bx.x0, bx.x1), cz = clamp(p.z, bx.z0, bx.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < 0.2 || d > 0.8) continue;
      const nx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
      const nz = nx ? 0 : Math.sign(dz);
      p.climb = { bi: i, nx, nz };
      this.cancelAct(p);
      this.setState(p, ST.CLIMB);
      p.vx = p.vy = p.vz = 0;
      p.facing = Math.atan2(-nx, -nz);
      this.ev({ e: 'cling', id: p.id });
      return true;
    }
    return false;
  }

  updateClimb(p, inp) {
    const c = p.climb;
    const bx = c && this.boxes[c.bi];
    if (!bx) { this.setState(p, ST.FREE); return; }
    const drop = (word) => {
      p.climb = null;
      p.hangCd = 25;
      p.vx = c.nx * 1.5; p.vz = c.nz * 1.5; p.vy = 0;
      this.setState(p, ST.FREE);
      if (word) this.ev({ e: 'tired', id: p.id, x: r2(p.x), y: r2(p.y + 2), z: r2(p.z) });
    };
    if (!(inp.b & ANY_HAND)) { drop(false); return; }
    if (p.stam <= 0) { drop(true); return; }
    if (this.consume(p, BTN.JUMP)) {
      // kick off the wall
      p.climb = null;
      p.hangCd = 18;
      p.vx = c.nx * 6; p.vz = c.nz * 6; p.vy = 9;
      this.setState(p, ST.FREE);
      this.ev({ e: 'jump', id: p.id });
      return;
    }
    // stick toward the wall = climb up, away = slide down, sideways = shimmy
    const tx = -c.nz, tz = c.nx;
    const up = clamp(-(inp.mx * c.nx + inp.mz * c.nz), -1, 1);
    const sideAmt = inp.mx * tx + inp.mz * tz;
    p.y += up * CLIMB.SPEED * DT;
    if (up < -0.2) p.y += up * CLIMB.SPEED * 0.6 * DT;
    let nx = p.x + tx * sideAmt * CLIMB.SPEED * 0.7 * DT;
    let nz = p.z + tz * sideAmt * CLIMB.SPEED * 0.7 * DT;
    // stay on the face of the box
    if (c.nx) { nz = clamp(nz, bx.z0 + 0.2, bx.z1 - 0.2); nx = c.nx > 0 ? bx.x1 + 0.5 : bx.x0 - 0.5; }
    else { nx = clamp(nx, bx.x0 + 0.2, bx.x1 - 0.2); nz = c.nz > 0 ? bx.z1 + 0.5 : bx.z0 - 0.5; }
    p.x = nx; p.z = nz;
    p.vx = p.vy = p.vz = 0;
    p.og = false;
    p.stam -= up > 0.2 ? 1.5 : 0.7;
    if (p.y + 1.0 < bx.y0) { drop(false); return; }
    // reached the top: grab the ledge
    if (bx.y1 - p.y <= 1.85) {
      const ex = c.nx > 0 ? bx.x1 : c.nx < 0 ? bx.x0 : p.x;
      const ez = c.nz > 0 ? bx.z1 : c.nz < 0 ? bx.z0 : p.z;
      p.hang = { x: ex + c.nx * 0.5, z: ez + c.nz * 0.5, y: bx.y1 - 1.75, top: bx.y1, nx: c.nx, nz: c.nz, cx: ex, cz: ez };
      p.climb = null;
      this.setState(p, ST.HANG);
      this.ev({ e: 'hang', id: p.id, x: r2(ex), y: r2(bx.y1), z: r2(ez) });
    }
  }

  // ---------------------------------------------------------------- chase race
  updateRace() {
    const cfg = this.lv.chaser;
    if (this.phase !== PHASE.FIGHT) {
      this.chaserPos = cfg.startX;
      return;
    }
    this.chaserPos = chaserX(cfg, this.phaseT / 60);
    const front = this.chaserPos + 1.6;
    for (const o of this.players.values()) {
      if (!o.alive || o.y < -8) continue;
      if (o.x < front) {
        this.ev({ e: 'squash', id: o.id, x: r2(o.x), y: r2(o.y), z: r2(o.z), w: pick(SQUASH_WORDS) });
        this.eliminate(o, true);
      } else if (!o.dummy && !this.finisher && o.x >= this.lv.finishX && o.og) {
        this.finisher = o;
        this.ev({ e: 'finish', id: o.id, x: r2(o.x), y: r2(o.y), z: r2(o.z) });
      }
    }
    for (const pr of [...this.props.values()]) {
      if (pr.state !== 'held' && pr.x < front) this.props.delete(pr.id);
    }
  }

  // ---------------------------------------------------------------- SUPER: SPIN-O-RAMA
  startSuper(p) {
    p.super = 0;
    this.releaseGrab(p);
    this.dropHeld(p);
    this.cancelAct(p);
    p.superHits = new Map();
    this.setState(p, ST.SUPER);
    this.ev({ e: 'super', id: p.id, x: r2(p.x), y: r2(p.y + 2), z: r2(p.z) });
  }

  updateSuper(p, inp, stickLen) {
    this.locomote(p, inp, stickLen, 0.3);
    const R = SUPER.RADIUS + 0.45;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || o.state === ST.HELD) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > R || Math.abs(o.y - p.y) > 1.6) continue;
      const last = p.superHits.get(o.id) ?? -999;
      if (this.tick - last < SUPER.REHIT) continue;
      p.superHits.set(o.id, this.tick);
      const dl = d || 1;
      // fling outward with a spin-wise kick
      const nx = dx / dl, nz = dz / dl;
      this.applyHit(p, o, {
        dmg: SUPER.DMG, kb: SUPER.KB * this.kbMul, up: SUPER.UP, dir: [nx * 0.8 - nz * 0.5, nz * 0.8 + nx * 0.5],
        word: pick(['SPIN!', 'WHIRL!', 'TORNADO!', 'WHAM!', 'SPIN-O-RAMA!']), kind: 'super', sfx: 'punch',
        x: (o.x + p.x) / 2, y: o.y + 1, z: (o.z + p.z) / 2, noSelfStop: true,
      });
    }
    // swat projectiles away
    for (const pr of this.props.values()) {
      if (pr.state !== 'thrown' || pr.owner === p.id) continue;
      const dx = pr.x - p.x, dz = pr.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > R || Math.abs(pr.y - p.y - 1) > 1.6) continue;
      const sp = Math.max(12, Math.hypot(pr.vx, pr.vz));
      pr.vx = (dx / (d || 1)) * sp;
      pr.vz = (dz / (d || 1)) * sp;
      pr.vy = 4;
      pr.owner = p.id;
      pr.ownerT = 0;
    }
    if (p.st >= SUPER.TICKS) {
      p.superHits = null;
      this.setState(p, ST.FREE);
      this.ev({ e: 'superEnd', id: p.id });
    }
  }

  // ---------------------------------------------------------------- hands (LT / RT)
  // Each trigger drives one hand. Holding a trigger reaches out and grabs whatever
  // rascal comes into reach. Both hands on a rascal lifts them overhead.
  updateHands(p, canGrab) {
    const b = p.inp.b;
    for (let h = 0; h < 2; h++) {
      const bit = HAND_BTN[h];
      const mask = 1 << h;
      const down = (b & bit) !== 0;
      const pressed = (p.pressed & bit) !== 0;

      // Sticky props: pressing the hand that holds it throws it.
      if (p.held >= 0 && (p.heldHand === h || p.heldHand === 2)) {
        if (pressed && canGrab) this.throwProp(p);
        continue;
      }
      if (p.grab >= 0 && p.grabMask & mask) {
        if (!down) this.releaseHand(p, h);
        continue;
      }
      if (!down || !canGrab || p.grabCd > 0) continue;

      if (p.grab >= 0) {
        // second hand joins in -> hoist them overhead
        if (p.held < 0) {
          p.grabMask |= mask;
          if (p.grabMask === 3) this.ev({ e: 'lift', a: p.id, v: p.grab });
        }
        continue;
      }
      const target = this.findGrabTarget(p);
      if (target && !this.isHeavy(p)) {
        this.grabPlayer(p, target, mask);
        const other = HAND_BTN[1 - h];
        if (b & other && p.held < 0) {
          p.grabMask = 3;
          this.ev({ e: 'lift', a: p.id, v: target.id });
        }
        continue;
      }
      if (pressed && p.held < 0) this.tryPickup(p, h);
    }
  }

  findGrabTarget(p) {
    let target = null, best = 1.5;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || o.state === ST.HELD || o.state === ST.DODGE || o.state === ST.HANG || o.state === ST.SUPER) continue;
      if (o.grab >= 0) continue;
      if (o.invuln > 0 && o.state !== ST.KO && o.state !== ST.DOWN) continue;
      if (o.state === ST.TUMBLE && !o.og) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      if (Math.abs(o.y - p.y) > 1.1) continue;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && (dx * p.fx + dz * p.fz) / d < 0.3) continue;
      const reach = o.state === ST.KO ? best + 0.35 : best;
      if (d < reach) { best = d; target = o; }
    }
    return target;
  }

  grabPlayer(p, v, mask) {
    this.cancelAct(v);
    this.dropHeld(v);
    this.releaseGrab(v);
    const ko = v.koStun > 0;
    const limp = v.state === ST.DOWN || v.state === ST.DIZZY;
    v.grabbedBy = p.id;
    v.drag = ko;
    v.escape = (65 + Math.min(80, v.damage * 0.3)) * charStats(p.char).grip;
    v.limp = limp ? 50 : 0;
    v.hang = null;
    this.setState(v, ST.HELD);
    p.grab = v.id;
    p.grabMask = mask;
    if (p.state === ST.BLOCK) this.setState(p, ST.FREE);
    this.ev({ e: 'grab', a: p.id, v: v.id, dr: ko ? 1 : 0, x: r2(v.x), y: r2(v.y + 1.1), z: r2(v.z) });
  }

  tryPickup(p, h) {
    let best = null, bestD = 1.7;
    for (const pr of this.props.values()) {
      if (pr.state === 'held') continue;
      if (pr.state === 'thrown' && Math.hypot(pr.vx, pr.vy, pr.vz) > 7) continue;
      const dx = pr.x - p.x, dz = pr.z - p.z;
      const dy = pr.y - (p.y + 0.5);
      if (Math.abs(dy) > 1.4) continue;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && (dx * p.fx + dz * p.fz) / d < -0.3) continue;
      if (d < bestD) { bestD = d; best = pr; }
    }
    if (!best) return;
    const heavy = ITEMS[best.kind].type === 'heavy';
    if (heavy && p.grab >= 0) return; // need both hands
    if (!heavy && p.grab >= 0 && p.grabMask & (1 << h)) return;
    this.takeProp(p, best, heavy ? 2 : h);
    this.ev({ e: 'pickup', id: p.id, item: best.id, k: best.kind });
  }

  takeProp(p, pr, hand) {
    pr.state = 'held';
    pr.owner = p.id;
    pr.vx = pr.vy = pr.vz = 0;
    if (!ITEMS[pr.kind].fuseOnThrow) pr.fuse = -1; // lit grenades stay lit: hot potato!
    p.held = pr.id;
    p.heldHand = hand;
  }

  releaseHand(p, h) {
    const before = p.grabMask;
    p.grabMask &= ~(1 << h);
    if (p.grabMask === 0) this.letGo(p, before === 3);
    else if (before === 3) this.ev({ e: 'lower', a: p.id, v: p.grab });
  }

  // Voluntary release (trigger let go)
  letGo(p, wasLifted) {
    const v = this.victimOf(p);
    p.grab = -1;
    p.grabMask = 0;
    p.grabCd = 12;
    if (!v || v.grabbedBy !== p.id) return;
    v.grabbedBy = -1;
    v.drag = false;
    if (wasLifted) {
      v.vx = p.fx * 3; v.vz = p.fz * 3; v.vy = 2;
      this.setState(v, ST.TUMBLE);
      v.stun = 10;
    } else if (v.koStun > 0) {
      this.setState(v, ST.KO);
    } else {
      this.setState(v, ST.FREE);
      v.invuln = 10;
    }
    this.ev({ e: 'letgo', a: p.id, v: v.id });
  }

  // Forced release (got hit, dodged, victim escaped...)
  releaseGrab(p) {
    if (p.grab < 0) return;
    const v = this.victimOf(p);
    p.grab = -1;
    p.grabMask = 0;
    p.grabCd = 25;
    if (v && v.grabbedBy === p.id) {
      v.grabbedBy = -1;
      v.drag = false;
      if (v.state === ST.HELD) {
        this.setState(v, ST.TUMBLE);
        v.stun = 12;
        v.vy = Math.max(v.vy, 2.5);
      }
    }
  }

  throwPlayer(p) {
    const v = this.victimOf(p);
    const lifted = p.grabMask === 3;
    const wasDrag = !!(v && v.drag);
    p.grab = -1;
    p.grabMask = 0;
    p.grabCd = 20;
    if (!v) return;
    v.grabbedBy = -1;
    v.drag = false;
    const sp = (lifted ? 17 : wasDrag ? 15 : 12) + Math.min(8, v.damage * 0.035);
    v.x = p.x + p.fx * 0.9;
    v.z = p.z + p.fz * 0.9;
    v.y = p.y + (lifted ? 1.6 : 0.9);
    v.vx = p.fx * sp;
    v.vz = p.fz * sp;
    v.vy = lifted ? 7.5 : 9;
    v.damage = Math.min(999, v.damage + (lifted ? 7 : 5));
    this.addDaze(v, lifted ? 5 : 4);
    this.addSuper(p, 8);
    v.lastHitBy = p.id;
    v.lastHitTick = this.tick;
    this.setState(v, ST.TUMBLE);
    v.stun = 40;
    p.hitstop = 5;
    v.hitstop = 5;
    v.pendingVel = [v.vx, v.vy, v.vz];
    this.ev({
      e: 'throw', a: p.id, v: v.id, x: r2(v.x), y: r2(v.y + 1), z: r2(v.z), lf: lifted ? 1 : 0,
      w: lifted ? pick(['YEET!', 'OUTTA HERE!', 'HEAVE-HO!']) : wasDrag ? pick(['FLING!', 'WHEEE!', 'BYE-BYE!']) : pick(['HUP!', 'SHOVE!']),
    });
    p.act = { k: lifted ? 'throwOver' : 'fling', t: 0, w: 2, a: 4, r: 12, c: 0, hits: new Set(), item: null };
    this.setState(p, ST.ATTACK);
  }

  throwProp(p) {
    const pr = this.props.get(p.held);
    const hand = p.heldHand;
    p.held = -1;
    if (!pr) return;
    const def = ITEMS[pr.kind];
    const heavy = def.type === 'heavy';
    const sp = def.throwSpeed ?? (heavy ? 16 : def.type === 'light' ? 25 : 22);
    const side = heavy ? 0 : hand === 1 ? 0.35 : -0.35;
    pr.state = 'thrown';
    pr.owner = p.id;
    pr.ownerT = 0;
    pr.x = p.x + p.fx * 0.8 + p.rx * side;
    pr.y = p.y + (heavy ? 2.0 : 1.35);
    pr.z = p.z + p.fz * 0.8 + p.rz * side;
    pr.vx = p.fx * sp + p.vx * 0.3;
    pr.vz = p.fz * sp + p.vz * 0.3;
    pr.vy = heavy ? 5 : def.type === 'light' ? 3 : 3.5;
    if (def.fuseOnThrow && pr.fuse < 0) pr.fuse = def.fuseOnThrow;
    if (p.inp.ay != null && !heavy) {
      // light things fly where the camera aims
      const yaw = this.aimAssist(p, p.inp.ay, 22, 0.3);
      const hs = Math.hypot(pr.vx, pr.vz);
      pr.vx = Math.sin(yaw) * hs;
      pr.vz = Math.cos(yaw) * hs;
      p.facing = yaw;
    }
    this.ev({ e: 'throw', a: p.id, item: pr.id, k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z), w: heavy ? 'HEAVE!' : def.type === 'light' ? '' : 'FWOOSH!' });
    p.act = { k: heavy ? 'throwOver' : 'throw', t: 0, w: 2, a: 4, r: def.type === 'light' ? 8 : 12, c: 0, hits: new Set(), item: null, hand };
    this.setState(p, ST.ATTACK);
  }

  dropHeld(p) {
    if (p.held < 0) return;
    const pr = this.props.get(p.held);
    p.held = -1;
    if (!pr) return;
    pr.state = 'free';
    pr.owner = -1;
    pr.ownerT = 0;
    pr.vx = (Math.random() - 0.5) * 4;
    pr.vz = (Math.random() - 0.5) * 4;
    pr.vy = 4;
  }

  dropHeldIfHeavy(p) {
    if (this.isHeavy(p)) this.dropHeld(p);
  }

  // ---------------------------------------------------------------- ledge hanging
  tryHang(p) {
    if (p.hangCd > 0 || p.koStun > 0 || p.grab >= 0 || this.isHeavy(p)) return false;
    const b = p.inp.b;
    // need a free hand holding its trigger
    let hand = false;
    for (let h = 0; h < 2; h++) {
      if (!(b & HAND_BTN[h])) continue;
      if (p.held >= 0 && p.heldHand === h) continue;
      hand = true;
    }
    if (!hand) return false;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.src || bx.bounce) continue; // no hanging off moving platforms
      const dy = bx.y1 - p.y;
      if (dy < 1.1 || dy > 2.1) continue;
      const cx = clamp(p.x, bx.x0, bx.x1), cz = clamp(p.z, bx.z0, bx.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < 0.2 || d > 0.9) continue;
      const nx = dx / d, nz = dz / d;
      // room to climb onto?
      const tx = cx - nx * 0.5, tz = cz - nz * 0.5;
      let blocked = false;
      for (let j = 0; j < boxes.length; j++) {
        if (j === i) continue;
        const o = boxes[j];
        if (tx > o.x0 && tx < o.x1 && tz > o.z0 && tz < o.z1 && o.y0 < bx.y1 + 1.4 && o.y1 > bx.y1 + 0.05) { blocked = true; break; }
      }
      if (blocked) continue;
        if (p.stam < 20) return false;
      p.hang = { x: cx + nx * 0.5, z: cz + nz * 0.5, y: bx.y1 - 1.75, top: bx.y1, nx, nz, cx, cz };
      this.cancelAct(p);
      this.setState(p, ST.HANG);
      p.vx = p.vy = p.vz = 0;
      p.x = p.hang.x; p.y = p.hang.y; p.z = p.hang.z;
      p.facing = Math.atan2(-nx, -nz);
      this.ev({ e: 'hang', id: p.id, x: r2(cx), y: r2(bx.y1), z: r2(cz) });
      return true;
    }
    return false;
  }

  updateHang(p, inp) {
    const h = p.hang;
    if (!h) { this.setState(p, ST.FREE); return; }
    p.x = h.x; p.y = h.y; p.z = h.z;
    p.vx = p.vy = p.vz = 0;
    p.og = false;
    if (this.consume(p, BTN.JUMP)) {
      // climb up onto the ledge
      p.x = h.cx - h.nx * 0.55;
      p.z = h.cz - h.nz * 0.55;
      p.y = h.top + 0.05;
      p.vy = 5;
      p.vx = -h.nx * 2;
      p.vz = -h.nz * 2;
      p.hang = null;
      p.hangCd = 20;
      p.invuln = Math.max(p.invuln, 10);
      this.setState(p, ST.FREE);
      this.ev({ e: 'climb', id: p.id });
      return;
    }
    p.stam -= CLIMB.HANG_DRAIN;
    if (!(inp.b & ANY_HAND) || p.stam <= 0) {
      if (p.stam <= 0) this.ev({ e: 'tired', id: p.id, x: r2(p.x), y: r2(p.y + 2), z: r2(p.z) });
      p.x += h.nx * 0.1;
      p.z += h.nz * 0.1;
      p.hang = null;
      p.hangCd = 30;
      this.setState(p, ST.FREE);
    }
  }

  // ---------------------------------------------------------------- attacks
  nextPunch(p) {
    if (p.comboTimer > 0) {
      if (p.combo === 1) return 'jab2';
      if (p.combo === 2) return 'hook';
    }
    return 'jab1';
  }

  startAttack(p, kind) {
    const weapon = kind === 'swing' ? this.heldWeapon(p) : null;
    let def, rev = false, mirror = false;
    if (weapon) {
      def = ITEMS[weapon.kind].swing;
      if (def.style === 'slam') kind = 'slam';
      rev = p.combo === 9 && p.comboTimer > 0 && def.style === 'side';
      mirror = p.heldHand === 1;
    } else {
      if (kind === 'swing') kind = this.nextPunch(p);
      def = ATTACKS[kind];
    }
    p.act = {
      k: kind, t: 0, w: def.wind, a: def.active, r: def.rec, c: 0, rev, mirror,
      hits: new Set(), item: weapon ? weapon.kind : null, hitAny: false,
      chargeable: kind === 'jab1' || kind === 'jab2' || kind === 'hook' || kind === 'swing' || kind === 'slam',
    };
    if (kind === 'jab1') { p.combo = 1; p.comboTimer = 30; }
    else if (kind === 'jab2') { p.combo = 2; p.comboTimer = 30; }
    else if (kind === 'hook') { p.combo = 0; p.comboTimer = 0; }
    // gentle melee aim assist: snap toward a rascal right in front of you
    if (p.grab < 0 && kind !== 'pound') p.facing = this.aimAssist(p, p.facing, kind === 'spear' || kind === 'dk' || kind === 'slide' ? 6 : 2.8, 1.0);
    if (kind === 'dk') {
      p.vx = p.fx * 14.5;
      p.vz = p.fz * 14.5;
      p.vy = Math.max(p.vy, 5.5);
      p.airDash = false;
      this.ev({ e: 'whoosh', id: p.id, k: 'dk' });
    } else if (kind === 'spear' || kind === 'slide') {
      this.ev({ e: 'whoosh', id: p.id, k: kind });
      if (kind === 'slide') {
        p.vx = p.fx * 15;
        p.vz = p.fz * 15;
      }
    } else if (kind === 'pound') {
      p.vx *= 0.3;
      p.vz *= 0.3;
      p.vy = 3;
    }
    p.spT = 0;
    if (p.state === ST.BLOCK) p.blockCd = 6;
    this.setState(p, ST.ATTACK);
  }

  attackDef(act) {
    if (act.k === 'swing' || act.k === 'slam') return ITEMS[act.item].swing;
    return ATTACKS[act.k];
  }

  updateAttack(p, inp, stickLen) {
    const act = p.act;
    if (!act) { this.setState(p, ST.FREE); return; }
    act.t++;

    // animation-only actions (throws)
    if (!ATTACKS[act.k] && act.k !== 'swing' && act.k !== 'slam') {
      if (act.t >= act.w + act.a + act.r) { p.act = null; this.setState(p, ST.FREE); }
      this.locomote(p, inp, stickLen, 0.1);
      return;
    }
    const def = this.attackDef(act);
    if (BALLISTIC.has(act.k)) {
      this.updateBallistic(p, act, def);
      return;
    }

    // hold the wind-up pose to charge a power attack
    if (act.chargeable && act.t === act.w && inp.b & BTN.ATTACK && act.c === 0 && !act.charged) {
      act.charged = true;
      this.setState(p, ST.CHARGE);
      p.charge = 0;
      this.locomote(p, inp, stickLen, 0.2);
      return;
    }

    const activeStart = act.w;
    const activeEnd = act.w + act.a;
    if (act.t === activeStart) {
      const lunge = (def.lunge || 2) * (1 + act.c * 0.8) * (p.grab >= 0 ? 0.2 : 1);
      p.vx += p.fx * lunge;
      p.vz += p.fz * lunge;
      if (act.k === 'swing' || act.k === 'slam' || act.k === 'hay' || act.k === 'hook' || act.k === 'kick')
        this.ev({ e: 'whoosh', id: p.id, k: act.k, c: r2(act.c) });
    }
    if (act.t >= activeStart && act.t < activeEnd) this.attackHitbox(p, act, def);
    if (act.k === 'slam' && act.t === activeEnd - 1) this.slamShockwave(p, act);

    // chain / cancel windows during recovery
    if (act.t >= activeEnd) {
      const recT = act.t - activeEnd;
      const isPunch = act.k === 'jab1' || act.k === 'jab2';
      const isSide = act.k === 'swing';
      if (((isPunch && recT >= 2) || (isSide && recT >= act.r * 0.45)) && p.buf & BTN.ATTACK) {
        this.consume(p, BTN.ATTACK);
        if (isSide) {
          p.combo = act.rev ? 0 : 9;
          p.comboTimer = act.rev ? 0 : 20;
        }
        const v = this.victimOf(p);
        if (v && (p.grabMask === 3 || v.drag)) this.throwPlayer(p);
        else this.startAttack(p, isSide ? 'swing' : this.nextPunch(p));
        this.locomote(p, inp, stickLen, 0.1);
        return;
      }
      if (p.buf & BTN.DODGE && recT >= act.r * 0.5 && p.dodgeCd <= 0) {
        this.consume(p, BTN.DODGE);
        p.act = null;
        this.startDodge(p, inp, stickLen);
        return;
      }
    }
    if (act.t >= act.w + act.a + act.r) {
      p.act = null;
      this.setState(p, ST.FREE);
    }
    this.locomote(p, inp, stickLen, act.t < act.w ? 0.18 : 0.04);
  }

  // dropkick, spear tackle, slide tackle, ground pound
  updateBallistic(p, act, def) {
    const inActive = act.t >= act.w && act.t < act.w + act.a;
    const done = act.t >= act.w + act.a + act.r;
    switch (act.k) {
      case 'dk': {
        applyGravity(p, DT, true);
        p.vx *= 0.995; p.vz *= 0.995;
        collideMove(p, DT, this.boxes);
        if (act.t >= act.w) this.attackHitbox(p, act, def);
        if ((p.og && act.t > 3) || act.t > 70) {
          p.act = null;
          if (act.hitAny) this.setState(p, ST.GETUP);
          else {
            this.setState(p, ST.DOWN);
            p.stun = 26;
            this.ev({ e: 'bounce', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), s: 6 });
          }
        }
        return;
      }
      case 'spear': {
        if (act.t <= act.w + act.a) {
          p.vx = p.fx * 14;
          p.vz = p.fz * 14;
        } else groundFriction(p, this.boxes, 0.82);
        applyGravity(p, DT, false);
        collideMove(p, DT, this.boxes);
        if (inActive) {
          this.attackHitbox(p, act, def);
          if (act.hitAny) act.t = act.w + act.a; // stop on impact
        }
        break;
      }
      case 'slide': {
        if (inActive) {
          p.vx *= 0.965;
          p.vz *= 0.965;
        } else groundFriction(p, this.boxes, 0.8);
        applyGravity(p, DT, false);
        collideMove(p, DT, this.boxes);
        if (inActive) this.attackHitbox(p, act, def);
        break;
      }
      case 'pound': {
        if (act.t < act.w) {
          // hang in the air for a beat
          p.vy = Math.max(p.vy - 0.6, 0.5);
          p.vx *= 0.8;
          p.vz *= 0.8;
        } else if (inActive) {
          p.vy = -26;
          p.vx *= 0.9;
          p.vz *= 0.9;
        }
        collideMove(p, DT, this.boxes);
        if (inActive) {
          this.attackHitbox(p, act, def);
          if (p.og || act.t >= act.w + act.a - 1) {
            this.poundShockwave(p, act);
            act.t = act.w + act.a;
          }
        }
        break;
      }
    }
    if (done) {
      p.act = null;
      this.setState(p, act.k === 'slide' ? ST.GETUP : ST.FREE);
    }
  }

  poundShockwave(p, act) {
    this.ev({ e: 'pound', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z) });
    const R = 2.9;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || act.hits.has(o.id) || o.state === ST.HELD) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > R || Math.abs(o.y - p.y) > 1.2) continue;
      act.hits.add(o.id);
      const dl = d || 1;
      this.applyHit(p, o, {
        dmg: 5, kb: 6 + 7 * (1 - d / R), up: 9, dir: [(o.x - p.x) / dl, (o.z - p.z) / dl],
        word: 'QUAKE!', kind: 'shock', x: o.x, y: o.y + 0.3, z: o.z, noSelfStop: true,
      });
    }
  }

  updateCharge(p, inp, stickLen) {
    p.charge++;
    if (p.charge === CHARGE_MAX) this.ev({ e: 'chargeFull', id: p.id });
    if (!(inp.b & BTN.ATTACK) || p.charge >= CHARGE_MAX + 50) {
      const c = chargeAmount(p.charge);
      const act = p.act;
      if (act) {
        act.c = c;
        if (c > 0 && (act.k === 'jab1' || act.k === 'jab2' || act.k === 'hook')) {
          act.k = 'hay';
          act.a = ATTACKS.hay.active;
          act.r = ATTACKS.hay.rec;
          p.combo = 0;
          p.comboTimer = 0;
        }
        if (c > 0) act.r = Math.round(act.r * (1 + c * 0.35));
      }
      p.charge = 0;
      p.state = ST.ATTACK;
      p.st = 0;
    }
    this.locomote(p, inp, stickLen, 0.2);
  }

  startDodge(p, inp, stickLen) {
    let dx = p.fx, dz = p.fz;
    if (stickLen > 0.2) { dx = inp.mx / stickLen; dz = inp.mz / stickLen; }
    const sp = p.og ? 16 : 12;
    p.vx = dx * sp;
    p.vz = dz * sp;
    if (!p.og) { p.vy = Math.max(p.vy, 3); p.airDash = false; }
    p.invuln = Math.max(p.invuln, 11);
    p.dodgeCd = 34;
    this.releaseGrab(p);
    this.dropHeldIfHeavy(p);
    this.setState(p, ST.DODGE);
    this.ev({ e: 'dodge', id: p.id });
  }

  updateDodge(p) {
    if (p.st > 7) {
      const f = p.og ? 0.82 : 0.95;
      p.vx *= f;
      p.vz *= f;
    }
    applyGravity(p, DT, false);
    collideMove(p, DT, this.boxes);
    if (p.st >= 15) this.setState(p, ST.FREE);
  }

  // ---------------------------------------------------------------- held / stunned states
  updateHeld(p, inp) {
    const g = this.players.get(p.grabbedBy);
    if (!g || g.grab !== p.id || !g.alive) {
      p.grabbedBy = -1;
      p.drag = false;
      this.setState(p, ST.TUMBLE);
      p.stun = 10;
      return;
    }
    const mash = popcount(p.pressed) + (Math.abs(inp.mx) > 0.6 && Math.sign(inp.mx) !== Math.sign(p.lastStickX) ? 1 : 0);
    if (Math.abs(inp.mx) > 0.6) p.lastStickX = inp.mx;

    if (p.koStun > 0) {
      // out cold: can only mash to wake up sooner
      p.koStun -= 1 + mash * 5;
      if (p.koStun <= 0) {
        p.koStun = 0;
        p.dazeImmune = DAZE.IMMUNE_TICKS;
        this.breakFree(p, g, 'WAKE UP!');
      }
      return;
    }
    // REVERSAL: block right as you get grabbed
    if (p.st <= 14 && p.limp <= 0 && p.pressed & BTN.BLOCK) {
      this.breakFree(p, g, 'REVERSAL!');
      this.setState(g, ST.DIZZY);
      g.stun = 50;
      this.addSuper(p, 12);
      return;
    }
    if (p.limp > 0) p.limp--;
    else p.escape -= mash * 9 + 0.45;
    if (p.escape <= 0) this.breakFree(p, g, pick(['BREAK FREE!', 'LEMME GO!', 'WRIGGLE!']));
  }

  breakFree(p, g, word) {
    g.grab = -1;
    g.grabMask = 0;
    g.grabCd = 30;
    p.grabbedBy = -1;
    p.drag = false;
    p.vx = -g.fx * 6; p.vz = -g.fz * 6; p.vy = 5;
    p.x = g.x + g.fx * 1.0; p.z = g.z + g.fz * 1.0; p.y = Math.max(p.y, g.y);
    g.vx = -g.fx * 3; g.vz = -g.fz * 3;
    if (g.state === ST.FREE || g.state === ST.ATTACK || g.state === ST.CHARGE) {
      this.cancelAct(g);
      this.setState(g, ST.STAGGER);
      g.stun = 20;
    }
    this.setState(p, ST.FREE);
    p.invuln = 24;
    this.ev({ e: 'escape', id: p.id, a: g.id, x: r2(p.x), y: r2(p.y + 1.4), z: r2(p.z), w: word });
  }

  updateTumble(p) {
    const vyBefore = p.vy;
    const vxB = p.vx, vzB = p.vz;
    applyGravity(p, DT, true);
    p.vx *= 0.994;
    p.vz *= 0.994;
    const wasGround = p.og;
    collideMove(p, DT, this.boxes);
    if (p.stun > 0) p.stun--;
    if (p.koStun > 0) p.koStun = Math.max(1, p.koStun - 1);
    const hImpact = Math.hypot(vxB - p.vx, vzB - p.vz);
    if (hImpact > 10) {
      this.ev({ e: 'splat', id: p.id, x: r2(p.x), y: r2(p.y + 1), z: r2(p.z), s: r2(hImpact) });
      p.vx *= 0.4; p.vz *= 0.4;
      this.addDaze(p, 2);
    }
    if (p.og) {
      const s = -vyBefore;
      if (s > 7.5 && !wasGround) {
        p.vy = s * 0.42;
        p.og = false;
        p.vx *= 0.6;
        p.vz *= 0.6;
        this.ev({ e: 'bounce', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), s: r2(s) });
      } else {
        const slide = this.lv.phys && this.lv.phys.slide;
        groundFriction(p, this.boxes, slide ? 0.94 : 0.8);
        if (Math.hypot(p.vx, p.vz) < 2.5) {
          if (p.koStun > 0) this.setState(p, ST.KO);
          else {
            this.setState(p, ST.DOWN);
            p.stun = Math.max(18, p.stun);
          }
        }
      }
    } else if (p.koStun <= 0 && p.st > 8 && p.vy < 1.5 && p.inp.b & ANY_HAND) {
      // grab a ledge (or the wall) while flying past it - clutch save!
      if (this.tryHang(p) || this.tryClimb(p)) return;
    }
    // human bowling ball
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 11 && p.st > 3) {
      for (const o of this.players.values()) {
        if (o === p || !o.alive || o.state === ST.HELD || o.state === ST.TUMBLE || o.invuln > 0) continue;
        if (Math.abs(o.y - p.y) > 1.6) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 1.0) {
          const thrower = this.players.get(p.lastHitBy);
          this.applyHit(thrower && thrower !== o ? thrower : null, o, {
            dmg: 5, kb: sp * 0.65, up: 6, dir: [p.vx / sp, p.vz / sp], word: pick(['BONK!', 'OOF!', 'STRIKE!']),
            kind: 'body', x: (o.x + p.x) / 2, y: o.y + 1, z: (o.z + p.z) / 2, noSelfStop: true,
          });
          p.vx *= 0.55; p.vz *= 0.55;
        }
      }
    }
  }

  updateStagger(p) {
    this.physicsOnly(p, 0.86);
    if (p.stun > 0) p.stun--;
    if (p.stun <= 0) {
      if (p.koStun > 0) { this.setState(p, ST.TUMBLE); p.stun = 10; }
      else this.setState(p, ST.FREE);
    }
  }

  updateStunned(p) {
    this.physicsOnly(p, 0.8);
    p.stun -= 1 + popcount(p.pressed) * 4;
    if (p.stun <= 0) {
      if (p.state === ST.DOWN) {
        this.setState(p, ST.GETUP);
        p.invuln = Math.max(p.invuln, 16);
      } else this.setState(p, ST.FREE);
    }
  }

  updateKO(p) {
    this.physicsOnly(p, 0.75);
    p.koStun -= 1 + popcount(p.pressed) * 5;
    if (p.koStun <= 0) {
      p.koStun = 0;
      p.dazeImmune = DAZE.IMMUNE_TICKS;
      this.setState(p, ST.GETUP);
      p.invuln = Math.max(p.invuln, 20);
      this.ev({ e: 'wake', id: p.id, x: r2(p.x), y: r2(p.y + 1.4), z: r2(p.z) });
    }
  }

  addDaze(v, dmg) {
    if (v.koStun > 0 || v.dazeImmune > 0) return;
    const mul = this.set('ko') / charStats(v.char).grit * (v.acid > 0 ? 1.3 : 1);
    v.daze = Math.min(100, v.daze + dmg * DAZE.PER_DMG * mul);
    v.lastDazeTick = this.tick;
  }

  // Knock a rascal out cold
  knockOut(v) {
    v.koStun = DAZE.KO_TICKS;
    v.daze = 0;
    v.lastDazeTick = this.tick;
    v.hang = null;
    if (v.state === ST.HELD) {
      const g = this.players.get(v.grabbedBy);
      v.drag = !!g && g.grabMask !== 3;
    } else if (v.state !== ST.TUMBLE) {
      this.setState(v, ST.TUMBLE);
      v.stun = 10;
      if (!v.pendingVel) v.pendingVel = [v.vx * 0.5, 3, v.vz * 0.5];
    }
    this.ev({ e: 'knockout', id: v.id, x: r2(v.x), y: r2(v.y + 1.6), z: r2(v.z) });
  }

  // ---------------------------------------------------------------- combat
  attackHitbox(p, act, def) {
    const c = act.c;
    const pts = [];
    let hitR = def.r || 0.5;
    const fx = p.fx, fz = p.fz;
    const isWeapon = act.k === 'swing' || act.k === 'slam';
    if (isWeapon) {
      const w = ITEMS[act.item];
      hitR = def.hitR;
      const sgn = (act.rev ? -1 : 1) * (act.mirror ? -1 : 1);
      for (let s = 0; s <= 3; s++) {
        const prog = clamp((act.t - act.w - 1 + s / 3) / act.a, 0, 1);
        const ang = ((def.from + (def.to - def.from) * prog) * Math.PI) / 180;
        for (let k = 0; k < 4; k++) {
          const d = 0.45 + (w.len * (k + 1)) / 4;
          if (act.k === 'slam') {
            pts.push([p.x + fx * Math.cos(ang) * d, p.y + 1.3 + Math.sin(ang) * d, p.z + fz * Math.cos(ang) * d]);
          } else {
            const yaw = p.facing + ang * sgn;
            pts.push([p.x + Math.sin(yaw) * d, p.y + 1.05, p.z + Math.cos(yaw) * d]);
          }
        }
      }
    } else {
      const side = def.side || 0;
      const sx = p.rx * side, sz = p.rz * side;
      pts.push([p.x + fx * def.reach + sx, p.y + def.h, p.z + fz * def.reach + sz]);
      pts.push([p.x + fx * def.reach * 0.55 + sx, p.y + def.h, p.z + fz * def.reach * 0.55 + sz]);
    }

    for (const o of this.players.values()) {
      if (o === p || !o.alive || act.hits.has(o.id)) continue;
      const isVictim = o.id === p.grab;
      for (const pt of pts) {
        if (!capsuleHit(pt[0], pt[1], pt[2], hitR + (isVictim ? 0.4 : 0), o)) continue;
        act.hits.add(o.id);
        act.hitAny = true;
        let dx = o.x - p.x, dz = o.z - p.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx = (dx / dl) * 0.5 + fx * 0.5;
        dz = (dz / dl) * 0.5 + fz * 0.5;
        const words = isWeapon ? ITEMS[act.item].words : def.words;
        // Pummeling the rascal you're holding: no knockback, keeps them in your grip
        const pummel = isVictim && c < 0.5 && (act.k === 'jab1' || act.k === 'jab2' || act.k === 'swing' || act.k === 'slam');
        if (isVictim && !pummel) this.releaseGrab(p);
        const res = this.applyHit(p, o, {
          ignite: isWeapon && ITEMS[act.item].ignite,
          dmg: def.dmg * (1 + c * 0.9),
          kb: def.kb * (1 + c * 0.75) * this.kbMul,
          up: def.up * (1 + c * 0.4),
          dir: [dx, dz],
          word: c > 0.85 ? pick(['KA-BLAMMO!', 'HOME RUN!', 'MEGA POW!', 'KRAKOOM!']) : pick(words),
          kind: isWeapon ? 'weapon' : act.k === 'kick' || act.k === 'dk' || act.k === 'slide' ? 'kick' : 'punch',
          sfx: isWeapon ? ITEMS[act.item].sfx : 'punch',
          x: pt[0], y: pt[1], z: pt[2],
          guardBreak: c > 0.6 || act.k === 'slam' || act.k === 'spear' || act.k === 'pound',
          trip: act.k === 'slide' || act.k === 'spear',
          c, pummel,
        });
        if (isWeapon && res !== 'miss' && res !== 'parry') {
          const ig = ITEMS[act.item].ignite;
          if (ig && res === 'hit' && o.alive) {
            if (!o.burn) this.ev({ e: 'ignite', id: o.id });
            o.burn = Math.max(o.burn, ig);
          }
          this.damageWeapon(p);
        }
        break;
      }
    }
    // smack loose props (batting barrels is encouraged)
    for (const pr of this.props.values()) {
      if (pr.state === 'held' || act.hits.has('p' + pr.id)) continue;
      for (const pt of pts) {
        const dx = pr.x - pt[0], dy = pr.y - pt[1], dz = pr.z - pt[2];
        if (dx * dx + dy * dy + dz * dz < (hitR + pr.r) ** 2) {
          act.hits.add('p' + pr.id);
          const force = def.kb * (1 + c) * 1.15;
          pr.vx = fx * force;
          pr.vz = fz * force;
          pr.vy = 5 + def.up * 0.5;
          pr.state = 'thrown';
          pr.owner = p.id;
          pr.ownerT = 0;
          this.ev({ e: 'hit', x: r2(pt[0]), y: r2(pt[1]), z: r2(pt[2]), p: r2(force * 0.5), w: pick(['TONK!', 'DINK!', 'WHACK!']), a: p.id, v: -1, k: 'prop', sfx: ITEMS[pr.kind].sfx });
          break;
        }
      }
    }
  }

  slamShockwave(p, act) {
    const w = ITEMS[act.item];
    const ix = p.x + p.fx * (0.45 + w.len), iz = p.z + p.fz * (0.45 + w.len);
    this.ev({ e: 'slam', x: r2(ix), y: r2(p.y), z: r2(iz), c: r2(act.c), id: p.id });
    const R = 2.4 + act.c * 1.2;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || act.hits.has(o.id) || !o.og || o.state === ST.HELD) continue;
      const d = Math.hypot(o.x - ix, o.z - iz);
      if (d < R && Math.abs(o.y - p.y) < 1) {
        act.hits.add(o.id);
        const dl = d || 1;
        this.applyHit(p, o, {
          dmg: 3, kb: 7 * (1 - d / R) + 4, up: 9, dir: [(o.x - ix) / dl, (o.z - iz) / dl],
          word: 'SHAKE!', kind: 'shock', x: o.x, y: o.y + 0.3, z: o.z, noSelfStop: true,
        });
      }
    }
  }

  countCombo(a) {
    if (!a) return 0;
    a.comboHits = this.tick - a.comboTick < 80 ? a.comboHits + 1 : 1;
    a.comboTick = this.tick;
    return a.comboHits;
  }

  // Returns 'hit' | 'block' | 'parry' | 'miss'
  applyHit(a, v, h) {
    if (!v.alive) return 'miss';
    if (v.invuln > 0 && v.state !== ST.KO) return 'miss';
    if (a === v) a = null;
    if (a) {
      const pw = charStats(a.char).power;
      h = { ...h, dmg: h.dmg * pw, kb: h.kb * pw };
    }
    if (v.acid > 0) h = { ...h, dmg: h.dmg * 1.25 };

    // flames / acid spray: chip damage without stunlock
    if (h.kind === 'dot') {
      v.damage = Math.min(999, v.damage + h.dmg);
      this.addDaze(v, h.dmg);
      const w = charStats(v.char).weight;
      v.vx += h.dir[0] * h.kb / w * 0.3;
      v.vz += h.dir[1] * h.kb / w * 0.3;
      if (a) { v.lastHitBy = a.id; v.lastHitTick = this.tick; this.addSuper(a, h.dmg * 0.6); }
      if (v.daze >= 100 && v.koStun === 0 && v.dazeImmune <= 0) this.knockOut(v);
      return 'hit';
    }

    if (h.pummel && a) {
      v.damage = Math.min(999, v.damage + h.dmg);
      this.addDaze(v, h.dmg);
      this.addSuper(a, h.dmg * 1.2);
      v.escape += 10;
      const hs = 4 + Math.floor(h.dmg * 0.35);
      v.hitstop = hs;
      a.hitstop = Math.max(a.hitstop, hs - 1);
      v.lastHitBy = a.id;
      v.lastHitTick = this.tick;
      const cb = this.countCombo(a);
      this.ev({ e: 'hit', x: r2(h.x), y: r2(h.y), z: r2(h.z), p: r2(h.kb * 0.6), w: h.word, a: a.id, v: v.id, k: h.kind, hs, dx: 0, dz: 0, sfx: h.sfx, pm: 1, cb });
      if (v.daze >= 100 && v.koStun === 0 && v.dazeImmune <= 0) this.knockOut(v);
      return 'hit';
    }

    // super armor: SPIN-O-RAMA can't be interrupted by normal hits
    if (v.state === ST.SUPER && !UNBLOCKABLE.has(h.kind)) {
      v.damage = Math.min(999, v.damage + h.dmg * 0.5);
      this.ev({ e: 'hit', x: r2(h.x), y: r2(h.y), z: r2(h.z), p: 4, w: 'ARMOR!', a: a ? a.id : -1, v: v.id, k: 'block', hs: 0, dx: 0, dz: 0, sfx: 'block' });
      return 'block';
    }

    // ------------------------------------------------ blocking
    const ax = a ? a.x : h.x, az = a ? a.z : h.z;
    if (v.state === ST.BLOCK && !UNBLOCKABLE.has(h.kind)) {
      const tx = ax - v.x, tz = az - v.z;
      const tl = Math.hypot(tx, tz) || 1;
      if ((tx / tl) * v.fx + (tz / tl) * v.fz > 0.05) {
        if (v.blockT < GUARD.PARRY_TICKS && a && h.kind !== 'throw' && h.kind !== 'body') {
          // PARRY! perfect timing staggers the attacker
          if (a.alive && a.state !== ST.HELD) {
            this.cancelAct(a);
            this.releaseGrab(a);
            this.dropHeldIfHeavy(a);
            this.setState(a, ST.DIZZY);
            a.stun = 60;
            a.hitstop = 9;
            a.vx = -a.fx * 5; a.vz = -a.fz * 5;
            this.addDaze(a, 6);
          }
          v.hitstop = 9;
          v.guard = Math.min(GUARD.MAX, v.guard + 15);
          this.addSuper(v, 20);
          this.ev({ e: 'parry', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a.id, v: v.id });
          return 'parry';
        }
        v.guard -= h.dmg * GUARD.DRAIN_PER_DMG * (h.guardBreak ? GUARD.DRAIN_CHARGED : 1) + (h.kind === 'throw' ? 6 : 0);
        v.guardT = 0;
        if (v.guard <= 0) {
          // guard shatters
          v.guard = 0;
          v.guardBroken = true;
          this.setState(v, ST.DIZZY);
          v.stun = 90;
          v.damage += h.dmg * 0.3;
          this.addDaze(v, 8);
          v.vx = h.dir[0] * 6; v.vz = h.dir[1] * 6;
          v.hitstop = 10;
          if (a) a.hitstop = 10;
          this.addSuper(a, 10);
          this.ev({ e: 'guardbreak', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a ? a.id : -1, v: v.id });
          return 'hit';
        }
        v.damage += h.dmg * 0.1;
        const push = h.kb * 0.35;
        v.vx += h.dir[0] * push; v.vz += h.dir[1] * push;
        v.hitstop = 4;
        if (a && !h.noSelfStop) a.hitstop = 4;
        this.addSuper(v, 3);
        this.ev({ e: 'block', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a ? a.id : -1, v: v.id, p: r2(push), g: Math.round(v.guard) });
        return 'block';
      }
    }

    // ------------------------------------------------ clean hit
    v.damage = Math.min(999, v.damage + h.dmg);
    this.addDaze(v, h.dmg + (h.daze || 0));
    if (a && a.state !== ST.SUPER) this.addSuper(a, h.dmg * 1.5);
    this.addSuper(v, h.dmg * 0.8);
    const power = (h.kb * (1 + v.damage / 190)) / charStats(v.char).weight;
    const up = h.up * (0.65 + v.damage / 320) + (power > 14 ? 1.5 : 0);
    const dl = Math.hypot(h.dir[0], h.dir[1]) || 1;
    const vx = (h.dir[0] / dl) * power * 0.74;
    const vz = (h.dir[1] / dl) * power * 0.74;

    const hs = Math.min(18, 3 + Math.floor(power * 0.38));
    v.hitstop = hs;
    if (a && !h.noSelfStop) a.hitstop = Math.max(a.hitstop, hs - 1);
    v.pendingVel = [vx, up, vz];
    if (a) { v.lastHitBy = a.id; v.lastHitTick = this.tick; }

    // getting hit breaks holds both ways (and knocks you off ledges)
    this.releaseGrab(v);
    if (v.grabbedBy >= 0) {
      const g = this.players.get(v.grabbedBy);
      if (g) this.releaseGrab(g);
    }
    v.hang = null;
    this.cancelAct(v);
    if (power >= 13.5 || h.trip || UNBLOCKABLE.has(h.kind) || v.koStun > 0 || v.state === ST.HANG) {
      this.dropHeld(v);
      this.setState(v, ST.TUMBLE);
      v.stun = 20 + Math.floor(power * 1.4);
      v.hangCd = 12;
    } else {
      this.dropHeldIfHeavy(v);
      this.setState(v, ST.STAGGER);
      v.stun = 10 + Math.floor(power * 0.8);
    }
    const knocked = v.daze >= 100 && v.koStun === 0 && v.dazeImmune <= 0;
    const cb = this.countCombo(a);

    this.ev({
      e: 'hit', x: r2(h.x), y: r2(h.y), z: r2(h.z), p: r2(power), w: h.word, a: a ? a.id : -1, v: v.id,
      k: h.kind, hs, dx: r2(h.dir[0] / dl), dz: r2(h.dir[1] / dl), sfx: h.sfx || h.kind, c: h.c || 0, cb,
    });
    if (knocked) this.knockOut(v);
    return 'hit';
  }

  cancelAct(p) {
    p.act = null;
    p.charge = 0;
    if (p.state === ST.CHARGE || p.state === ST.ATTACK) p.state = ST.FREE;
  }

  damageWeapon(p) {
    const pr = this.props.get(p.held);
    if (!pr) return;
    pr.dur--;
    if (pr.dur <= 0) {
      this.ev({ e: 'break', x: r2(p.x + p.fx), y: r2(p.y + 1.2), z: r2(p.z + p.fz), k: pr.kind, w: pr.kind === 'guitar' ? 'KRANNNG!' : 'SNAP!' });
      p.held = -1;
      this.props.delete(pr.id);
    }
  }

  // ---------------------------------------------------------------- carried things follow their carrier
  updateHeldPositions() {
    for (const p of this.players.values()) {
      if (p.grab >= 0) {
        const v = this.players.get(p.grab);
        if (!v || !v.alive || v.grabbedBy !== p.id) { p.grab = -1; p.grabMask = 0; continue; }
        if (p.grabMask === 3) {
          v.x = p.x; v.z = p.z; v.y = p.y + 1.75;
          v.vx = p.vx; v.vy = p.vy; v.vz = p.vz;
          v.facing = p.facing + Math.PI / 2;
          v.og = false;
        } else if (v.drag) {
          this.dragBody(p, v);
        } else {
          const side = p.grabMask === 1 ? -0.12 : 0.12;
          v.x = p.x + p.fx * 0.95 + p.rx * side;
          v.z = p.z + p.fz * 0.95 + p.rz * side;
          v.y = p.y + 0.18;
          v.vx = p.vx; v.vy = p.vy; v.vz = p.vz;
          v.facing = p.facing + Math.PI;
          v.og = false;
        }
      }
      if (p.held >= 0) {
        const pr = this.props.get(p.held);
        if (!pr) { p.held = -1; continue; }
        const heavy = p.heldHand === 2;
        const side = heavy ? 0 : p.heldHand === 1 ? 0.4 : -0.4;
        pr.x = p.x + (heavy ? 0 : p.fx * 0.45) + p.rx * side;
        pr.y = p.y + (heavy ? 2.3 : 1.0);
        pr.z = p.z + (heavy ? 0 : p.fz * 0.45) + p.rz * side;
        pr.vx = p.vx; pr.vy = p.vy; pr.vz = p.vz;
      }
    }
  }

  // Limp body trails behind the dragging hand on a rope-like tether.
  dragBody(p, v) {
    const side = p.grabMask === 2 ? 0.42 : -0.42;
    const hx = p.x + p.rx * side + p.fx * 0.15;
    const hz = p.z + p.rz * side + p.fz * 0.15;
    const L = 1.25;
    const dx = v.x - hx, dz = v.z - hz;
    const d = Math.hypot(dx, dz);
    let tx = v.x, tz = v.z;
    if (d > L) {
      tx = hx + (dx / d) * L;
      tz = hz + (dz / d) * L;
    } else if (d < 0.5) {
      const nd = d || 1;
      tx = hx + (dx / nd) * 0.5;
      tz = hz + (dz / nd) * 0.5;
    }
    v.vx = (tx - v.x) / DT;
    v.vz = (tz - v.z) / DT;
    applyGravity(v, DT, false);
    collideMove(v, DT, this.boxes, 0.35, 0.5);
    const hy = p.y + 0.8;
    if (hy - v.y > 1.7) { v.y = hy - 1.7; if (v.vy < 0) v.vy = 0; }
    if (v.y - hy > 0.6) { v.y = hy + 0.6; if (v.vy > 0) v.vy = 0; }
    v.vx = clamp(v.vx, -20, 20);
    v.vz = clamp(v.vz, -20, 20);
    v.facing = Math.atan2(hx - v.x, hz - v.z);
  }

  separatePlayers() {
    const list = [];
    for (const p of this.players.values()) if (p.alive && p.state !== ST.HELD && p.state !== ST.HANG) list.push(p);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.y - b.y) > PLAYER_HEIGHT * 0.8) continue;
        let dx = b.x - a.x, dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        const min = a.state === ST.KO || b.state === ST.KO ? 0.6 : 0.85;
        if (d < min) {
          if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
        }
      }
    }
  }

  // ================================================================ props
  canCatch(o, pr) {
    if (o.state !== ST.FREE && o.state !== ST.BLOCK) return false;
    if (this.tick - o.lastHandPress > 10 || o.held >= 0 || o.grab >= 0) return false;
    const hl = Math.hypot(pr.vx, pr.vz) || 1;
    return (-pr.vx / hl) * o.fx + (-pr.vz / hl) * o.fz > 0.3;
  }

  updateProps() {
    for (const pr of [...this.props.values()]) {
      if (!this.props.has(pr.id)) continue; // removed by a chain explosion this tick
      if (pr.state === 'held') {
        const h = this.players.get(pr.owner);
        if (!h || h.held !== pr.id || !h.alive) { pr.state = 'free'; pr.owner = -1; }
        else if (pr.fuse > 0 && --pr.fuse === 0) {
          h.held = -1;
          this.explode(pr);
        }
        continue;
      }
      const def = ITEMS[pr.kind];
      pr.ownerT++;
      const speedBefore = Math.hypot(pr.vx, pr.vy, pr.vz);
      pr.vy -= MOVE.GRAVITY * DT;
      const slide = this.lv.phys && this.lv.phys.slide;
      const friction = def.friction ?? (slide ? 0.97 : 0.9);
      const impact = collideSphere(pr, DT, this.boxes, pr.r, def.restitution ?? 0.3, friction);
      if (pr.fuse > 0 && --pr.fuse === 0) { this.explode(pr); continue; }
      if (impact > 3.5 && speedBefore > 4) this.ev({ e: 'clunk', id: pr.id, s: r2(impact), k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z) });

      if (pr.state === 'thrown') {
        if (def.explosive && !def.fuseOnThrow && impact > 7) { this.explode(pr); continue; }
        if (def.breakOnHit && impact > (def.type === 'light' ? 5 : 11)) { this.breakProp(pr); continue; }
        if (speedBefore < 3.5 && pr.og) { pr.state = 'free'; pr.owner = -1; pr.ownerT = 0; }
        else if (speedBefore > 6) {
          for (const o of this.players.values()) {
            if (!o.alive || o.state === ST.HELD) continue;
            if (o.id === pr.owner && pr.ownerT < 25) continue;
            if (!capsuleHit(pr.x, pr.y, pr.z, pr.r, o)) continue;
            // NICE CATCH: grab it right as it arrives
            if (this.canCatch(o, pr)) {
              this.takeProp(o, pr, def.type === 'heavy' ? 2 : o.lastHand);
              this.addSuper(o, 10);
              this.ev({ e: 'catch', id: o.id, k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z) });
              break;
            }
            const thrower = this.players.get(pr.owner) || null;
            const s = clamp(speedBefore / 15, 0.6, 1.6);
            const hl = Math.hypot(pr.vx, pr.vz) || 1;
            const res = this.applyHit(thrower, o, {
              dmg: def.throwDmg * s, kb: (def.throwKb || 14) * s * this.kbMul, up: 6,
              dir: [pr.vx / hl, pr.vz / hl], word: pick(def.words), kind: 'throw', sfx: def.sfx,
              x: pr.x, y: pr.y, z: pr.z, noSelfStop: true,
            });
            if (res === 'miss') continue;
            if (def.pie && res === 'hit') this.ev({ e: 'pie', v: o.id });
            if (def.explosive && !def.fuseOnThrow) { this.explode(pr); break; }
            if (def.breakOnHit) { this.breakProp(pr); break; }
            pr.vx *= -0.3; pr.vz *= -0.3; pr.vy = 4;
            if (def.type === 'weapon') {
              pr.dur -= 2;
              if (pr.dur <= 0) { this.breakProp(pr); break; }
            }
            break;
          }
        }
      } else {
        // banana peels trip whoever runs over them
        if (def.trap && pr.og && pr.ownerT > 20) {
          for (const o of this.players.values()) {
            if (!o.alive || !o.og || Math.abs(o.y - pr.y + pr.r) > 0.7) continue;
            if (o.state !== ST.FREE && o.state !== ST.ATTACK && o.state !== ST.BLOCK && o.state !== ST.CHARGE && o.state !== ST.TAUNT) continue;
            if (Math.hypot(o.vx, o.vz) < 1.5 || Math.hypot(o.x - pr.x, o.z - pr.z) > 0.6) continue;
            this.slip(o, pr);
            break;
          }
          if (!this.props.has(pr.id)) continue;
        }
        for (const o of this.players.values()) {
          if (!o.alive || o.state === ST.HELD) continue;
          const dx = pr.x - o.x, dz = pr.z - o.z;
          const d = Math.hypot(dx, dz);
          const min = pr.r + 0.42;
          if (d < min && d > 1e-4 && pr.y < o.y + 1.4 && pr.y > o.y - 0.3) {
            pr.x += (dx / d) * (min - d);
            pr.z += (dz / d) * (min - d);
            pr.vx += (dx / d) * 1.5;
            pr.vz += (dz / d) * 1.5;
          }
        }
      }
      if (pr.y < this.lv.killY - 2) this.props.delete(pr.id);
    }
  }

  slip(o, pr) {
    this.cancelAct(o);
    this.releaseGrab(o);
    this.dropHeld(o);
    this.setState(o, ST.TUMBLE);
    o.vx = o.fx * 4;
    o.vz = o.fz * 4;
    o.vy = 7.5;
    o.og = false;
    o.stun = 30;
    o.damage += 2;
    this.addDaze(o, 3);
    this.ev({ e: 'slip', id: o.id, x: r2(pr.x), y: r2(pr.y + 1), z: r2(pr.z), w: pick(ITEMS.banana.words) });
    this.removeProp(pr);
  }

  breakProp(pr) {
    const def = ITEMS[pr.kind];
    this.ev({ e: 'break', x: r2(pr.x), y: r2(pr.y), z: r2(pr.z), k: pr.kind, w: pick(def.words) });
    if (def.puddle) this.addPuddle(pr.x, pr.y, pr.z, def.puddle, 420);
    this.removeProp(pr);
  }

  explode(pr) {
    if (!this.props.has(pr.id)) return;
    this.removeProp(pr);
    const def = ITEMS[pr.kind];
    const R = typeof def.explosive === 'number' ? def.explosive : 4.6;
    this.blast(pr.x, pr.y, pr.z, R, pr.owner, pick(def.words));
  }

  blast(x, y, z, R, ownerId, word) {
    const pr = { x, y, z, owner: ownerId };
    const thrower = this.players.get(ownerId) || null;
    this.ev({ e: 'explode', x: r2(x), y: r2(y), z: r2(z), w: word, r: R });
    for (const o of this.players.values()) {
      if (!o.alive) continue;
      const dx = o.x - pr.x, dy = o.y + 0.9 - pr.y, dz = o.z - pr.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = 1 - d / R;
      const hl = Math.hypot(dx, dz) || 1;
      this.applyHit(thrower && thrower !== o ? thrower : null, o, {
        dmg: 5 + 15 * f, kb: (9 + 18 * f) * this.kbMul, up: 9 + 6 * f, dir: [dx / hl, dz / hl],
        word: '', kind: 'explode', x: o.x, y: o.y + 1, z: o.z, noSelfStop: true,
      });
    }
    for (const q of this.props.values()) {
      if (q.state === 'held') continue;
      const dx = q.x - pr.x, dy = q.y - pr.y, dz = q.z - pr.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = (1 - d / R) * 16;
      q.vx += (dx / (d || 1)) * f;
      q.vy += 6 + f * 0.4;
      q.vz += (dz / (d || 1)) * f;
      q.state = 'thrown';
      q.owner = pr.owner;
      q.ownerT = 30;
      if (ITEMS[q.kind].explosive && q.fuse < 0) q.fuse = 9;
    }
    for (const o of this.players.values()) {
      // explosions set rascals alight
      if (o.alive && Math.hypot(o.x - x, o.z - z) < R * 0.6 && Math.abs(o.y - y) < 2.5) o.burn = Math.max(o.burn, 90);
    }
  }

  // ================================================================ hazards
  updateHazards() {
    const hz = this.lv.hazards || {};
    if (!this.set('hazards')) return;
    if (hz.balls) for (const b of hz.balls) this.updateBall(b);
    if (hz.beams) this.updateBeams(hz.beams);
    if (hz.snow) this.updateSnow(hz.snow);
    if (hz.crusher) this.updateCrusher(hz.crusher);
  }

  updateBall(ball) {
    const b = ballPosition(ball, this.time);
    const speed = Math.abs(b.dang);
    if (speed < 0.15) return;
    const sdx = Math.cos(b.yaw) * Math.sign(b.dang);
    const sdz = Math.sin(b.yaw) * Math.sign(b.dang);
    for (const o of this.players.values()) {
      if (!o.alive || o.ballCd > 0) continue;
      if (!capsuleHit(b.x, b.y, b.z, ball.radius, o)) continue;
      o.ballCd = 40;
      if (o.state === ST.HELD) {
        const g = this.players.get(o.grabbedBy);
        if (g) this.releaseGrab(g);
      }
      let dx = o.x - b.x, dz = o.z - b.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx = (dx / dl) * 0.4 + sdx * 0.8;
      dz = (dz / dl) * 0.4 + sdz * 0.8;
      this.applyHit(null, o, {
        dmg: 12, kb: 20 * speed * this.kbMul, up: 9, dir: [dx, dz], word: pick(['WHAM!', 'KA-RANG!', 'DOINNG!']),
        kind: 'ball', sfx: 'metal', x: (o.x + b.x) / 2, y: o.y + 1, z: (o.z + b.z) / 2, noSelfStop: true,
      });
    }
    for (const pr of this.props.values()) {
      if (pr.state === 'held') continue;
      const dx = pr.x - b.x, dy = pr.y - b.y, dz = pr.z - b.z;
      if (dx * dx + dy * dy + dz * dz < (ball.radius + pr.r) ** 2) {
        pr.vx = sdx * 18 * speed;
        pr.vz = sdz * 18 * speed;
        pr.vy = 6;
        pr.state = 'thrown';
        pr.owner = -1;
        pr.ownerT = 30;
        if (ITEMS[pr.kind].explosive && pr.fuse < 0) pr.fuse = 6;
      }
    }
  }

  bodyHeight(p) {
    if (p.state === ST.KO || p.state === ST.DOWN || (p.state === ST.HELD && p.drag)) return 0.55;
    if (p.state === ST.HANG) return 1.95;
    if (p.state === ST.ATTACK && p.act && p.act.k === 'slide') return 0.6;
    return PLAYER_HEIGHT;
  }

  updateBeams(cfg) {
    const b = beamState(cfg, this.time);
    if (b.phase !== 'move') return;
    const xMin = b.x - cfg.thick / 2 - 0.45;
    const xMax = b.x + cfg.speed * DT + cfg.thick / 2 + 0.45;
    for (const o of this.players.values()) {
      if (!o.alive || o.beamI === b.i) continue;
      if (o.x < xMin || o.x > xMax || o.z < cfg.z[0] || o.z > cfg.z[1]) continue;
      if (o.y + this.bodyHeight(o) < b.y0 || o.y > b.y1) continue;
      o.beamI = b.i;
      this.applyHit(null, o, {
        dmg: 10, kb: 18 * this.kbMul, up: 6, dir: [-1, 0], word: pick(['CLANG!', 'WHAM!', 'DOINNG!', 'BONK!']),
        kind: 'beam', sfx: 'metal', x: o.x + 0.4, y: (b.y0 + b.y1) / 2, z: o.z, noSelfStop: true,
      });
    }
    for (const pr of this.props.values()) {
      if (pr.state === 'held') continue;
      if (pr.x < xMin || pr.x > xMax || pr.z < cfg.z[0] || pr.z > cfg.z[1]) continue;
      if (pr.y + pr.r < b.y0 || pr.y - pr.r > b.y1) continue;
      pr.vx = -22;
      pr.vy = 4;
      pr.state = 'thrown';
      pr.owner = -1;
      pr.ownerT = 30;
    }
  }

  updateSnow(cfg) {
    if (this.phase === PHASE.FIGHT || this.phase === PHASE.LOBBY) {
      if (++this.snowT >= (cfg.interval * 60) / (this.suddenDeath ? 2 : 1)) {
        this.snowT = 0;
        const areas = this.boxes.filter((b) => (b.kind === 'ice' || b.kind === 'floe') && !b.src);
        let total = 0;
        for (const b of areas) total += (b.x1 - b.x0) * (b.z1 - b.z0);
        let r = Math.random() * total;
        let bx = areas[0];
        for (const b of areas) {
          r -= (b.x1 - b.x0) * (b.z1 - b.z0);
          if (r <= 0) { bx = b; break; }
        }
        const m = 0.8;
        const x = bx.x0 + m + Math.random() * Math.max(0.1, bx.x1 - bx.x0 - 2 * m);
        const z = bx.z0 + m + Math.random() * Math.max(0.1, bx.z1 - bx.z0 - 2 * m);
        const t = Math.round(cfg.warn * 60);
        this.snowDrops.push({ x, y: bx.y1, z, t });
        this.ev({ e: 'snowWarn', x: r2(x), y: bx.y1, z: r2(z), t });
      }
    }
    for (let i = this.snowDrops.length - 1; i >= 0; i--) {
      const d = this.snowDrops[i];
      if (--d.t > 0) continue;
      this.snowDrops.splice(i, 1);
      this.ev({ e: 'snowHit', x: r2(d.x), y: d.y, z: r2(d.z) });
      for (const o of this.players.values()) {
        if (!o.alive) continue;
        const dx = o.x - d.x, dz = o.z - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist > cfg.radius || Math.abs(o.y - d.y) > 2.2) continue;
        const dl = dist || 1;
        this.applyHit(null, o, {
          dmg: 8, kb: 14 - dist * 2, up: 9, dir: [dx / dl, dz / dl], word: pick(['POOF!', 'FWUMP!', 'AVALANCHE!']),
          kind: 'snow', sfx: 'snow', x: o.x, y: o.y + 1.2, z: o.z, noSelfStop: true,
        });
      }
      for (const pr of this.props.values()) {
        if (pr.state === 'held') continue;
        const dx = pr.x - d.x, dz = pr.z - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist > cfg.radius) continue;
        pr.vx += (dx / (dist || 1)) * 9;
        pr.vz += (dz / (dist || 1)) * 9;
        pr.vy = 6;
        pr.state = 'thrown';
        pr.owner = -1;
        pr.ownerT = 30;
      }
    }
  }

  updateCrusher(cfg) {
    const c = crusherState(cfg, this.time);
    const down = (c.phase === 'slam' && c.y < 2.0) || c.phase === 'hold';
    if (!down) return;
    const cx = (cfg.x0 + cfg.x1) / 2, cz = (cfg.z0 + cfg.z1) / 2;
    const m = 0.3;
    for (const o of this.players.values()) {
      if (!o.alive) continue;
      if (o.x < cfg.x0 - m || o.x > cfg.x1 + m || o.z < cfg.z0 - m || o.z > cfg.z1 + m) continue;
      if (o.y > c.y + 0.2 || o.y < -1.5) continue;
      const ex = Math.min(o.x - (cfg.x0 - m), cfg.x1 + m - o.x);
      const ez = Math.min(o.z - (cfg.z0 - m), cfg.z1 + m - o.z);
      let dir;
      if (ex < ez) dir = [o.x < cx ? -1 : 1, 0];
      else dir = [0, o.z < cz ? -1 : 1];
      if (o.crushI !== c.i) {
        o.crushI = c.i;
        if (o.state === ST.HELD) {
          const g = this.players.get(o.grabbedBy);
          if (g) this.releaseGrab(g);
        }
        this.applyHit(null, o, {
          dmg: 16, kb: 11, up: 4, dir, word: pick(['SQUISH!', 'KA-CHUNK!', 'FLATTENED!']), kind: 'crush', sfx: 'metal',
          x: o.x, y: o.y + 0.5, z: o.z, noSelfStop: true,
        });
        this.addDaze(o, 22);
        if (o.daze >= 100 && o.koStun === 0 && o.dazeImmune <= 0) this.knockOut(o);
        this.ev({ e: 'crush', id: o.id });
      } else if (c.phase === 'hold') {
        if (dir[0]) o.x = dir[0] < 0 ? cfg.x0 - m - 0.01 : cfg.x1 + m + 0.01;
        else o.z = dir[1] < 0 ? cfg.z0 - m - 0.01 : cfg.z1 + m + 0.01;
      }
    }
    for (const pr of [...this.props.values()]) {
      if (pr.state === 'held' || !this.props.has(pr.id)) continue;
      if (pr.x < cfg.x0 || pr.x > cfg.x1 || pr.z < cfg.z0 || pr.z > cfg.z1 || pr.y > c.y + pr.r) continue;
      const def = ITEMS[pr.kind];
      if (def.explosive) this.explode(pr);
      else if (def.breakOnHit || def.type === 'weapon') this.breakProp(pr);
      else {
        pr.vx = (pr.x < cx ? -1 : 1) * 10;
        pr.vy = 5;
        pr.state = 'thrown';
        pr.owner = -1;
        pr.ownerT = 30;
      }
    }
  }

  // ================================================================ ring outs / rounds
  checkRingOuts() {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.y < this.lv.killY || Math.abs(p.x) > 250 || Math.abs(p.z) > 250) this.eliminate(p);
    }
  }

  eliminate(p, squashed = false) {
    this.releaseGrab(p);
    if (p.grabbedBy >= 0) {
      const g = this.players.get(p.grabbedBy);
      if (g) { g.grab = -1; g.grabMask = 0; }
      p.grabbedBy = -1;
    }
    this.dropHeld(p);
    let by = -1;
    if (p.lastHitBy >= 0 && this.tick - p.lastHitTick < 60 * 8) {
      const k = this.players.get(p.lastHitBy);
      if (k && k !== p && !p.dummy) {
        k.kos++;
        by = k.id;
        this.addSuper(k, 15);
        this.rosterDirty = true;
      }
    }
    const left = this.humans().filter((o) => o.alive && o !== p).length;
    this.ev({ e: 'out', id: p.id, by, x: r2(p.x), y: r2(Math.max(p.y, this.lv.killY)), z: r2(p.z), left: p.dummy ? 99 : left, sq: squashed ? 1 : 0 });
    p.state = ST.DEAD;
    p.koStun = 0;
    p.drag = false;
    p.hang = null;
    p.climb = null;
    p.burn = 0;
    p.acid = 0;
    p.respawn = 100;
  }

  enterLobby() {
    this.phase = PHASE.LOBBY;
    this.phaseT = 0;
    this.round = 0;
    this.suddenDeath = false;
    this.kbMul = this.set('kb');
    this.finisher = null;
    for (const p of this.players.values()) {
      p.wins = 0;
      p.kos = 0;
      if (!p.dummy) p.ready = false;
      if (!p.alive) this.spawnPlayer(p);
    }
    this.rosterDirty = true;
    this.announce('LOBBY', 'Everyone press START / ENTER to ready up', 'small');
  }

  startRound() {
    this.round++;
    if (this.round === 1) this.matchStartLevel = this.levelIndex;
    this.phase = PHASE.COUNTDOWN;
    this.phaseT = 0;
    this.suddenDeath = false;
    this.kbMul = this.set('kb');
    this.dropTimer = 0;
    this.finisher = null;
    // pick the stage: rotate through all, random, or the host's favourite
    const st = this.set('stages');
    let next;
    if (st === 'rotate') next = (this.matchStartLevel + this.round - 1) % LEVELS.length;
    else if (st === 'random') next = (Math.random() * LEVELS.length) | 0;
    else next = st;
    this.setLevel(next);
    let i = 0;
    const order = [...this.players.values()].sort(() => Math.random() - 0.5);
    for (const p of order) this.spawnPlayer(p, p.dummy ? -1 : i++);
    this.announce(`ROUND ${this.round}`, this.lv.name, 'round');
  }

  updatePhase() {
    const t = this.phaseT;
    switch (this.phase) {
      case PHASE.LOBBY: {
        const humans = this.humans();
        if (humans.length >= 2 && humans.every((p) => p.ready) && t > 30) {
          for (const p of this.players.values()) { p.wins = 0; p.kos = 0; }
          this.rosterDirty = true;
          this.startRound();
        }
        break;
      }
      case PHASE.COUNTDOWN:
        if (t === 60) this.announce('3', '', 'count');
        if (t === 105) this.announce('2', '', 'count');
        if (t === 150) this.announce('1', '', 'count');
        if (t === 195) {
          this.announce('RUMBLE!', '', 'go');
          this.phase = PHASE.FIGHT;
          this.phaseT = 0;
        }
        break;
      case PHASE.FIGHT: {
        const limit = this.set('time');
        const race = this.lv.mode === 'race';
        if (!race && limit && t === 60 * limit && !this.suddenDeath) {
          this.suddenDeath = true;
          this.kbMul = this.set('kb') * 1.4;
          this.announce('SUDDEN DEATH!', 'Knockback x1.4', 'big');
        }
        const alive = this.humans().filter((p) => p.alive);
        if (alive.length <= 1 || (race && this.finisher)) {
          this.phase = PHASE.ROUND_END;
          this.phaseT = 0;
          const w = race && this.finisher ? this.finisher : alive[0];
          this.lastWinner = w ? w.id : -1;
          if (w) {
            w.wins++;
            this.rosterDirty = true;
            this.announce(`${w.name.toUpperCase()} WINS!`, `Round ${this.round}`, 'win');
            this.ev({ e: 'roundWin', id: w.id });
          } else this.announce('DOUBLE K.O.!', 'Nobody wins!', 'win');
        }
        break;
      }
      case PHASE.ROUND_END:
        if (t >= 60 * 3.5) {
          const champ = this.humans().find((p) => p.wins >= this.roundsToWin());
          if (champ) {
            this.phase = PHASE.MATCH_END;
            this.phaseT = 0;
            this.lastWinner = champ.id;
            this.announce('CHAMPION!', champ.name.toUpperCase(), 'champ');
            this.ev({ e: 'champ', id: champ.id });
          } else this.startRound();
        }
        break;
      case PHASE.MATCH_END:
        if (t >= 60 * 6) this.enterLobby();
        break;
    }
  }

  // ================================================================ networking
  roster() {
    return {
      t: 'roster',
      lv: this.levelIndex,
      host: this.hostClient,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, dummy: p.dummy, ready: p.ready, wins: p.wins, kos: p.kos,
        client: p.clientId, hat: p.hat, face: p.face, char: p.char,
      })),
    };
  }

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      const a = p.act;
      const b = p.inp.b;
      players.push({
        id: p.id,
        x: r2(p.x), y: r2(p.y), z: r2(p.z),
        vx: r2(p.vx), vy: r2(p.vy), vz: r2(p.vz),
        f: r2(p.facing),
        s: p.state, st: p.st,
        d: Math.round(p.damage),
        dz: Math.round(p.daze),
        gd: Math.round(p.guard),
        su: Math.round(p.super),
        ko: p.koStun,
        h: p.held, hh: p.heldHand,
        g: p.grab, gm: p.grabMask, gb: p.grabbedBy, dr: p.drag ? 1 : 0,
        hd: (b & BTN.GRAB_L ? 1 : 0) | (b & BTN.GRAB_R ? 2 : 0),
        og: p.og ? 1 : 0, gn: p.gnd, co: p.co, jb: p.jb, jh: p.jh ? 1 : 0, sp: p.spT | 0, bn: p.bn ? 1 : 0,
        hs: p.hitstop, iv: p.invuln > 0 ? 1 : 0,
        fi: p.burn > 0 ? 1 : 0, ac: p.acid > 0 ? 1 : 0, sm: Math.round((p.stam / CLIMB.STAMINA) * 100),
        ch: p.state === ST.CHARGE ? r2(chargeAmount(p.charge)) : 0,
        a: a ? [a.k, a.t, a.w, a.a, a.r, r2(a.c), a.rev ? 1 : 0, a.mirror ? 1 : 0, a.item || ''] : null,
        ack: p.ack,
        pr: isPredictable(p.state, a?.k) && p.hitstop === 0 ? 1 : 0,
      });
    }
    const props = [];
    for (const pr of this.props.values()) {
      props.push({
        id: pr.id, k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z),
        vx: r2(pr.vx), vy: r2(pr.vy), vz: r2(pr.vz),
        s: pr.state === 'held' ? 1 : pr.state === 'thrown' ? 2 : 0, o: pr.owner, f: pr.fuse > 0 ? 1 : 0,
        am: ITEMS[pr.kind].type === 'gun' ? pr.ammo : undefined,
      });
    }
    const ev = this.events;
    this.events = [];
    return {
      t: 'snap', tick: this.tick, time: Math.round(this.time * 1000) / 1000,
      ph: this.phase, pt: this.phaseT, rd: this.round, sd: this.suddenDeath ? 1 : 0, lv: this.levelIndex,
      hz: this.snowDrops.map((d) => [r2(d.x), d.y, r2(d.z), d.t]),
      bl: this.bullets.map((b) => [b.id, b.kind, r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz)]),
      pd: this.puddles.map((d) => [r2(d.x), r2(d.y), r2(d.z), d.r, d.t]),
      cx: this.lv.mode === 'race' ? r2(this.chaserPos) : undefined,
      players, props, ev,
    };
  }
}

// burning rascals run in a panic, acid slows you down (shared with client prediction via snapshot flags)
export function statusMoveMul(p) {
  return (p.burn > 0 ? 1.12 : 1) * (p.acid > 0 ? 0.78 : 1) * charStats(p.char).speed;
}

export function turnToward(a, target, rate) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= rate) return target;
  return a + Math.sign(d) * rate;
}

// sphere (x,y,z,r) vs player capsule
export function capsuleHit(x, y, z, r, o) {
  const lying = o.state === ST.KO || o.state === ST.DOWN || (o.state === ST.HELD && o.drag);
  let y0 = o.y + 0.45, y1 = o.y + 1.3, rad = 0.48;
  if (lying) { y0 = o.y + 0.2; y1 = o.y + 0.5; rad = 0.65; }
  else if (o.state === ST.HANG) { y0 = o.y + 0.9; y1 = o.y + 1.9; }
  const cy = y < y0 ? y0 : y > y1 ? y1 : y;
  const dx = x - o.x, dy = y - cy, dz = z - o.z;
  const rr = r + rad;
  return dx * dx + dy * dy + dz * dz < rr * rr;
}
