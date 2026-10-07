// Rascal character: procedural comic brawler with spring-driven, rubber-hose animation.
import * as THREE from 'three';
import { ST, COLORS } from '/shared/constants.js';
import { ITEMS } from '/shared/items.js';
import { toon, eyeTexture, mouthTexture, burlapTexture, targetTexture, starShape } from './toon.js';

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

export class Rascal {
  constructor(colorIdx, isDummy = false) {
    this.isDummy = isDummy;
    const col = isDummy ? { body: 0xd0aa70, dark: 0x9c7442, glove: 0xb98d55 } : COLORS[colorIdx % COLORS.length];
    this.color = col;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = COM_Y;
    this.root.add(this.pivot);
    this.model = new THREE.Group();
    this.model.position.y = -COM_Y;
    this.pivot.add(this.model);

    const bodyOpts = isDummy ? { map: burlapTexture() } : {};
    this.bodyMat = toon(col.body, bodyOpts);
    this.bodyMat.emissive = new THREE.Color(0x000000);
    this.darkMat = toon(col.dark);
    this.gloveMat = toon(col.glove);
    this.gloveMat.emissive = new THREE.Color(0x000000);
    const white = toon(0xffffff);
    const shoeMat = toon(isDummy ? 0x6b4a2a : 0xe8322c);
    const soleMat = toon(0xf4f1ff);
    const beltMat = toon(0x3a2a35);

    // torso + head (bean blob)
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.47, 22, 16), this.bodyMat);
    torso.scale.set(1, 1.05, 0.9);
    torso.position.y = 0.84;
    torso.castShadow = true;
    this.model.add(torso);
    this.head = new THREE.Group();
    this.head.position.y = 1.42;
    this.model.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), this.bodyMat);
    headMesh.scale.set(1, 0.94, 0.95);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // belt
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 8, 26), beltMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.6;
    belt.scale.set(1, 0.92, 1);
    this.model.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), toon(isDummy ? 0x6b4a2a : 0xffc61a));
    buckle.position.set(0, 0.6, 0.42);
    this.model.add(buckle);

    // face
    const eyeGeo = new THREE.CircleGeometry(0.15, 28);
    this.eyeL = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ map: eyeTexture('open'), transparent: true, alphaTest: 0.5 }));
    this.eyeR = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ map: eyeTexture('open'), transparent: true, alphaTest: 0.5 }));
    placeOnSphere(this.eyeL, 0.17, 0.08, 0.5);
    placeOnSphere(this.eyeR, -0.17, 0.08, 0.5);
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
    placeOnSphere(this.mouth, 0, -0.2, 0.5, 0.015);
    this.head.add(this.mouth);
    this.expr = '';

    if (isDummy) {
      const target = new THREE.Mesh(new THREE.CircleGeometry(0.24, 28), new THREE.MeshBasicMaterial({ map: targetTexture() }));
      target.position.set(0, 0.86, 0.43);
      this.model.add(target);
      // straw tuft
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 5), toon(0xf2d16b));
        s.position.set((i - 2) * 0.06, 0.48, -0.02);
        s.rotation.z = (i - 2) * 0.3;
        this.head.add(s);
      }
      // patch stitches
      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), toon(0x9c7442));
      patch.position.set(-0.3, 0.25, 0.36);
      patch.rotation.set(0, -0.6, 0.4);
      this.head.add(patch);
    } else {
      // hair tuft
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 7), this.bodyMat);
        t.position.set((i - 1) * 0.11, 0.5, -0.04 + Math.abs(i - 1) * -0.04);
        t.rotation.z = (1 - i) * 0.45;
        t.rotation.x = -0.25;
        t.castShadow = true;
        this.head.add(t);
      }
      // band-aid
      const bandMat = toon(0xf3c9a0);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.03), bandMat);
      const b2 = b1.clone();
      b2.rotation.z = Math.PI / 2;
      const band = new THREE.Group();
      band.add(b1, b2);
      const side = colorIdx % 2 ? 1 : -1;
      placeOnSphere(band, 0.3 * side, 0.2, 0.5, 0.01);
      band.rotateZ(0.6 * side);
      this.head.add(band);
    }

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

    // limbs
    const armMat = this.bodyMat;
    const glove = new THREE.Group();
    const gloveMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), this.gloveMat);
    gloveMesh.scale.set(1, 0.95, 1.1);
    gloveMesh.castShadow = true;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.09, 12), white);
    cuff.position.y = 0.14;
    glove.add(gloveMesh, cuff);
    const glove2 = glove.clone();
    this.armL = new Limb(this.model, 0.44, 1.02, 0.5, 0.1, armMat, glove);
    this.armR = new Limb(this.model, -0.44, 1.02, 0.5, 0.1, armMat, glove2);
    const shoe = () => {
      const s = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), shoeMat);
      top.scale.set(1, 0.75, 1.55);
      top.position.set(0, 0.02, 0.09);
      top.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.46), soleMat);
      sole.position.set(0, -0.07, 0.09);
      s.add(top, sole);
      return s;
    };
    this.legL = new Limb(this.model, 0.2, 0.5, 0.38, 0.12, this.darkMat, shoe());
    this.legR = new Limb(this.model, -0.2, 0.5, 0.38, 0.12, this.darkMat, shoe());
    this.limbs = [this.armL, this.armR, this.legL, this.legR];

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

    // animation state
    this.pose = { pitch: 0, roll: 0, yaw: 0, low: 0, squash: 1 };
    this.tumbleQ = new THREE.Quaternion();
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.flash = 0;
    this.lastOg = true;
    this.lastState = -1;
    this.shake = 0;
    this.facing = 0;
    this.renderPos = new THREE.Vector3();
  }

  // pulse white when hit
  hitFlash(power) {
    this.flash = Math.min(1, 0.6 + power * 0.03);
    this.shake = Math.min(0.25, 0.04 + power * 0.006);
  }

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
    this.mouth.material.map = mouthTexture(mouth);
    this.mouth.material.needsUpdate = true;
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
  // s: interpolated player state; ctx: { views, others, dt, now, frozen }
  update(s, dt, ctx) {
    const frozen = s.hs > 0;
    const adt = frozen ? 0 : dt;
    this.time += adt;
    const t = this.time;
    this.root.visible = s.s !== ST.DEAD;
    if (!this.root.visible) return;

    // root transform
    this.root.position.set(s.rx ?? s.x, s.ry ?? s.y, s.rz ?? s.z);
    this.root.rotation.y = s.f;
    this.facing = s.f;

    const P = this.pose;
    let pitch = 0, roll = 0, yaw = 0, low = 0, squash = 1;
    let poseK = 160;
    const sf = Math.sin(s.f), cf = Math.cos(s.f);
    const fwdSpeed = s.vx * sf + s.vz * cf;
    const sideSpeed = -s.vx * cf + s.vz * sf;
    const speed = Math.hypot(s.vx, s.vz);
    const og = !!s.og;
    const st = s.s;
    const act = s.a;
    const heldProp = s.h >= 0 ? ctx.props.get(s.h) : null;
    const heldDef = heldProp ? ITEMS[heldProp.k] : null;
    const heavy = !!(heldDef && heldDef.type === 'heavy');
    const weaponHand = heldDef && heldDef.type === 'weapon' ? (s.hh === 1 ? this.armR : this.armL) : null;
    const offHand = weaponHand ? (weaponHand === this.armR ? this.armL : this.armR) : null;
    let tumbling = false;
    let eyes = 'open', mouth = 'grin', brow = 'none';
    this.stars.visible = false;
    let chargeVis = false;

    // landing / takeoff squash
    if (og && !this.lastOg && (st === ST.FREE || st === ST.ATTACK || st === ST.BLOCK)) P.squashV = (P.squashV || 0) - 5.5;
    if (!og && this.lastOg && s.vy > 4) P.squashV = (P.squashV || 0) + 4;
    this.lastOg = og;

    const upright = st === ST.FREE || st === ST.ATTACK || st === ST.CHARGE || st === ST.BLOCK || st === ST.TAUNT;

    // ---------------------------------------------------- default locomotion
    const G = 0.42; // guard height
    const guardL = [-0.34, G, 0.84], guardR = [0.34, G, 0.84];
    if (upright) {
      if (og) {
        const k = clamp(speed / 7, 0, 1);
        this.phase += adt * (4 + speed * 1.55);
        const sw = Math.sin(this.phase) * 0.95 * k;
        this.legL.set(0, -Math.cos(sw), Math.sin(sw), 1 - 0.22 * Math.max(0, Math.sin(this.phase)) * k);
        this.legR.set(0, -Math.cos(-sw), Math.sin(-sw), 1 - 0.22 * Math.max(0, -Math.sin(this.phase)) * k);
        pitch = 0.22 * k + fwdSpeed * 0.01;
        roll = -sideSpeed * 0.035;
        low = k * 0.06 * (1 - Math.abs(Math.cos(this.phase)));
        const as = -sw * 0.7;
        this.armL.set(guardL[0] * (1 - k * 0.5), G * (1 - k) - 0.2 * k + Math.sin(as) * 0.3, guardL[2] * (1 - k * 0.3) + Math.sin(as) * 0.7 * k, 1.05);
        this.armR.set(guardR[0] * (1 - k * 0.5), G * (1 - k) - 0.2 * k - Math.sin(as) * 0.3, guardR[2] * (1 - k * 0.3) - Math.sin(as) * 0.7 * k, 1.05);
        if (k < 0.1) {
          // idle boxer bounce
          low = 0.03 + Math.sin(t * 5.5) * 0.03;
          this.armL.set(guardL[0], guardL[1] + Math.sin(t * 5.5) * 0.05, guardL[2], 1.05);
          this.armR.set(guardR[0], guardR[1] + Math.sin(t * 5.5 + 0.5) * 0.05, guardR[2], 1.05);
          this.legL.set(0.12, -1, 0.05, 1);
          this.legR.set(-0.12, -1, -0.05, 1);
        }
      } else {
        // airborne
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
        const onShoulder = w === 'hammer' || w === 'sign';
        const sgn = weaponHand === this.armL ? 1 : -1;
        if (onShoulder) weaponHand.set(0.15 * sgn, 1, -0.25, 0.9);
        else weaponHand.set(0.3 * sgn, 0.55 + Math.sin(t * 5.5) * 0.04, 0.78, 1.05);
      }
      if (heavy) {
        this.armL.set(0.22, 1, 0.02, 1.55);
        this.armR.set(-0.22, 1, 0.02, 1.55);
        mouth = 'grit';
        brow = 'angry';
      }
    }

    // ---------------------------------------------------- reaching hands (LT/RT held)
    const reaching = (st === ST.FREE || st === ST.BLOCK) && s.g < 0 ? s.hd || 0 : 0;
    if (reaching & 1 && !(weaponHand === this.armL) && !heavy) {
      this.armL.set(0.12, 0.15 + Math.sin(t * 9) * 0.06, 1, 1.4, 400);
    }
    if (reaching & 2 && !(weaponHand === this.armR) && !heavy) {
      this.armR.set(-0.12, 0.15 + Math.sin(t * 9 + 1) * 0.06, 1, 1.4, 400);
    }
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
            yaw = inWind ? (def.from * sgn * Math.PI) / 180 * 0.35 : inActive ? lerp(def.from, def.to, pa) * sgn * Math.PI / 180 * 0.35 : 0;
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
        yaw = (((def?.from || 100) * sgn) * Math.PI) / 180 * 0.45 + tremble;
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
      _v.set(s.vz / sp, 0, -s.vx / sp); // world axis perpendicular to motion
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
      if (ko) squash = 1 + Math.sin(t * 2.2) * 0.04; // snoring belly
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
        // trailing arms, one leg up toward the dragger's hand
        this.armL.set(0.5, 1, -0.3, 1.05, 140);
        this.armR.set(-0.5, 1, 0.2, 1.05, 140);
        this.legL.set(0.3, -1, -0.2, 1, 140);
        if (grabber && gs) {
          const hand = grabber.handAnchor(gs.gm === 2 ? 1 : 0);
          hand.getWorldPosition(_v2);
          this.aimLimb(this.legR, _v2, 220);
        }
      } else {
        // dangling by the collar, kicking & flailing
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

    // ---------------------------------------------------- grabbing hands aim at the victim
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
    // tumble quaternion lives in world space; express it in root (yaw) space:
    // pivot = Ry^-1 * T * Ry * pose
    _q.setFromAxisAngle(UP, s.f);
    _q3.copy(_q).invert().multiply(this.tumbleQ).multiply(_q).multiply(_q2);
    this.pivot.quaternion.copy(_q3);
    this.pivot.position.y = COM_Y - P.low;
    const sq = clamp(P.squash, 0.6, 1.5);
    const sxz = 1 / Math.sqrt(sq);
    this.model.scale.set(sxz, sq, sxz);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.5);
      if (frozen) {
        this.model.position.x = (Math.random() - 0.5) * this.shake * 2;
        this.model.position.z = (Math.random() - 0.5) * this.shake * 2;
      } else this.model.position.x = this.model.position.z = 0;
    } else this.model.position.x = this.model.position.z = 0;

    for (const l of this.limbs) l.update(adt);

    // head bob + looking
    this.head.rotation.x = clamp(-P.pitch * 0.25, -0.4, 0.4);
    this.head.rotation.z = -P.roll * 0.4;
    if (this.stars.visible) this.stars.rotation.y += dt * 4;

    // flash / charge glow
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    let glow = this.flash;
    if (chargeVis) {
      const c = s.ch || 0;
      glow = Math.max(glow, (0.25 + c * 0.5) * (0.5 + 0.5 * Math.sin(t * (12 + c * 30))));
      this.chargeRing.visible = true;
      const cyc = (t * (1.5 + c * 3)) % 1;
      this.chargeRing.scale.setScalar(1.6 - cyc * 1.2);
      this.chargeRing.material.opacity = 0.35 + cyc * 0.6;
      this.chargeRing.material.color.setHex(c >= 1 ? 0xffffff : 0xffe14d);
    } else this.chargeRing.visible = false;
    this.bodyMat.emissive.setRGB(glow, glow, glow * (chargeVis ? 0.5 : 1));
    this.gloveMat.emissive.setRGB(glow, glow, glow * 0.8);

    // invulnerable blink (spawn / getup)
    this.model.visible = !(s.iv && st !== ST.DODGE && st !== ST.GETUP && Math.floor(t * 20) % 2 === 0);

    this.setExpression(eyes, mouth, brow);
    this.lastState = st;
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

  // Point a limb at a world position (rubber-hose stretch to reach it)
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

// position + orient a flat face decal on the head sphere surface
function placeOnSphere(obj, x, y, r, lift = 0.012) {
  const n = new THREE.Vector3(x, y, Math.sqrt(Math.max(0.01, r * r - x * x - y * y))).normalize();
  obj.position.copy(n).multiplyScalar(r * 0.95 + lift);
  obj.lookAt(n.clone().multiplyScalar(2));
}
