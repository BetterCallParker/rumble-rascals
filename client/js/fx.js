// 3D comic effects: dust puffs, debris, impact bursts, stars, shockwaves, explosions, swoosh trails.
import * as THREE from 'three';
import { toon, starShape, burstShape } from './toon.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

const GEO = {};
function geo(name) {
  if (GEO[name]) return GEO[name];
  switch (name) {
    case 'sphere': GEO[name] = new THREE.SphereGeometry(0.5, 10, 8); break;
    case 'box': GEO[name] = new THREE.BoxGeometry(0.2, 0.2, 0.2); break;
    case 'star': GEO[name] = new THREE.ShapeGeometry(starShape(0.5, 0.21)); break;
    case 'burst': GEO[name] = new THREE.ShapeGeometry(burstShape(1, 0.5, 11, 0.35)); break;
    case 'burst2': GEO[name] = new THREE.ShapeGeometry(burstShape(1, 0.62, 16, 0.2)); break;
    case 'ring': GEO[name] = new THREE.RingGeometry(0.8, 1, 40); break;
    case 'plane': GEO[name] = new THREE.PlaneGeometry(1, 1); break;
    case 'spark': {
      const g = new THREE.PlaneGeometry(1, 0.12);
      g.translate(0.5, 0, 0);
      GEO[name] = g;
      break;
    }
  }
  return GEO[name];
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.active = [];
    this.pool = new Map();
    this.trails = new Map();
    this.markers = [];
  }

  get(kind) {
    const list = this.pool.get(kind);
    if (list && list.length) return list.pop();
    let m;
    switch (kind) {
      case 'dust':
        m = new THREE.Mesh(geo('sphere'), toon(0xffffff));
        break;
      case 'smoke':
        m = new THREE.Mesh(geo('sphere'), toon(0x6d6a80));
        break;
      case 'fire':
        m = new THREE.Mesh(geo('sphere'), new THREE.MeshBasicMaterial({ color: 0xffb21f }));
        break;
      case 'debris':
        m = new THREE.Mesh(geo('box'), toon(0xc98b45));
        m.castShadow = true;
        break;
      case 'star':
        m = new THREE.Mesh(geo('star'), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide, transparent: true }));
        m.layers.set(1);
        break;
      case 'burst':
      case 'burst2':
        m = new THREE.Mesh(geo(kind), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthTest: false }));
        m.renderOrder = 10;
        m.layers.set(1);
        break;
      case 'spark':
        m = new THREE.Mesh(geo('spark'), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthTest: false }));
        m.renderOrder = 11;
        m.layers.set(1);
        break;
      case 'ring':
        m = new THREE.Mesh(geo('ring'), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
        m.layers.set(1);
        break;
      case 'confetti':
      case 'streak':
        m = new THREE.Mesh(geo('plane'), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
        m.layers.set(1);
        break;
    }
    m.userData.kind = kind;
    return m;
  }

  release(p) {
    this.scene.remove(p.m);
    if (!this.pool.has(p.m.userData.kind)) this.pool.set(p.m.userData.kind, []);
    this.pool.get(p.m.userData.kind).push(p.m);
  }

  add(kind, o) {
    if (this.active.length > 700) return null;
    const m = this.get(kind);
    const p = {
      m, kind,
      life: 0,
      max: o.life ?? 0.6,
      pos: new THREE.Vector3(o.x, o.y, o.z),
      vel: new THREE.Vector3(o.vx || 0, o.vy || 0, o.vz || 0),
      grav: o.grav ?? 0,
      drag: o.drag ?? 0,
      s0: o.s0 ?? 0.3,
      s1: o.s1 ?? 1,
      s2: o.s2 ?? 0,
      spin: o.spin || 0,
      rot: o.rot ?? Math.random() * Math.PI * 2,
      bb: o.bb ?? false,
      floor: o.floor ?? -1e9,
      fade: o.fade ?? false,
      color: o.color,
      color2: o.color2,
      stretch: o.stretch || 0,
      flat: o.flat || false,
      axis: o.axis ? o.axis.clone() : null,
    };
    if (o.color !== undefined) m.material.color.setHex(o.color);
    if (m.material.opacity !== undefined) m.material.opacity = 1;
    m.position.copy(p.pos);
    m.scale.setScalar(p.s0);
    m.rotation.set(0, 0, 0);
    if (p.flat) m.rotation.x = -Math.PI / 2;
    if (p.axis) {
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), p.axis);
    }
    this.scene.add(m);
    this.active.push(p);
    return p;
  }

  update(dt, time) {
    const cam = this.camera;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        this.release(p);
        this.active.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.y *= -0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      const m = p.m;
      m.position.copy(p.pos);
      // scale curve: s0 -> s1 (pop) -> s2
      let s;
      if (t < 0.25) s = p.s0 + (p.s1 - p.s0) * (t / 0.25);
      else s = p.s1 + (p.s2 - p.s1) * ((t - 0.25) / 0.75);
      if (p.kind === 'spark') {
        m.scale.set(p.stretch * (1 - t), Math.max(0.2, 1.4 * (1 - t)), 1);
      } else if (p.kind === 'streak') {
        m.scale.set(p.s1, 0.06, 1);
      } else m.scale.setScalar(Math.max(0.001, s));
      if (p.bb) {
        m.quaternion.copy(cam.quaternion);
        p.rot += p.spin * dt;
        m.rotateZ(p.rot);
      } else if (p.spin && !p.flat && !p.axis) {
        m.rotation.x += p.spin * dt;
        m.rotation.y += p.spin * 0.7 * dt;
      }
      if (p.kind === 'spark') {
        // orient along projected velocity
        m.quaternion.copy(cam.quaternion);
        _v.copy(p.vel).applyQuaternion(_q.copy(cam.quaternion).invert());
        m.rotateZ(Math.atan2(_v.y, _v.x));
      }
      if (p.kind === 'fire' && p.color2 !== undefined && t > 0.35) m.material.color.setHex(p.color2);
      if (p.kind === 'confetti') {
        m.rotation.x += dt * 9;
        m.rotation.y += dt * 7;
        p.vel.x += Math.sin(time * 8 + p.rot) * dt * 3;
      }
      if (p.fade && m.material.transparent) m.material.opacity = 1 - t * t;
    }
    // trails
    for (const [key, tr] of this.trails) {
      if (!tr.update(dt)) {
        this.scene.remove(tr.mesh);
        tr.dispose();
        this.trails.delete(key);
      }
    }
    // drop markers
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const mk = this.markers[i];
      mk.t += dt;
      mk.group.rotation.y += dt * 3;
      const pulse = 1 + Math.sin(mk.t * 14) * 0.08;
      mk.group.scale.setScalar(pulse);
      if (mk.t > mk.max) {
        this.scene.remove(mk.group);
        this.markers.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- composite effects
  dust(x, y, z, n = 6, spread = 1, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (2 + Math.random() * 2.5) * spread;
      this.add('dust', {
        x: x + Math.cos(a) * 0.2, y: y + 0.15, z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 1.2, vz: Math.sin(a) * sp,
        drag: 4, life: 0.45 + Math.random() * 0.3, s0: size * 0.3, s1: size * (0.8 + Math.random() * 0.5), s2: 0,
      });
    }
  }

  impact(x, y, z, power, color = 0xffe14d, dir = null) {
    const big = power > 15;
    // white-hot core burst + colored burst behind
    this.add('burst', { x, y, z, life: big ? 0.2 : 0.14, s0: 0.2, s1: 0.5 + power * 0.06, s2: 0.2, bb: true, color: 0xffffff, rot: Math.random() * 6 });
    const b2 = this.add('burst2', { x, y, z, life: big ? 0.26 : 0.18, s0: 0.3, s1: 0.8 + power * 0.08, s2: 0.4, bb: true, color, rot: Math.random() * 6 });
    if (b2) b2.m.renderOrder = 9;
    // sparks
    const n = 5 + Math.min(14, power * 0.6) | 0;
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
      if (dir) _v.add(_v2.set(dir[0], 0.2, dir[1]).multiplyScalar(0.9)).normalize();
      const sp = 7 + Math.random() * 9 + power * 0.3;
      this.add('spark', { x, y, z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, drag: 6, life: 0.18 + Math.random() * 0.12, stretch: 0.5 + power * 0.03, color: i % 3 ? 0xffffff : color });
    }
    // star confetti
    const ns = 2 + Math.min(6, power * 0.25) | 0;
    for (let i = 0; i < ns; i++) {
      _v.set(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5).normalize();
      const sp = 3 + Math.random() * 4;
      this.add('star', { x, y, z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, grav: 9, life: 0.6 + Math.random() * 0.3, s0: 0.15, s1: 0.32 + Math.random() * 0.15, s2: 0, bb: true, spin: 8, color: i % 2 ? 0xffe14d : 0xffffff });
    }
    if (big) {
      this.add('ring', { x, y, z, life: 0.25, s0: 0.3, s1: 1.4 + power * 0.06, s2: 2 + power * 0.08, bb: true, color: 0xffffff, fade: true });
    }
  }

  debris(x, y, z, colors, n = 10, power = 8, floor = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * power * 0.4;
      this.add('debris', {
        x, y, z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 6, vz: Math.sin(a) * sp,
        grav: 26, life: 0.9 + Math.random() * 0.6, s0: 0.5 + Math.random() * 0.9, s1: 0.6 + Math.random() * 0.8, s2: 0,
        spin: 10 + Math.random() * 10, floor: floor + 0.05, color: colors[i % colors.length],
      });
    }
  }

  shockwave(x, y, z, radius = 2.5, color = 0xffffff) {
    this.add('ring', { x, y: y + 0.06, z, life: 0.35, s0: 0.3, s1: radius * 0.7, s2: radius, flat: true, color, fade: true });
    this.add('ring', { x, y: y + 0.07, z, life: 0.5, s0: 0.2, s1: radius * 0.5, s2: radius * 1.25, flat: true, color: 0x15101e, fade: true });
  }

  explosion(x, y, z) {
    this.add('burst', { x, y, z, life: 0.22, s0: 0.5, s1: 4.2, s2: 2, bb: true, color: 0xffffff });
    this.add('burst2', { x, y, z, life: 0.3, s0: 0.8, s1: 5.5, s2: 3, bb: true, color: 0xff8a00 });
    for (let i = 0; i < 16; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const sp = 3 + Math.random() * 6;
      this.add('fire', {
        x: x + _v.x * 0.5, y: y + _v.y * 0.5, z: z + _v.z * 0.5,
        vx: _v.x * sp, vy: _v.y * sp + 1, vz: _v.z * sp, drag: 3, life: 0.5 + Math.random() * 0.4,
        s0: 0.6, s1: 1.4 + Math.random() * 1.2, s2: 0, color: i % 3 ? 0xffb21f : 0xff4a1a, color2: 0x55505f,
      });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add('smoke', {
        x: x + Math.cos(a) * 0.8, y: y + 0.4, z: z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * 2, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * 2, drag: 1.5,
        life: 1.2 + Math.random() * 0.6, s0: 0.5, s1: 1.6 + Math.random() * 1.2, s2: 0.2,
      });
    }
    this.debris(x, y, z, [0xe8322c, 0x5a5a68, 0x2b2838], 14, 18, -2);
    this.shockwave(x, Math.max(0, y - 0.5), z, 5.5, 0xffe14d);
  }

  confetti(x, y, z, n = 60) {
    const colors = [0xef2f2a, 0xffd21f, 0x2f6cf0, 0x2fd4b8, 0xff6fb5, 0x9b5cf0, 0xffffff];
    for (let i = 0; i < n; i++) {
      this.add('confetti', {
        x: x + (Math.random() - 0.5) * 3, y: y + Math.random() * 2, z: z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 8, vy: 6 + Math.random() * 8, vz: (Math.random() - 0.5) * 8,
        grav: 9, drag: 1.4, life: 2.2 + Math.random() * 1.2, s0: 0.18, s1: 0.22, s2: 0.18, color: colors[i % colors.length],
      });
    }
  }

  streak(x, y, z, vx, vy, vz) {
    const sp = Math.hypot(vx, vy, vz) || 1;
    const axis = _v.set(vx / sp, vy / sp, vz / sp);
    this.add('streak', {
      x: x - axis.x * 0.6 + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.9, z: z - axis.z * 0.6 + (Math.random() - 0.5) * 0.8,
      vx: vx * 0.15, vy: vy * 0.15, vz: vz * 0.15, life: 0.18, s1: 0.8 + sp * 0.07, axis, fade: true, color: 0xffffff,
    });
  }

  sweat(x, y, z) {
    for (let i = 0; i < 3; i++) {
      this.add('dust', {
        x, y, z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
        grav: 14, life: 0.5, s0: 0.08, s1: 0.13, s2: 0.05, color: 0x8fd8ff,
      });
    }
  }

  dropMarker(x, y, z, life = 1.6) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(geo('ring'), new THREE.MeshBasicMaterial({ color: 0xef2f2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.8);
    const cross = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.55, 0.2, 4)), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide, depthWrite: false }));
    cross.rotation.x = -Math.PI / 2;
    cross.position.y = 0.01;
    g.add(ring, cross);
    g.traverse((o) => o.layers.set(1));
    g.position.set(x, y + 0.05, z);
    this.scene.add(g);
    this.markers.push({ group: g, t: 0, max: life });
  }

  // swoosh trail sample (call every frame while the swing is live)
  trail(key, base, tip, color = 0xffffff) {
    let tr = this.trails.get(key);
    if (!tr) {
      tr = new Trail(color);
      this.trails.set(key, tr);
      this.scene.add(tr.mesh);
    }
    tr.push(base, tip);
  }
}

const TRAIL_N = 18;
class Trail {
  constructor(color) {
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.alpha = new Float32Array(TRAIL_N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying float vA; void main(){ if (vA < 0.02) discard; gl_FragColor = vec4(mix(vec3(0.08,0.06,0.12), color, step(0.18, vA)), vA); }',
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    this.idle = 0;
    this.fed = false;
  }
  push(base, tip) {
    this.pts.unshift({ b: base.clone(), t: tip.clone(), age: 0 });
    if (this.pts.length > TRAIL_N) this.pts.pop();
    this.fed = true;
  }
  update(dt) {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > 0.14) this.pts.pop();
    if (!this.fed) this.idle += dt;
    else this.idle = 0;
    this.fed = false;
    const n = this.pts.length;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      const o = i * 6;
      if (!p) {
        this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0;
        continue;
      }
      this.pos[o] = p.b.x; this.pos[o + 1] = p.b.y; this.pos[o + 2] = p.b.z;
      this.pos[o + 3] = p.t.x; this.pos[o + 4] = p.t.y; this.pos[o + 5] = p.t.z;
      const a = i < n ? Math.max(0, 1 - p.age / 0.14) * (1 - i / TRAIL_N) : 0;
      this.alpha[i * 2] = a * 0.15;
      this.alpha[i * 2 + 1] = a * 0.95;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    return this.idle < 0.3;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
