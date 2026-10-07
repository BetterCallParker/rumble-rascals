// Third-person cameras: one per local player (split-screen on one machine), plus an
// overview camera for spectating / menus.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

// Ray vs axis-aligned box (slab test). Returns entry distance or Infinity.
function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-6) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t0 = (lo - o) / d, t1 = (hi - o) / d;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmax < tmin) return Infinity;
  }
  return tmin;
}

export class PlayerCam {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 600);
    this.yaw = 0;
    this.pitch = 0.36;
    this.baseDist = 8.5;
    this.zoom = 1;
    this.dist = 8.5;
    this.target = new THREE.Vector3();
    this.trauma = 0;
    this.kick = new THREE.Vector3();
    this.idle = 9;
    this.time = Math.random() * 10;
    this.ready = false;
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    try {
      const z = parseFloat(localStorage.getItem('rr_zoom'));
      if (z > 0.4 && z < 2.2) this.zoom = z;
    } catch { /* storage blocked */ }
  }

  addTrauma(v) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  punch(pos, k) {
    _v.copy(pos).sub(this.camera.position).normalize().multiplyScalar(k * 0.5);
    this.kick.add(_v);
  }

  // look = { yaw, pitch, zoom, active } from Input.look()
  control(look) {
    this.yaw -= look.yaw;
    this.pitch = Math.min(1.25, Math.max(-0.25, this.pitch + look.pitch));
    if (look.zoom) {
      this.zoom = Math.min(2.1, Math.max(0.45, this.zoom * Math.exp(look.zoom)));
      try { localStorage.setItem('rr_zoom', this.zoom.toFixed(2)); } catch { /* ignore */ }
    }
    if (look.active) this.idle = 0;
  }

  // world-space movement for a raw stick (x right, y down)
  toWorld(sx, sy) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [sx * c + sy * s, -sx * s + sy * c];
  }

  // direction the camera looks along the ground (for aiming)
  aimYaw() {
    return this.yaw + Math.PI;
  }

  // steer: optional yaw to swing toward (e.g. looking at the wall you're climbing)
  update(dt, focus, vel, facing, boxes, overview = false, steer = null) {
    this.time += dt;
    this.idle += dt;
    const head = _v.set(focus.x, focus.y + 1.55, focus.z);
    if (!this.ready) {
      this.target.copy(head);
      this.yaw = facing + Math.PI;
      this.ready = true;
    }
    const kXZ = 1 - Math.exp(-dt * 12);
    const kY = 1 - Math.exp(-dt * 6);
    this.target.x += (head.x - this.target.x) * kXZ;
    this.target.z += (head.z - this.target.z) * kXZ;
    this.target.y += (head.y - this.target.y) * kY;
    // lazy follow: swing around behind the direction you're running
    const sp = Math.hypot(vel.x, vel.z);
    if (this.idle > 0.9 && sp > 2 && !overview) {
      let want = Math.atan2(vel.x, vel.z) + Math.PI;
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // don't spin around when running toward the camera
      if (Math.abs(d) < 2.3) this.yaw += d * Math.min(1, dt * 1.1 * Math.min(1, sp / 8));
    }
    if (steer !== null && this.idle > 0.6) {
      let d = steer - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 2.5);
    }
    const wantDist = this.baseDist * this.zoom * (overview ? 3 : 1);
    const cp = Math.cos(this.pitch), spt = Math.sin(this.pitch);
    _d.set(Math.sin(this.yaw) * cp, spt, Math.cos(this.yaw) * cp);
    // keep the camera out of walls
    let dist = wantDist;
    if (boxes && !overview) {
      for (const b of boxes) {
        if (b.y1 - b.y0 < 0.9) continue; // low clutter: look over it
        const t = rayBox(this.target.x, this.target.y, this.target.z, _d.x, _d.y, _d.z, b, dist);
        if (t < dist) dist = Math.max(1.2, t - 0.35);
      }
    }
    this.dist += (dist - this.dist) * (dist < this.dist ? 1 : 1 - Math.exp(-dt * 4));
    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(_d, this.dist);
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma;
    const t = this.time * 40;
    cam.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.22 * sh;
    cam.position.y += (Math.sin(t * 1.7) + Math.sin(t * 3.1)) * 0.2 * sh;
    cam.position.add(this.kick);
    this.kick.multiplyScalar(Math.exp(-dt * 10));
    cam.lookAt(this.target);
    cam.rotateZ(Math.sin(t * 0.9) * 0.02 * sh);
  }
}

// Normalized viewport rectangles (origin bottom-left, like WebGL)
export function layoutViewports(n) {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }];
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: c / cols, y: 1 - (r + 1) / rows, w: 1 / cols, h: 1 / rows });
  }
  return out;
}
