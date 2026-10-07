// Deterministic character movement + collision, shared by server and client prediction.
import { MOVE, BTN, PLAYER_RADIUS, PLAYER_HEIGHT } from './constants.js';

// p: { x,y,z, vx,vy,vz, og (on ground), gnd (ground box index), co (coyote ticks),
//      jb (jump buffer ticks), jh (jump held last tick) }
// inp: { mx, mz, b }
// opt: { mul (speed multiplier), canJump, dt, phys (level surface overrides) }
// returns true if a jump was started this step
export function stepMove(p, inp, boxes, opt) {
  const dt = opt.dt;
  const mul = opt.mul;
  const phys = opt.phys || NO_PHYS;
  let mx = inp.mx || 0;
  let mz = inp.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  // conveyor belts carry whoever stands on them
  const [cvx, cvz] = beltVel(p, boxes);
  const tx = mx * MOVE.SPEED * mul + cvx;
  const tz = mz * MOVE.SPEED * mul + cvz;
  const hasInput = len > 0.08 && mul > 0;
  const accel = p.og
    ? hasInput ? phys.accel ?? MOVE.GROUND_ACCEL : phys.decel ?? MOVE.GROUND_DECEL
    : phys.air ?? MOVE.AIR_ACCEL;
  approachVel(p, tx, tz, accel * dt);

  // Jumping with coyote time + input buffering
  const held = (inp.b & BTN.JUMP) !== 0;
  const pressed = held && !p.jh;
  p.jh = held;
  if (pressed) p.jb = MOVE.JUMP_BUFFER_TICKS;
  if (p.og) p.co = MOVE.COYOTE_TICKS;
  let jumped = false;
  if (p.jb > 0 && p.co > 0 && opt.canJump) {
    p.vy = MOVE.JUMP_VEL;
    p.og = false;
    p.co = 0;
    p.jb = 0;
    jumped = true;
  }
  if (p.jb > 0) p.jb--;
  if (!p.og && p.co > 0) p.co--;

  applyGravity(p, dt, held);
  collideMove(p, dt, boxes);
  return jumped;
}

const NO_PHYS = {};

export function beltVel(p, boxes) {
  if (p.og && p.gnd >= 0) {
    const b = boxes[p.gnd];
    if (b && b.conv) return b.conv;
  }
  return ZERO2;
}

// Riders of moving platforms get carried along with them.
function ride(o, boxes, dt) {
  if (!o.og || o.gnd < 0) return;
  const b = boxes[o.gnd];
  if (b && b.carry) {
    o.x += b.carry[0] * dt;
    o.z += b.carry[1] * dt;
  }
}
const ZERO2 = [0, 0];

// Friction for bodies that aren't walking (knocked down, staggered...). Belts still carry them.
export function groundFriction(p, boxes, friction) {
  if (!p.og) return;
  const [cvx, cvz] = beltVel(p, boxes);
  p.vx = cvx + (p.vx - cvx) * friction;
  p.vz = cvz + (p.vz - cvz) * friction;
}

function approachVel(p, tx, tz, maxDelta) {
  const dx = tx - p.vx;
  const dz = tz - p.vz;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d === 0) {
    p.vx = tx;
    p.vz = tz;
  } else {
    p.vx += (dx / d) * maxDelta;
    p.vz += (dz / d) * maxDelta;
  }
}

export function applyGravity(p, dt, jumpHeld = false) {
  let g = MOVE.GRAVITY;
  if (p.vy < 0) {
    g *= MOVE.FALL_GRAVITY_MUL;
    p.bn = false;
  } else if (!jumpHeld && !p.bn) g *= MOVE.JUMP_CUT_GRAVITY_MUL; // bounce pads keep full height
  p.vy -= g * dt;
  if (p.vy < -MOVE.MAX_FALL) p.vy = -MOVE.MAX_FALL;
}

// Moves a vertical cylinder (feet at p.y) through AABB world. Sets p.og.
// Returns the impact speed against surfaces (useful for bounce/thud effects).
export function collideMove(p, dt, boxes, R = PLAYER_RADIUS, H = PLAYER_HEIGHT) {
  ride(p, boxes, dt);
  const wasGround = p.og;
  const prevY = p.y;
  p.og = false;
  p.gnd = -1;
  let impact = 0;

  // --- vertical
  p.y += p.vy * dt;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!circleRect(p.x, p.z, R * 0.9, b)) continue;
    if (p.y < b.y1 && p.y + H > b.y0) {
      if (p.vy <= 0 && prevY >= b.y1 - 0.25) {
        impact = Math.max(impact, -p.vy);
        p.y = b.y1;
        if (b.bounce) {
          // bounce pad: BOING!
          p.vy = b.bounce;
          p.bn = true;
          p.bounced = true;
          continue;
        }
        p.vy = 0;
        p.og = true;
        p.gnd = i;
      } else if (p.vy > 0 && prevY + H <= b.y0 + 0.3) {
        p.y = b.y0 - H;
        impact = Math.max(impact, p.vy);
        p.vy = 0;
      }
    }
  }

  // --- horizontal
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!(p.y < b.y1 - 0.001 && p.y + H > b.y0)) continue;
      const cx = p.x < b.x0 ? b.x0 : p.x > b.x1 ? b.x1 : p.x;
      const cz = p.z < b.z0 ? b.z0 : p.z > b.z1 ? b.z1 : p.z;
      let dx = p.x - cx;
      let dz = p.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      // Step up small ledges when grounded
      if ((wasGround || p.og) && b.y1 - p.y <= MOVE.STEP_HEIGHT && p.vy <= 0.01) {
        p.y = b.y1;
        p.og = true;
        p.gnd = i;
        continue;
      }
      let nx, nz, pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        pen = R - d;
      } else {
        // center inside box: push out along the shallowest axis
        const l = p.x - b.x0, r = b.x1 - p.x, f = p.z - b.z0, k = b.z1 - p.z;
        const m = Math.min(l, r, f, k);
        if (m === l) { nx = -1; nz = 0; pen = l + R; }
        else if (m === r) { nx = 1; nz = 0; pen = r + R; }
        else if (m === f) { nx = 0; nz = -1; pen = f + R; }
        else { nx = 0; nz = 1; pen = k + R; }
      }
      p.x += nx * pen;
      p.z += nz * pen;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        p.vx -= vn * nx;
        p.vz -= vn * nz;
      }
    }
  }

  // Ground probe so walking off tiny bumps doesn't flicker grounded state
  if (!p.og && wasGround && p.vy <= 0) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (circleRect(p.x, p.z, R * 0.9, b) && p.y >= b.y1 - 0.01 && p.y - b.y1 < 0.12) {
        p.y = b.y1;
        p.vy = 0;
        p.og = true;
        p.gnd = i;
        break;
      }
    }
  }
  return impact;
}

export function circleRect(x, z, r, b) {
  const cx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x;
  const cz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Sphere vs AABB world for props. Returns impact speed.
export function collideSphere(o, dt, boxes, r, restitution = 0.35, friction = 0.85) {
  ride(o, boxes, dt);
  o.og = false;
  o.gnd = -1;
  o.x += o.vx * dt;
  o.y += o.vy * dt;
  o.z += o.vz * dt;
  let impact = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const cx = o.x < b.x0 ? b.x0 : o.x > b.x1 ? b.x1 : o.x;
      const cy = o.y < b.y0 ? b.y0 : o.y > b.y1 ? b.y1 : o.y;
      const cz = o.z < b.z0 ? b.z0 : o.z > b.z1 ? b.z1 : o.z;
      let dx = o.x - cx, dy = o.y - cy, dz = o.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      let nx, ny, nz, pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; nz = dz / d;
        pen = r - d;
      } else {
        nx = 0; ny = 1; nz = 0;
        pen = b.y1 - o.y + r;
      }
      o.x += nx * pen;
      o.y += ny * pen;
      o.z += nz * pen;
      const vn = o.vx * nx + o.vy * ny + o.vz * nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        o.vx -= (1 + restitution) * vn * nx;
        o.vy -= (1 + restitution) * vn * ny;
        o.vz -= (1 + restitution) * vn * nz;
        if (ny > 0.6 && b.bounce) {
          o.vy = b.bounce * 0.85;
        } else if (ny > 0.6) {
          o.og = true;
          o.gnd = i;
          const c = b.conv;
          const cvx = c ? c[0] : 0, cvz = c ? c[1] : 0;
          o.vx = cvx + (o.vx - cvx) * friction;
          o.vz = cvz + (o.vz - cvz) * friction;
          if (Math.abs(o.vy) < 1.2) o.vy = 0;
        }
      }
    }
  }
  return impact;
}
