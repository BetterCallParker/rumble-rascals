// Client-side prediction for locally controlled rascals: replays unacknowledged inputs
// through the exact same movement code the server runs, so movement feels instant.
import { DT, ST, STATE_MOVE_MUL, holdMoveMul } from '/shared/constants.js';
import { stepMove } from '/shared/physics.js';
import { ARENA } from '/shared/arena.js';
import { ITEMS } from '/shared/items.js';

const TURN = { [ST.FREE]: 0.3, [ST.BLOCK]: 0.12, [ST.CHARGE]: 0.2, [ST.ATTACK]: 0.04, [ST.TAUNT]: 0 };

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
    this.mul = 1;
    this.canJump = true;
    this.turn = 0.3;
    this.facing = 0;
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
    stepMove(this.s, inp, ARENA.boxes, { dt: DT, mul: this.mul, canJump: this.canJump });
  }

  // sp: this player's entry in the newest snapshot
  reconcile(sp, snap) {
    while (this.hist.length && this.hist[0].seq <= (sp ? sp.ack : 0)) this.hist.shift();
    if (!sp || !sp.pr) {
      this.active = false;
      return;
    }
    this.s = { x: sp.x, y: sp.y, z: sp.z, vx: sp.vx, vy: sp.vy, vz: sp.vz, og: !!sp.og, co: sp.co | 0, jb: sp.jb | 0, jh: !!sp.jh };
    let heavy = false;
    if (sp.h >= 0) {
      const pr = snap.props.find((p) => p.id === sp.h);
      heavy = !!(pr && ITEMS[pr.k].type === 'heavy');
    }
    let drag = false;
    if (sp.g >= 0) {
      const v = snap.players.find((p) => p.id === sp.g);
      drag = !!(v && v.dr);
    }
    this.mul = (STATE_MOVE_MUL[sp.s] ?? 1) * holdMoveMul(sp.gm, drag, heavy);
    this.canJump = sp.s === ST.FREE || sp.s === ST.BLOCK;
    this.turn = TURN[sp.s] ?? 0;
    this.facing = sp.f;
    for (const inp of this.hist) this.step(inp);
    this.active = true;
  }
}
