// Builds and animates each stage: geometry from the shared level data plus themed set dressing,
// moving platforms and hazard visuals.
import * as THREE from 'three';
import { LEVELS, levelBoxesAt, ballPosition, beamState, crusherState } from '/shared/levels.js';
import {
  toon, toonGradient, canvasTex, floorTexture, emblemTexture, concreteTexture, hazardTexture, crateTexture,
  yellowCrateTexture, plankTexture, scaffoldTexture, containerTexture, windowsTexture, fenceTexture, billboardTexture,
} from './toon.js';

const INK = '#15101e';
const texCache = new Map();
function tx(key, fn) {
  if (!texCache.has(key)) texCache.set(key, fn());
  return texCache.get(key);
}
function rep(base, rx, ry) {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(0.25, rx), Math.max(0.25, ry));
  return t;
}
const mapMat = (t, color = 0xffffff, extra = {}) => new THREE.MeshToonMaterial({ map: t, color, gradientMap: toonGradient(), ...extra });

// ------------------------------------------------------------------ extra textures
function metalTexture(base = '#7c8aa8') {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 8; y < w; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) g.fillRect(x, y, 6, 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, w - 3);
  }, { repeat: true });
}
function beltTexture() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#2b2838';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd21f';
    for (let x = 0; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x + 6, 10);
      g.lineTo(x + 20, h / 2);
      g.lineTo(x + 6, h - 10);
      g.lineTo(x + 12, h - 10);
      g.lineTo(x + 26, h / 2);
      g.lineTo(x + 12, 10);
      g.closePath();
      g.fill();
    }
  }, { repeat: true });
}
function iceTexture() {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#e9f6ff';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(120,170,220,0.5)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * w;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 80;
        y += (Math.random() - 0.5) * 80;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 80; i++) g.fillRect(Math.random() * w, Math.random() * w, 3, 3);
  }, { repeat: true });
}
function iceSideTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.15, '#bfe6ff');
    grd.addColorStop(1, '#3f86c8');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { repeat: true });
}
function asphaltTexture() {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#5a5670';
    g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * w, 2, 2);
    g.fillStyle = '#ffd21f';
    for (let x = 0; x < w; x += 64) g.fillRect(x, w / 2 - 4, 36, 8);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 6, w, 6);
    g.fillRect(0, w - 12, w, 6);
  }, { repeat: true });
}
function checkerTexture() {
  return canvasTex(128, 128, (g, w) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#15101e' : '#ffffff';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }, { repeat: true });
}
function boxcarTexture(label, base) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 4, h);
    g.font = 'bold 54px Bangers, Impact, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.strokeText(label, w / 2, h / 2 + 18);
    g.fillStyle = '#fff3d0';
    g.fillText(label, w / 2, h / 2 + 18);
  });
}
function skyTex(stops) {
  return canvasTex(64, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    for (const [t, c] of stops) grd.addColorStop(t, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

// ------------------------------------------------------------------ box styling by kind
function boxMaterials(b, w, h, d) {
  const T = (k, fn) => tx(k, fn);
  switch (b.kind) {
    case 'deck': {
      const top = mapMat(rep(T('floor', () => floorTexture()), w / 2, d / 2));
      const wall = mapMat(rep(T('bldg', () => windowsTexture('#8f7fc0', '#ffe9a0', '#3a2f6b')), w / 4, h / 4));
      const wallZ = mapMat(rep(T('bldg', () => windowsTexture('#8f7fc0', '#ffe9a0', '#3a2f6b')), d / 4, h / 4));
      return [wallZ, wallZ, top, wall, wall, wall];
    }
    case 'island': {
      const top = mapMat(rep(T('islandFloor', () => floorTexture('#c9d8ec', 'rgba(50,70,110,0.28)')), w / 2, d / 2));
      const wall = mapMat(rep(T('bldg2', () => windowsTexture('#5d8fd6', '#fff3b0', '#203a6b')), w / 4, h / 4));
      return [wall, wall, top, wall, wall, wall];
    }
    case 'scaffold': {
      const top = mapMat(rep(T('planks', plankTexture), w / 2, d / 2));
      const s = mapMat(rep(T('scaffold', scaffoldTexture), d / 2.4, h / 2.4));
      const s2 = mapMat(rep(T('scaffold', scaffoldTexture), w / 2.4, h / 2.4));
      return [s, s, top, s, s2, s2];
    }
    case 'container': {
      const side = mapMat(T('container', containerTexture));
      const plain = toon(0x2557c4);
      return [plain, plain, plain, plain, side, side];
    }
    case 'crate':
      return mapMat(T('crate', () => crateTexture()));
    case 'crateY':
      return mapMat(T('crateY', yellowCrateTexture));
    case 'ledge': {
      const s = mapMat(rep(T('hazard', hazardTexture), w / 2, 1));
      return [toon(0xb9a7c9), toon(0xb9a7c9), toon(0xd8cce8), toon(0xb9a7c9), s, s];
    }
    case 'bounce':
      return [toon(0x3d3a4a), toon(0x3d3a4a), toon(0x5cff8a, { emissive: 0x1f6b2a }), toon(0x3d3a4a), toon(0x3d3a4a), toon(0x3d3a4a)];
    case 'lift':
    case 'pallet':
    case 'hatch':
      return mapMat(rep(T('planks', plankTexture), w / 2, d / 2));
    case 'car': {
      const label = ['RUMBLE RAIL', 'BONK EXPRESS', 'SMASH FREIGHT', 'POW LINES'][Math.abs(Math.round(b.x0)) % 4];
      const base = ['#c0392b', '#2f6cf0', '#3fa535', '#e08a1e'][Math.abs(Math.round(b.x0 / 3)) % 4];
      const side = mapMat(T('car:' + label + base, () => boxcarTexture(label, base)));
      const top = mapMat(rep(T('roof', () => metalTexture('#8a8399')), w / 2, d / 2));
      const end = toon(0x5a5466);
      return [end, end, top, end, side, side];
    }
    case 'tank': {
      const m = toon(0x2b2838);
      return m;
    }
    case 'ice':
    case 'floe': {
      const top = mapMat(rep(T('ice', iceTexture), w / 4, d / 4));
      const side = mapMat(rep(T('iceside', iceSideTexture), w / 3, 1), 0xffffff);
      const sideZ = mapMat(rep(T('iceside', iceSideTexture), d / 3, 1), 0xffffff);
      return [sideZ, sideZ, top, side, side, side];
    }
    case 'igloo':
      return toon(0xf4f8ff);
    case 'iceblock':
      return new THREE.MeshToonMaterial({ color: 0xbfeaff, gradientMap: toonGradient(), emissive: 0x204a66 });
    case 'metal':
    case 'bridge':
    case 'platform':
    case 'shuttle': {
      const top = mapMat(rep(T('metal', () => metalTexture()), w / 2, d / 2));
      const side = mapMat(rep(T('metalDark', () => metalTexture('#4d5670')), Math.max(w, d) / 2, h / 2));
      return [side, side, top, side, side, side];
    }
    case 'conveyor': {
      const t = rep(T('belt', beltTexture), w / 2, d / 2);
      const top = mapMat(t);
      top.userData.belt = { tex: t, speed: (b.conv[0] / 2) * (b.conv[0] > 0 ? 1 : 1), axis: 'x' };
      const side = toon(0x3d3a4a);
      return [side, side, top, side, side, side];
    }
    case 'piston':
      return [toon(0x7c8aa8), toon(0x7c8aa8), mapMat(rep(T('hazard', hazardTexture), 1, 1)), toon(0x7c8aa8), toon(0x7c8aa8), toon(0x7c8aa8)];
    case 'machine':
      return toon(0xe08a1e);
    case 'track': {
      const top = mapMat(rep(T('asphalt', asphaltTexture), w / 6, d / 11));
      const side = mapMat(rep(T('dirt', () => concreteTexture('#8a6a4a')), w / 4, h / 4));
      return [side, side, top, side, side, side];
    }
    case 'step':
    case 'hurdle':
      return [toon(0xffd21f), toon(0xffd21f), mapMat(rep(T('hazard', hazardTexture), w / 2, 1)), toon(0xffd21f), toon(0xef2f2a), toon(0xef2f2a)];
    case 'finish': {
      const top = mapMat(rep(T('checker', checkerTexture), w / 2, d / 2));
      const side = mapMat(rep(T('dirt', () => concreteTexture('#8a6a4a')), w / 4, h / 4));
      return [side, side, top, side, side, side];
    }
    default:
      return toon(0xcccccc);
  }
}

function boxMesh(b) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMaterials(b, w, h, d));
  m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  m.castShadow = h < 8;
  m.receiveShadow = true;
  return m;
}

function addHazardTrim(group, b) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const trimX = mapMat(rep(tx('hazard', hazardTexture), w / 2, 1));
  const trimZ = mapMat(rep(tx('hazard', hazardTexture), d / 2, 1));
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.35, 0.05), trimX);
  f.position.set(cx, b.y1 - 0.18, b.z1 + 0.01);
  const bk = f.clone();
  bk.position.z = b.z0 - 0.01;
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, d + 0.02), trimZ);
  l.position.set(b.x0 - 0.01, b.y1 - 0.18, cz);
  const r = l.clone();
  r.position.x = b.x1 + 0.01;
  group.add(f, bk, l, r);
}

function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clouds(group, rng, n, yMin, yMax, rMin, rMax, color = 0xffffff) {
  const cloudMat = toon(color);
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const k = 4 + ((rng() * 4) | 0);
    for (let j = 0; j < k; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rng() * 2.5, 12, 10), cloudMat);
      s.position.set(j * 2.6 - k * 1.3, rng() * 1.5, rng() * 2);
      s.scale.y = 0.75;
      c.add(s);
    }
    const ang = rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    c.position.set(Math.cos(ang) * r, yMin + rng() * (yMax - yMin), Math.sin(ang) * r - 20);
    c.userData.drift = 0.3 + rng() * 0.6;
    group.add(c);
    list.push(c);
  }
  return list;
}

function skyline(group, rng, colors, count, rMin, rMax, yBase, hMin, hMax, center = [0, -20]) {
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    const x = Math.cos(ang) * r + center[0], z = Math.sin(ang) * r + center[1];
    const w = 8 + rng() * 14, d = 8 + rng() * 14, h = hMin + rng() * (hMax - hMin);
    const col = colors[(rng() * colors.length) | 0];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mapMat(rep(tx('win:' + col, () => windowsTexture(col)), w / 6, h / 10)));
    b.position.set(x, h / 2 + yBase, z);
    group.add(b);
  }
}

function bounceSpring(group, b) {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 18), toon(0x9aa0b8));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(cx, b.y1 + 0.05, cz);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x5cff8a }));
  arrow.position.set(cx, b.y1 + 0.6, cz);
  arrow.layers.set(1);
  group.add(coil, arrow);
  return arrow;
}

// ================================================================== builder
export function buildLevel(scene, index) {
  const lv = LEVELS[index];
  const group = new THREE.Group();
  scene.add(group);
  const rng = mulberry(1234 + index * 77);
  const movers = []; // { mesh, i }
  const belts = [];
  const spinners = []; // objects rotated each frame { obj, axis, speed }
  const floaters = [];
  const anim = []; // custom per-frame callbacks
  const env = { sky: null, fog: null, fogNear: 120, fogFar: 340, hemi: [0xdcefff, 0x8a6f9a, 1.35], sun: [0xfff0d0, 2.6] };

  // geometry
  lv.boxes.forEach((b, i) => {
    const m = boxMesh(b);
    group.add(m);
    if (b.move) movers.push({ mesh: m, i, base: m.position.clone() });
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) if (mt.userData.belt) belts.push({ ...mt.userData.belt, dir: Math.sign(b.conv[0]) });
    if (b.kind === 'deck' || b.kind === 'island' || b.kind === 'track' || b.kind === 'finish') addHazardTrim(group, b);
    if (b.bounce) anim.push(((arrow) => (t) => { arrow.position.y = b.y1 + 0.6 + Math.sin(t * 6) * 0.15; arrow.rotation.y = t * 2; })(bounceSpring(group, b)));
  });

  const hz = lv.hazards || {};
  let craneUpdate = null;
  let ballRigs = [];
  if (hz.balls) {
    for (const cfg of hz.balls) ballRigs.push(buildBall(group, cfg));
  }

  switch (lv.id) {
    case 'rooftop':
      env.sky = skyTex([[0, '#2a7bf0'], [0.42, '#7cc4ff'], [0.62, '#ffe7b8'], [1, '#ff9e6b']]);
      env.fog = 0xbcd8ff;
      decorRooftop(group, rng, lv);
      break;
    case 'train':
      env.sky = skyTex([[0, '#3a2a7a'], [0.35, '#e0607a'], [0.6, '#ffb36b'], [1, '#ffe2a0']]);
      env.fog = 0xffc49a;
      env.fogNear = 90;
      env.fogFar = 260;
      env.hemi = [0xffd9b0, 0x6a4a6a, 1.3];
      env.sun = [0xffc48a, 2.5];
      anim.push(decorTrain(group, rng, lv));
      break;
    case 'ice':
      env.sky = skyTex([[0, '#0b0a2a'], [0.3, '#1d2f6b'], [0.5, '#2fa88a'], [0.62, '#4a3a9b'], [1, '#bcd8ff']]);
      env.fog = 0x9ab8e8;
      env.fogNear = 80;
      env.fogFar = 240;
      env.hemi = [0xcfe6ff, 0x4a5a8a, 1.45];
      env.sun = [0xe8f2ff, 2.2];
      anim.push(decorIce(group, rng, lv));
      break;
    case 'factory':
      env.sky = skyTex([[0, '#1d1a2a'], [0.4, '#4a3a5a'], [0.7, '#c06a3a'], [1, '#ffb36b']]);
      env.fog = 0x6a5068;
      env.fogNear = 70;
      env.fogFar = 220;
      env.hemi = [0xffd8b0, 0x3a3a5a, 1.25];
      env.sun = [0xffd0a0, 2.4];
      anim.push(decorFactory(group, rng, lv, spinners));
      break;
    case 'chase':
      env.sky = skyTex([[0, '#2a8af0'], [0.5, '#9fdcff'], [1, '#e8fff0']]);
      env.fog = 0xcfeaff;
      env.fogNear = 90;
      env.fogFar = 300;
      anim.push(decorChase(group, rng, lv));
      break;
  }

  group.traverse((o) => {
    if (o.isMesh && o.castShadow === undefined) o.castShadow = false;
  });

  const boxBuf = [];
  return {
    group,
    lv,
    env,
    update(t, dt, snap) {
      // moving platforms
      if (movers.length) {
        const boxes = levelBoxesAt(lv, t, boxBuf);
        for (const m of movers) {
          const b = boxes[m.i];
          m.mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        }
      }
      for (const b of belts) b.tex.offset.x -= b.dir * dt * 1.7;
      for (const s of spinners) s.obj.rotation[s.axis] += s.speed * dt;
      for (const r of ballRigs) r.update(t);
      for (const f of anim) f(t, dt, snap);
      void craneUpdate;
      void floaters;
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
    },
  };
}

// ------------------------------------------------------------------ wrecking balls / pendulums
function buildBall(group, cfg) {
  const dark = toon(0x3d3a4a);
  const pivot = new THREE.Vector3(...cfg.pivot);
  if (cfg.crane) {
    const yellow = toon(0xffc61a);
    const towerZ = -32, towerH = 18;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, towerH + 60, 0.25), yellow);
      leg.position.set(dx, towerH / 2 - 30, towerZ + dz);
      group.add(leg);
    }
    for (let y = -26; y < towerH; y += 2.2) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), yellow);
      brace.position.set(0, y, towerZ - 0.8);
      brace.rotation.z = 0.75;
      group.add(brace);
    }
    const jibLen = pivot.z - towerZ + 4;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, jibLen), yellow);
    jib.position.set(0, towerH + 0.5, towerZ + jibLen / 2 - 2);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), toon(0xef2f2a));
    cab.position.set(0, towerH - 1, towerZ + 1.6);
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, towerH - pivot.y, 6), dark);
    drop.position.set(pivot.x, (towerH + pivot.y) / 2, pivot.z);
    group.add(jib, cab, drop);
  } else {
    // pendulum frame over the course
    const frameMat = toon(0xef2f2a);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, pivot.y + 1, 0.4), frameMat);
      post.position.set(pivot.x, pivot.y / 2, pivot.z + s * 4.2);
      group.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 8.8), frameMat);
    top.position.copy(pivot);
    group.add(top);
  }
  const swing = new THREE.Group();
  swing.position.copy(pivot);
  group.add(swing);
  const L = cfg.length - cfg.radius;
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, L, 6), dark);
  chain.position.y = -L / 2;
  swing.add(chain);
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius, 24, 18), toon(0x2b2838));
  ballMesh.position.y = -cfg.length;
  ballMesh.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius, 0.12, 8, 30), toon(0xffc61a));
  band.position.y = -cfg.length;
  band.rotation.x = Math.PI / 2;
  swing.add(ballMesh, band);
  const warn = new THREE.Mesh(
    new THREE.RingGeometry(cfg.radius * 0.9, cfg.radius * 1.15, 32),
    new THREE.MeshBasicMaterial({ color: 0xef2f2a, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  warn.rotation.x = -Math.PI / 2;
  warn.layers.set(1);
  group.add(warn);
  return {
    update(t) {
      const b = ballPosition(cfg, t);
      swing.rotation.set(0, 0, 0);
      swing.rotateY(-b.yaw);
      swing.rotateZ(b.ang);
      warn.position.set(b.x, 0.03, b.z);
      const height = b.y - cfg.radius;
      warn.visible = height < 2.5;
      warn.material.opacity = 0.25 + (1 - Math.min(1, Math.max(0, height) / 2.5)) * 0.5;
    },
  };
}

// ------------------------------------------------------------------ 1. rooftop dressing
function decorRooftop(group, rng, lv) {
  const poleMat = toon(0x3d3a4a);
  const corners = [[-17.6, 11.6], [17.6, 11.6], [-17.6, -6], [17.6, -6]];
  for (const [x, z] of corners) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), poleMat);
    p.position.set(x, 2.6, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(0xfff3b0, { emissive: 0xffd866 }));
    lamp.position.set(x, 5.3, z);
    group.add(p, lamp);
  }
  addBunting(group, [-17.6, 5, -6], [17.6, 5, -6], 30);
  addBunting(group, [-17.6, 5, 11.6], [-17.6, 5, -6], 16);
  addBunting(group, [17.6, 5, 11.6], [17.6, 5, -6], 16);
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const x of [-15, 15]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), fenceMat.clone());
    f.material.map = f.material.map.clone();
    f.material.map.repeat.set(5, 2);
    f.material.map.needsUpdate = true;
    f.position.set(x, 2.6 + 1.1, -12.05);
    f.layers.set(1);
    group.add(f);
  }
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: emblemTexture(), transparent: true, depthWrite: false }));
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.set(0, 0.012, 1);
  emblem.layers.set(1);
  group.add(emblem);
  // ropes for the window-washer lift and chains for the crane pallet are implied; add AC units
  const acMat = toon(0xd8d4e8);
  for (const sx of [-1, 1]) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), acMat);
    ac.position.set(sx * 25.5, 0.45, -3.3);
    group.add(ac);
  }
  skyline(group, rng, ['#7f8fe0', '#9f86d8', '#5f9fe0', '#c58fd0', '#6fb0d8', '#8b7ad1'], 70, 80, 190, -60, 20, 70);
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: billboardTexture('POW! COLA', 'It hits back!', '#ef2f2a', '#ffd21f') }));
  bb.position.set(-30, 10, -40);
  bb.rotation.y = 0.35;
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: billboardTexture('BONK!', 'Rumble Rascals Live', '#2f6cf0', '#fff') }));
  bb2.position.set(32, 11, -38);
  bb2.rotation.y = -0.4;
  group.add(bb, bb2);
  clouds(group, rng, 22, -30, 50, 70, 190);
  void lv;
}

function addBunting(parent, a, b, count) {
  const colors = [0xef2f2a, 0xffd21f, 0x2f6cf0, 0x2fd4b8, 0xff6fb5];
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * 0.9;
    pts.push(p);
  }
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15101e })));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3));
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * 0.9;
    const f = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    f.position.copy(p);
    f.lookAt(p.x + (B.z - A.z), p.y, p.z - (B.x - A.x));
    parent.add(f);
  }
}

// ------------------------------------------------------------------ 2. train dressing
function decorTrain(group, rng, lv) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 400),
    mapMat(rep(tx('desert', () => canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#e0a860';
      g.fillRect(0, 0, w, w);
      g.fillStyle = 'rgba(150,90,40,0.35)';
      for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, Math.random() * w, 4, 2);
    }, { repeat: true })), 60, 40)),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -4.6;
  ground.receiveShadow = true;
  group.add(ground);
  const groundTex = ground.material.map;
  // rails + sleepers
  const railMat = toon(0x9aa0b8);
  for (const z of [-1.8, 1.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(600, 0.15, 0.15), railMat);
    rail.position.set(0, -4.4, z);
    group.add(rail);
  }
  const sleeperTex = rep(tx('sleepers', () => canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#c99a6a';
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#6b4a2a';
    g.fillRect(0, 0, 22, w);
  }, { repeat: true })), 300, 1);
  const sleepers = new THREE.Mesh(new THREE.PlaneGeometry(600, 5), mapMat(sleeperTex));
  sleepers.rotation.x = -Math.PI / 2;
  sleepers.position.y = -4.55;
  group.add(sleepers);
  // wheels under each car
  const wheels = [];
  const wheelMat = toon(0x2b2838);
  for (const b of lv.boxes) {
    if (b.kind !== 'car') continue;
    for (const x of [b.x0 + 1.6, b.x0 + 3.2, b.x1 - 3.2, b.x1 - 1.6]) {
      for (const z of [-1.8, 1.8]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 14), wheelMat);
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, -4.0, z);
        group.add(wh);
        wheels.push(wh);
      }
    }
  }
  // couplers
  for (let i = 0; i < lv.boxes.length - 1; i++) {
    const a = lv.boxes[i], b = lv.boxes[i + 1];
    if (a.kind !== 'car' || b.kind !== 'car') continue;
    const c = new THREE.Mesh(new THREE.BoxGeometry(b.x0 - a.x1 + 0.4, 0.35, 0.5), toon(0x3d3a4a));
    c.position.set((a.x1 + b.x0) / 2, -3.2, 0);
    group.add(c);
  }
  // tank car body (round)
  const tankBox = lv.boxes.find((b) => b.kind === 'tank');
  if (tankBox) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, tankBox.x1 - tankBox.x0, 24), toon(0x2b2838));
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set((tankBox.x0 + tankBox.x1) / 2, tankBox.y1 - 2.15, 0);
    group.add(cyl);
  }
  // locomotive at the front
  const loco = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6), toon(0xef2f2a));
  body.position.set(30, -1.6, 0);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 20), toon(0x2b2838));
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(31, 1.2, 0);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 2.5, 12), toon(0x2b2838));
  stack.position.set(33.5, 3.8, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3, 5.5), toon(0xffd21f));
  cab.position.set(26.5, 1.9, 0);
  loco.add(body, boiler, stack, cab);
  group.add(loco);
  // passing telegraph poles
  const poles = [];
  const poleMat = toon(0x6b4a2a);
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 6), poleMat);
    post.position.y = -0.1;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.4), poleMat);
    arm.position.y = 3.6;
    p.add(post, arm);
    p.position.set(-100 + i * 18, -4.5, -12);
    group.add(p);
    poles.push(p);
  }
  // distant mesas
  for (let i = 0; i < 16; i++) {
    const h = 8 + rng() * 22;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6 + rng() * 10, 10 + rng() * 14, h, 7), toon(rng() < 0.5 ? 0xc0603a : 0xd98a4a));
    const ang = rng() * Math.PI - Math.PI;
    m.position.set(Math.cos(ang) * (110 + rng() * 80), h / 2 - 4.6, Math.sin(ang) * (70 + rng() * 60) - 40);
    group.add(m);
  }
  clouds(group, rng, 12, 25, 50, 90, 200, 0xffe6d0);
  // overhead beams
  const beamCfg = lv.hazards.beams;
  const gantry = new THREE.Group();
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, 0.5), toon(0x5a5466));
  postL.position.set(0, 0.5, beamCfg.z[0] - 0.3);
  const postR = postL.clone();
  postR.position.z = beamCfg.z[1] + 0.3;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(beamCfg.thick, 1, beamCfg.z[1] - beamCfg.z[0] + 1), toon(0xffc61a));
  const barStripe = new THREE.Mesh(new THREE.BoxGeometry(beamCfg.thick + 0.02, 0.25, beamCfg.z[1] - beamCfg.z[0] + 1.02), toon(0x15101e));
  gantry.add(postL, postR, bar, barStripe);
  group.add(gantry);
  // warning light on the locomotive
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), new THREE.MeshBasicMaterial({ color: 0x441111 }));
  lamp.position.set(24, 3.9, 0);
  group.add(lamp);
  const speed = 26; // scenery speed (m/s)
  return (t, dt) => {
    groundTex.offset.x += (dt * speed) / 10;
    sleeperTex.offset.x += (dt * speed) / 2;
    for (const w of wheels) w.rotation.y -= dt * speed * 2;
    for (const p of poles) {
      p.position.x -= dt * speed;
      if (p.position.x < -110) p.position.x += 216;
    }
    const b = beamState(beamCfg, t);
    gantry.visible = b.phase === 'move' || b.phase === 'warn';
    gantry.position.x = b.phase === 'warn' ? beamCfg.from + (1 - b.k) * 30 : b.x;
    const ymid = (b.y0 + b.y1) / 2;
    bar.scale.y = b.y1 - b.y0;
    bar.position.y = ymid;
    barStripe.position.y = ymid;
    lamp.material.color.setHex(b.phase === 'warn' && Math.floor(t * 8) % 2 === 0 ? (b.high ? 0x2fd4ff : 0xff3322) : 0x441111);
    lamp.material.needsUpdate = false;
  };
}

// ------------------------------------------------------------------ 3. ice dressing
function decorIce(group, rng, lv) {
  const waterTex = canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#1f5ea8';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(160,220,255,0.55)';
    g.lineWidth = 4;
    for (let y = 8; y < w; y += 22) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.2) * 3);
      g.stroke();
    }
  }, { repeat: true });
  waterTex.repeat.set(60, 60);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mapMat(waterTex, 0xffffff, { transparent: true, opacity: 0.95 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.25;
  water.receiveShadow = true;
  water.layers.set(1);
  group.add(water);
  // igloo dome
  const igBox = lv.boxes.find((b) => b.kind === 'igloo');
  if (igBox) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf4f8ff));
    dome.position.set((igBox.x0 + igBox.x1) / 2, 0, (igBox.z0 + igBox.z1) / 2);
    dome.scale.y = 0.95;
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 14, 1, false, 0, Math.PI), toon(0x2b3a6b));
    door.rotation.z = Math.PI / 2;
    door.position.set(dome.position.x, 0.6, igBox.z1 + 0.1);
    group.add(dome, door);
  }
  // penguins on the edges (decoration)
  const pengs = [];
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), toon(0x26232e));
    body.scale.set(0.9, 1.25, 0.85);
    body.position.y = 0.5;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), toon(0xffffff));
    belly.position.set(0, 0.45, 0.14);
    belly.scale.set(0.9, 1.2, 0.8);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), toon(0xff9420));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.75, 0.38);
    p.add(body, belly, beak);
    const a = (i / 9) * Math.PI * 2;
    p.position.set(Math.cos(a) * 30, -1.2, Math.sin(a) * 22);
    p.rotation.y = -a + Math.PI / 2;
    const floe = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 8), toon(0xe9f6ff));
    floe.position.set(p.position.x, -1.25, p.position.z);
    group.add(floe, p);
    pengs.push(p);
  }
  // snowfall
  const snowGeo = new THREE.BufferGeometry();
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rng() - 0.5) * 90;
    pos[i * 3 + 1] = rng() * 40;
    pos[i * 3 + 2] = (rng() - 0.5) * 70;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.9, depthWrite: false }));
  snow.layers.set(1);
  group.add(snow);
  // icebergs on the horizon
  for (let i = 0; i < 14; i++) {
    const h = 10 + rng() * 25;
    const m = new THREE.Mesh(new THREE.ConeGeometry(8 + rng() * 10, h, 6), toon(0xdff2ff));
    const ang = rng() * Math.PI * 2;
    m.position.set(Math.cos(ang) * (120 + rng() * 60), h / 2 - 2, Math.sin(ang) * (100 + rng() * 60));
    group.add(m);
  }
  // stars
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2, e = 0.25 + rng() * 1.2;
    sp[i * 3] = Math.cos(a) * Math.cos(e) * 380;
    sp[i * 3 + 1] = Math.sin(e) * 380;
    sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
  stars.layers.set(1);
  group.add(stars);
  // falling snowball hazards (from snapshot)
  const balls = [];
  const markers = [];
  const ballGeo = new THREE.SphereGeometry(1.1, 16, 12);
  const ballMat = toon(0xf4f8ff);
  const markGeo = new THREE.RingGeometry(1.4, 2.0, 28);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x2fd4ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  return (t, dt, snap) => {
    waterTex.offset.x += dt * 0.02;
    waterTex.offset.y += dt * 0.012;
    const arr = snow.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] -= dt * (2 + (i % 5) * 0.4);
      arr[i * 3] += Math.sin(t + i) * dt * 0.3;
      if (arr[i * 3 + 1] < -1) arr[i * 3 + 1] += 40;
    }
    snow.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < pengs.length; i++) pengs[i].rotation.z = Math.sin(t * 3 + i) * 0.12;
    const hz = (snap && snap.hz) || [];
    while (balls.length < hz.length) {
      const b = new THREE.Mesh(ballGeo, ballMat);
      b.castShadow = true;
      const m = new THREE.Mesh(markGeo, markMat);
      m.rotation.x = -Math.PI / 2;
      m.layers.set(1);
      group.add(b, m);
      balls.push(b);
      markers.push(m);
    }
    for (let i = 0; i < balls.length; i++) {
      const d = hz[i];
      balls[i].visible = markers[i].visible = !!d;
      if (!d) continue;
      const [x, y, z, ticks] = d;
      const tt = ticks / 60;
      balls[i].position.set(x, y + 1.1 + tt * tt * 16 + tt * 8, z);
      balls[i].rotation.x += dt * 4;
      markers[i].position.set(x, y + 0.04, z);
      markers[i].scale.setScalar(1 + Math.sin(t * 16) * 0.08);
    }
  };
}

// ------------------------------------------------------------------ 4. factory dressing
function decorFactory(group, rng, lv, spinners) {
  // grinder pit
  const pitFloor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 22), toon(0x2b2838));
  pitFloor.position.set(0, -12.5, 0);
  group.add(pitFloor);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 22), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.6, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, -11.9, 0);
  glow.layers.set(1);
  group.add(glow);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.6, 12), toon(0x7c8aa8));
    drum.rotation.z = Math.PI / 2;
    g.add(drum);
    for (let k = 0; k < 10; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 5), toon(0xbfc4d4));
      const a = (k / 10) * Math.PI * 2;
      spike.position.set(-2.4 + (k % 5) * 1.2, Math.cos(a) * 1.25, Math.sin(a) * 1.25);
      spike.rotation.x = a;
      g.add(spike);
    }
    g.position.set(0, -11, -9 + i * 4);
    group.add(g);
    spinners.push({ obj: g, axis: 'x', speed: i % 2 ? 3 : -3 });
  }
  // back wall with giant gears
  const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 1), mapMat(rep(tx('metalDark', () => metalTexture('#4d5670')), 15, 8)));
  wall.position.set(0, 6, -16);
  group.add(wall);
  for (let i = 0; i < 6; i++) {
    const r = 2.5 + rng() * 3;
    const gear = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 20), toon(i % 2 ? 0xc9a14a : 0x9aa0b8));
    disc.rotation.x = Math.PI / 2;
    gear.add(disc);
    for (let k = 0; k < 12; k++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.6), toon(i % 2 ? 0xc9a14a : 0x9aa0b8));
      const a = (k / 12) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * (r + 0.3), Math.sin(a) * (r + 0.3), 0);
      tooth.rotation.z = a;
      gear.add(tooth);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.8, 12), toon(0x2b2838));
    hub.rotation.x = Math.PI / 2;
    gear.add(hub);
    gear.position.set(-24 + i * 9.5, 4 + (i % 2) * 7, -15.2);
    group.add(gear);
    spinners.push({ obj: gear, axis: 'z', speed: (i % 2 ? 0.6 : -0.6) * (4 / r) });
  }
  // pipes
  const pipeMat = toon(0x3fa535);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 10), i % 2 ? pipeMat : toon(0xef2f2a));
    p.rotation.z = Math.PI / 2;
    p.position.set(0, 12 + i * 1.3, -14.5);
    group.add(p);
  }
  // crusher
  const cfg = lv.hazards.crusher;
  const press = new THREE.Group();
  const w = cfg.x1 - cfg.x0, d = cfg.z1 - cfg.z0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), toon(0x5a5f78));
  head.position.y = 0.6;
  const stripes = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.4, d + 0.04), mapMat(rep(tx('hazard', hazardTexture), w / 1.5, 1)));
  stripes.position.y = 0.25;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12, 12), toon(0xbfc4d4));
  shaft.position.y = 7.2;
  press.add(head, stripes, shaft);
  press.position.set((cfg.x0 + cfg.x1) / 2, cfg.top, (cfg.z0 + cfg.z1) / 2);
  group.add(press);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 1.5, d + 2), toon(0xffc61a));
  frame.position.set(press.position.x, cfg.top + 9, press.position.z);
  group.add(frame);
  const lights = [];
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, cfg.top + 9, 0.4), toon(0xffc61a));
    post.position.set(press.position.x + sx * (w / 2 + 0.9), (cfg.top + 9) / 2, press.position.z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0x441111 }));
    lamp.position.set(post.position.x, 4, post.position.z + 0.3);
    group.add(post, lamp);
    lights.push(lamp);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(press.position.x, 0.02, press.position.z);
  shadow.layers.set(1);
  group.add(shadow);
  // hanging lamps
  for (let i = 0; i < 6; i++) {
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.8, 12, 1, true), toon(0x3d3a4a, { side: THREE.DoubleSide }));
    lamp.position.set(-14 + i * 5.6, 9, 2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), toon(0xfff3b0, { emissive: 0xffd866 }));
    bulb.position.set(lamp.position.x, 8.6, 2);
    group.add(lamp, bulb);
  }
  return (t) => {
    const c = crusherState(cfg, t);
    press.position.y = c.y;
    const warn = c.phase === 'warn' || c.phase === 'slam';
    for (const l of lights) l.material.color.setHex(warn && Math.floor(t * 10) % 2 === 0 ? 0xff2a1a : 0x441111);
    shadow.material.opacity = 0.15 + (1 - Math.min(1, (c.y - cfg.bottom) / (cfg.top - cfg.bottom))) * 0.5;
    glow.material.opacity = 0.45 + Math.sin(t * 5) * 0.15;
  };
}

// ------------------------------------------------------------------ 5. chase dressing
function decorChase(group, rng, lv) {
  // grass fields far below
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(700, 300), mapMat(rep(tx('grass', () => canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#5ccf3a';
    g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(30,110,20,0.4)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * w, 3, 5);
  }, { repeat: true })), 80, 35)));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(80, -14, 0);
  grass.receiveShadow = true;
  group.add(grass);
  // trees
  for (let i = 0; i < 70; i++) {
    const tr = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 6), toon(0x8a5524));
    trunk.position.y = 2;
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rng() * 1.2, 10, 8), toon(rng() < 0.5 ? 0x3fa535 : 0x5ccf3a));
    top.position.y = 5;
    tr.add(trunk, top);
    const side = rng() < 0.5 ? -1 : 1;
    tr.position.set(-20 + rng() * 220, -14, side * (16 + rng() * 40));
    group.add(tr);
  }
  // start & finish arches
  const arch = (x, label, color) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), toon(color));
      post.position.set(0, 3.5, s * 6.6);
      g.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 13.8), [
      toon(color), toon(color), toon(color), toon(color),
      new THREE.MeshBasicMaterial({ map: billboardTexture(label, '', '#15101e', '#ffd21f') }),
      new THREE.MeshBasicMaterial({ map: billboardTexture(label, '', '#15101e', '#ffd21f') }),
    ]);
    banner.rotation.y = Math.PI / 2;
    banner.position.y = 7;
    g.add(banner);
    g.position.x = x;
    group.add(g);
  };
  arch(4, 'START', 0x2f6cf0);
  arch(lv.finishX, 'FINISH!', 0xef2f2a);
  // finish confetti cannons
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2, 12), toon(0xffd21f));
    c.position.set(lv.finishX + 4, 1, s * 6);
    group.add(c);
  }
  // crowd stands along the course
  for (let i = 0; i < 9; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 3), mapMat(rep(tx('crowd', () => canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#3d3a4a';
      g.fillRect(0, 0, w, h);
      const cols = ['#ef2f2a', '#ffd21f', '#2f6cf0', '#2fd4b8', '#ff6fb5', '#ffffff'];
      for (let y = 6; y < h; y += 12) for (let x = 4; x < w; x += 10) {
        g.fillStyle = cols[((x * 7 + y * 3) / 4) % cols.length | 0];
        g.beginPath();
        g.arc(x, y, 4, 0, 7);
        g.fill();
      }
    }, { repeat: true })), 3, 1)));
    st.position.set(i * 20, -2, i % 2 ? -10.5 : 10.5);
    group.add(st);
  }
  clouds(group, rng, 18, 18, 40, 60, 200);
  // the STEAMROLLER
  const roller = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, lv.chaser.width, 28), toon(0x6d6a80));
  drum.rotation.x = Math.PI / 2;
  drum.position.set(1.0, 2.6, 0);
  const bands = [];
  for (let i = -2; i <= 2; i++) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.12, 6, 28), toon(0xffc61a));
    b.position.set(1.0, 2.6, i * (lv.chaser.width / 5));
    roller.add(b);
    bands.push(b);
  }
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, lv.chaser.width * 0.7), toon(0xffc61a));
  bodyM.position.set(-4.5, 4, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3, 5), toon(0xef2f2a));
  cab.position.set(-5, 7.6, 0);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 3, 10), toon(0x2b2838));
  stack.position.set(-7, 8.5, 2.2);
  // angry face on the front
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x15101e });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), eyeMat);
    eye.position.set(-0.95, 5.2, s * 1.6);
    eye.rotation.y = Math.PI / 2;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), pupilMat);
    pupil.position.set(-0.93, 5.0, s * 1.5);
    pupil.rotation.y = Math.PI / 2;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 1.8), toon(0x15101e));
    brow.position.set(-0.9, 6.2, s * 1.6);
    brow.rotation.x = s * 0.4;
    roller.add(eye, pupil, brow);
  }
  roller.add(drum, bodyM, cab, stack);
  group.add(roller);
  const dust = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), toon(0xd8c8a8));
  dust.scale.set(1.5, 0.8, lv.chaser.width * 0.6);
  group.add(dust);
  return (t, dt, snap) => {
    const x = snap && snap.cx !== undefined ? snap.cx : lv.chaser.startX;
    roller.position.x += (x - 1.6 - roller.position.x) * Math.min(1, dt * 10);
    drum.rotation.y = 0;
    drum.rotation.z -= dt * 3;
    for (const b of bands) b.rotation.y = drum.rotation.z;
    roller.position.y = Math.abs(Math.sin(t * 9)) * 0.08;
    dust.position.set(roller.position.x + 3.2, 0.5, 0);
    dust.scale.x = 1.5 + Math.sin(t * 14) * 0.2;
  };
}
