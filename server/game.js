// Authoritative game simulation for one room.
import {
  DT, BTN, ALL_BTNS, ST, PHASE, MOVE, STATE_MOVE_MUL, holdMoveMul, DAZE,
  KILL_Y, ROUND_WINS_TO_MATCH, MAX_PLAYERS, COLORS, PLAYER_HEIGHT, isPredictable, clamp,
} from '../shared/constants.js';
import { ARENA, ballPosition } from '../shared/arena.js';
import { stepMove, collideMove, applyGravity, collideSphere } from '../shared/physics.js';
import { ITEMS, WEAPON_KINDS, HEAVY_KINDS } from '../shared/items.js';
import { ATTACKS, chargeAmount, CHARGE_MAX } from '../shared/combat.js';

const BOXES = ARENA.boxes;
const HAND_BTN = [BTN.GRAB_L, BTN.GRAB_R];
const TAUNTS = ['HA-HA!', 'NYAH!', 'COME ON!', 'BOO-YAH!', 'TOO EASY!', 'HEH HEH!'];

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
    this.og = false; this.co = 0; this.jb = 0; this.jh = false;
    this.facing = 0;
    this.state = ST.FREE;
    this.st = 0;
    this.stun = 0;
    this.damage = 0;
    this.daze = 0;
    this.lastDazeTick = -9999;
    this.dazeImmune = 0;
    this.koStun = 0; // >0 while knocked out cold
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
    this.invuln = 0;
    this.dodgeCd = 0;
    this.blockT = 0;
    this.blockCd = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.buf = 0;
    this.bufT = 0;
    this.airDash = true;
    this.lastHitBy = -1;
    this.lastHitTick = -9999;
    this.ballCd = 0;
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
    this.ballPos = ballPosition(ARENA.ball, 0);
    this.spawnInitialProps();
    this.addDummy();
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

  pushInput(id, seq, mx, mz, b) {
    const p = this.players.get(id);
    if (!p || p.dummy) return;
    seq |= 0;
    const last = p.queue.length ? p.queue[p.queue.length - 1].seq : p.ack;
    if (seq <= last) return;
    p.queue.push({ seq, mx: clamp(+mx || 0, -1, 1), mz: clamp(+mz || 0, -1, 1), b: b & ALL_BTNS });
    // Keep latency bounded if a client runs fast / bursts after a stall
    if (p.queue.length > 6) p.queue.splice(0, p.queue.length - 3);
  }

  spawnPlayer(p, idx = -1) {
    const keepWins = p.wins, keepKos = p.kos;
    p.reset();
    p.wins = keepWins;
    p.kos = keepKos;
    const spawns = ARENA.spawns;
    let s = spawns[0];
    if (p.dummy) s = ARENA.dummySpawn;
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
    p.facing = p.dummy ? 0 : Math.atan2(-p.x, -p.z);
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
    const pr = {
      id: this.nextPropId++, kind, x, y, z, vx: 0, vy: 0, vz: 0, og: false,
      state: 'free', owner: -1, ownerT: 0, dur: def.durability || 1, fuse: -1, r: def.r,
    };
    this.props.set(pr.id, pr);
    return pr;
  }

  randomKind() {
    const r = Math.random();
    if (r < 0.62) return pick(WEAPON_KINDS);
    if (r < 0.8) return 'crate';
    if (r < 0.92) return 'barrel';
    return 'tire';
  }

  spawnInitialProps() {
    for (const p of this.players.values()) p.held = -1;
    this.props.clear();
    const spots = [...ARENA.itemSpawns].sort(() => Math.random() - 0.5).slice(0, 7);
    const kinds = ['bat', 'pan', 'barrel', 'crate', pick(WEAPON_KINDS), pick(WEAPON_KINDS), pick(HEAVY_KINDS)];
    spots.forEach((s, i) => this.spawnProp(kinds[i], s[0], s[1] + 0.6, s[2]));
  }

  skyDrop() {
    const s = pick(ARENA.itemSpawns);
    const kind = this.randomKind();
    const pr = this.spawnProp(kind, s[0] + (Math.random() - 0.5), s[1] + 16, s[2] + (Math.random() - 0.5));
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

  // ================================================================ main loop
  step() {
    this.tick++;
    this.time += DT;
    this.phaseT++;
    this.updatePhase();

    for (const p of this.players.values()) this.readInput(p);
    const frozen = this.phase === PHASE.COUNTDOWN;
    if (!frozen) for (const p of this.players.values()) this.updatePlayer(p);
    this.updateHeldPositions();
    this.separatePlayers();
    this.updateProps();
    this.updateBall();
    this.checkRingOuts();

    if (this.phase === PHASE.FIGHT || this.phase === PHASE.LOBBY) {
      this.dropTimer++;
      const interval = this.suddenDeath ? 180 : 420;
      if (this.dropTimer > interval && this.props.size < 11) {
        this.dropTimer = 0;
        this.skyDrop();
      }
    }
  }

  readInput(p) {
    if (p.dummy) {
      p.inp = { mx: 0, mz: 0, b: 0, seq: 0 };
    } else if (p.queue.length) {
      p.inp = p.queue.shift();
    } // else: keep last input (held buttons repeat, edges don't retrigger)
    const b = p.inp.b;
    p.pressed = b & ~p.prevB;
    p.prevB = b;
    p.ack = p.inp.seq;
    // buffer actions pressed during hitstop / recovery
    const actionBits = p.pressed & (BTN.ATTACK | BTN.KICK | BTN.DODGE);
    if (actionBits) { p.buf |= actionBits; p.bufT = 9; }
    else if (p.bufT > 0 && --p.bufT === 0) p.buf = 0;
    if (p.pressed & BTN.START) this.toggleReady(p);
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

  // ================================================================ player update
  updatePlayer(p) {
    if (p.state === ST.DEAD) {
      if ((this.phase === PHASE.LOBBY || p.dummy) && --p.respawn <= 0) this.spawnPlayer(p);
      return;
    }
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
    if (p.dazeImmune > 0) p.dazeImmune--;
    if (p.daze > 0 && this.tick - p.lastDazeTick > DAZE.DECAY_DELAY) p.daze = Math.max(0, p.daze - DAZE.DECAY);
    if (p.comboTimer > 0 && --p.comboTimer === 0) p.combo = 0;
    if (p.og) p.airDash = true;

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
      case ST.GETUP:
        this.physicsOnly(p, 0.8);
        if (p.st >= 14) this.setState(p, ST.FREE);
        break;
    }
  }

  isHeavy(p) {
    if (p.held < 0) return false;
    const pr = this.props.get(p.held);
    return !!pr && ITEMS[pr.kind].type === 'heavy';
  }

  heldWeapon(p) {
    if (p.held < 0) return null;
    const pr = this.props.get(p.held);
    return pr && ITEMS[pr.kind].type === 'weapon' ? pr : null;
  }

  victimOf(p) {
    return p.grab >= 0 ? this.players.get(p.grab) : null;
  }

  moveMul(p) {
    const v = this.victimOf(p);
    return (STATE_MOVE_MUL[p.state] ?? 1) * holdMoveMul(p.grabMask, !!(v && v.drag), this.isHeavy(p));
  }

  locomote(p, inp, stickLen, turnRate) {
    if (stickLen > 0.2 && turnRate > 0) {
      p.facing = turnToward(p.facing, Math.atan2(inp.mx, inp.mz), turnRate);
    }
    const wasGround = p.og;
    const vyBefore = p.vy;
    const canJump = p.state === ST.FREE || p.state === ST.BLOCK;
    const jumped = stepMove(p, inp, BOXES, { dt: DT, mul: this.moveMul(p), canJump });
    if (jumped) {
      if (p.state === ST.BLOCK) this.setState(p, ST.FREE);
      this.ev({ e: 'jump', id: p.id });
    }
    if (!wasGround && p.og && vyBefore < -9) this.ev({ e: 'land', id: p.id, s: r2(-vyBefore) });
  }

  physicsOnly(p, friction = 0.85) {
    applyGravity(p, DT, false);
    if (p.og) { p.vx *= friction; p.vz *= friction; }
    collideMove(p, DT, BOXES);
  }

  updateFree(p, inp, stickLen) {
    const heavy = this.isHeavy(p);
    const weapon = this.heldWeapon(p);

    if (p.state === ST.BLOCK) {
      p.blockT++;
      if (!(inp.b & BTN.BLOCK)) {
        this.setState(p, ST.FREE);
        p.blockCd = 10;
      }
    } else if (p.state === ST.TAUNT) {
      if (p.st > 50 || stickLen > 0.5) this.setState(p, ST.FREE);
    }

    if (p.state === ST.FREE || p.state === ST.BLOCK) {
      if (p.buf & BTN.DODGE && p.dodgeCd <= 0 && (p.og || p.airDash)) {
        this.consume(p, BTN.DODGE);
        this.startDodge(p, inp, stickLen);
        return;
      }
      this.updateHands(p, true);
      if (p.state !== ST.FREE && p.state !== ST.BLOCK) return;

      if (this.consume(p, BTN.ATTACK)) {
        const v = this.victimOf(p);
        if (v && (p.grabMask === 3 || v.drag)) this.throwPlayer(p);
        else if (heavy) this.throwProp(p);
        else this.startAttack(p, weapon ? 'swing' : this.nextPunch(p));
        if (p.state === ST.ATTACK) return;
      }
      if (this.consume(p, BTN.KICK) && !heavy && p.grabMask !== 3) {
        const v = this.victimOf(p);
        if (!(v && v.drag)) {
          this.startAttack(p, p.og || p.grab >= 0 ? 'kick' : 'dk');
          return;
        }
      }
      if (p.state === ST.FREE && (inp.b & BTN.BLOCK) && p.blockCd <= 0 && p.grab < 0 && !heavy && p.og) {
        this.setState(p, ST.BLOCK);
        p.blockT = 0;
      }
      if (p.state === ST.FREE && (p.pressed & BTN.TAUNT) && p.og && p.grab < 0) {
        this.setState(p, ST.TAUNT);
        this.ev({ e: 'taunt', id: p.id, w: pick(TAUNTS) });
      }
    }
    this.locomote(p, inp, stickLen, p.state === ST.BLOCK ? 0.12 : 0.3);
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
      if (target && !(p.held >= 0 && this.isHeavy(p))) {
        this.grabPlayer(p, target, mask);
        // other trigger already held too? lift right away
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
      if (o === p || !o.alive || o.state === ST.HELD || o.state === ST.DODGE || o.grab >= 0) continue;
      if (o.invuln > 0 && o.state !== ST.KO && o.state !== ST.DOWN) continue;
      if (o.state === ST.TUMBLE && !o.og) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      if (Math.abs(o.y - p.y) > 1.1) continue;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && (dx * p.fx + dz * p.fz) / d < 0.3) continue;
      // knocked-out bodies lie on the floor, give a little extra reach
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
    v.escape = 65 + Math.min(80, v.damage * 0.3);
    v.limp = limp ? 50 : 0;
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
    best.state = 'held';
    best.owner = p.id;
    best.vx = best.vy = best.vz = 0;
    best.fuse = -1;
    p.held = best.id;
    p.heldHand = heavy ? 2 : h;
    this.ev({ e: 'pickup', id: p.id, item: best.id, k: best.kind });
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
    const sp = (lifted ? 17.5 : wasDrag ? 15.5 : 12) + Math.min(9, v.damage * 0.045);
    v.x = p.x + p.fx * 0.9;
    v.z = p.z + p.fz * 0.9;
    v.y = p.y + (lifted ? 1.6 : 0.9);
    v.vx = p.fx * sp;
    v.vz = p.fz * sp;
    v.vy = lifted ? 7.5 : 9;
    v.damage = Math.min(999, v.damage + (lifted ? 8 : 6));
    this.addDaze(v, lifted ? 8 : 6);
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
    p.held = -1;
    if (!pr) return;
    const heavy = ITEMS[pr.kind].type === 'heavy';
    const sp = heavy ? 16 : 22;
    const side = heavy ? 0 : p.heldHand === 1 ? 0.35 : -0.35;
    pr.state = 'thrown';
    pr.owner = p.id;
    pr.ownerT = 0;
    pr.x = p.x + p.fx * 0.8 + p.rx * side;
    pr.y = p.y + (heavy ? 2.0 : 1.3);
    pr.z = p.z + p.fz * 0.8 + p.rz * side;
    pr.vx = p.fx * sp + p.vx * 0.3;
    pr.vz = p.fz * sp + p.vz * 0.3;
    pr.vy = heavy ? 5 : 3.5;
    this.ev({ e: 'throw', a: p.id, item: pr.id, k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z), w: heavy ? 'HEAVE!' : 'FWOOSH!' });
    p.act = { k: heavy ? 'throwOver' : 'throw', t: 0, w: 2, a: 4, r: 12, c: 0, hits: new Set(), item: null, hand: p.heldHand };
    this.setState(p, ST.ATTACK);
  }

  dropHeld(p) {
    if (p.held < 0) return;
    const pr = this.props.get(p.held);
    p.held = -1;
    if (!pr) return;
    pr.state = 'free';
    pr.owner = -1;
    pr.vx = (Math.random() - 0.5) * 4;
    pr.vz = (Math.random() - 0.5) * 4;
    pr.vy = 4;
  }

  dropHeldIfHeavy(p) {
    if (this.isHeavy(p)) this.dropHeld(p);
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
    if (kind === 'dk') {
      p.vx = p.fx * 14.5;
      p.vz = p.fz * 14.5;
      p.vy = Math.max(p.vy, 5.5);
      p.airDash = false;
      this.ev({ e: 'whoosh', id: p.id, k: 'dk' });
    }
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

    // simple animation-only actions (throws)
    if (!ATTACKS[act.k] && act.k !== 'swing' && act.k !== 'slam') {
      if (act.t >= act.w + act.a + act.r) { p.act = null; this.setState(p, ST.FREE); }
      this.locomote(p, inp, stickLen, 0.1);
      return;
    }
    const def = this.attackDef(act);

    if (act.k === 'dk') {
      applyGravity(p, DT, true);
      p.vx *= 0.995; p.vz *= 0.995;
      collideMove(p, DT, BOXES);
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

    // Hold the wind-up pose to charge a power attack
    if (act.chargeable && act.t === act.w && (inp.b & BTN.ATTACK) && act.c === 0 && !act.charged) {
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
    collideMove(p, DT, BOXES);
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
    collideMove(p, DT, BOXES);
    if (p.stun > 0) p.stun--;
    if (p.koStun > 0) p.koStun = Math.max(1, p.koStun - 1);
    const hImpact = Math.hypot(vxB - p.vx, vzB - p.vz);
    if (hImpact > 10) {
      this.ev({ e: 'splat', id: p.id, x: r2(p.x), y: r2(p.y + 1), z: r2(p.z), s: r2(hImpact) });
      p.vx *= 0.4; p.vz *= 0.4;
      this.addDaze(p, 3);
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
        p.vx *= 0.8;
        p.vz *= 0.8;
        if (Math.hypot(p.vx, p.vz) < 2.5) {
          if (p.koStun > 0) this.setState(p, ST.KO);
          else {
            this.setState(p, ST.DOWN);
            p.stun = Math.max(18, p.stun);
          }
        }
      }
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
            dmg: 6, kb: sp * 0.7, up: 6, dir: [p.vx / sp, p.vz / sp], word: pick(['BONK!', 'OOF!', 'STRIKE!']),
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
    v.daze = Math.min(100, v.daze + dmg * DAZE.PER_DMG);
    v.lastDazeTick = this.tick;
  }

  // Knock a rascal out cold
  knockOut(v) {
    v.koStun = DAZE.KO_TICKS;
    v.daze = 0;
    v.lastDazeTick = this.tick;
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
        if (!isVictim && !capsuleHit(pt[0], pt[1], pt[2], hitR, o)) continue;
        if (isVictim && !capsuleHit(pt[0], pt[1], pt[2], hitR + 0.4, o)) continue;
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
          dmg: def.dmg * (1 + c * 0.9),
          kb: def.kb * (1 + c * 0.75) * this.kbMul,
          up: def.up * (1 + c * 0.4),
          dir: [dx, dz],
          word: c > 0.85 ? pick(['KA-BLAMMO!', 'HOME RUN!', 'MEGA POW!', 'KRAKOOM!']) : pick(words),
          kind: isWeapon ? 'weapon' : act.k === 'kick' || act.k === 'dk' ? 'kick' : 'punch',
          sfx: isWeapon ? ITEMS[act.item].sfx : 'punch',
          x: pt[0], y: pt[1], z: pt[2],
          guardBreak: c > 0.6 || act.k === 'slam',
          c, pummel,
        });
        if (isWeapon && res !== 'miss' && res !== 'parry') this.damageWeapon(p);
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
          dmg: 4, kb: 7 * (1 - d / R) + 4, up: 9, dir: [(o.x - ix) / dl, (o.z - iz) / dl],
          word: 'SHAKE!', kind: 'shock', x: o.x, y: o.y + 0.3, z: o.z, noSelfStop: true,
        });
      }
    }
  }

  // Returns 'hit' | 'block' | 'parry' | 'miss'
  applyHit(a, v, h) {
    if (!v.alive) return 'miss';
    if (v.invuln > 0 && v.state !== ST.KO) return 'miss';
    if (a === v) a = null;

    if (h.pummel && a) {
      v.damage = Math.min(999, v.damage + h.dmg);
      this.addDaze(v, h.dmg * 1.2);
      v.escape += 10;
      const hs = 4 + Math.floor(h.dmg * 0.35);
      v.hitstop = hs;
      a.hitstop = Math.max(a.hitstop, hs - 1);
      v.lastHitBy = a.id;
      v.lastHitTick = this.tick;
      this.ev({ e: 'hit', x: r2(h.x), y: r2(h.y), z: r2(h.z), p: r2(h.kb * 0.6), w: h.word, a: a.id, v: v.id, k: h.kind, hs, dx: 0, dz: 0, sfx: h.sfx, pm: 1 });
      if (v.daze >= 100 && v.koStun === 0 && v.dazeImmune <= 0) this.knockOut(v);
      return 'hit';
    }

    const ax = a ? a.x : h.x, az = a ? a.z : h.z;
    if (v.state === ST.BLOCK && a && h.kind !== 'explode' && h.kind !== 'ball') {
      const tx = ax - v.x, tz = az - v.z;
      const tl = Math.hypot(tx, tz) || 1;
      if ((tx / tl) * v.fx + (tz / tl) * v.fz > 0.15) {
        if (v.blockT < 8 && h.kind !== 'throw' && h.kind !== 'body') {
          // PARRY!
          if (a.alive && a.state !== ST.HELD) {
            this.cancelAct(a);
            this.releaseGrab(a);
            this.dropHeldIfHeavy(a);
            this.setState(a, ST.DIZZY);
            a.stun = 55;
            a.hitstop = 8;
            a.vx = -a.fx * 5; a.vz = -a.fz * 5;
            this.addDaze(a, 8);
          }
          v.hitstop = 8;
          this.ev({ e: 'parry', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a.id, v: v.id });
          return 'parry';
        }
        if (h.guardBreak) {
          this.setState(v, ST.DIZZY);
          v.stun = 85;
          v.damage += h.dmg * 0.3;
          this.addDaze(v, 10);
          v.vx = h.dir[0] * 6; v.vz = h.dir[1] * 6;
          v.hitstop = 10;
          a.hitstop = 10;
          this.ev({ e: 'guardbreak', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a.id, v: v.id });
          return 'hit';
        }
        v.damage += h.dmg * 0.15;
        const push = h.kb * 0.35;
        v.vx += h.dir[0] * push; v.vz += h.dir[1] * push;
        v.hitstop = 4;
        if (!h.noSelfStop) a.hitstop = 4;
        this.ev({ e: 'block', x: r2(h.x), y: r2(h.y), z: r2(h.z), a: a.id, v: v.id, p: r2(push) });
        return 'block';
      }
    }

    v.damage = Math.min(999, v.damage + h.dmg);
    this.addDaze(v, h.dmg);
    const power = h.kb * (1 + v.damage / 150);
    const up = h.up * (0.65 + v.damage / 300) + (power > 14 ? 1.5 : 0);
    const dl = Math.hypot(h.dir[0], h.dir[1]) || 1;
    const vx = (h.dir[0] / dl) * power * 0.78;
    const vz = (h.dir[1] / dl) * power * 0.78;

    const hs = Math.min(18, 3 + Math.floor(power * 0.38));
    v.hitstop = hs;
    if (a && !h.noSelfStop) a.hitstop = Math.max(a.hitstop, hs - 1);
    v.pendingVel = [vx, up, vz];
    if (a) { v.lastHitBy = a.id; v.lastHitTick = this.tick; }

    // getting hit breaks holds both ways
    this.releaseGrab(v);
    if (v.grabbedBy >= 0) {
      const g = this.players.get(v.grabbedBy);
      if (g) this.releaseGrab(g);
    }
    this.cancelAct(v);
    if (power >= 12.5 || h.kind === 'explode' || h.kind === 'ball' || v.koStun > 0) {
      this.dropHeld(v);
      this.setState(v, ST.TUMBLE);
      v.stun = 20 + Math.floor(power * 1.4);
    } else {
      this.dropHeldIfHeavy(v);
      this.setState(v, ST.STAGGER);
      v.stun = 10 + Math.floor(power * 0.8);
    }
    const knocked = v.daze >= 100 && v.koStun === 0 && v.dazeImmune <= 0;

    this.ev({
      e: 'hit', x: r2(h.x), y: r2(h.y), z: r2(h.z), p: r2(power), w: h.word, a: a ? a.id : -1, v: v.id,
      k: h.kind, hs, dx: r2(h.dir[0] / dl), dz: r2(h.dir[1] / dl), sfx: h.sfx || h.kind, c: h.c || 0,
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
      this.ev({ e: 'break', x: r2(p.x + p.fx), y: r2(p.y + 1.2), z: r2(p.z + p.fz), k: pr.kind, w: 'SNAP!' });
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
          // hoisted overhead
          v.x = p.x; v.z = p.z; v.y = p.y + 1.75;
          v.vx = p.vx; v.vy = p.vy; v.vz = p.vz;
          v.facing = p.facing + Math.PI / 2;
          v.og = false;
        } else if (v.drag) {
          this.dragBody(p, v);
        } else {
          // held by the collar at arm's length
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
    let dx = v.x - hx, dz = v.z - hz;
    const d = Math.hypot(dx, dz);
    let tx = v.x, tz = v.z;
    if (d > L) {
      tx = hx + (dx / d) * L;
      tz = hz + (dz / d) * L;
    } else if (d < 0.5) {
      // don't let the body clip into the dragger
      const nd = d || 1;
      tx = hx + (dx / nd) * 0.5;
      tz = hz + (dz / nd) * 0.5;
    }
    v.vx = (tx - v.x) / DT;
    v.vz = (tz - v.z) / DT;
    applyGravity(v, DT, false);
    collideMove(v, DT, BOXES, 0.35, 0.5);
    // stay tethered vertically (dangles off ledges)
    const hy = p.y + 0.8;
    if (hy - v.y > 1.7) { v.y = hy - 1.7; if (v.vy < 0) v.vy = 0; }
    if (v.y - hy > 0.6) { v.y = hy + 0.6; if (v.vy > 0) v.vy = 0; }
    // keep velocity sane for clients' extrapolation
    v.vx = clamp(v.vx, -20, 20);
    v.vz = clamp(v.vz, -20, 20);
    v.facing = Math.atan2(hx - v.x, hz - v.z);
  }

  separatePlayers() {
    const list = [];
    for (const p of this.players.values()) if (p.alive && p.state !== ST.HELD) list.push(p);
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
  updateProps() {
    for (const pr of [...this.props.values()]) {
      if (!this.props.has(pr.id)) continue; // removed by a chain explosion this tick
      if (pr.state === 'held') {
        const h = this.players.get(pr.owner);
        if (!h || h.held !== pr.id || !h.alive) { pr.state = 'free'; pr.owner = -1; }
        continue;
      }
      const def = ITEMS[pr.kind];
      pr.ownerT++;
      const speedBefore = Math.hypot(pr.vx, pr.vy, pr.vz);
      pr.vy -= MOVE.GRAVITY * DT;
      const impact = collideSphere(pr, DT, BOXES, pr.r, def.restitution ?? 0.3, 0.9);
      if (pr.fuse > 0 && --pr.fuse === 0) { this.explode(pr); continue; }
      if (impact > 3.5 && speedBefore > 4) this.ev({ e: 'clunk', id: pr.id, s: r2(impact), k: pr.kind, x: r2(pr.x), y: r2(pr.y), z: r2(pr.z) });

      if (pr.state === 'thrown') {
        if (def.explosive && impact > 7) { this.explode(pr); continue; }
        if (def.breakOnHit && impact > 11) { this.breakProp(pr); continue; }
        if (speedBefore < 3.5 && pr.og) { pr.state = 'free'; pr.owner = -1; }
        else if (speedBefore > 6) {
          for (const o of this.players.values()) {
            if (!o.alive || o.state === ST.HELD) continue;
            if (o.id === pr.owner && pr.ownerT < 25) continue;
            if (!capsuleHit(pr.x, pr.y, pr.z, pr.r, o)) continue;
            const thrower = this.players.get(pr.owner) || null;
            const s = clamp(speedBefore / 15, 0.6, 1.6);
            const hl = Math.hypot(pr.vx, pr.vz) || 1;
            const res = this.applyHit(thrower, o, {
              dmg: def.throwDmg * s, kb: (def.throwKb || 14) * s * this.kbMul, up: 6,
              dir: [pr.vx / hl, pr.vz / hl], word: pick(def.words), kind: 'throw', sfx: def.sfx,
              x: pr.x, y: pr.y, z: pr.z, noSelfStop: true,
            });
            if (res === 'miss') continue;
            if (def.explosive) { this.explode(pr); break; }
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
      if (pr.y < KILL_Y) this.props.delete(pr.id);
    }
  }

  breakProp(pr) {
    this.ev({ e: 'break', x: r2(pr.x), y: r2(pr.y), z: r2(pr.z), k: pr.kind, w: pick(ITEMS[pr.kind].words) });
    this.removeProp(pr);
  }

  explode(pr) {
    if (!this.props.has(pr.id)) return;
    this.removeProp(pr);
    const R = 4.6;
    const thrower = this.players.get(pr.owner) || null;
    this.ev({ e: 'explode', x: r2(pr.x), y: r2(pr.y), z: r2(pr.z), w: pick(ITEMS.barrel.words) });
    for (const o of this.players.values()) {
      if (!o.alive) continue;
      const dx = o.x - pr.x, dy = o.y + 0.9 - pr.y, dz = o.z - pr.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = 1 - d / R;
      const hl = Math.hypot(dx, dz) || 1;
      this.applyHit(thrower && thrower !== o ? thrower : null, o, {
        dmg: 6 + 18 * f, kb: (9 + 20 * f) * this.kbMul, up: 9 + 6 * f, dir: [dx / hl, dz / hl],
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
  }

  // ================================================================ wrecking ball
  updateBall() {
    const ball = ARENA.ball;
    const b = ballPosition(ball, this.time);
    this.ballPos = b;
    const speed = Math.abs(b.dang);
    if (speed < 0.15) return;
    const sdx = Math.cos(b.yaw) * Math.sign(b.dang);
    const sdz = Math.sin(b.yaw) * Math.sign(b.dang);
    for (const o of this.players.values()) {
      if (!o.alive || o.ballCd > 0) continue;
      if (!capsuleHit(b.x, b.y, b.z, ball.radius, o)) continue;
      o.ballCd = 40;
      let dx = o.x - b.x, dz = o.z - b.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx = (dx / dl) * 0.4 + sdx * 0.8;
      dz = (dz / dl) * 0.4 + sdz * 0.8;
      this.applyHit(null, o, {
        dmg: 14, kb: 22 * speed * this.kbMul, up: 9, dir: [dx, dz], word: pick(['WHAM!', 'KA-RANG!', 'DOINNG!']),
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

  // ================================================================ ring outs / rounds
  checkRingOuts() {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.y < KILL_Y || Math.abs(p.x) > 45 || Math.abs(p.z) > 45) this.eliminate(p);
    }
  }

  eliminate(p) {
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
        this.rosterDirty = true;
      }
    }
    this.ev({ e: 'out', id: p.id, by, x: r2(p.x), y: r2(Math.max(p.y, KILL_Y)), z: r2(p.z) });
    p.state = ST.DEAD;
    p.koStun = 0;
    p.drag = false;
    p.respawn = 100;
  }

  enterLobby() {
    this.phase = PHASE.LOBBY;
    this.phaseT = 0;
    this.round = 0;
    this.suddenDeath = false;
    this.kbMul = 1;
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
    this.phase = PHASE.COUNTDOWN;
    this.phaseT = 0;
    this.suddenDeath = false;
    this.kbMul = 1;
    this.dropTimer = 0;
    this.spawnInitialProps();
    let i = 0;
    const order = [...this.players.values()].sort(() => Math.random() - 0.5);
    for (const p of order) {
      p.grab = -1; p.grabMask = 0; p.grabbedBy = -1;
      this.spawnPlayer(p, p.dummy ? -1 : i++);
    }
    this.announce(`ROUND ${this.round}`, 'GET READY!', 'round');
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
        if (t === 60 * 75 && !this.suddenDeath) {
          this.suddenDeath = true;
          this.kbMul = 1.45;
          this.announce('SUDDEN DEATH!', 'Knockback x1.5', 'big');
        }
        const alive = this.humans().filter((p) => p.alive);
        if (alive.length <= 1) {
          this.phase = PHASE.ROUND_END;
          this.phaseT = 0;
          const w = alive[0];
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
          const champ = [...this.players.values()].find((p) => p.wins >= ROUND_WINS_TO_MATCH);
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
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, dummy: p.dummy, ready: p.ready, wins: p.wins, kos: p.kos, client: p.clientId,
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
        ko: p.koStun,
        h: p.held, hh: p.heldHand,
        g: p.grab, gm: p.grabMask, gb: p.grabbedBy, dr: p.drag ? 1 : 0,
        hd: (b & BTN.GRAB_L ? 1 : 0) | (b & BTN.GRAB_R ? 2 : 0),
        og: p.og ? 1 : 0, co: p.co, jb: p.jb, jh: p.jh ? 1 : 0,
        hs: p.hitstop, iv: p.invuln > 0 ? 1 : 0,
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
      });
    }
    const ev = this.events;
    this.events = [];
    return {
      t: 'snap', tick: this.tick, time: Math.round(this.time * 1000) / 1000,
      ph: this.phase, pt: this.phaseT, rd: this.round, sd: this.suddenDeath ? 1 : 0,
      players, props, ev,
    };
  }
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
  const y0 = o.y + (lying ? 0.2 : 0.45), y1 = o.y + (lying ? 0.5 : 1.3);
  const cy = y < y0 ? y0 : y > y1 ? y1 : y;
  const dx = x - o.x, dy = y - cy, dz = z - o.z;
  const rr = r + (lying ? 0.65 : 0.48);
  return dx * dx + dy * dy + dz * dz < rr * rr;
}
