// Rascal character: procedural comic brawler with spring-driven, rubber-hose animation,
// 8 character looks, hats & face gear, status effects and poses for every move.
import * as THREE from 'three';
import { ST, COLORS } from '/shared/constants.js';
import { ITEMS } from '/shared/items.js';
import { CHARACTERS } from '/shared/characters.js';
import { toon, toonGradient, canvasTex, eyeTexture, mouthTexture, burlapTexture, targetTexture, starShape } from './toon.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const COM_Y = 0.85;
const LIE_DROP = 0.5;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

function springScalar(o, key, target, k, d, dt) {
  const vk = key + 'V';
  const v = o[vk] || 0;
  o[vk] = v + ((target - o[key]) * k - v * d) * dt;
  o[key] += o[vk] * dt;
}

function mk(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

class Limb {
  constructor(parent, x, y, len, radius, mat, endObj) {
    this.joint = new THREE.Group();
    this.joint.position.set(x, y, 0);
    parent.add(this.joint);
    this.len = len;
    const geo = new THREE.CapsuleGeometry(radius, len - radius, 4, 10);
    geo.translate(0, -len / 2, 0);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.joint.add(this.mesh);
    this.end = new THREE.Group();
    this.end.position.y = -len;
    this.joint.add(this.end);
    if (endObj) this.end.add(endObj);
    this.dir = new THREE.Vector3(0, -1, 0);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3(0, -1, 0);
    this.stretch = 1;
    this.stretchV = 0;
    this.targetStretch = 1;
    this.k = 260;
    this.d = 22;
  }

  set(x, y, z, stretch = 1, k = 260) {
    this.target.set(x, y, z).normalize();
    this.targetStretch = stretch;
    this.k = k;
    this.d = 2 * Math.sqrt(k) * 0.72;
  }

  update(dt) {
    const k = this.k, d = this.d;
    this.vel.x += ((this.target.x - this.dir.x) * k - this.vel.x * d) * dt;
    this.vel.y += ((this.target.y - this.dir.y) * k - this.vel.y * d) * dt;
    this.vel.z += ((this.target.z - this.dir.z) * k - this.vel.z * d) * dt;
    this.dir.addScaledVector(this.vel, dt);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, -1, 0);
    this.dir.normalize();
    this.stretchV += ((this.targetStretch - this.stretch) * k - this.stretchV * d) * dt;
    this.stretch = clamp(this.stretch + this.stretchV * dt, 0.35, 3.2);
    this.joint.quaternion.setFromUnitVectors(DOWN, this.dir);
    this.mesh.scale.set(1, this.stretch, 1);
    this.end.position.y = -this.len * this.stretch;
  }
}

// ------------------------------------------------------------------ cosmetics
const stripeTex = (a, b) => canvasTex(64, 64, (g, w) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(0, (i * w) / 8, w, w / 8 + 1);
  }
});

export function buildHat(i, colorHex) {
  const g = new THREE.Group();
  const add = (...m) => g.add(...m);
  const c = colorHex;
  switch (i) {
    case 1: { // party hat
      const cone = mk(new THREE.ConeGeometry(0.22, 0.6, 16), new THREE.MeshToonMaterial({ map: stripeTex('#ff6fb5', '#ffe14d'), gradientMap: toonGradient() }), 0, 0.3);
      add(cone, mk(new THREE.SphereGeometry(0.08, 8, 6), toon(0x2fd4ff), 0, 0.62));
      g.rotation.z = -0.25;
      break;
    }
    case 2: { // crown
      add(mk(new THREE.CylinderGeometry(0.27, 0.25, 0.18, 16, 1, true), toon(0xffc61a, { side: THREE.DoubleSide }), 0, 0.09));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        add(mk(new THREE.ConeGeometry(0.06, 0.16, 5), toon(0xffc61a), Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25));
      }
      add(mk(new THREE.SphereGeometry(0.05, 8, 6), toon(0xef2f2a), 0, 0.1, 0.26));
      break;
    }
    case 3: // top hat
      add(mk(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), toon(0x15101e), 0, 0.02), mk(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 18), toon(0x15101e), 0, 0.27),
        mk(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 18), toon(0xef2f2a), 0, 0.08));
      break;
    case 4: // cowboy
      add(mk(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 22), toon(0x8a5524), 0, 0.02), mk(new THREE.CylinderGeometry(0.22, 0.27, 0.32, 16), toon(0x8a5524), 0, 0.18),
        mk(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 16), toon(0x3a2a20), 0, 0.06));
      g.rotation.x = -0.12;
      break;
    case 5: { // viking
      add(mk(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x9aa0b8), 0, -0.05));
      for (const s of [-1, 1]) {
        const horn = mk(new THREE.ConeGeometry(0.08, 0.4, 8), toon(0xfff3d0), s * 0.36, 0.12);
        horn.rotation.z = -s * 1.0;
        add(horn);
      }
      break;
    }
    case 6: { // propeller cap
      add(mk(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ map: stripeTex('#ef2f2a', '#2f6cf0'), gradientMap: toonGradient() }), 0, -0.04));
      const prop = new THREE.Group();
      prop.add(mk(new THREE.BoxGeometry(0.6, 0.02, 0.08), toon(0xffe14d)), mk(new THREE.BoxGeometry(0.08, 0.02, 0.6), toon(0xffe14d)));
      prop.position.y = 0.32;
      add(mk(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), toon(0x15101e), 0, 0.28), prop);
      g.userData.spin = prop;
      break;
    }
    case 7: // chef
      add(mk(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16), toon(0xffffff), 0, 0.1), mk(new THREE.SphereGeometry(0.2, 10, 8), toon(0xffffff), -0.1, 0.32),
        mk(new THREE.SphereGeometry(0.2, 10, 8), toon(0xffffff), 0.1, 0.34), mk(new THREE.SphereGeometry(0.2, 10, 8), toon(0xffffff), 0, 0.38, 0.08));
      break;
    case 8: { // pirate
      const hat = mk(new THREE.ConeGeometry(0.5, 0.3, 3), toon(0x15101e), 0, 0.12);
      hat.rotation.y = Math.PI;
      hat.scale.set(1.1, 1, 0.8);
      add(hat, mk(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.14, 0.27));
      break;
    }
    case 9: // bunny ears
      for (const s of [-1, 1]) {
        const ear = mk(new THREE.SphereGeometry(0.09, 10, 8), toon(0xffffff), s * 0.13, 0.3);
        ear.scale.set(1, 3.2, 0.6);
        ear.rotation.z = -s * 0.2;
        const inner = mk(new THREE.SphereGeometry(0.05, 8, 6), toon(0xff9ac4), s * 0.13, 0.3, 0.04);
        inner.scale.set(1, 3.4, 0.4);
        inner.rotation.z = -s * 0.2;
        add(ear, inner);
      }
      break;
    case 10: // cone head
      add(mk(new THREE.ConeGeometry(0.25, 0.62, 14), toon(0xff7a1a), 0, 0.3), mk(new THREE.CylinderGeometry(0.15, 0.18, 0.1, 14), toon(0xffffff), 0, 0.28));
      break;
    case 11: // sombrero
      add(mk(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 26), toon(0xe8c44a), 0, 0.03), mk(new THREE.ConeGeometry(0.28, 0.42, 16), toon(0xe8c44a), 0, 0.24),
        mk(new THREE.TorusGeometry(0.62, 0.035, 6, 26), toon(0xef2f2a), 0, 0.05));
      g.children[2].rotation.x = Math.PI / 2;
      break;
    case 12: { // ball cap
      add(mk(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(c), 0, -0.04));
      const visor = mk(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), toon(c), 0, -0.02, 0.16);
      add(visor);
      break;
    }
    case 13: { // wizard
      add(mk(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), toon(0x2f3cb0), 0, 0.02), mk(new THREE.ConeGeometry(0.25, 0.8, 16), toon(0x2f3cb0), 0, 0.42));
      for (let k = 0; k < 4; k++) add(mk(new THREE.ShapeGeometry(starShape(0.06, 0.025)), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide }), (k % 2 ? 0.08 : -0.06), 0.25 + k * 0.13, 0.19 - k * 0.03));
      g.children[1].rotation.z = 0.15;
      break;
    }
    case 14: { // halo
      const halo = mk(new THREE.TorusGeometry(0.25, 0.04, 8, 24), toon(0xffe14d, { emissive: 0xc9a100 }), 0, 0.3);
      halo.rotation.x = Math.PI / 2;
      add(halo);
      g.userData.bob = halo;
      break;
    }
    case 15: // pom-pom beanie
      add(mk(new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ map: stripeTex('#2fd4b8', '#ffffff'), gradientMap: toonGradient() }), 0, -0.05),
        mk(new THREE.SphereGeometry(0.11, 10, 8), toon(0xffffff), 0, 0.28));
      break;
    case 16: { // headphones
      const band = mk(new THREE.TorusGeometry(0.42, 0.04, 6, 20, Math.PI), toon(0x15101e), 0, -0.25);
      add(band);
      for (const s of [-1, 1]) {
        const cup = mk(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), toon(c), s * 0.45, -0.3);
        cup.rotation.z = Math.PI / 2;
        add(cup);
      }
      break;
    }
    case 17: // mohawk
      for (let k = 0; k < 5; k++) add(mk(new THREE.ConeGeometry(0.06, 0.32, 6), toon(0xef2f2a), 0, 0.12, 0.22 - k * 0.11));
      break;
    case 18: { // flower
      const f = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        f.add(mk(new THREE.SphereGeometry(0.07, 8, 6), toon(0xff6fb5), Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0));
      }
      f.add(mk(new THREE.SphereGeometry(0.06, 8, 6), toon(0xffe14d)));
      f.position.set(0.28, 0.05, 0.1);
      f.rotation.y = 0.9;
      add(f);
      break;
    }
    case 19: { // chick buddy
      add(mk(new THREE.SphereGeometry(0.14, 12, 10), toon(0xffe14d), 0, 0.12), mk(new THREE.SphereGeometry(0.1, 10, 8), toon(0xffe14d), 0, 0.28, 0.04));
      const beak = mk(new THREE.ConeGeometry(0.03, 0.08, 6), toon(0xff9420), 0, 0.27, 0.15);
      beak.rotation.x = Math.PI / 2;
      add(beak, mk(new THREE.SphereGeometry(0.02, 6, 6), toon(0x15101e), 0.04, 0.31, 0.12), mk(new THREE.SphereGeometry(0.02, 6, 6), toon(0x15101e), -0.04, 0.31, 0.12));
      break;
    }
  }
  g.position.y = 0.42;
  return g;
}

export function buildFace(i) {
  const g = new THREE.Group();
  const add = (...m) => g.add(...m);
  switch (i) {
    case 1: // shades
      add(mk(new THREE.BoxGeometry(0.2, 0.12, 0.04), toon(0x15101e), 0.17, 0.08, 0.5), mk(new THREE.BoxGeometry(0.2, 0.12, 0.04), toon(0x15101e), -0.17, 0.08, 0.5),
        mk(new THREE.BoxGeometry(0.14, 0.03, 0.03), toon(0x15101e), 0, 0.11, 0.5));
      break;
    case 2: // mustache
      for (const s of [-1, 1]) {
        const m = mk(new THREE.TorusGeometry(0.08, 0.035, 6, 12, Math.PI * 1.2), toon(0x3a2a20), s * 0.09, -0.08, 0.48);
        m.rotation.z = s > 0 ? Math.PI * 1.1 : -0.1;
        add(m);
      }
      break;
    case 3: // eyepatch
      add(mk(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0x15101e }), 0.17, 0.08, 0.5), mk(new THREE.TorusGeometry(0.5, 0.015, 4, 30), toon(0x15101e), 0, 0.14, 0));
      g.children[1].rotation.x = Math.PI / 2 - 0.25;
      break;
    case 4: // monocle
      add(mk(new THREE.TorusGeometry(0.12, 0.02, 6, 18), toon(0xffc61a), -0.17, 0.08, 0.5), mk(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), toon(0xffc61a), -0.27, -0.12, 0.45));
      break;
    case 5: // clown nose
      add(mk(new THREE.SphereGeometry(0.09, 12, 10), toon(0xef2f2a), 0, -0.04, 0.52));
      break;
    case 6: // goggles
      for (const s of [-1, 1]) {
        const lens = mk(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), toon(0x9aa0b8), s * 0.17, 0.1, 0.48);
        lens.rotation.x = Math.PI / 2;
        add(lens);
      }
      add(mk(new THREE.TorusGeometry(0.5, 0.03, 4, 30), toon(0x8a5524), 0, 0.1, 0));
      g.children[2].rotation.x = Math.PI / 2;
      break;
    case 7: { // bandana
      const b = mk(new THREE.CylinderGeometry(0.51, 0.49, 0.22, 20, 1, true, -Math.PI / 2 - 1.2, 2.4), toon(0xef2f2a, { side: THREE.DoubleSide }), 0, -0.2, 0);
      add(b);
      break;
    }
  }
  return g;
}

// ------------------------------------------------------------------ character look extras
function addLookParts(r, look, col) {
  const head = r.head, model = r.model;
  const body = r.bodyMat;
  const dark = toon(col.dark);
  switch (look) {
    case 'classic':
      for (let i = 0; i < 3; i++) {
        const t = mk(new THREE.ConeGeometry(0.09, 0.3, 7), body, (i - 1) * 0.11, 0.5, -0.04 + Math.abs(i - 1) * -0.04);
        t.rotation.z = (1 - i) * 0.45;
        t.rotation.x = -0.25;
        head.add(t);
      }
      break;
    case 'bruiser': {
      const top = mk(new THREE.BoxGeometry(0.6, 0.16, 0.5), dark, 0, 0.42, -0.02);
      head.add(top);
      const jaw = mk(new THREE.SphereGeometry(0.4, 14, 10), body, 0, -0.22, 0.12);
      jaw.scale.set(1.15, 0.6, 0.9);
      head.add(jaw);
      r.torso.scale.set(1.18, 1.05, 1.0);
      for (const arm of [r.armL, r.armR]) arm.end.scale.setScalar(1.25);
      break;
    }
    case 'zippy':
      for (let i = 0; i < 5; i++) {
        const sp = mk(new THREE.ConeGeometry(0.1, 0.5, 6), body, 0, 0.25 - i * 0.02, -0.25 - i * 0.03);
        sp.rotation.x = -1.2 - i * 0.12;
        sp.rotation.z = (i - 2) * 0.35;
        head.add(sp);
      }
      {
        const bolt = new THREE.Shape();
        bolt.moveTo(-0.05, 0.2); bolt.lineTo(0.08, 0.2); bolt.lineTo(0.0, 0.03); bolt.lineTo(0.1, 0.03); bolt.lineTo(-0.08, -0.22); bolt.lineTo(-0.01, -0.03); bolt.lineTo(-0.1, -0.03);
        const b = mk(new THREE.ShapeGeometry(bolt), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide }), 0, 0.86, 0.44);
        model.add(b);
      }
      break;
    case 'robot': {
      const metal = toon(0x9aa0b8);
      const ant = mk(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), metal, 0, 0.62);
      const bulb = mk(new THREE.SphereGeometry(0.07, 10, 8), toon(0xef2f2a, { emissive: 0x801010 }), 0, 0.82);
      head.add(ant, bulb);
      r.antenna = bulb;
      for (const s of [-1, 1]) head.add(mk(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), metal, s * 0.5, 0.0).rotateZ(Math.PI / 2));
      const panel = mk(new THREE.BoxGeometry(0.42, 0.3, 0.06), metal, 0, 0.92, 0.4);
      model.add(panel);
      for (let k = 0; k < 3; k++) model.add(mk(new THREE.SphereGeometry(0.04, 6, 6), toon([0x5cff8a, 0xffe14d, 0x2fd4ff][k], { emissive: 0x333333 }), -0.12 + k * 0.12, 0.92, 0.44));
      break;
    }
    case 'cat':
      for (const s of [-1, 1]) {
        const ear = mk(new THREE.ConeGeometry(0.15, 0.3, 4), body, s * 0.27, 0.42, -0.02);
        ear.rotation.z = -s * 0.35;
        head.add(ear, mk(new THREE.ConeGeometry(0.08, 0.18, 4), toon(0xff9ac4), s * 0.26, 0.42, 0.03).rotateZ(-s * 0.35));
        for (const k of [-1, 1]) head.add(mk(new THREE.BoxGeometry(0.3, 0.012, 0.012), toon(0x15101e), s * 0.32, -0.08 + k * 0.04, 0.42).rotateZ(s * k * 0.15));
      }
      head.add(mk(new THREE.SphereGeometry(0.05, 8, 6), toon(0xff6f9a), 0, -0.05, 0.5));
      {
        const tail = mk(new THREE.TorusGeometry(0.35, 0.06, 6, 14, Math.PI * 1.2), body, 0, 0.6, -0.5);
        tail.rotation.y = Math.PI / 2;
        model.add(tail);
        r.tail = tail;
      }
      break;
    case 'dino':
      for (let i = 0; i < 5; i++) {
        const sp = mk(new THREE.ConeGeometry(0.09, 0.24, 4), toon(col.glove), 0, 0.5 - i * 0.12, -0.2 - i * 0.12);
        sp.rotation.x = -0.6 - i * 0.25;
        head.add(sp);
      }
      {
        const snout = mk(new THREE.SphereGeometry(0.3, 14, 10), body, 0, -0.12, 0.3);
        snout.scale.set(1, 0.65, 0.8);
        head.add(snout);
        const tail = mk(new THREE.ConeGeometry(0.22, 0.9, 10), body, 0, 0.55, -0.7);
        tail.rotation.x = -1.9;
        model.add(tail);
        r.tail = tail;
      }
      break;
    case 'duck': {
      const beak = mk(new THREE.SphereGeometry(0.2, 12, 8), toon(0xff9420), 0, -0.13, 0.45);
      beak.scale.set(1.3, 0.45, 1.1);
      head.add(beak);
      r.mouth.visible = false;
      r.noMouth = true;
      for (let k = 0; k < 3; k++) head.add(mk(new THREE.SphereGeometry(0.06, 6, 6), body, (k - 1) * 0.06, 0.5, -0.02));
      for (const s of [r.legL, r.legR]) s.end.children[0].children[0].material = toon(0xff9420);
      break;
    }
    case 'bear':
      for (const s of [-1, 1]) {
        head.add(mk(new THREE.SphereGeometry(0.14, 12, 10), body, s * 0.32, 0.38, -0.05), mk(new THREE.SphereGeometry(0.08, 8, 6), toon(col.dark), s * 0.32, 0.38, 0.05));
      }
      {
        const muzzle = mk(new THREE.SphereGeometry(0.22, 12, 10), toon(0xf3dcb8), 0, -0.14, 0.36);
        muzzle.scale.set(1.1, 0.75, 0.7);
        head.add(muzzle, mk(new THREE.SphereGeometry(0.07, 8, 6), toon(0x15101e), 0, -0.06, 0.52));
        model.add(mk(new THREE.SphereGeometry(0.12, 10, 8), body, 0, 0.6, -0.45));
        r.torso.scale.set(1.12, 1.05, 0.98);
      }
      break;
  }
}

export class Rascal {
  constructor(colorIdx, isDummy = false, charIdx = 0) {
    this.isDummy = isDummy;
    const ch = CHARACTERS[charIdx] || CHARACTERS[0];
    this.charIdx = charIdx;
    const col = isDummy ? { body: 0xd0aa70, dark: 0x9c7442, glove: 0xb98d55 } : COLORS[colorIdx % COLORS.length];
    this.color = col;
    this.size = isDummy ? 1 : ch.size;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = COM_Y * this.size;
    this.root.add(this.pivot);
    this.sizer = new THREE.Group();
    this.sizer.scale.setScalar(this.size);
    this.pivot.add(this.sizer);
    this.model = new THREE.Group();
    this.model.position.y = -COM_Y;
    this.sizer.add(this.model);

    const robot = !isDummy && ch.look === 'robot';
    const bodyOpts = isDummy ? { map: burlapTexture() } : {};
    this.bodyMat = toon(col.body, bodyOpts);
    this.bodyMat.emissive = new THREE.Color(0x000000);
    this.darkMat = toon(robot ? 0x6d7288 : col.dark);
    this.gloveMat = toon(col.glove);
    this.gloveMat.emissive = new THREE.Color(0x000000);
    const white = toon(0xffffff);
    const shoeMat = toon(isDummy ? 0x6b4a2a : robot ? 0x5a5f78 : 0xe8322c);
    const soleMat = toon(0xf4f1ff);
    const beltMat = toon(0x3a2a35);

    this.torso = mk(new THREE.SphereGeometry(0.47, 22, 16), this.bodyMat, 0, 0.84, 0);
    this.torso.scale.set(1, 1.05, 0.9);
    this.model.add(this.torso);
    this.head = new THREE.Group();
    this.head.position.y = 1.42;
    this.model.add(this.head);
    const headMesh = robot ? mk(new THREE.BoxGeometry(0.92, 0.82, 0.86), this.bodyMat) : mk(new THREE.SphereGeometry(0.5, 24, 18), this.bodyMat);
    if (!robot) headMesh.scale.set(1, 0.94, 0.95);
    this.head.add(headMesh);

    const belt = mk(new THREE.TorusGeometry(0.44, 0.07, 8, 26), beltMat, 0, 0.6, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.92, 1);
    this.model.add(belt, mk(new THREE.BoxGeometry(0.2, 0.14, 0.06), toon(isDummy ? 0x6b4a2a : 0xffc61a), 0, 0.6, 0.42));

    // face
    const eyeGeo = new THREE.CircleGeometry(0.15, 28);
    this.eyeL = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ map: eyeTexture('open'), transparent: true, alphaTest: 0.5 }));
    this.eyeR = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ map: eyeTexture('open'), transparent: true, alphaTest: 0.5 }));
    placeOnSphere(this.eyeL, 0.17, 0.08, robot ? 0.47 : 0.5);
    placeOnSphere(this.eyeR, -0.17, 0.08, robot ? 0.47 : 0.5);
    if (robot) { this.eyeL.position.z = this.eyeR.position.z = 0.44; this.eyeL.rotation.set(0, 0, 0); this.eyeR.rotation.set(0, 0, 0); }
    this.eyeR.scale.x = -1;
    this.head.add(this.eyeL, this.eyeR);
    const browGeo = new THREE.BoxGeometry(0.22, 0.065, 0.05);
    const browMat = toon(isDummy ? 0x3b2716 : 0x15101e);
    this.browL = new THREE.Mesh(browGeo, browMat);
    this.browR = new THREE.Mesh(browGeo, browMat);
    this.browL.position.set(0.18, 0.28, 0.43);
    this.browR.position.set(-0.18, 0.28, 0.43);
    this.head.add(this.browL, this.browR);
    this.mouth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.28),
      new THREE.MeshBasicMaterial({ map: mouthTexture(isDummy ? 'stitch' : 'grin'), transparent: true, alphaTest: 0.5 }),
    );
    placeOnSphere(this.mouth, 0, -0.2, robot ? 0.47 : 0.5, 0.015);
    if (robot) { this.mouth.position.z = 0.445; this.mouth.rotation.set(0, 0, 0); }
    this.head.add(this.mouth);
    this.expr = '';

    // limbs
    const glove = new THREE.Group();
    const gloveMesh = mk(new THREE.SphereGeometry(0.17, 14, 12), this.gloveMat);
    gloveMesh.scale.set(1, 0.95, 1.1);
    glove.add(gloveMesh, mk(new THREE.CylinderGeometry(0.12, 0.13, 0.09, 12), white, 0, 0.14, 0));
    this.armL = new Limb(this.model, 0.44, 1.02, 0.5, 0.1, robot ? this.darkMat : this.bodyMat, glove);
    this.armR = new Limb(this.model, -0.44, 1.02, 0.5, 0.1, robot ? this.darkMat : this.bodyMat, glove.clone());
    const shoe = () => {
      const s = new THREE.Group();
      const top = mk(new THREE.SphereGeometry(0.16, 12, 10), shoeMat, 0, 0.02, 0.09);
      top.scale.set(1, 0.75, 1.55);
      s.add(top, mk(new THREE.BoxGeometry(0.26, 0.07, 0.46), soleMat, 0, -0.07, 0.09));
      return s;
    };
    this.legL = new Limb(this.model, 0.2, 0.5, 0.38, 0.12, this.darkMat, shoe());
    this.legR = new Limb(this.model, -0.2, 0.5, 0.38, 0.12, this.darkMat, shoe());
    this.limbs = [this.armL, this.armR, this.legL, this.legR];

    if (isDummy) {
      this.model.add(new THREE.Mesh(new THREE.CircleGeometry(0.24, 28), new THREE.MeshBasicMaterial({ map: targetTexture() })).translateY(0.86).translateZ(0.43));
      for (let i = 0; i < 5; i++) {
        const s = mk(new THREE.ConeGeometry(0.035, 0.32, 5), toon(0xf2d16b), (i - 2) * 0.06, 0.48, -0.02);
        s.rotation.z = (i - 2) * 0.3;
        this.head.add(s);
      }
    } else addLookParts(this, ch.look, col);

    // dizzy stars
    this.stars = new THREE.Group();
    this.stars.position.y = 0.62;
    const starGeo = new THREE.ShapeGeometry(starShape(0.13, 0.055));
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.5, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.5);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.head.add(this.stars);

    // cosmetics anchors
    this.hatAnchor = new THREE.Group();
    this.head.add(this.hatAnchor);
    this.faceAnchor = new THREE.Group();
    this.head.add(this.faceAnchor);
    this.hatId = -1;
    this.faceId = -1;

    // overhead anchor for heavy props
    this.overhead = new THREE.Group();
    this.overhead.position.set(0, 2.45, 0.05);
    this.model.add(this.overhead);

    // charge ring
    this.chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.position.y = 0.04;
    this.chargeRing.visible = false;
    this.chargeRing.layers.set(1);
    this.root.add(this.chargeRing);

    // block shield
    this.shield = new THREE.Group();
    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 20, 14, -Math.PI / 2 - 0.9, 1.8, 0.3, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    bubble.layers.set(1);
    bubble.rotation.y = Math.PI;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24, Math.PI * 1.1), toon(0xffffff));
    rim.position.set(0, 0.0, 0.7);
    rim.rotation.z = -Math.PI * 0.05;
    this.shield.add(bubble, rim);
    this.shield.position.set(0, 0, 0.05);
    this.shield.visible = false;
    this.shieldBubble = bubble;
    this.shieldRim = rim;
    this.pivot.add(this.shield);

    // status FX (fire / acid)
    this.flames = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.9, depthWrite: false });
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), i % 2 ? flameMat : flameMat2);
      const a = (i / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.35, 1.3 + (i % 3) * 0.25, Math.sin(a) * 0.35);
      f.layers.set(1);
      this.flames.add(f);
    }
    this.flames.visible = false;
    this.model.add(this.flames);
    this.acidMat = new THREE.Color(0x3aff2a);

    // pie face
    this.pieBlob = new THREE.Group();
    const cream = mk(new THREE.SphereGeometry(0.36, 14, 10), toon(0xfffaf0), 0, 0.02, 0.32);
    cream.scale.set(1.15, 0.95, 0.5);
    this.pieBlob.add(cream, mk(new THREE.SphereGeometry(0.07, 8, 6), toon(0xef2f2a), 0.05, 0.18, 0.5));
    this.pieBlob.visible = false;
    this.head.add(this.pieBlob);

    // animation state
    this.pose = { pitch: 0, roll: 0, yaw: 0, low: 0, squash: 1 };
    this.tumbleQ = new THREE.Quaternion();
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.flash = 0;
    this.lastOg = true;
    this.shake = 0;
    this.facing = 0;
    this.spin = 0;
    this.pancake = 0;
    this.pieT = 0;
    this.recoil = 0;
    this.shieldPop = 0;
    this.lastY = 0;
  }

  setCosmetics(hat, face) {
    if (this.isDummy) return;
    if (hat !== this.hatId) {
      this.hatId = hat;
      this.hatAnchor.clear();
      if (hat > 0) this.hatAnchor.add(buildHat(hat, this.color.glove));
    }
    if (face !== this.faceId) {
      this.faceId = face;
      this.faceAnchor.clear();
      if (face > 0) this.faceAnchor.add(buildFace(face));
    }
  }

  hitFlash(power) {
    this.flash = Math.min(1, 0.6 + power * 0.03);
    this.shake = Math.min(0.25, 0.04 + power * 0.006);
  }
  crush() { this.pancake = 1.3; }
  pie() { this.pieT = 4; }
  shot() { this.recoil = 1; }
  blocked() { this.shieldPop = 1; }

  setExpression(eyes, mouth, brow) {
    const key = eyes + mouth + brow;
    if (key === this.expr) return;
    this.expr = key;
    if (this.isDummy) {
      eyes = eyes === 'x' || eyes === 'spiral' ? eyes : 'button';
      mouth = mouth === 'tongue' || mouth === 'ouch' || mouth === 'scream' ? 'ouch' : 'stitch';
    }
    this.eyeL.material.map = eyeTexture(eyes);
    this.eyeR.material.map = eyeTexture(eyes);
    this.eyeL.material.needsUpdate = true;
    this.eyeR.material.needsUpdate = true;
    if (!this.noMouth) {
      this.mouth.material.map = mouthTexture(mouth);
      this.mouth.material.needsUpdate = true;
    }
    const angry = brow === 'angry' ? 0.42 : brow === 'worried' ? -0.35 : 0.08;
    this.browL.rotation.z = -angry;
    this.browR.rotation.z = angry;
    this.browL.position.y = brow === 'worried' ? 0.32 : 0.28;
    this.browR.position.y = this.browL.position.y;
  }

  handAnchor(hand) {
    return hand === 1 ? this.armR.end : this.armL.end;
  }

  headWorld(out) {
    return this.head.getWorldPosition(out);
  }

  // ------------------------------------------------------------------ main update
  update(s, dt, ctx) {
    const frozen = s.hs > 0;
    const adt = frozen ? 0 : dt;
    this.time += adt;
    const t = this.time;
    this.root.visible = s.s !== ST.DEAD;
    if (!this.root.visible) return;

    this.root.position.set(s.rx ?? s.x, s.ry ?? s.y, s.rz ?? s.z);
    const climbMove = Math.abs(this.root.position.y - this.lastY) / Math.max(1e-3, dt);
    this.lastY = this.root.position.y;
    const st = s.s;
    if (st === ST.SUPER) this.spin += adt * 24;
    else this.spin *= 0.8;
    this.root.rotation.y = s.f + this.spin;
    this.facing = s.f;

    const P = this.pose;
    let pitch = 0, roll = 0, yaw = 0, low = 0, squash = 1;
    let poseK = 160;
    const sf = Math.sin(s.f), cf = Math.cos(s.f);
    const fwdSpeed = s.vx * sf + s.vz * cf;
    const sideSpeed = -s.vx * cf + s.vz * sf;
    const speed = Math.hypot(s.vx, s.vz);
    const og = !!s.og;
    const act = s.a;
    const heldProp = s.h >= 0 ? ctx.props.get(s.h) : null;
    const heldDef = heldProp ? ITEMS[heldProp.k] : null;
    const heavy = !!(heldDef && heldDef.type === 'heavy');
    const oneHand = heldDef && heldDef.type !== 'heavy' ? (s.hh === 1 ? this.armR : this.armL) : null;
    const weaponHand = heldDef && heldDef.type === 'weapon' ? oneHand : null;
    const gunHand = heldDef && heldDef.type === 'gun' ? oneHand : null;
    const offHand = oneHand ? (oneHand === this.armR ? this.armL : this.armR) : null;
    let tumbling = false;
    let eyes = 'open', mouth = 'grin', brow = 'none';
    this.stars.visible = false;
    let chargeVis = false;

    if (og && !this.lastOg && (st === ST.FREE || st === ST.ATTACK || st === ST.BLOCK)) P.squashV = (P.squashV || 0) - 5.5;
    if (!og && this.lastOg && s.vy > 4) P.squashV = (P.squashV || 0) + 4;
    this.lastOg = og;

    const upright = st === ST.FREE || st === ST.ATTACK || st === ST.CHARGE || st === ST.BLOCK || st === ST.TAUNT;
    const sprinting = (s.sp | 0) > 34 && og && st === ST.FREE;

    // ---------------------------------------------------- default locomotion
    const G = 0.42;
    const guardL = [-0.34, G, 0.84], guardR = [0.34, G, 0.84];
    if (upright) {
      if (og) {
        const k = clamp(speed / 7, 0, 1);
        this.phase += adt * (4 + speed * 1.55);
        const sw = Math.sin(this.phase) * (sprinting ? 1.15 : 0.95) * k;
        this.legL.set(0, -Math.cos(sw), Math.sin(sw), 1 - 0.22 * Math.max(0, Math.sin(this.phase)) * k);
        this.legR.set(0, -Math.cos(-sw), Math.sin(-sw), 1 - 0.22 * Math.max(0, -Math.sin(this.phase)) * k);
        pitch = (sprinting ? 0.42 : 0.22) * k + fwdSpeed * 0.01;
        roll = -sideSpeed * 0.035;
        low = k * 0.06 * (1 - Math.abs(Math.cos(this.phase)));
        const as = -sw * 0.7;
        if (sprinting) {
          // arms streaming back like a cartoon sprint
          this.armL.set(0.25, -0.3 + Math.sin(this.phase * 2) * 0.3, -1, 1.15);
          this.armR.set(-0.25, -0.3 - Math.sin(this.phase * 2) * 0.3, -1, 1.15);
        } else {
          this.armL.set(guardL[0] * (1 - k * 0.5), G * (1 - k) - 0.2 * k + Math.sin(as) * 0.3, guardL[2] * (1 - k * 0.3) + Math.sin(as) * 0.7 * k, 1.05);
          this.armR.set(guardR[0] * (1 - k * 0.5), G * (1 - k) - 0.2 * k - Math.sin(as) * 0.3, guardR[2] * (1 - k * 0.3) - Math.sin(as) * 0.7 * k, 1.05);
        }
        if (k < 0.1) {
          low = 0.03 + Math.sin(t * 5.5) * 0.03;
          this.armL.set(guardL[0], guardL[1] + Math.sin(t * 5.5) * 0.05, guardL[2], 1.05);
          this.armR.set(guardR[0], guardR[1] + Math.sin(t * 5.5 + 0.5) * 0.05, guardR[2], 1.05);
          this.legL.set(0.12, -1, 0.05, 1);
          this.legR.set(-0.12, -1, -0.05, 1);
        }
      } else {
        const rising = s.vy > 0;
        this.legL.set(0, -0.75, 0.55, rising ? 0.72 : 0.95);
        this.legR.set(0, -0.95, -0.35, rising ? 0.95 : 0.8);
        this.armL.set(0.75, 0.45, 0.2, 1.05);
        this.armR.set(-0.75, 0.45, 0.2, 1.05);
        squash = 1 + clamp(s.vy * 0.012, -0.12, 0.15);
        pitch = 0.1;
        mouth = 'shout';
      }
      if (weaponHand && st !== ST.ATTACK && st !== ST.CHARGE) {
        const w = heldProp.k;
        const onShoulder = w === 'hammer' || w === 'sign' || w === 'mallet' || w === 'chair' || w === 'guitar';
        const sgn = weaponHand === this.armL ? 1 : -1;
        if (onShoulder) weaponHand.set(0.15 * sgn, 1, -0.25, 0.9);
        else weaponHand.set(0.3 * sgn, 0.55 + Math.sin(t * 5.5) * 0.04, 0.78, 1.05);
      }
      if (gunHand && st !== ST.ATTACK) {
        // aim down the barrel
        const sgn = gunHand === this.armL ? 1 : -1;
        gunHand.set(-0.08 * sgn, 0.05 + this.recoil * 0.5, 1, 1.15 - this.recoil * 0.25, 600);
        offHand.set(-0.35 * sgn, 0.05, 1, 0.95, 500);
        brow = 'angry';
      }
      if (heldDef && heldDef.type === 'light' && st !== ST.ATTACK) {
        const sgn = oneHand === this.armL ? 1 : -1;
        oneHand.set(0.35 * sgn, 0.85, -0.25, 1.05);
      }
      if (heavy) {
        this.armL.set(0.22, 1, 0.02, 1.55);
        this.armR.set(-0.22, 1, 0.02, 1.55);
        mouth = 'grit';
        brow = 'angry';
      }
    }

    // reaching hands (LT/RT)
    const reaching = (st === ST.FREE || st === ST.BLOCK) && s.g < 0 ? s.hd || 0 : 0;
    if (reaching & 1 && oneHand !== this.armL && !heavy) this.armL.set(0.12, 0.15 + Math.sin(t * 9) * 0.06, 1, 1.4, 400);
    if (reaching & 2 && oneHand !== this.armR && !heavy) this.armR.set(-0.12, 0.15 + Math.sin(t * 9 + 1) * 0.06, 1, 1.4, 400);
    if (reaching) { mouth = 'grit'; brow = 'angry'; }

    // ---------------------------------------------------- actions
    if (st === ST.ATTACK && act) {
      brow = 'angry';
      mouth = 'shout';
      const [k, at, w, a, r, c, rev, mirror, item] = act;
      const inWind = at < w;
      const inActive = at >= w && at < w + a;
      const pw = clamp(at / Math.max(1, w), 0, 1);
      const pa = clamp((at - w) / Math.max(1, a), 0, 1);
      const pr = clamp((at - w - a) / Math.max(1, r), 0, 1);
      const hard = 900;
      switch (k) {
        case 'jab1':
        case 'jab2':
        case 'hook':
        case 'hay': {
          const right = k !== 'jab2';
          const arm = right ? this.armR : this.armL;
          const sx = right ? -1 : 1;
          if (k === 'hook') {
            if (inWind) arm.set(sx * 1, 0.35, -0.1, 1.0, hard);
            else if (inActive) arm.set(-sx * 0.25 * pa + sx * (1 - pa) * 0.8, 0.3, 1, 1.75, hard);
            yaw = inWind ? -0.45 * sx : inActive ? 0.5 * sx : 0.3 * sx * (1 - pr);
          } else if (k === 'hay') {
            if (inWind) arm.set(sx * 0.45, 0.45, -1, 0.9, hard);
            else if (inActive) arm.set(0, 0.2, 1, 2.6, hard);
            else arm.set(0, 0.1, 1, lerp(2.2, 1.1, pr), 300);
            yaw = inWind ? -0.6 * sx : inActive ? 0.55 * sx : 0.3 * sx * (1 - pr);
            pitch = inActive ? 0.4 : inWind ? -0.12 : 0.2;
            low = inWind ? 0.12 : 0;
          } else {
            if (inWind) arm.set(sx * 0.25, 0.4, -0.4, 0.8, hard);
            else if (inActive) arm.set(sx * 0.05, 0.22, 1, 1.95, hard);
            yaw = inActive ? 0.28 * sx : 0;
            pitch += inActive ? 0.12 : 0;
          }
          break;
        }
        case 'kick': {
          if (inWind) this.legR.set(0, -0.6, -0.8, 0.9, hard);
          else if (inActive) this.legR.set(0, 0.2, 1, 1.55, hard);
          else this.legR.set(0, -0.8, 0.4, 1, 300);
          pitch = inActive ? -0.32 : -0.05;
          this.armL.set(0.8, 0.5, -0.2);
          this.armR.set(-0.8, 0.5, -0.2);
          break;
        }
        case 'dk': {
          pitch = -1.3;
          this.legL.set(0.12, 0.05, 1, 1.45, hard);
          this.legR.set(-0.12, 0.05, 1, 1.45, hard);
          this.armL.set(0.7, 0.4, -0.6, 1.1);
          this.armR.set(-0.7, 0.4, -0.6, 1.1);
          mouth = 'scream';
          break;
        }
        case 'spear': {
          pitch = inWind ? 0.3 : 0.95;
          low = 0.15;
          this.armL.set(0.5, -0.2, -1, 1.1, hard);
          this.armR.set(-0.5, -0.2, -1, 1.1, hard);
          this.phase += adt * 22;
          const sw = Math.sin(this.phase) * 1.1;
          this.legL.set(0, -Math.cos(sw), Math.sin(sw) - 0.3, 1);
          this.legR.set(0, -Math.cos(-sw), Math.sin(-sw) - 0.3, 1);
          mouth = 'scream';
          break;
        }
        case 'slide': {
          pitch = -1.15;
          low = 0.45;
          this.legL.set(0.1, -0.15, 1, 1.35, hard);
          this.legR.set(-0.15, -0.8, 0.4, 0.75, hard);
          this.armL.set(0.8, 0.3, -0.4, 1.1);
          this.armR.set(-0.8, 0.6, 0.2, 1.1);
          break;
        }
        case 'pound': {
          if (inWind) {
            tumbling = true;
            const sp = Math.max(0.1, speed);
            _v.set(s.vz / sp || 1, 0, -s.vx / sp || 0);
            this.spinWorld(_v.set(Math.cos(s.f), 0, -Math.sin(s.f)), adt * 18);
            this.armL.set(0.2, -0.3, 0.7, 0.6, 500);
            this.armR.set(-0.2, -0.3, 0.7, 0.6, 500);
            this.legL.set(0.1, -0.3, 0.7, 0.6, 500);
            this.legR.set(-0.1, -0.3, 0.7, 0.6, 500);
          } else {
            pitch = -0.4;
            this.legL.set(0.3, 0.1, 1, 1.1, hard);
            this.legR.set(-0.3, 0.1, 1, 1.1, hard);
            this.armL.set(0.6, 1, 0, 1.2, hard);
            this.armR.set(-0.6, 1, 0, 1.2, hard);
            squash = inActive ? 0.85 : 1;
          }
          mouth = 'scream';
          break;
        }
        case 'swing': {
          const def = ITEMS[item]?.swing;
          if (def && weaponHand) {
            const sgn = (rev ? -1 : 1) * (mirror ? -1 : 1);
            let ang;
            if (inWind) ang = lerp(def.from * 0.5, def.from + 28, easeOut(pw));
            else if (inActive) ang = lerp(def.from, def.to, easeOut(pa));
            else ang = lerp(def.to, def.to * 0.6, pr);
            const ar = (ang * sgn * Math.PI) / 180;
            weaponHand.set(Math.sin(ar), inWind ? 0.35 : 0.08, Math.cos(ar), 1.25, inActive ? 1400 : 500);
            offHand.set(Math.sin(ar) * 0.8, 0.2, Math.cos(ar) * 0.8 + 0.3, 0.95, 500);
            yaw = inWind ? ((def.from * sgn * Math.PI) / 180) * 0.35 : inActive ? ((lerp(def.from, def.to, pa) * sgn * Math.PI) / 180) * 0.35 : 0;
            pitch = inActive ? 0.15 : 0;
          }
          break;
        }
        case 'slam': {
          let phi;
          if (inWind) phi = lerp(60, 120, easeOut(pw));
          else if (inActive) phi = lerp(120, -20, easeIn(pa));
          else phi = -20 + pr * 20;
          const pr2 = (phi * Math.PI) / 180;
          const k2 = inActive ? 1500 : 400;
          if (weaponHand) {
            weaponHand.set(0.05, Math.sin(pr2), Math.cos(pr2), 1.15, k2);
            offHand.set(-0.05, Math.sin(pr2), Math.cos(pr2), 1.05, k2);
          }
          pitch = inWind ? -0.25 : inActive ? lerp(-0.25, 0.5, pa) : 0.45 * (1 - pr);
          low = !inWind && !inActive ? 0.12 * (1 - pr) : 0;
          break;
        }
        case 'throw': {
          const arm = s.hh === 1 ? this.armR : this.armL;
          if (inWind) arm.set(0, 0.7, -0.7, 1.0, hard);
          else arm.set(0, 0.35, 1, inActive ? 1.6 : 1.2, hard);
          yaw = inActive ? 0.3 : 0;
          break;
        }
        case 'throwOver': {
          if (inWind) { this.armL.set(0.2, 0.9, -0.5, 1.4, hard); this.armR.set(-0.2, 0.9, -0.5, 1.4, hard); }
          else { this.armL.set(0.2, 0.35, 1, 1.6, hard); this.armR.set(-0.2, 0.35, 1, 1.6, hard); }
          pitch = inWind ? -0.2 : 0.35;
          break;
        }
        case 'fling': {
          if (inWind) this.armR.set(-0.4, -0.3, -1, 1.5, hard);
          else this.armR.set(0, 0.6, 1, 1.7, hard);
          yaw = inWind ? -0.6 : 0.7;
          break;
        }
        case 'grab': {
          this.armL.set(0.1, 0.1, 1, inActive ? 1.6 : 1.1, hard);
          this.armR.set(-0.1, 0.1, 1, inActive ? 1.6 : 1.1, hard);
          break;
        }
      }
    } else if (st === ST.CHARGE && act) {
      chargeVis = true;
      brow = 'angry';
      mouth = 'grit';
      const c = s.ch || 0;
      const k = act[0];
      const tremble = (Math.random() - 0.5) * (0.04 + c * 0.1);
      if (k === 'swing' && weaponHand) {
        const def = ITEMS[act[8]]?.swing;
        const sgn = (act[6] ? -1 : 1) * (act[7] ? -1 : 1);
        const ar = (((def?.from || 100) + 35) * sgn * Math.PI) / 180;
        weaponHand.set(Math.sin(ar), 0.45, Math.cos(ar), 1.2, 600);
        offHand.set(Math.sin(ar) * 0.7, 0.3, Math.cos(ar) * 0.7, 0.9, 600);
        yaw = ((((def?.from || 100) * sgn) * Math.PI) / 180) * 0.45 + tremble;
      } else if (k === 'slam' && weaponHand) {
        weaponHand.set(0.05, 0.85, -0.5, 1.15, 600);
        offHand.set(-0.05, 0.85, -0.5, 1.05, 600);
        pitch = -0.3;
      } else {
        const right = k !== 'jab2';
        const arm = right ? this.armR : this.armL;
        const sx = right ? -1 : 1;
        arm.set(sx * 0.5, 0.5, -1, 0.85, 600);
        yaw = -0.65 * sx + tremble;
        pitch = -0.1;
      }
      low = 0.1 + c * 0.08;
      squash = 1 - c * 0.08 + Math.sin(t * 40) * 0.02 * c;
    } else if (st === ST.SUPER) {
      // SPIN-O-RAMA lariat
      this.armL.set(1, 0.15, -0.1, 1.7, 500);
      this.armR.set(-1, 0.15, 0.1, 1.7, 500);
      this.legL.set(0.35, -1, 0, 1);
      this.legR.set(-0.35, -1, 0, 1);
      low = 0.1 + Math.sin(t * 30) * 0.03;
      brow = 'angry';
      mouth = 'shout';
      chargeVis = true;
    } else if (st === ST.BLOCK) {
      this.armL.set(-0.55, 0.62, 0.6, 0.85, 600);
      this.armR.set(0.55, 0.7, 0.6, 0.85, 600);
      low = 0.12;
      pitch = 0.12;
      eyes = 'squint';
      mouth = 'grit';
      brow = 'angry';
    } else if (st === ST.TAUNT) {
      const k = Math.sin(t * 9);
      this.armL.set(0.7, 0.7 + k * 0.3, 0.1, 1.2);
      this.armR.set(-0.7, 0.7 - k * 0.3, 0.1, 1.2);
      this.legL.set(0.25, -1, 0.1);
      this.legR.set(-0.25, -1, 0.1);
      roll = k * 0.18;
      low = Math.abs(k) * 0.08;
      eyes = 'happy';
      mouth = 'laugh';
      yaw = Math.sin(t * 4.5) * 0.3;
    } else if (st === ST.DODGE) {
      tumbling = true;
      const sp = Math.max(0.1, speed);
      _v.set(s.vz / sp, 0, -s.vx / sp);
      this.spinWorld(_v, adt * 24);
      this.armL.set(0.2, -0.2, 0.7, 0.6, 500);
      this.armR.set(-0.2, -0.2, 0.7, 0.6, 500);
      this.legL.set(0.1, -0.3, 0.7, 0.6, 500);
      this.legR.set(-0.1, -0.3, 0.7, 0.6, 500);
      eyes = 'squint';
      mouth = 'grit';
    } else if (st === ST.STAGGER) {
      pitch = -0.38 + Math.sin(t * 14) * 0.08;
      roll = Math.sin(t * 9) * 0.15;
      this.armL.set(0.9, 0.6 + Math.sin(t * 18) * 0.3, -0.2, 1.1);
      this.armR.set(-0.9, 0.6 + Math.cos(t * 17) * 0.3, -0.2, 1.1);
      this.legL.set(0.15, -1, 0.25);
      this.legR.set(-0.15, -1, -0.25);
      eyes = 'hurt';
      mouth = 'ouch';
      brow = 'worried';
    } else if (st === ST.TUMBLE) {
      if (!og) {
        tumbling = true;
        const sp = Math.max(0.1, Math.hypot(s.vx, s.vy * 0.5, s.vz));
        const hs = Math.hypot(s.vx, s.vz) || 1;
        _v.set(s.vz / hs, 0, -s.vx / hs);
        this.spinWorld(_v, adt * clamp(sp * 1.1, 5, 17));
      } else {
        pitch = -Math.PI / 2;
        low = LIE_DROP;
        poseK = 260;
      }
      this.flail(t, s.ko > 0);
      eyes = s.ko > 0 ? 'x' : 'hurt';
      mouth = s.ko > 0 ? 'tongue' : 'scream';
      brow = 'worried';
    } else if (st === ST.DOWN || st === ST.KO) {
      pitch = -Math.PI / 2;
      low = LIE_DROP;
      poseK = 200;
      const ko = st === ST.KO;
      const limp = ko ? 0 : Math.sin(t * 3) * 0.1;
      this.armL.set(1, 0.35 + limp, -0.1, 1.05, 120);
      this.armR.set(-1, 0.45 - limp, 0.1, 1.05, 120);
      this.legL.set(0.45, -1, 0.15, 1, 120);
      this.legR.set(-0.35, -1, -0.1, 1, 120);
      eyes = ko ? 'x' : 'spiral';
      mouth = ko ? 'tongue' : 'wobble';
      this.stars.visible = true;
      if (ko) squash = 1 + Math.sin(t * 2.2) * 0.04;
    } else if (st === ST.GETUP) {
      const p = clamp((s.st || 0) / 14, 0, 1);
      pitch = lerp(-Math.PI / 2, 0, easeOut(p));
      low = lerp(LIE_DROP, 0, easeOut(p));
      poseK = 500;
      this.armL.set(0.6, 0.8, 0.2, 1.1);
      this.armR.set(-0.6, 0.8, 0.2, 1.1);
      mouth = 'grit';
    } else if (st === ST.DIZZY) {
      pitch = Math.cos(t * 4.2) * 0.18;
      roll = Math.sin(t * 5) * 0.28;
      this.armL.set(0.5, -1, 0.2, 1.1, 120);
      this.armR.set(-0.5, -1, 0.2, 1.1, 120);
      this.legL.set(0.15, -1, Math.sin(t * 5) * 0.2);
      this.legR.set(-0.15, -1, -Math.sin(t * 5) * 0.2);
      eyes = 'spiral';
      mouth = 'wobble';
      brow = 'worried';
      this.stars.visible = true;
    } else if (st === ST.HANG) {
      // hands on the ledge, legs dangling
      _v.set(Math.sin(s.f), 0, Math.cos(s.f));
      for (const [arm, side] of [[this.armL, 1], [this.armR, -1]]) {
        _v2.set(this.root.position.x + _v.x * 0.45 - Math.cos(s.f) * side * -0.3, this.root.position.y + 1.78 * this.size, this.root.position.z + _v.z * 0.45 + Math.sin(s.f) * side * -0.3);
        this.aimLimb(arm, _v2, 500);
      }
      this.legL.set(0.1, -1, Math.sin(t * 2.5) * 0.3, 1, 120);
      this.legR.set(-0.1, -1, -Math.sin(t * 2.5) * 0.3, 1, 120);
      const tired = (s.sm ?? 100) < 30;
      pitch = 0.1 + (tired ? Math.sin(t * 30) * 0.03 : 0);
      eyes = 'wide';
      mouth = tired ? 'scream' : 'grit';
      brow = 'worried';
    } else if (st === ST.CLIMB) {
      // hand over hand up the wall
      const moving = climbMove > 0.3;
      this.phase += adt * (moving ? 9 : 2);
      const a = Math.sin(this.phase);
      this.armL.set(0.3, 0.8 + a * 0.35, 0.55, 1.15, 400);
      this.armR.set(-0.3, 0.8 - a * 0.35, 0.55, 1.15, 400);
      this.legL.set(0.2, -0.9 - a * 0.2, 0.45, 0.9, 400);
      this.legR.set(-0.2, -0.9 + a * 0.2, 0.45, 0.9, 400);
      pitch = 0.15;
      mouth = (s.sm ?? 100) < 30 ? 'scream' : 'grit';
      brow = 'angry';
    } else if (st === ST.HELD) {
      const grabber = ctx.views.get(s.gb);
      const gs = ctx.states.get(s.gb);
      const lifted = gs && gs.gm === 3;
      const limp = s.ko > 0;
      if (lifted) {
        pitch = -Math.PI / 2;
        low = LIE_DROP;
        if (limp) {
          this.armL.set(1, -0.6, 0, 1.05, 90);
          this.armR.set(-1, -0.6, 0, 1.05, 90);
          this.legL.set(0.3, -0.7, -0.6, 1, 90);
          this.legR.set(-0.3, -0.7, -0.6, 1, 90);
        } else this.flail(t, false);
      } else if (s.dr) {
        pitch = -Math.PI / 2;
        low = LIE_DROP;
        this.armL.set(0.5, 1, -0.3, 1.05, 140);
        this.armR.set(-0.5, 1, 0.2, 1.05, 140);
        this.legL.set(0.3, -1, -0.2, 1, 140);
        if (grabber && gs) {
          grabber.handAnchor(gs.gm === 2 ? 1 : 0).getWorldPosition(_v2);
          this.aimLimb(this.legR, _v2, 220);
        }
      } else {
        pitch = 0.1;
        this.legL.set(0, -Math.cos(Math.sin(t * 16) * 0.9), Math.sin(Math.sin(t * 16) * 0.9), 0.9, 400);
        this.legR.set(0, -Math.cos(Math.sin(t * 16 + 2) * 0.9), Math.sin(Math.sin(t * 16 + 2) * 0.9), 0.9, 400);
        this.armL.set(0.7, 0.6 + Math.sin(t * 19) * 0.4, 0.6, 1.2, 400);
        this.armR.set(-0.7, 0.6 + Math.cos(t * 18) * 0.4, 0.6, 1.2, 400);
      }
      eyes = limp ? 'x' : 'wide';
      mouth = limp ? 'tongue' : 'scream';
      brow = 'worried';
      if (limp) this.stars.visible = true;
    }

    // grabbing hands aim at the victim
    if (s.g >= 0 && st !== ST.HELD) {
      const vv = ctx.views.get(s.g);
      const vs = ctx.states.get(s.g);
      if (vv && vs) {
        mouth = 'grit';
        brow = 'angry';
        const lifted = s.gm === 3;
        for (const hand of [0, 1]) {
          if (!(s.gm & (1 << hand))) continue;
          const arm = hand ? this.armR : this.armL;
          if (lifted) {
            vv.pivot.getWorldPosition(_v2);
            _v.set(hand ? -0.32 : 0.32, 0, 0).applyAxisAngle(UP, s.f);
            _v2.add(_v);
          } else if (vs.dr) {
            vv.legR.end.getWorldPosition(_v2);
          } else {
            vv.pivot.getWorldPosition(_v2);
            _v2.y += 0.45;
            _v.set(hand ? -0.25 : 0.25, 0, 0).applyAxisAngle(UP, s.f);
            _v2.add(_v);
          }
          this.aimLimb(arm, _v2, 500);
        }
        if (lifted) pitch = -0.08;
        if (vs.dr && !lifted) {
          pitch = 0.3;
          low = 0.06;
        }
      }
    }

    // status effects override the face
    if (s.fi) {
      eyes = 'wide';
      mouth = 'scream';
      brow = 'worried';
    }

    // ---------------------------------------------------- springs + transforms
    const kP = poseK, dP = 2 * Math.sqrt(kP) * 0.55;
    springScalar(P, 'pitch', pitch, kP, dP, adt);
    springScalar(P, 'roll', roll, kP, dP, adt);
    springScalar(P, 'yaw', yaw, 300, 2 * Math.sqrt(300) * 0.7, adt);
    springScalar(P, 'low', low, 220, 2 * Math.sqrt(220) * 0.8, adt);
    springScalar(P, 'squash', squash, 380, 11, adt);
    if (!tumbling) this.tumbleQ.slerp(_q.identity(), 1 - Math.exp(-adt * 12));
    _e.set(P.pitch, P.yaw, P.roll, 'YXZ');
    _q2.setFromEuler(_e);
    _q.setFromAxisAngle(UP, s.f + this.spin);
    _q3.copy(_q).invert().multiply(this.tumbleQ).multiply(_q).multiply(_q2);
    this.pivot.quaternion.copy(_q3);
    this.pivot.position.y = (COM_Y - P.low) * this.size;
    let sq = clamp(P.squash, 0.6, 1.5);
    let sxz = 1 / Math.sqrt(sq);
    if (this.pancake > 0) {
      this.pancake -= dt;
      const k = clamp(this.pancake / 1.3, 0, 1);
      sq = lerp(1, 0.14, Math.min(1, k * 3));
      sxz = lerp(1, 1.7, Math.min(1, k * 3));
      eyes = 'x';
    }
    this.model.scale.set(sxz, sq, sxz);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.5);
      if (frozen) {
        this.model.position.x = (Math.random() - 0.5) * this.shake * 2;
        this.model.position.z = (Math.random() - 0.5) * this.shake * 2;
      } else this.model.position.x = this.model.position.z = 0;
    } else this.model.position.x = this.model.position.z = 0;

    for (const l of this.limbs) l.update(adt);

    this.head.rotation.x = clamp(-P.pitch * 0.25, -0.4, 0.4);
    this.head.rotation.z = -P.roll * 0.4;
    if (this.stars.visible) this.stars.rotation.y += dt * 4;
    if (this.tail) this.tail.rotation.z = Math.sin(t * 4) * 0.3;
    if (this.antenna) this.antenna.material.emissive.setHex(Math.floor(t * 3) % 2 ? 0xff2020 : 0x400000);
    const hat = this.hatAnchor.children[0];
    if (hat && hat.userData.spin) hat.userData.spin.rotation.y += dt * (12 + speed * 3);
    if (hat && hat.userData.bob) hat.userData.bob.position.y = 0.3 + Math.sin(t * 3) * 0.04;

    // shield
    const blocking = st === ST.BLOCK;
    this.shield.visible = blocking;
    if (blocking) {
      const gd = s.gd ?? 100;
      const c = gd > 60 ? 0x8fd8ff : gd > 30 ? 0xffe14d : 0xff5a3a;
      this.shieldBubble.material.color.setHex(c);
      this.shieldBubble.material.opacity = 0.25 + this.shieldPop * 0.4 + (gd < 30 ? Math.abs(Math.sin(t * 20)) * 0.2 : 0);
      this.shield.scale.setScalar(1 + this.shieldPop * 0.25);
    }
    if (this.shieldPop > 0) this.shieldPop = Math.max(0, this.shieldPop - dt * 5);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 8);

    // flames & acid
    this.flames.visible = !!s.fi;
    if (s.fi) {
      this.flames.children.forEach((f, i) => {
        f.scale.set(1, 0.7 + Math.abs(Math.sin(t * 17 + i * 1.7)) * 0.9, 1);
        f.position.y = 1.2 + (i % 3) * 0.28 + Math.sin(t * 9 + i) * 0.05;
      });
    }
    // pie
    if (this.pieT > 0) this.pieT -= dt;
    this.pieBlob.visible = this.pieT > 0 && (this.pieT > 0.6 || Math.floor(t * 12) % 2 === 0);

    // flash / charge glow / acid tint
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    let glow = this.flash;
    if (chargeVis) {
      const c = st === ST.SUPER ? 1 : s.ch || 0;
      glow = Math.max(glow, (0.25 + c * 0.5) * (0.5 + 0.5 * Math.sin(t * (12 + c * 30))));
      this.chargeRing.visible = true;
      const cyc = (t * (1.5 + c * 3)) % 1;
      this.chargeRing.scale.setScalar(st === ST.SUPER ? 2.2 - cyc : 1.6 - cyc * 1.2);
      this.chargeRing.material.opacity = 0.35 + cyc * 0.6;
      this.chargeRing.material.color.setHex(st === ST.SUPER ? 0xff6fb5 : c >= 1 ? 0xffffff : 0xffe14d);
    } else this.chargeRing.visible = false;
    if (s.ac) this.bodyMat.emissive.setRGB(glow * 0.6, 0.25 + glow * 0.6 + Math.sin(t * 6) * 0.08, glow * 0.4);
    else if ((s.su ?? 0) >= 100) {
      // super meter full: shimmer
      const k = 0.1 + Math.abs(Math.sin(t * 4)) * 0.15;
      this.bodyMat.emissive.setRGB(Math.max(glow, k), Math.max(glow, k * 0.5), Math.max(glow, k));
    } else this.bodyMat.emissive.setRGB(glow, glow, glow * (chargeVis ? 0.5 : 1));
    this.gloveMat.emissive.setRGB(glow, glow, glow * 0.8);

    this.model.visible = !(s.iv && st !== ST.DODGE && st !== ST.GETUP && Math.floor(t * 20) % 2 === 0);
    this.setExpression(eyes, mouth, brow);
  }

  flail(t, limp) {
    if (limp) {
      this.armL.set(1, 0.2, -0.4, 1.05, 80);
      this.armR.set(-1, 0.3, 0.3, 1.05, 80);
      this.legL.set(0.4, -1, 0.3, 1, 80);
      this.legR.set(-0.4, -1, -0.3, 1, 80);
      return;
    }
    this.armL.set(0.8, Math.sin(t * 17) * 0.8, Math.cos(t * 13) * 0.6, 1.15, 300);
    this.armR.set(-0.8, Math.cos(t * 16) * 0.8, Math.sin(t * 14) * 0.6, 1.15, 300);
    this.legL.set(0.3, -0.6 + Math.sin(t * 15) * 0.5, Math.cos(t * 12) * 0.6, 1, 300);
    this.legR.set(-0.3, -0.6 + Math.cos(t * 13) * 0.5, Math.sin(t * 15) * 0.6, 1, 300);
  }

  spinWorld(axis, angle) {
    _q.setFromAxisAngle(axis, angle);
    this.tumbleQ.premultiply(_q);
  }

  aimLimb(limb, world, k = 400) {
    this.root.updateMatrixWorld(true);
    _v.copy(world);
    limb.joint.parent.worldToLocal(_v);
    _v.sub(limb.joint.position);
    const dist = _v.length();
    if (dist < 1e-4) return;
    _v.divideScalar(dist);
    limb.set(_v.x, _v.y, _v.z, clamp(dist / limb.len, 0.6, 2.8), k);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}

function placeOnSphere(obj, x, y, r, lift = 0.012) {
  const n = new THREE.Vector3(x, y, Math.sqrt(Math.max(0.01, r * r - x * x - y * y))).normalize();
  obj.position.copy(n).multiplyScalar(r * 0.95 + lift);
  obj.lookAt(n.clone().multiplyScalar(2));
}
