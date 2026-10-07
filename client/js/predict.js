// Client-side prediction for locally controlled rascals: replays unacknowledged inputs
// through the exact same movement code the server runs, so movement feels instant.
import { DT, ST, STATE_MOVE_MUL, HOLD_HEAVY_MUL, holdMoveMul, updateSprint } from '/shared/constants.js';
import { stepMove } from '/shared/physics.js';
import { LEVELS, levelBoxesAt, hasMovers } from '/shared/levels.js';
import { ITEMS } from '/shared/items.js';
import { charStats } from '/shared/characters.js';

const TURN = { [ST.FREE]: 0.3, [ST.BLOCK]: 0.12, [ST.CHARGE]: 0.2, [ST.ATTACK]: 0.04, [ST.TAUNT]: 0, [ST.SUPER]: 0.3 };

function turnToward(a, target, rate) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= rate) return target;
  return a + Math.sign(d) * rate;
}

export class Predictor {
  constructor(id) {
    this.id = id;
    this.hist = [];
    this.s = null;
    this.active = false;
    this.baseMul = 1;
    this.canSprint = true;
    this.canJump = true;
    this.turn = 0.3;
    this.facing = 0;
    this.lv = LEVELS[0];
    this.time = 0;
    this.boxBuf = [];
    this.boxes = LEVELS[0].boxes;
    this.movers = false;
    this.char = 0;
  }

  addInput(inp) {
    this.hist.push(inp);
    if (this.hist.length > 240) this.hist.shift();
    if (this.active) this.step(inp);
  }

  step(inp) {
    if (this.turn > 0 && Math.hypot(inp.mx, inp.mz) > 0.2) {
      this.facing = turnToward(this.facing, Math.atan2(inp.mx, inp.mz), this.turn);
    }
    this.time += DT;
    if (this.movers) this.boxes = levelBoxesAt(this.lv, this.time, this.boxBuf);
    const stick = Math.hypot(inp.mx, inp.mz);
    const sprint = updateSprint(this.s, stick, this.canSprint);
    stepMove(this.s, inp, this.boxes, { dt: DT, mul: this.baseMul * sprint, canJump: this.canJump, phys: this.lv.phys });
  }

  // sp: this player's entry in the newest snapshot
  reconcile(sp, snap, charIdx) {
    while (this.hist.length && this.hist[0].seq <= (sp ? sp.ack : 0)) this.hist.shift();
    if (!sp || !sp.pr) {
      this.active = false;
      return;
    }
    const lv = LEVELS[snap.lv] || LEVELS[0];
    if (lv !== this.lv) {
      this.lv = lv;
      this.boxBuf = [];
      this.movers = hasMovers(lv);
      this.boxes = lv.boxes;
    }
    this.time = snap.time;
    if (this.movers) this.boxes = levelBoxesAt(lv, this.time, this.boxBuf);
    this.s = {
      x: sp.x, y: sp.y, z: sp.z, vx: sp.vx, vy: sp.vy, vz: sp.vz, og: !!sp.og, gnd: sp.gn ?? -1,
      co: sp.co | 0, jb: sp.jb | 0, jh: !!sp.jh, spT: sp.sp | 0, bn: !!sp.bn,
    };
    let heavyMul = 1;
    if (sp.h >= 0) {
      const pr = snap.props.find((p) => p.id === sp.h);
      const def = pr && ITEMS[pr.k];
      if (def && def.type === 'heavy') heavyMul = def.carryMul ?? HOLD_HEAVY_MUL;
    }
    let drag = false;
    if (sp.g >= 0) {
      const v = snap.players.find((p) => p.id === sp.g);
      drag = !!(v && v.dr);
    }
    const status = (sp.fi ? 1.12 : 1) * (sp.ac ? 0.78 : 1) * charStats(charIdx).speed;
    this.baseMul = (STATE_MOVE_MUL[sp.s] ?? 1) * holdMoveMul(sp.gm, drag, heavyMul) * status;
    this.canSprint = sp.s === ST.FREE && sp.g < 0 && heavyMul === 1;
    this.canJump = sp.s === ST.FREE || sp.s === ST.BLOCK;
    this.turn = TURN[sp.s] ?? 0;
    this.facing = sp.f;
    for (const inp of this.hist) this.step(inp);
    this.active = true;
  }
}
